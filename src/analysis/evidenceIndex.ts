import { testRunForSequence, compareIndex } from "../evidence/reconstructed-evidence";
import { canonical } from "../evidence/common";
import type { RecordedExecution, RecordedRun } from "../evidence/reconstructed-evidence";
import type { EventData, Observation } from "../evidence/schema";
import {
    ABSTRACTION_LIMITS,
    type AnalysisSource,
    type EvidenceReference,
    type IndexCounts,
} from "./types";

export interface IndexedObservation {
    source: AnalysisSource;
    reference: EvidenceReference;
    observation: Observation;
}

export interface EvidenceIndex {
    sources: Map<string, AnalysisSource>;
    runs: Map<string, { source: AnalysisSource; run: RecordedRun }>;
    observations: Map<string, IndexedObservation>;
    widgets: Map<
        string,
        { reference: EvidenceReference; widget: Observation["recorded_state"]["widgets"][number] }
    >;
    actions: Map<string, { source: AnalysisSource; action: EventData<"action_described"> }>;
    executions: Map<string, { source: AnalysisSource; execution: RecordedExecution }>;
    counts: IndexCounts;
}

export function runKey(source: string, run: string): string {
    return canonical([source, run]);
}

export function referenceKey(reference: EvidenceReference): string {
    return canonical([
        reference.source,
        reference.run,
        reference.observation,
        ...(reference.widget === undefined ? [] : [reference.widget]),
    ]);
}

export function buildEvidenceIndex(
    sources: AnalysisSource[],
    selectedRuns: string[],
): EvidenceIndex {
    const index: EvidenceIndex = {
        sources: new Map(),
        runs: new Map(),
        observations: new Map(),
        widgets: new Map(),
        actions: new Map(),
        executions: new Map(),
        counts: { sources: 0, runs: 0, observations: 0, widgets: 0, actions: 0, executions: 0 },
    };
    const selected = new Set(selectedRuns);
    const knownRuns = new Set<string>();
    const sourceIds = new Set<string>();
    const fingerprints = new Set<string>();
    for (const source of [...sources].sort((left, right) =>
        compare(left.fingerprint, right.fingerprint),
    )) {
        if (sourceIds.has(source.id) || fingerprints.has(source.fingerprint)) {
            throw new Error(
                "Each imported evidence source must have a unique identity and fingerprint.",
            );
        }
        sourceIds.add(source.id);
        fingerprints.add(source.fingerprint);
        const includedRuns = new Set<string>();
        for (const run of [...source.evidence.runs.values()].sort((left, right) =>
            compare(left.id, right.id),
        )) {
            const key = runKey(source.id, run.id);
            knownRuns.add(key);
            if (selected.has(key)) {
                index.runs.set(key, { source, run });
                includedRuns.add(run.id);
            }
        }
        if (includedRuns.size === 0) {
            continue;
        }
        index.sources.set(source.id, source);
        const actions = new Set<string>();
        const observations = [...source.evidence.observations.values()]
            .filter((observation) =>
                includedRuns.has(testRunForSequence(source.evidence, observation.test_sequence)),
            )
            .sort(
                (left, right) =>
                    compare(left.test_sequence, right.test_sequence) ||
                    compareIndex(left.observation_index, right.observation_index) ||
                    compare(left.id, right.id),
            );
        for (const observation of observations) {
            const reference = {
                source: source.id,
                run: testRunForSequence(source.evidence, observation.test_sequence),
                observation: observation.id,
            };
            index.observations.set(referenceKey(reference), { source, reference, observation });
            if (index.observations.size > ABSTRACTION_LIMITS.observations) {
                throw new Error(
                    "Select fewer runs: matching supports at most 10,000 observations.",
                );
            }
            for (const widget of observation.recorded_state.widgets) {
                const widgetReference = { ...reference, widget: widget.id };
                index.widgets.set(referenceKey(widgetReference), {
                    reference: widgetReference,
                    widget,
                });
                if (index.widgets.size > ABSTRACTION_LIMITS.widgets) {
                    throw new Error(
                        "Select fewer runs: matching supports at most 100,000 captured widgets.",
                    );
                }
            }
            for (const availableAction of observation.available_actions) {
                actions.add(availableAction.action_description);
            }
        }
        for (const execution of source.evidence.executions.values()) {
            if (
                includedRuns.has(
                    testRunForSequence(source.evidence, execution.execution.test_sequence),
                )
            ) {
                index.executions.set(
                    canonical([
                        source.id,
                        testRunForSequence(source.evidence, execution.execution.test_sequence),
                        execution.execution.id,
                    ]),
                    {
                        source,
                        execution,
                    },
                );
                actions.add(execution.execution.action_description);
            }
        }
        for (const id of [...actions].sort(compare)) {
            const action = source.evidence.actions.get(id);
            if (action) {
                index.actions.set(canonical([source.id, id]), { source, action });
            }
        }
    }
    for (const run of selected) {
        if (!knownRuns.has(run)) {
            throw new Error("A selected run is no longer available in the imported evidence.");
        }
    }
    index.counts = {
        sources: index.sources.size,
        runs: index.runs.size,
        observations: index.observations.size,
        widgets: index.widgets.size,
        actions: index.actions.size,
        executions: index.executions.size,
    };
    return index;
}

export function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
