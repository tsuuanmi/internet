use std::{collections::BTreeMap, sync::Arc};

use internet_mcp_task_lifecycle::{
    BackendTaskSnapshot, InternetTaskLifecycle, TaskBackend, TaskInputResponses, TaskStatus,
};
use rmcp::model::ErrorCode;
use serde_json::json;
use tempfile::tempdir;
use tokio::sync::Mutex;

#[derive(Clone)]
struct FakeBackend {
    snapshot: Arc<Mutex<BackendTaskSnapshot>>,
    updates: Arc<Mutex<Vec<TaskInputResponses>>>,
    cancels: Arc<Mutex<usize>>,
}

impl FakeBackend {
    fn new(snapshot: BackendTaskSnapshot) -> Self {
        Self {
            snapshot: Arc::new(Mutex::new(snapshot)),
            updates: Arc::new(Mutex::new(Vec::new())),
            cancels: Arc::new(Mutex::new(0)),
        }
    }
}

impl TaskBackend for FakeBackend {
    async fn observe(
        &self,
        _owner_ref: &str,
        _subject_ref: &str,
    ) -> Result<BackendTaskSnapshot, String> {
        Ok(self.snapshot.lock().await.clone())
    }

    async fn update(
        &self,
        _owner_ref: &str,
        _subject_ref: &str,
        responses: TaskInputResponses,
    ) -> Result<(), String> {
        self.updates.lock().await.push(responses);
        Ok(())
    }

    async fn cancel(&self, _owner_ref: &str, _subject_ref: &str) -> Result<(), String> {
        *self.cancels.lock().await += 1;
        Ok(())
    }
}

#[tokio::test]
async fn create_is_idempotent_for_the_same_owner_and_request_id() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend).unwrap();

    let first = lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-42",
            Some(120_000),
            Some(500),
        )
        .await
        .unwrap();
    let second = lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-42",
            Some(120_000),
            Some(500),
        )
        .await
        .unwrap();

    assert_eq!(second.task_id, first.task_id);
}

#[tokio::test]
async fn request_id_reuse_with_different_subject_is_rejected() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend).unwrap();

    lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    let error = lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-43",
            None,
            None,
        )
        .await
        .unwrap_err();
    assert_eq!(error.code(), ErrorCode::INVALID_PARAMS);
}

#[tokio::test]
async fn request_id_reuse_with_different_creation_options_is_rejected() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend).unwrap();

    lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    for error in [
        lifecycle
            .create(
                "principal:user-1",
                "request-stable",
                "workflow:wf-42",
                Some(1_000),
                None,
            )
            .await
            .unwrap_err(),
        lifecycle
            .create(
                "principal:user-1",
                "request-stable",
                "workflow:wf-42",
                None,
                Some(250),
            )
            .await
            .unwrap_err(),
    ] {
        assert_eq!(error.code(), ErrorCode::INVALID_PARAMS);
    }
}

#[tokio::test]
async fn same_request_id_is_scoped_by_owner() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend).unwrap();

    let first = lifecycle
        .create(
            "principal:user-1",
            "request-stable",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();
    let second = lifecycle
        .create(
            "principal:user-2",
            "request-stable",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    assert_ne!(second.task_id, first.task_id);
}

#[tokio::test]
async fn created_task_is_observable_before_return_and_survives_adapter_restart() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("planning"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend.clone()).unwrap();

    let created = lifecycle
        .create(
            "principal:user-1",
            "request-1",
            "workflow:wf-42",
            Some(120_000),
            Some(500),
        )
        .await
        .unwrap();

    assert_ne!(created.task_id, "workflow:wf-42");
    let immediate = lifecycle
        .get("principal:user-1", &created.task_id)
        .await
        .unwrap();
    assert_eq!(immediate.status, TaskStatus::Working);
    assert_eq!(immediate.status_message.as_deref(), Some("planning"));

    drop(lifecycle);

    let reopened = InternetTaskLifecycle::open(dir.path(), backend).unwrap();
    let recovered = reopened
        .get("principal:user-1", &created.task_id)
        .await
        .unwrap();
    assert_eq!(recovered.task_id, created.task_id);
    assert_eq!(recovered.subject_ref.as_deref(), Some("workflow:wf-42"));
}

#[tokio::test]
async fn input_required_round_trips_exact_outstanding_requests_and_forwards_responses() {
    let dir = tempdir().unwrap();
    let mut requests = BTreeMap::new();
    requests.insert(
        "merge-approval".to_string(),
        json!({
            "method": "elicitation/create",
            "params": {"message": "Approve merge?"}
        }),
    );
    let backend = FakeBackend::new(BackendTaskSnapshot::input_required(requests.clone()));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend.clone()).unwrap();
    let task = lifecycle
        .create(
            "principal:user-1",
            "request-2",
            "workflow:wf-42",
            None,
            Some(250),
        )
        .await
        .unwrap();

    let snapshot = lifecycle
        .get("principal:user-1", &task.task_id)
        .await
        .unwrap();
    assert_eq!(snapshot.status, TaskStatus::InputRequired);
    assert_eq!(snapshot.input_requests, requests);

    let mut responses = BTreeMap::new();
    responses.insert("merge-approval".to_string(), json!({"action": "accept"}));
    lifecycle
        .update("principal:user-1", &task.task_id, responses.clone())
        .await
        .unwrap();

    assert_eq!(backend.updates.lock().await.as_slice(), &[responses]);
}

#[tokio::test]
async fn update_ignores_responses_for_keys_that_are_not_outstanding() {
    let dir = tempdir().unwrap();
    let mut requests = BTreeMap::new();
    requests.insert(
        "merge-approval".to_string(),
        json!({
            "method": "elicitation/create",
            "params": {"message": "Approve merge?"}
        }),
    );
    let backend = FakeBackend::new(BackendTaskSnapshot::input_required(requests));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend.clone()).unwrap();
    let task = lifecycle
        .create(
            "principal:user-1",
            "request-3",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    let mut responses = BTreeMap::new();
    responses.insert("unknown".to_string(), json!({"action": "accept"}));
    lifecycle
        .update("principal:user-1", &task.task_id, responses)
        .await
        .unwrap();

    assert!(backend.updates.lock().await.is_empty());
}

#[tokio::test]
async fn cancellation_is_ack_only_and_domain_backend_remains_authoritative_for_terminal_state() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend.clone()).unwrap();
    let task = lifecycle
        .create(
            "principal:user-1",
            "request-3",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    lifecycle
        .cancel("principal:user-1", &task.task_id)
        .await
        .unwrap();
    assert_eq!(*backend.cancels.lock().await, 1);

    let after_ack = lifecycle
        .get("principal:user-1", &task.task_id)
        .await
        .unwrap();
    assert_eq!(after_ack.status, TaskStatus::Working);
}

#[tokio::test]
async fn unknown_task_is_invalid_params() {
    let dir = tempdir().unwrap();
    let lifecycle = InternetTaskLifecycle::open(
        dir.path(),
        FakeBackend::new(BackendTaskSnapshot::working("idle")),
    )
    .unwrap();

    for error in [
        lifecycle
            .get("principal:user-1", "missing")
            .await
            .unwrap_err(),
        lifecycle
            .cancel("principal:user-1", "missing")
            .await
            .unwrap_err(),
        lifecycle
            .update("principal:user-1", "missing", BTreeMap::new())
            .await
            .unwrap_err(),
    ] {
        assert_eq!(error.code(), ErrorCode::INVALID_PARAMS);
    }
}

#[tokio::test]
async fn task_access_is_bound_to_the_authenticated_owner() {
    let dir = tempdir().unwrap();
    let backend = FakeBackend::new(BackendTaskSnapshot::working("running"));
    let lifecycle = InternetTaskLifecycle::open(dir.path(), backend).unwrap();
    let task = lifecycle
        .create(
            "principal:user-1",
            "request-3",
            "workflow:wf-42",
            None,
            None,
        )
        .await
        .unwrap();

    for error in [
        lifecycle
            .get("principal:user-2", &task.task_id)
            .await
            .unwrap_err(),
        lifecycle
            .cancel("principal:user-2", &task.task_id)
            .await
            .unwrap_err(),
        lifecycle
            .update("principal:user-2", &task.task_id, BTreeMap::new())
            .await
            .unwrap_err(),
    ] {
        assert_eq!(error.code(), ErrorCode::INVALID_PARAMS);
    }
}

#[test]
fn tasks_extension_is_required_without_fallback() {
    let error = InternetTaskLifecycle::<FakeBackend>::missing_required_capability();
    assert_eq!(error.code, ErrorCode::MISSING_REQUIRED_CLIENT_CAPABILITY);
    let extensions = error
        .data
        .as_ref()
        .and_then(|data| data.get("requiredCapabilities"))
        .and_then(|caps| caps.get("extensions"))
        .and_then(|extensions| extensions.as_object())
        .unwrap();
    assert!(extensions.contains_key("io.modelcontextprotocol/tasks"));
}
