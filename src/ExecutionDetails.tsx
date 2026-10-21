import type { ImportedSource } from "./evidence/import";
import { Properties } from "./EvidenceFields";
import { EvaluationList } from "./EvaluationList";

export function ExecutionDetails({
    source,
    executionId,
    onSelectObservation,
}: {
    source: ImportedSource;
    executionId: string;
    onSelectObservation: (id: string) => void;
}) {
    const record = source.model.executions.get(executionId)!;
    const action = source.model.actions.get(record.execution.action)!;
    const from = source.model.observations.get(record.execution.source)!;
    const to = record.result ? source.model.observations.get(record.result) : undefined;
    const checks = source.model.checks.filter(
        ({ data }) => data.target.kind === "execution" && data.target.execution === executionId,
    );
    const descriptions = {
        selected: "The action was selected; submission has not been recorded.",
        submitted: "The tool accepted the action; a resulting observation has not been recorded.",
        rejected: "The tool rejected this action submission.",
        observed: "A resulting observation was recorded for this execution.",
        incomplete: "The run ended before this execution had a recorded result.",
    };
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Action execution</h2>
                <p>{action.kind}</p>
            </div>
            <div className="detail-body">
                <span className={"badge " + record.status}>{record.status}</span>
                <p className="muted">{descriptions[record.status]}</p>
                <div className="execution-navigation">
                    <button className="quiet" onClick={() => onSelectObservation(from.id)}>
                        Open source observation ({from.sequence})
                    </button>
                    {to && (
                        <button className="quiet" onClick={() => onSelectObservation(to.id)}>
                            Open result observation ({to.sequence})
                        </button>
                    )}
                </div>
                <Properties
                    values={{
                        "Execution ID": record.execution.id,
                        "Action ID": action.id,
                        "Source observation": from.id,
                        "Result observation": record.result,
                        "Target widget": record.execution.target,
                        Parameters: record.execution.parameters,
                        "Submission error": record.error,
                    }}
                />
                <details>
                    <summary>Action definition</summary>
                    <Properties values={action.properties} />
                </details>
                <h3>Evaluations targeting this execution</h3>
                <EvaluationList checks={checks} model={source.model} />
                {checks.length === 0 && (
                    <p className="muted">
                        No evaluation directly targets this execution. Observation, run, and
                        sequence evaluations are available from the observation inspector.
                    </p>
                )}
            </div>
        </aside>
    );
}
