import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(text, pattern, replacement, label) {
	const next = text.replace(pattern, replacement);
	if (next === text) throw new Error(`phase1 plan sync did not match ${label}`);
	return next;
}

const planPath = ".internet/workspace/PLAN.md";
let plan = readFileSync(planPath, "utf8");
plan = replaceOnce(
	plan,
	/Admission lifecycle should support states equivalent to:\n\n```text\nDRAFT\nPREFLIGHTED\nAWAITING_CONFIRMATION\nACCEPTED\nACTIVATED\nEXPIRED\nSUPERSEDED\n```/u,
	[
		"Phase 1 admission lifecycle uses only states with defined production transitions:",
		"",
		"```text",
		"DRAFT",
		"PREFLIGHTED",
		"AWAITING_CONFIRMATION",
		"ACCEPTED",
		"ACTIVATING",
		"ACTIVATED",
		"```",
		"",
		"`ACTIVATING` durably records exact activation intent before the execution target is ensured. Expiration or supersession shall be added only when a concrete policy defines its trigger, authority, and recovery semantics; unused terminal states are not introduced speculatively.",
	].join("\n"),
	"Phase 1 lifecycle",
);
plan = replaceOnce(
	plan,
	"Keep `/workflow <objective>` and existing tool start behavior as compatibility adapters initially.",
	"`/workflow <objective>` remains the User-explicit `AUTO_SUBMIT` convenience path. The low-level Local Agent client uses explicit `admit -> confirm -> activate`; no direct-start compatibility path bypasses admission.",
	"Phase 1 client compatibility wording",
);
writeFileSync(planPath, plan);

const todoPath = ".internet/workspace/TODO.md";
let todo = readFileSync(todoPath, "utf8");
todo = replaceOnce(
	todo,
	/Architecture\/design only\. Runtime implementation should begin only after Design Gate D0 is complete\.[\s\S]*?The highest-priority implementation gap remains the lack of one authoritative application\/service boundary shared by the slash command and low-level workflow tool\./u,
	[
		"**Design Gate D0 is complete. Phase 0 has landed on `main`, and Phase 1 durable admission is implemented in PR #39.**",
		"",
		"The current production migration now has one authoritative `WorkflowService` boundary, explicit principal/authorization context, durable provenance-preserving admission, deterministic preflight, explicit Local/User confirmation, exact accepted-spec activation, and crash-safe idempotent activation of the current software `WorkflowJob` target.",
		"",
		"The next implementation milestone is the parallel vNext kernel substrate (`WorkflowRun`, Artifact, WorkItem, InputBundle, capability registry) without mutating the existing v3 durable-job schema in place.",
	].join("\n"),
	"TODO current status",
);
todo = replaceOnce(
	todo,
	/## P0 — WorkflowService \/ authorization boundary\n\n[\s\S]*?\n## P0 — Migration contract/u,
	[
		"## P0 — WorkflowService / authorization boundary",
		"",
		"- [x] Add `WorkflowService` as the single workflow client boundary.",
		"- [x] Define an explicit authorization context/principal input for service operations.",
		"- [x] Preserve v3 `ownerSessionId` behavior through a session-binding adapter.",
		"- [x] Do not make creator-session identity the permanent vNext authorization model.",
		"- [x] Route `/workflow` command operations through `WorkflowService`.",
		"- [x] Route `internet_workflow` tool operations through `WorkflowService`.",
		"- [x] Centralize authorization for status, cancel, continue/recover, and delete.",
		"- [x] Add cross-session denial tests for status.",
		"- [x] Add cross-session denial tests for cancel.",
		"- [x] Add cross-session denial tests for continue/recover.",
		"- [x] Add cross-session denial tests for delete.",
		"- [x] Preserve current v3 execution semantics and exact-head behavior while routing new starts through admission.",
		"- [x] Remove obsolete direct-start/tool compatibility paths once durable admission became the authoritative current-spec client protocol.",
		"",
		"## P0 — Migration contract",
	].join("\n"),
	"TODO Phase 0 service block",
);
todo = replaceOnce(
	todo,
	/## P1 — Durable admission\n\n[\s\S]*?\n## P1 — Kernel substrate/u,
	[
		"## P1 — Durable admission",
		"",
		"- [x] Define `WorkflowAdmissionDraft`.",
		"- [x] Define immutable accepted `AdmissionSpec`.",
		"- [x] Define field provenance: User explicit / Local interpretation / policy default / Planner derivation / system observation, with confirmation provenance recorded separately.",
		"- [x] Add durable `WorkflowAdmissionStore` for pre-run records.",
		"- [x] Define concrete admission lifecycle: DRAFT / PREFLIGHTED / AWAITING_CONFIRMATION / ACCEPTED / ACTIVATING / ACTIVATED.",
		"- [x] Define deterministic admission validation.",
		"- [x] Define deterministic preflight result/preview.",
		"- [x] Define stable canonical admission hashing and schema/version identity.",
		"- [x] Persist confirmation provenance/receipt when confirmation is required.",
		"- [x] Require activation against the exact accepted-spec hash.",
		"- [x] Add stale/mismatched admission activation tests.",
		"- [x] Add reconstruction/retry coverage for outstanding confirmation and activation crash windows.",
		"- [x] Add initial software profile admission mapping and profile registry boundary.",
		"- [x] Keep `/workflow <objective>` as the User-explicit `AUTO_SUBMIT` convenience path while the low-level client uses explicit `admit -> confirm -> activate`.",
		"",
		"## P1 — Kernel substrate",
	].join("\n"),
	"TODO Phase 1 admission block",
);
todo = replaceOnce(
	todo,
	/## Validation checklist for every implementation PR\n\n[\s\S]*?\n## Design-PR completion checklist/u,
	[
		"## Validation checklist for every implementation PR",
		"",
		"- [x] Run focused Vitest files while developing Phase 0/1.",
		"- [x] `npm run check`",
		"- [x] `npm test`",
		"- [x] `npm run build`",
		"- [x] `npm run verify-package`",
		"- [x] Confirm existing v3 characterization tests remain green; Phase 1 changes startup admission without replacing the v3 execution/state contract.",
		"",
		"## Design-PR completion checklist",
	].join("\n"),
	"TODO validation block",
);
writeFileSync(todoPath, todo);
