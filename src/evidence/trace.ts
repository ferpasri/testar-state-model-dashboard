import { compareIndex } from "./reconstructed-evidence";
import type { ReconstructedEvidence } from "./reconstructed-evidence";
import type { Observation } from "./schema";

export interface ObservationGap {
    id: string;
    source: string;
    target: string;
    run: string;
}

export function observationGaps(
    evidence: ReconstructedEvidence,
    observations: Observation[],
): ObservationGap[] {
    const visible = new Set(observations.map((item) => item.id));
    const sequences = new Set(observations.map((item) => item.test_sequence));
    const completed = new Set<string>();
    for (const item of evidence.executions.values()) {
        if (item.status === "completed" && item.resultingObservation) {
            completed.add(
                JSON.stringify([item.execution.source_observation, item.resultingObservation]),
            );
        }
    }
    const groups = new Map<string, Observation[]>();
    for (const item of evidence.observations.values()) {
        if (sequences.has(item.test_sequence)) {
            const group = groups.get(item.test_sequence) ?? [];
            group.push(item);
            groups.set(item.test_sequence, group);
        }
    }
    const gaps: ObservationGap[] = [];
    for (const [sequence, group] of groups) {
        group.sort((left, right) => compareIndex(left.observation_index, right.observation_index));
        for (let index = 1; index < group.length; index++) {
            const source = group[index - 1].id;
            const target = group[index].id;
            const id = JSON.stringify([source, target]);
            if (visible.has(source) && visible.has(target) && !completed.has(id)) {
                gaps.push({ id, source, target, run: evidence.sequences.get(sequence)!.test_run });
            }
        }
    }
    return gaps;
}
