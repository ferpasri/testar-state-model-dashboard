import { useState } from "react";
import type { AbstractModel, EvidenceReference, ExecutionReference } from "testar-abstraction";
import { actionLabel } from "./abstract-action-presentation";

export function AbstractActionsPanel({
    model,
    selectedAction,
    onSelectAction,
    onOpenObservation,
    onOpenExecution,
}: {
    model: AbstractModel;
    selectedAction: string;
    onSelectAction: (id: string) => void;
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
}) {
    const [limit, setLimit] = useState(30);
    const evidence = model.actionEvidence;
    if (!evidence) {
        return (
            <p className="notice">
                To match available actions, choose the "Page address and available actions" preset
                or add an actions section to your abstraction rules, then build the model.
            </p>
        );
    }
    const unmatched =
        evidence.unmatchedAvailableActions.length + evidence.unmatchedExecutions.length;
    return (
        <section className="abstraction-panel" aria-label="Abstract actions">
            <h3>Abstract actions ({evidence.actions.length})</h3>
            <p className="muted">
                Availability and execution support come from the selected evidence. No matched
                execution does not prove an action was never executed.
            </p>
            <div className="abstract-model-list">
                {evidence.actions.slice(0, limit).map((action) => (
                    <button
                        key={action.id}
                        className="abstract-model-node"
                        aria-pressed={selectedAction === action.id}
                        onClick={() => onSelectAction(action.id)}
                    >
                        <strong>{actionLabel(action)}</strong>
                        <span>
                            From: {model.nodes.find((node) => node.id === action.sourceNode)?.label}
                        </span>
                        <span>
                            {action.availability.length} availability records /{" "}
                            {action.executions.length} matched execution attempts
                            {action.ambiguous ? " / ambiguous" : ""}
                        </span>
                        {!action.executions.length && <span>No matched execution</span>}
                    </button>
                ))}
            </div>
            {evidence.actions.length > limit && (
                <button className="quiet" onClick={() => setLimit(limit + 30)}>
                    Show more actions
                </button>
            )}
            {unmatched > 0 && (
                <details>
                    <summary>Actions needing more information ({unmatched})</summary>
                    <p className="muted">
                        These records remain separate because the selected rules could not match
                        them reliably.
                    </p>
                    {evidence.unmatchedAvailableActions.slice(0, limit).map((item) => (
                        <article
                            className="abstract-model-member"
                            key={JSON.stringify(item.reference)}
                        >
                            <p>{item.reason}</p>
                            <button
                                className="quiet"
                                onClick={() => onOpenObservation(item.reference)}
                            >
                                Open original observation
                            </button>
                        </article>
                    ))}
                    {evidence.unmatchedExecutions.slice(0, limit).map((item) => (
                        <article
                            className="abstract-model-member"
                            key={JSON.stringify(item.reference)}
                        >
                            <p>{item.reason}</p>
                            <button
                                className="quiet"
                                onClick={() => onOpenExecution(item.reference)}
                            >
                                Open original execution
                            </button>
                        </article>
                    ))}
                    {unmatched > limit && (
                        <button className="quiet" onClick={() => setLimit(limit + 30)}>
                            Show more unmatched actions
                        </button>
                    )}
                </details>
            )}
        </section>
    );
}
