import { MATCHING_LIMITS, runKey, type AnalysisSource } from "./analysis";
import type { ImportedSource } from "./evidence/import";

export function matchingInputs(
    sources: ImportedSource[],
    selectedRuns: string[],
): AnalysisSource[] {
    const selected = new Set(selectedRuns);
    let observationsCount = 0;
    let widgetsCount = 0;
    const result: AnalysisSource[] = [];
    for (const source of sources) {
        const runs = new Map(
            Array.from(source.model.runs).filter(([id]) => selected.has(runKey(source.id, id))),
        );
        if (runs.size === 0) {
            continue;
        }
        const observations = new Map(
            Array.from(source.model.observations).filter(([, observation]) =>
                runs.has(observation.run),
            ),
        );
        for (const observation of observations.values()) {
            observationsCount += 1;
            widgetsCount += observation.state.widgets.length;
        }
        if (
            observationsCount > MATCHING_LIMITS.observations ||
            widgetsCount > MATCHING_LIMITS.widgets
        ) {
            throw new Error(
                "Select fewer runs. Matching supports up to 10,000 observations and 100,000 widgets.",
            );
        }
        const executions = new Map(
            Array.from(source.model.executions).filter(([, execution]) =>
                runs.has(execution.execution.run),
            ),
        );
        const actionIds = new Set([
            ...Array.from(observations.values()).flatMap((observation) =>
                observation.candidates.map((candidate) => candidate.action),
            ),
            ...Array.from(executions.values(), (execution) => execution.execution.action),
        ]);
        result.push({
            id: source.id,
            label: source.label,
            fingerprint: source.fingerprint,
            model: {
                ...source.model,
                runs,
                observations,
                executions,
                actions: new Map(
                    Array.from(source.model.actions).filter(([id]) => actionIds.has(id)),
                ),
                checks: [],
                snapshots: new Map(),
            },
        });
    }
    return result;
}
