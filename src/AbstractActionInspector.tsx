import { useState } from "react";
import type { AbstractAction, EvidenceReference, ExecutionReference } from "testar-abstraction";
import type { ImportedSource } from "./evidence/import";
import { displayValue } from "./evidence/common";
import { evidenceLabel } from "./abstract-model-presentation";
import { actionLabel } from "./abstract-action-presentation";

export function AbstractActionInspector({
    action,
    sources,
    onOpenObservation,
    onOpenExecution,
}: {
    action: AbstractAction;
    sources: ImportedSource[];
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
}) {
    const [limit, setLimit] = useState(20);
    return (
        <>
            <h2>Abstract action</h2>
            <p className="abstract-model-selection-label">{actionLabel(action)}</p>
            {action.ambiguous && (
                <p className="notice">
                    The selected properties describe several available actions in one observation.
                    Inferred matches cannot identify which one was executed.
                </p>
            )}
            {!action.executions.length && (
                <p className="notice">No matched execution in the selected evidence.</p>
            )}
            <details>
                <summary>Compared action values</summary>
                <pre>{displayValue(action.comparison)}</pre>
            </details>
            <h3>Reported availability ({action.availability.length})</h3>
            {action.availability.slice(0, limit).map((item) => (
                <article className="abstract-model-member" key={JSON.stringify(item.reference)}>
                    <strong>{evidenceLabel(sources, item.reference)}</strong>
                    <p>
                        Observation: {item.reference.observation} / available-action scope:{" "}
                        {item.scope}
                    </p>
                    <p>{item.recordedExecutions.length} recorded execution links</p>
                    <button className="quiet" onClick={() => onOpenObservation(item.reference)}>
                        Open original observation
                    </button>
                </article>
            ))}
            <h3>Execution support ({action.executions.length})</h3>
            {action.executions.slice(0, limit).map((item) => (
                <article className="abstract-model-execution" key={JSON.stringify(item.reference)}>
                    <strong>{evidenceLabel(sources, item.reference)}</strong>
                    <p>
                        {item.status} /{" "}
                        {item.relationship === "recorded"
                            ? "Recorded availability link"
                            : "Matched by abstraction rules"}
                    </p>
                    {item.diagnostic && <p className="notice">{item.diagnostic}</p>}
                    <button className="quiet" onClick={() => onOpenExecution(item.reference)}>
                        Open original execution
                    </button>
                </article>
            ))}
            {Math.max(action.availability.length, action.executions.length) > limit && (
                <button className="quiet" onClick={() => setLimit(limit + 20)}>
                    Show more supporting records
                </button>
            )}
            <p className="muted">
                An outcome placeholder marks missing resulting-state evidence. It is not a recorded
                state. An execution match does not extend oracle coverage.
            </p>
        </>
    );
}
