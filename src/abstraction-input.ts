import { testRunForSequence } from "./evidence/reconstructed-evidence";
import { ABSTRACTION_LIMITS, runKey, type AnalysisSource } from "testar-abstraction";
import type { ImportedSource } from "./evidence/import";

export function abstractionInputs(
    sources: ImportedSource[],
    selectedRuns: string[],
): AnalysisSource[] {
    const selected = new Set(selectedRuns);
    let observationsCount = 0;
    let widgetsCount = 0;
    const result: AnalysisSource[] = [];
    for (const source of sources) {
        const runs = new Map(
            Array.from(source.evidence.runs).filter(([id]) => selected.has(runKey(source.id, id))),
        );
        if (runs.size === 0) {
            continue;
        }
        const observations = new Map(
            Array.from(source.evidence.observations).filter(([, observation]) =>
                runs.has(testRunForSequence(source.evidence, observation.test_sequence)),
            ),
        );
        for (const observation of observations.values()) {
            observationsCount += 1;
            widgetsCount += observation.recorded_state.widgets.length;
        }
        if (
            observationsCount > ABSTRACTION_LIMITS.observations ||
            widgetsCount > ABSTRACTION_LIMITS.widgets
        ) {
            throw new Error(
                "Select fewer runs. Matching supports up to 10,000 observations and 100,000 widgets.",
            );
        }
        const executions = new Map(
            Array.from(source.evidence.executions).filter(([, execution]) =>
                runs.has(testRunForSequence(source.evidence, execution.execution.test_sequence)),
            ),
        );
        const actionIds = new Set([
            ...Array.from(observations.values()).flatMap((observation) =>
                observation.available_actions.map(
                    (availableAction) => availableAction.action_description,
                ),
            ),
            ...Array.from(
                executions.values(),
                (execution) => execution.execution.action_description,
            ),
        ]);
        result.push({
            id: source.id,
            label: source.label,
            fingerprint: source.fingerprint,
            evidence: {
                runs,
                sequences: new Map(
                    Array.from(source.evidence.sequences).filter(([, sequence]) =>
                        runs.has(sequence.test_run),
                    ),
                ),
                observations,
                executions,
                actions: new Map(
                    Array.from(source.evidence.actions).filter(([id]) => actionIds.has(id)),
                ),
            },
        });
    }
    return result;
}
