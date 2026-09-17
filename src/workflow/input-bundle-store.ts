import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensurePrivateDirectory, writePrivateJson } from "#internet/core/private-json";
import {
	normalizeArtifactRefs,
	normalizeInputFacts,
	workflowInputBundleId,
} from "#internet/workflow/kernel/identity";
import {
	WORKFLOW_INPUT_BUNDLE_SCHEMA,
	type WorkflowArtifactRef,
	type WorkflowInputBundle,
	type WorkflowInputFact,
	type WorkflowVersionRef,
} from "#internet/workflow/kernel/types";
import { parseWorkflowInputBundle } from "#internet/workflow/kernel/validation";

export interface CreateWorkflowInputBundleInput {
	readonly runId: string;
	readonly workItemId: string;
	readonly capability: WorkflowVersionRef;
	readonly projection: WorkflowVersionRef;
	readonly artifacts?: readonly WorkflowArtifactRef[];
	readonly facts?: readonly WorkflowInputFact[];
}

export class WorkflowInputBundleStoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkflowInputBundleStoreError";
	}
}

function assertHex(value: string, length: number, label: string): void {
	if (!new RegExp(`^[0-9a-f]{${String(length)}}$`, "u").test(value)) {
		throw new WorkflowInputBundleStoreError(`${label} must be ${String(length)} lowercase hex characters`);
	}
}

function assertPrivateFile(path: string, label: string): void {
	const stat = lstatSync(path);
	if (!stat.isFile()) throw new WorkflowInputBundleStoreError(`${label} is not a regular file`);
	if (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
		throw new WorkflowInputBundleStoreError(`${label} permissions must be 0600`);
}

export class WorkflowInputBundleStore {
	private readonly root: string;

	constructor(dataDir: string) {
		this.root = join(dataDir, "workflows", "input-bundles");
	}

	private runDir(runId: string): string {
		assertHex(runId, 32, "workflow run id");
		return join(this.root, runId);
	}

	pathFor(runId: string, bundleId: string): string {
		assertHex(bundleId, 64, "workflow input bundle id");
		return join(this.runDir(runId), `${bundleId}.json`);
	}

	create(input: CreateWorkflowInputBundleInput): WorkflowInputBundle {
		const artifacts = normalizeArtifactRefs(input.artifacts ?? []);
		const facts = normalizeInputFacts(input.facts ?? []);
		const bundleId = workflowInputBundleId({
			runId: input.runId,
			workItemId: input.workItemId,
			capability: input.capability,
			projection: input.projection,
			artifacts,
			facts,
		});
		const path = this.pathFor(input.runId, bundleId);
		if (existsSync(path)) {
			const current = this.get(input.runId, bundleId);
			if (current === undefined) throw new WorkflowInputBundleStoreError(`workflow input bundle ${bundleId} disappeared`);
			return current;
		}
		const bundle: WorkflowInputBundle = {
			schema: WORKFLOW_INPUT_BUNDLE_SCHEMA,
			version: 1,
			bundleId,
			runId: input.runId,
			workItemId: input.workItemId,
			capability: input.capability,
			projection: input.projection,
			artifacts,
			facts,
			createdAt: new Date().toISOString(),
		};
		parseWorkflowInputBundle(bundle);
		ensurePrivateDirectory(this.runDir(input.runId));
		writePrivateJson(path, bundle);
		return bundle;
	}

	get(runId: string, bundleId: string): WorkflowInputBundle | undefined {
		const path = this.pathFor(runId, bundleId);
		if (!existsSync(path)) return undefined;
		assertPrivateFile(path, `workflow input bundle ${bundleId}`);
		try {
			return parseWorkflowInputBundle(JSON.parse(readFileSync(path, "utf8")));
		} catch (error) {
			throw new WorkflowInputBundleStoreError(
				`workflow input bundle ${bundleId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	list(runId: string): readonly WorkflowInputBundle[] {
		const directory = this.runDir(runId);
		if (!existsSync(directory)) return [];
		if (!lstatSync(directory).isDirectory())
			throw new WorkflowInputBundleStoreError(`workflow input bundles path for run ${runId} is not a directory`);
		return readdirSync(directory)
			.filter((name) => /^[0-9a-f]{64}\.json$/u.test(name))
			.sort()
			.map((name) => {
				const bundle = this.get(runId, name.slice(0, -5));
				if (bundle === undefined)
					throw new WorkflowInputBundleStoreError(`workflow input bundle ${name} disappeared during enumeration`);
				return bundle;
			});
	}
}
