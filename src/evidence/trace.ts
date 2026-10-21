import type { EvidenceModel } from "./model";
import type { Observation } from "./schema";

export interface ObservationGap {
    id: string;
    source: string;
    target: string;
    run: string;
}

export function observationGaps(
    model: EvidenceModel,
    observations: Observation[],
): ObservationGap[] {
    const visible = new Set(observations.map((item) => item.id));
    const runs = new Set(observations.map((item) => item.run));
    const completed = new Set<string>();
    for (const item of model.executions.values()) {
        if (item.status === "observed" && item.result) {
            completed.add(JSON.stringify([item.execution.source, item.result]));
        }
    }
    const groups = new Map<string, Observation[]>();
    for (const item of model.observations.values()) {
        if (runs.has(item.run)) {
            const group = groups.get(item.run) ?? [];
            group.push(item);
            groups.set(item.run, group);
        }
    }
    const gaps: ObservationGap[] = [];
    for (const [run, group] of groups) {
        group.sort((left, right) => left.sequence - right.sequence);
        for (let index = 1; index < group.length; index++) {
            const source = group[index - 1].id;
            const target = group[index].id;
            const id = JSON.stringify([source, target]);
            if (visible.has(source) && visible.has(target) && !completed.has(id)) {
                gaps.push({ id, source, target, run });
            }
        }
    }
    return gaps;
}
