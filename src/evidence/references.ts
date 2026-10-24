import { canonical, EvidenceError, requireEvidence, safePath } from "./common";
import type { OracleResult, Observation } from "./schema";
import type { ReconstructedEvidence } from "./reconstructed-evidence";

export function validateObservation(
    evidence: ReconstructedEvidence,
    observation: Observation,
): void {
    const state = observation.recorded_state;
    const widgets = new Map(state.widgets.map((item) => [item.id, item]));
    requireEvidence(widgets.size === state.widgets.length, "Duplicate widget ID.");
    requireEvidence(
        state.capture !== "unavailable" || widgets.size === 0,
        "Unavailable capture cannot contain widgets.",
    );
    const completed = new Set<string>();
    for (const widget of widgets.values()) {
        const ancestry = new Set<string>();
        let current: typeof widget | undefined = widget;
        while (current && !completed.has(current.id)) {
            requireEvidence(!ancestry.has(current.id), "Widget hierarchy contains a cycle.");
            ancestry.add(current.id);
            if (current.parent === null) {
                break;
            }
            requireEvidence(widgets.has(current.parent), "Widget parent is missing.");
            current = widgets.get(current.parent);
        }
        for (const id of ancestry) {
            completed.add(id);
        }
    }
    const availableActions = new Set<string>();
    for (const availableAction of observation.available_actions) {
        if (!evidence.actions.has(availableAction.action_description)) {
            throw new EvidenceError(
                "Unknown available action description.",
                "invalid_reference",
                "available_actions.action_description",
            );
        }
        requireEvidence(
            availableAction.target_widget === null || widgets.has(availableAction.target_widget),
            "Available-action target widget is missing.",
        );
        const key = canonical(availableAction);
        requireEvidence(!availableActions.has(key), "Duplicate available action.");
        availableActions.add(key);
    }
    const artifacts = new Set<string>();
    for (const artifact of observation.artifacts) {
        safePath(artifact.path);
        requireEvidence(!artifacts.has(artifact.id), "Duplicate artifact ID.");
        artifacts.add(artifact.id);
    }
}

export function validateOracleResult(evidence: ReconstructedEvidence, result: OracleResult): void {
    function require(condition: unknown, code: string, field: string): asserts condition {
        if (!condition) {
            throw new EvidenceError(
                "Invalid oracle reference or reporting context: " + field,
                code,
                field,
            );
        }
    }
    require(evidence.runs.has(result.test_run), "invalid_reference", "test_run");
    const target = result.oracle_target;
    const sequence =
        result.test_sequence === undefined
            ? undefined
            : evidence.sequences.get(result.test_sequence);
    function observation(id: string, field: string): Observation {
        const record = evidence.observations.get(id);
        require(record &&
            record.test_sequence === result.test_sequence, "invalid_oracle_target", field);
        return record;
    }
    if (target.target_type === "test_run") {
        require(result.test_sequence === undefined, "invalid_oracle_target", "test_sequence");
    } else {
        require(sequence &&
            sequence.test_run === result.test_run, "invalid_oracle_target", "test_sequence");
        switch (target.target_type) {
            case "test_sequence":
                break;
            case "observation":
            case "state_property":
                observation(target.observation, "oracle_target.observation");
                break;
            case "widget":
            case "widget_property": {
                const record = observation(target.observation, "oracle_target.observation");
                require(record.recorded_state.widgets.some(
                    (widget) => widget.id === target.widget,
                ), "invalid_oracle_target", "oracle_target.widget");
                break;
            }
            case "action_execution":
                require(evidence.executions.get(target.action_execution)?.execution
                    .test_sequence ===
                    result.test_sequence, "invalid_oracle_target", "oracle_target.action_execution");
                break;
            case "observation_range": {
                const first = observation(
                    target.first_observation,
                    "oracle_target.first_observation",
                );
                const last = observation(target.last_observation, "oracle_target.last_observation");
                require(last.observation_index >=
                    first.observation_index, "invalid_oracle_target", "oracle_target.last_observation");
                break;
            }
        }
    }
    const value = result.oracle_details["evidence.assessment"];
    if (value === undefined) {
        return;
    }
    const prefix = "oracle_details.evidence.assessment";
    require(value !== null &&
        typeof value === "object" &&
        !Array.isArray(value), "invalid_record", prefix);
    const assessment = value as Record<string, unknown>;
    require(["during_run", "end_of_run", "during_sequence", "end_of_sequence"].includes(
        String(assessment.phase),
    ), "invalid_record", prefix + ".phase");
    require(["open_ended", "recorded_interval"].includes(
        String(assessment.semantics),
    ), "invalid_record", prefix + ".semantics");
    const sequencePhase = String(assessment.phase).endsWith("sequence");
    if (sequencePhase) {
        require(sequence, "invalid_oracle_target", "test_sequence");
    }
    const history = sequencePhase ? sequence! : evidence.runs.get(result.test_run)!;
    const finished = history.status === "finished";
    require(finished === String(assessment.phase).startsWith("end_"), "invalid_lifecycle", prefix +
        ".phase");
    if (Object.hasOwn(assessment, "termination_reason")) {
        require(finished &&
            typeof assessment.termination_reason === "string" &&
            assessment.termination_reason === history.reason, "invalid_record", prefix +
            ".termination_reason");
    }
}
