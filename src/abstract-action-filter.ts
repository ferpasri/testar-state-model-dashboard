import type { AbstractActionEvidence, EvidenceReference } from "testar-abstraction";

export function filterActionEvidence(
    evidence: AbstractActionEvidence,
    selected: (reference: Pick<EvidenceReference, "source" | "run">) => boolean,
): AbstractActionEvidence {
    return {
        actions: evidence.actions.flatMap((action) => {
            const availability = action.availability
                .filter((item) => selected(item.reference))
                .map((item) => ({
                    ...item,
                    recordedExecutions: item.recordedExecutions.filter(selected),
                }));
            const executions = action.executions
                .filter((item) => selected(item.reference))
                .map((item) => ({
                    ...item,
                    recordedAvailableActions: item.recordedAvailableActions.filter(selected),
                }));
            return availability.length || executions.length
                ? [{ ...action, availability, executions }]
                : [];
        }),
        unmatchedAvailableActions: evidence.unmatchedAvailableActions
            .filter((item) => selected(item.reference))
            .map((item) => ({
                ...item,
                recordedExecutions: item.recordedExecutions.filter(selected),
            })),
        unmatchedExecutions: evidence.unmatchedExecutions
            .filter((item) => selected(item.reference))
            .map((item) => ({
                ...item,
                recordedAvailableActions: item.recordedAvailableActions.filter(selected),
            })),
    };
}
