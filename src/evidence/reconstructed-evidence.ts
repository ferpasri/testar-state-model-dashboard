import {
    eventSchema,
    type EvidenceEvent,
    type EventData,
    type OracleResult,
    type Manifest,
    type Observation,
} from "./schema";
import { canonical, EvidenceError, requireEvidence } from "./common";
import { validateObservation, validateOracleResult } from "./references";

export interface RecordedRun extends EventData<"test_run_started"> {
    status: "running" | "finished";
    reason: string | null;
}
export interface RecordedSequence extends EventData<"test_sequence_started"> {
    status: "running" | "finished";
    reason: string | null;
}
export interface RecordedExecution {
    execution: EventData<"action_selected">;
    status:
        | "awaiting_execution_result"
        | "awaiting_resulting_observation"
        | "failed"
        | "completed"
        | "incomplete";
    executionResult: EventData<"action_execution_reported"> | null;
    resultingObservation: string | null;
}
export interface ReconstructedEvidence {
    manifest: Manifest;
    eventCount: number;
    runs: Map<string, RecordedRun>;
    sequences: Map<string, RecordedSequence>;
    observations: Map<string, Observation>;
    actions: Map<string, EventData<"action_described">>;
    executions: Map<string, RecordedExecution>;
    oracleResults: Array<{ id: string; data: OracleResult }>;
    recordedStates: Map<string, Observation["recorded_state"]>;
}
export function testRunForSequence(evidence: ReconstructedEvidence, sequence: string): string {
    const record = evidence.sequences.get(sequence);
    requireEvidence(record, "Unknown test sequence.");
    return record.test_run;
}
export function compareIndex(left: number | bigint, right: number | bigint): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
export class Replay {
    readonly evidence: ReconstructedEvidence;
    private readonly events = new Map<string, string>();
    private readonly latest = new Map<string, Observation>();
    private readonly outstanding = new Set<string>();

    constructor(manifest: Manifest) {
        this.evidence = {
            manifest,
            eventCount: 0,
            runs: new Map(),
            sequences: new Map(),
            observations: new Map(),
            actions: new Map(),
            executions: new Map(),
            oracleResults: [],
            recordedStates: new Map(),
        };
    }
    apply(raw: unknown): void {
        const parsed = eventSchema.safeParse(raw);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            const field = issue.path.slice(2).join(".");
            const rawRecord = raw as { id?: string };
            const severity = issue.path.includes("oracle_severity");
            throw new EvidenceError(
                "Invalid event field " + issue.path.join(".") + ": " + issue.message,
                severity ? "invalid_oracle_severity" : "invalid_record",
                field,
                rawRecord?.id,
            );
        }
        const evidenceEvent = parsed.data;
        const encoded = canonical(evidenceEvent);
        const previous = this.events.get(evidenceEvent.id);
        if (previous !== undefined) {
            requireEvidence(previous === encoded, "Event ID has conflicting content.");
            return;
        }
        try {
            this.project(evidenceEvent);
        } catch (error) {
            if (error instanceof EvidenceError) {
                error.event = evidenceEvent.id;
            }
            throw error;
        }
        this.events.set(evidenceEvent.id, encoded);
        this.evidence.eventCount++;
    }
    private require(
        condition: unknown,
        code: string,
        message: string,
        field?: string,
    ): asserts condition {
        if (!condition) {
            throw new EvidenceError(message + (field ? " (" + field + ")" : ""), code, field);
        }
    }
    private activeSequence(id: string): RecordedSequence {
        const sequence = this.evidence.sequences.get(id);
        this.require(sequence, "invalid_reference", "Unknown test sequence.", "test_sequence");
        this.require(
            sequence.status === "running",
            "invalid_lifecycle",
            "Test sequence has finished.",
            "test_sequence",
        );
        return sequence;
    }
    private execution(id: string): RecordedExecution {
        const record = this.evidence.executions.get(id);
        this.require(record, "invalid_reference", "Unknown action execution.", "action_execution");
        return record;
    }
    private project(evidenceEvent: EvidenceEvent): void {
        const event = evidenceEvent.event;
        const evidence = this.evidence;
        switch (event.event_type) {
            case "test_run_started": {
                const data = event.data;
                this.require(
                    !evidence.runs.has(data.id),
                    "conflict",
                    "Test run ID already exists.",
                );
                evidence.runs.set(data.id, { ...data, status: "running", reason: null });
                break;
            }
            case "test_sequence_started": {
                const data = event.data;
                const run = evidence.runs.get(data.test_run);
                this.require(run, "invalid_reference", "Unknown parent test run.", "test_run");
                this.require(
                    run.status === "running",
                    "invalid_lifecycle",
                    "Parent test run has finished.",
                    "test_run",
                );
                this.require(
                    !evidence.sequences.has(data.id),
                    "conflict",
                    "Test sequence ID already exists.",
                );
                this.require(
                    [...evidence.sequences.values()].every(
                        (sequence) =>
                            sequence.test_run !== data.test_run ||
                            sequence.sequence_index < data.sequence_index,
                    ),
                    "invalid_order",
                    "Sequence indexes must increase within the run.",
                    "sequence_index",
                );
                evidence.sequences.set(data.id, { ...data, status: "running", reason: null });
                break;
            }
            case "action_described": {
                const data = event.data;
                const previous = evidence.actions.get(data.id);
                this.require(
                    !previous || canonical(previous) === canonical(data),
                    "conflict",
                    "Action description has changed.",
                );
                evidence.actions.set(data.id, data);
                break;
            }
            case "observation_recorded": {
                const data = event.data;
                this.activeSequence(data.test_sequence);
                this.require(
                    !evidence.observations.has(data.id),
                    "conflict",
                    "Observation ID already exists.",
                );
                const previous = this.latest.get(data.test_sequence);
                this.require(
                    !previous || previous.observation_index < data.observation_index,
                    "invalid_order",
                    "Observation index must increase within the sequence.",
                    "observation_index",
                );
                const state = evidence.recordedStates.get(data.recorded_state.id);
                this.require(
                    !state || canonical(state) === canonical(data.recorded_state),
                    "conflict",
                    "Recorded-state ID has conflicting content.",
                );
                validateObservation(evidence, data);
                evidence.observations.set(data.id, data);
                evidence.recordedStates.set(data.recorded_state.id, data.recorded_state);
                this.latest.set(data.test_sequence, data);
                break;
            }
            case "action_selected": {
                const data = event.data;
                this.activeSequence(data.test_sequence);
                this.require(
                    !evidence.executions.has(data.id),
                    "conflict",
                    "Execution ID already exists.",
                );
                const source = evidence.observations.get(data.source_observation);
                this.require(
                    source &&
                        source.test_sequence === data.test_sequence &&
                        this.latest.get(data.test_sequence)?.id === source.id,
                    "invalid_reference",
                    "Source must be the sequence's latest observation.",
                    "source_observation",
                );
                this.require(
                    source.available_actions.some(
                        (action) =>
                            action.action_description === data.action_description &&
                            action.target_widget === data.target_widget,
                    ),
                    "invalid_reference",
                    "Selected action and target are not available at source.",
                    "action_description",
                );
                this.require(
                    !this.outstanding.has(data.test_sequence),
                    "invalid_lifecycle",
                    "Sequence already has an unfinished execution.",
                    "test_sequence",
                );
                evidence.executions.set(data.id, {
                    execution: data,
                    status: "awaiting_execution_result",
                    executionResult: null,
                    resultingObservation: null,
                });
                this.outstanding.add(data.test_sequence);
                break;
            }
            case "action_execution_reported": {
                const data = event.data;
                const record = this.execution(data.action_execution);
                this.activeSequence(record.execution.test_sequence);
                this.require(
                    record.status === "awaiting_execution_result",
                    "invalid_lifecycle",
                    "Execution result already reported.",
                    "action_execution",
                );
                this.require(
                    data.outcome !== "returned" || data.error === null,
                    "invalid_record",
                    "A returned execution cannot have an error.",
                    "error",
                );
                record.executionResult = data;
                record.status =
                    data.outcome === "returned" ? "awaiting_resulting_observation" : "failed";
                if (data.outcome === "error") {
                    this.outstanding.delete(record.execution.test_sequence);
                }
                break;
            }
            case "transition_recorded": {
                const data = event.data;
                const record = this.execution(data.action_execution);
                this.activeSequence(record.execution.test_sequence);
                this.require(
                    record.status === "awaiting_resulting_observation",
                    "invalid_lifecycle",
                    "Execution is not awaiting a resulting observation.",
                    "action_execution",
                );
                const source = evidence.observations.get(record.execution.source_observation)!;
                const result = evidence.observations.get(data.resulting_observation);
                this.require(
                    result &&
                        result.test_sequence === source.test_sequence &&
                        result.observation_index > source.observation_index,
                    "invalid_transition",
                    "Result must be later in the same sequence.",
                    "resulting_observation",
                );
                record.status = "completed";
                record.resultingObservation = data.resulting_observation;
                this.outstanding.delete(record.execution.test_sequence);
                break;
            }
            case "oracle_result_recorded":
                validateOracleResult(evidence, event.data);
                evidence.oracleResults.push({ id: evidenceEvent.id, data: event.data });
                break;
            case "test_sequence_finished": {
                const data = event.data;
                const sequence = this.activeSequence(data.test_sequence);
                sequence.status = "finished";
                sequence.reason = data.reason;
                this.outstanding.delete(data.test_sequence);
                for (const record of evidence.executions.values()) {
                    if (
                        record.execution.test_sequence === data.test_sequence &&
                        ["awaiting_execution_result", "awaiting_resulting_observation"].includes(
                            record.status,
                        )
                    ) {
                        record.status = "incomplete";
                    }
                }
                break;
            }
            case "test_run_finished": {
                const data = event.data;
                const run = evidence.runs.get(data.test_run);
                this.require(
                    run && run.status === "running",
                    "invalid_lifecycle",
                    "Test run is not active.",
                    "test_run",
                );
                this.require(
                    [...evidence.sequences.values()].every(
                        (sequence) =>
                            sequence.test_run !== data.test_run || sequence.status === "finished",
                    ),
                    "invalid_lifecycle",
                    "Finish the run's sequences first.",
                    "test_run",
                );
                run.status = "finished";
                run.reason = data.reason;
                break;
            }
        }
    }
}
