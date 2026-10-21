import {
    eventSchema,
    type Envelope,
    type EventData,
    type Check,
    type Manifest,
    type Observation,
} from "./schema";
import { canonical, EvidenceError, requireEvidence } from "./common";
import { validateObservation, validateCheck } from "./references";

export interface RecordedRun extends EventData<"run_started"> {
    status: "running" | "finished";
    reason: string | null;
}
export interface RecordedExecution {
    execution: EventData<"action_selected">;
    status: "selected" | "submitted" | "rejected" | "observed" | "incomplete";
    result: string | null;
    error: string | null;
}
export interface EvidenceModel {
    manifest: Manifest;
    eventCount: number;
    runs: Map<string, RecordedRun>;
    observations: Map<string, Observation>;
    actions: Map<string, EventData<"action_defined">>;
    executions: Map<string, RecordedExecution>;
    checks: Array<{ id: string; data: Check }>;
    snapshots: Map<string, Observation["state"]>;
}

export class Replay {
    readonly model: EvidenceModel;
    private readonly events = new Map<string, string>();
    private readonly latest = new Map<string, Observation>();
    private readonly outstanding = new Set<string>();

    constructor(manifest: Manifest) {
        this.model = {
            manifest,
            eventCount: 0,
            runs: new Map(),
            observations: new Map(),
            actions: new Map(),
            executions: new Map(),
            checks: [],
            snapshots: new Map(),
        };
    }

    apply(raw: unknown): void {
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            throw new EvidenceError(
                "Invalid event field " + issue.path.join(".") + ": " + issue.message,
            );
        }
        const envelope = parsed.data;
        const encoded = canonical(envelope);
        const existing = this.events.get(envelope.id);
        if (existing !== undefined) {
            requireEvidence(existing === encoded, "Event ID has conflicting content.");
            return;
        }
        try {
            this.project(envelope);
        } catch (error) {
            if (error instanceof EvidenceError) {
                error.event = envelope.id;
            }
            throw error;
        }
        this.events.set(envelope.id, encoded);
        this.model.eventCount++;
    }

    private running(id: string): RecordedRun {
        const run = this.model.runs.get(id);
        requireEvidence(run && run.status === "running", "Reference must identify a running run.");
        return run;
    }

    private project(envelope: Envelope): void {
        const event = envelope.event;
        const model = this.model;
        switch (event.kind) {
            case "run_started": {
                const data = event.data;
                requireEvidence(!model.runs.has(data.id), "Run ID already exists.");
                model.runs.set(data.id, { ...data, status: "running", reason: null });
                break;
            }
            case "action_defined": {
                const data = event.data;
                const previous = model.actions.get(data.id);
                requireEvidence(
                    !previous || canonical(previous) === canonical(data),
                    "Action ID has conflicting content.",
                );
                model.actions.set(data.id, data);
                break;
            }
            case "observed": {
                const data = event.data;
                this.running(data.run);
                requireEvidence(!model.observations.has(data.id), "Observation ID already exists.");
                const previous = this.latest.get(data.run);
                requireEvidence(
                    !previous || previous.sequence < data.sequence,
                    "Observation sequence must increase within its run.",
                );
                const snapshot = model.snapshots.get(data.state.id);
                requireEvidence(
                    !snapshot || canonical(snapshot) === canonical(data.state),
                    "Snapshot ID has conflicting content.",
                );
                validateObservation(model, data);
                model.observations.set(data.id, data);
                model.snapshots.set(data.state.id, data.state);
                this.latest.set(data.run, data);
                break;
            }
            case "action_selected": {
                const data = event.data;
                this.running(data.run);
                requireEvidence(!model.executions.has(data.id), "Execution ID already exists.");
                const source = model.observations.get(data.source);
                const latest = this.latest.get(data.run);
                requireEvidence(
                    source && source.run === data.run && latest?.id === source.id,
                    "Execution source must be the latest observation of its run.",
                );
                requireEvidence(
                    source.candidates.some(
                        (item) => item.action === data.action && item.target === data.target,
                    ),
                    "Selected action and target must be a source candidate.",
                );
                requireEvidence(
                    !this.outstanding.has(data.run),
                    "Run already has an outstanding execution.",
                );
                model.executions.set(data.id, {
                    execution: data,
                    status: "selected",
                    result: null,
                    error: null,
                });
                this.outstanding.add(data.run);
                break;
            }
            case "action_submitted": {
                const data = event.data;
                const record = model.executions.get(data.execution);
                requireEvidence(
                    record && record.status === "selected",
                    "Submission requires a selected execution.",
                );
                this.running(record.execution.run);
                requireEvidence(
                    !data.accepted || data.error === null,
                    "Accepted submission cannot have an error.",
                );
                record.status = data.accepted ? "submitted" : "rejected";
                record.error = data.error;
                if (!data.accepted) {
                    this.outstanding.delete(record.execution.run);
                }
                break;
            }
            case "action_result": {
                const data = event.data;
                const record = model.executions.get(data.execution);
                const target = model.observations.get(data.observation);
                requireEvidence(
                    record && record.status === "submitted",
                    "Result requires a submitted execution.",
                );
                this.running(record.execution.run);
                const source = model.observations.get(record.execution.source)!;
                requireEvidence(
                    target && target.run === source.run && target.sequence > source.sequence,
                    "Result must identify a later observation in the same run.",
                );
                record.status = "observed";
                record.result = data.observation;
                this.outstanding.delete(record.execution.run);
                break;
            }
            case "checked": {
                validateCheck(model, event.data);
                model.checks.push({ id: envelope.id, data: event.data });
                break;
            }
            case "run_finished": {
                const data = event.data;
                const run = this.running(data.run);
                run.status = "finished";
                run.reason = data.reason;
                this.outstanding.delete(data.run);
                for (const execution of model.executions.values()) {
                    if (
                        execution.execution.run === data.run &&
                        ["selected", "submitted"].includes(execution.status)
                    ) {
                        execution.status = "incomplete";
                    }
                }
                break;
            }
        }
    }
}
