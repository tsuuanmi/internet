use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::Utc;
use rmcp::{
    ErrorData,
    model::{
        ClientCapabilities, CreateTaskResult, DetailedTask, ErrorCode, InputRequest, InputRequests,
        JsonObject, Task as McpTask, TaskPayload, TaskStatus as McpTaskStatus,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};

pub type TaskInputRequests = BTreeMap<String, Value>;
pub type TaskInputResponses = BTreeMap<String, Value>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Working,
    InputRequired,
    Completed,
    Failed,
    Cancelled,
}

impl From<TaskStatus> for McpTaskStatus {
    fn from(value: TaskStatus) -> Self {
        match value {
            TaskStatus::Working => Self::Working,
            TaskStatus::InputRequired => Self::InputRequired,
            TaskStatus::Completed => Self::Completed,
            TaskStatus::Failed => Self::Failed,
            TaskStatus::Cancelled => Self::Cancelled,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BackendTaskSnapshot {
    pub status: TaskStatus,
    pub status_message: Option<String>,
    pub input_requests: TaskInputRequests,
    pub result: Option<JsonObject>,
    pub error: Option<JsonObject>,
}

impl BackendTaskSnapshot {
    pub fn working(message: impl Into<String>) -> Self {
        Self {
            status: TaskStatus::Working,
            status_message: Some(message.into()),
            input_requests: BTreeMap::new(),
            result: None,
            error: None,
        }
    }

    pub fn input_required(input_requests: TaskInputRequests) -> Self {
        Self {
            status: TaskStatus::InputRequired,
            status_message: None,
            input_requests,
            result: None,
            error: None,
        }
    }

    pub fn completed(result: JsonObject) -> Self {
        Self {
            status: TaskStatus::Completed,
            status_message: None,
            input_requests: BTreeMap::new(),
            result: Some(result),
            error: None,
        }
    }

    pub fn failed(error: JsonObject) -> Self {
        Self {
            status: TaskStatus::Failed,
            status_message: None,
            input_requests: BTreeMap::new(),
            result: None,
            error: Some(error),
        }
    }

    pub fn cancelled() -> Self {
        Self {
            status: TaskStatus::Cancelled,
            status_message: None,
            input_requests: BTreeMap::new(),
            result: None,
            error: None,
        }
    }
}

#[allow(async_fn_in_trait)]
pub trait TaskBackend: Clone + Send + Sync + 'static {
    async fn observe(
        &self,
        owner_ref: &str,
        subject_ref: &str,
    ) -> Result<BackendTaskSnapshot, String>;
    async fn update(
        &self,
        owner_ref: &str,
        subject_ref: &str,
        responses: TaskInputResponses,
    ) -> Result<(), String>;
    async fn cancel(&self, owner_ref: &str, subject_ref: &str) -> Result<(), String>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct TaskSnapshot {
    pub task_id: String,
    pub subject_ref: Option<String>,
    pub status: TaskStatus,
    pub status_message: Option<String>,
    pub input_requests: TaskInputRequests,
    pub result: Option<JsonObject>,
    pub error: Option<JsonObject>,
    pub created_at: String,
    pub last_updated_at: String,
    pub ttl_ms: Option<u64>,
    pub poll_interval_ms: Option<u64>,
}

impl TaskSnapshot {
    pub fn to_mcp_create_task(&self) -> CreateTaskResult {
        CreateTaskResult::new(self.mcp_task())
    }

    pub fn to_mcp_detailed_task(&self) -> Result<DetailedTask, TaskLifecycleError> {
        let payload = match self.status {
            TaskStatus::Working => TaskPayload::Working,
            TaskStatus::InputRequired => {
                let mut requests = InputRequests::new();
                for (key, value) in &self.input_requests {
                    let request =
                        serde_json::from_value::<InputRequest>(value.clone()).map_err(|error| {
                            TaskLifecycleError::internal(format!(
                                "task input request {key:?} is not valid MCP input: {error}"
                            ))
                        })?;
                    requests.insert(key.clone(), request);
                }
                TaskPayload::InputRequired {
                    input_requests: requests,
                }
            }
            TaskStatus::Completed => TaskPayload::Completed {
                result: self.result.clone().ok_or_else(|| {
                    TaskLifecycleError::internal("completed task is missing its result payload")
                })?,
            },
            TaskStatus::Failed => TaskPayload::Failed {
                error: self.error.clone().ok_or_else(|| {
                    TaskLifecycleError::internal("failed task is missing its error payload")
                })?,
            },
            TaskStatus::Cancelled => TaskPayload::Cancelled,
        };
        Ok(DetailedTask::new(self.mcp_task(), payload))
    }

    fn mcp_task(&self) -> McpTask {
        let mut task = McpTask::new(
            self.task_id.clone(),
            self.status.into(),
            self.created_at.clone(),
            self.last_updated_at.clone(),
        );
        task.status_message = self.status_message.clone();
        task.ttl_ms = self.ttl_ms;
        task.poll_interval_ms = self.poll_interval_ms;
        task
    }
}

#[derive(Debug, thiserror::Error)]
#[error("{message}")]
pub struct TaskLifecycleError {
    code: ErrorCode,
    message: String,
}

impl TaskLifecycleError {
    pub fn code(&self) -> ErrorCode {
        self.code
    }

    pub fn to_mcp_error(&self) -> ErrorData {
        ErrorData::new(self.code, self.message.clone(), None)
    }

    fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::INVALID_PARAMS,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            code: ErrorCode::INTERNAL_ERROR,
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskRecord {
    task_id: String,
    owner_ref: String,
    subject_ref: String,
    created_at: String,
    created_unix_ms: u64,
    ttl_ms: Option<u64>,
    poll_interval_ms: Option<u64>,
}

pub struct InternetTaskLifecycle<B: TaskBackend> {
    root: PathBuf,
    backend: B,
}

impl<B: TaskBackend> InternetTaskLifecycle<B> {
    pub fn open(data_dir: impl AsRef<Path>, backend: B) -> Result<Self, TaskLifecycleError> {
        let root = data_dir.as_ref().join("mcp-tasks");
        ensure_private_directory(&root)?;
        Ok(Self { root, backend })
    }

    pub async fn create(
        &self,
        owner_ref: &str,
        subject_ref: &str,
        ttl_ms: Option<u64>,
        poll_interval_ms: Option<u64>,
    ) -> Result<TaskSnapshot, TaskLifecycleError> {
        validate_ref(owner_ref, "task owner ref")?;
        validate_ref(subject_ref, "task subject ref")?;
        validate_positive_optional(ttl_ms, "task TTL")?;
        validate_positive_optional(poll_interval_ms, "task poll interval")?;

        let observed = self
            .backend
            .observe(owner_ref, subject_ref)
            .await
            .map_err(|error| {
                TaskLifecycleError::internal(format!("task backend observe failed: {error}"))
            })?;

        let task_id = Uuid::new_v4().to_string();
        let record = TaskRecord {
            task_id: task_id.clone(),
            owner_ref: owner_ref.to_owned(),
            subject_ref: subject_ref.to_owned(),
            created_at: Utc::now().to_rfc3339(),
            created_unix_ms: now_unix_ms()?,
            ttl_ms,
            poll_interval_ms,
        };
        self.write_record(&record)?;

        Ok(project(&record, observed))
    }

    pub async fn get(
        &self,
        owner_ref: &str,
        task_id: &str,
    ) -> Result<TaskSnapshot, TaskLifecycleError> {
        let record = self.authorized_record(owner_ref, task_id)?;
        let observed = self
            .backend
            .observe(owner_ref, &record.subject_ref)
            .await
            .map_err(|error| TaskLifecycleError::internal(format!("task backend observe failed: {error}")))?;
        Ok(project(&record, observed))
    }

    pub async fn update(
        &self,
        owner_ref: &str,
        task_id: &str,
        responses: TaskInputResponses,
    ) -> Result<(), TaskLifecycleError> {
        let record = self.authorized_record(owner_ref, task_id)?;
        let observed = self
            .backend
            .observe(owner_ref, &record.subject_ref)
            .await
            .map_err(|error| TaskLifecycleError::internal(format!("task backend observe failed: {error}")))?;

        if observed.status != TaskStatus::InputRequired {
            return Ok(());
        }

        let filtered = responses
            .into_iter()
            .filter(|(key, _)| observed.input_requests.contains_key(key))
            .collect::<TaskInputResponses>();
        if filtered.is_empty() {
            return Ok(());
        }

        self.backend
            .update(owner_ref, &record.subject_ref, filtered)
            .await
            .map_err(|error| {
                TaskLifecycleError::internal(format!("task backend update failed: {error}"))
            })
    }

    pub async fn cancel(&self, owner_ref: &str, task_id: &str) -> Result<(), TaskLifecycleError> {
        let record = self.authorized_record(owner_ref, task_id)?;
        self.backend
            .cancel(owner_ref, &record.subject_ref)
            .await
            .map_err(|error| {
                TaskLifecycleError::internal(format!("task backend cancel failed: {error}"))
            })
    }

    pub fn missing_required_capability() -> ErrorData {
        ErrorData::missing_required_client_capability(
            ClientCapabilities::builder().enable_tasks().build(),
        )
    }

    fn authorized_record(
        &self,
        owner_ref: &str,
        task_id: &str,
    ) -> Result<TaskRecord, TaskLifecycleError> {
        validate_ref(owner_ref, "task owner ref")?;
        let Some(record) = self.read_record(task_id)? else {
            return Err(unknown_task(task_id));
        };
        if record.owner_ref != owner_ref || record_is_expired(&record)? {
            return Err(unknown_task(task_id));
        }
        Ok(record)
    }

    fn record_path(&self, task_id: &str) -> Result<PathBuf, TaskLifecycleError> {
        if Uuid::parse_str(task_id).is_err() {
            return Err(unknown_task(task_id));
        }
        Ok(self.root.join(format!("{task_id}.json")))
    }

    fn read_record(&self, task_id: &str) -> Result<Option<TaskRecord>, TaskLifecycleError> {
        let path = self.record_path(task_id)?;
        if !path.exists() {
            return Ok(None);
        }
        assert_private_regular_file(&path)?;
        let mut contents = Vec::new();
        File::open(&path)
            .and_then(|mut file| file.read_to_end(&mut contents))
            .map_err(|error| {
                TaskLifecycleError::internal(format!("failed to read task record: {error}"))
            })?;
        let record = serde_json::from_slice::<TaskRecord>(&contents).map_err(|error| {
            TaskLifecycleError::internal(format!("invalid task record: {error}"))
        })?;
        if record.task_id != task_id {
            return Err(TaskLifecycleError::internal(
                "task record identity mismatch",
            ));
        }
        Ok(Some(record))
    }

    fn write_record(&self, record: &TaskRecord) -> Result<(), TaskLifecycleError> {
        let path = self.record_path(&record.task_id)?;
        if path.exists() {
            return Err(TaskLifecycleError::internal("task id collision"));
        }

        let temp_path = self
            .root
            .join(format!(".{}.{}.tmp", record.task_id, Uuid::new_v4()));
        let bytes = serde_json::to_vec(record).map_err(|error| {
            TaskLifecycleError::internal(format!("failed to encode task record: {error}"))
        })?;

        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        options.mode(0o600);

        let mut file = options.open(&temp_path).map_err(|error| {
            TaskLifecycleError::internal(format!("failed to create task record: {error}"))
        })?;
        let write_result = (|| {
            file.write_all(&bytes)?;
            file.sync_all()?;
            fs::rename(&temp_path, &path)?;
            #[cfg(unix)]
            File::open(&self.root)?.sync_all()?;
            Ok::<(), std::io::Error>(())
        })();
        if let Err(error) = write_result {
            let _ = fs::remove_file(&temp_path);
            return Err(TaskLifecycleError::internal(format!(
                "failed to persist task record: {error}"
            )));
        }
        Ok(())
    }
}

fn project(record: &TaskRecord, observed: BackendTaskSnapshot) -> TaskSnapshot {
    TaskSnapshot {
        task_id: record.task_id.clone(),
        subject_ref: Some(record.subject_ref.clone()),
        status: observed.status,
        status_message: observed.status_message,
        input_requests: observed.input_requests,
        result: observed.result,
        error: observed.error,
        created_at: record.created_at.clone(),
        last_updated_at: Utc::now().to_rfc3339(),
        ttl_ms: record.ttl_ms,
        poll_interval_ms: record.poll_interval_ms,
    }
}

fn validate_ref(value: &str, label: &str) -> Result<(), TaskLifecycleError> {
    if value.trim().is_empty() {
        return Err(TaskLifecycleError::invalid_params(format!(
            "{label} is required"
        )));
    }
    Ok(())
}

fn validate_positive_optional(value: Option<u64>, label: &str) -> Result<(), TaskLifecycleError> {
    if value == Some(0) {
        return Err(TaskLifecycleError::invalid_params(format!(
            "{label} must be positive"
        )));
    }
    Ok(())
}

fn unknown_task(task_id: &str) -> TaskLifecycleError {
    TaskLifecycleError::invalid_params(format!("unknown task: {task_id}"))
}

fn now_unix_ms() -> Result<u64, TaskLifecycleError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| {
            TaskLifecycleError::internal(format!("system clock is before Unix epoch: {error}"))
        })?;
    u64::try_from(duration.as_millis())
        .map_err(|_| TaskLifecycleError::internal("system clock timestamp does not fit in u64"))
}

fn record_is_expired(record: &TaskRecord) -> Result<bool, TaskLifecycleError> {
    let Some(ttl_ms) = record.ttl_ms else {
        return Ok(false);
    };
    let now = now_unix_ms()?;
    Ok(now.saturating_sub(record.created_unix_ms) >= ttl_ms)
}

fn ensure_private_directory(path: &Path) -> Result<(), TaskLifecycleError> {
    fs::create_dir_all(path).map_err(|error| {
        TaskLifecycleError::internal(format!("failed to create task directory: {error}"))
    })?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
        TaskLifecycleError::internal(format!("failed to secure task directory: {error}"))
    })?;
    Ok(())
}

fn assert_private_regular_file(path: &Path) -> Result<(), TaskLifecycleError> {
    let metadata = fs::symlink_metadata(path).map_err(|error| {
        TaskLifecycleError::internal(format!("failed to inspect task record: {error}"))
    })?;
    if !metadata.file_type().is_file() {
        return Err(TaskLifecycleError::internal(
            "task record is not a regular file",
        ));
    }
    #[cfg(unix)]
    if metadata.permissions().mode() & 0o077 != 0 {
        return Err(TaskLifecycleError::internal(
            "task record permissions must not grant group/other access",
        ));
    }
    Ok(())
}
