import type { WorkflowJob } from "#internet/workflow/types";

export type WorkflowTeamPhase = "research" | "review";
export type WorkflowTeamLane = "A" | "B";

function laneFocus(phase: WorkflowTeamPhase, lane: WorkflowTeamLane): string {
	if (phase === "research") {
		return lane === "A"
			? "Prioritize architecture, repository integration points, implementation sequencing, and compatibility with the stated objective."
			: "Independently challenge assumptions; prioritize failure modes, tests, edge cases, security/correctness risks, and a simpler alternative when one exists.";
	}
	return lane === "A"
		? "Review for correctness, architecture, scope discipline, regressions, and whether the implementation actually satisfies the objective."
		: "Review adversarially for edge cases, tests, security/reliability issues, concurrency/state bugs, and hidden failure modes.";
}

/** Build authoritative, deterministic workflow team tasks without an intermediary LLM. */
export class WorkflowTeamPromptBuilder {
	research(job: WorkflowJob, lane: WorkflowTeamLane): string {
		return [
			`Workflow research lane: ${lane}`,
			`Repository: ${job.repository}`,
			`Target base revision: ${job.baseRevision}`,
			"",
			"Objective:",
			job.objective,
			"",
			laneFocus("research", lane),
			"",
			"Analyze independently from the other workflow lane. Use the repository and exact base revision as authoritative scope. Produce one implementation-ready final answer for the writer: concrete files/components to inspect, recommended changes, validation strategy, risks, and any blocker. Do not assume another agent will summarize your final answer.",
		].join("\n");
	}

	review(job: WorkflowJob, lane: WorkflowTeamLane): string {
		const pullRequest = job.pullRequest;
		if (pullRequest === undefined)
			throw new Error("workflow review prompt requires a persisted pull request receipt");
		return [
			`Workflow review lane: ${lane}`,
			`Repository: ${job.repository}`,
			`Original base revision: ${job.baseRevision}`,
			`Pull request: ${pullRequest.url}`,
			`PR number: ${pullRequest.number}`,
			`Review cycle: ${job.reviewCycle}`,
			`Exact PR head SHA to review: ${pullRequest.headSha}`,
			"",
			"Objective:",
			job.objective,
			"",
			laneFocus("review", lane),
			"",
			'Review the actual PR at the exact head SHA above. Treat earlier review cycles only as context; findings must be valid for this head. Return exactly one JSON object and no markdown or surrounding prose. Use {"verdict":"PASS","summary":"concise evidence-based summary"} when no material issue remains. Otherwise use {"verdict":"CHANGES_REQUIRED","findings":[{"severity":"high|medium|low","location":"file/area","issue":"concrete problem","remediation":"required fix"}]}. The complete JSON object is the reviewer payload delivered verbatim to the writer; do not rely on another agent to summarize it.',
		].join("\n");
	}
}
