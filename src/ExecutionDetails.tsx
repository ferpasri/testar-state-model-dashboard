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
    const record = source.evidence.executions.get(executionId)!;
    const action = source.evidence.actions.get(record.execution.action_description)!;
    const from = source.evidence.observations.get(record.execution.source_observation)!;
    const to = record.resultingObservation
        ? source.evidence.observations.get(record.resultingObservation)
        : undefined;
    const oracleResults = source.evidence.oracleResults.filter(
        ({ data }) =>
            data.oracle_target.target_type === "action_execution" &&
            data.oracle_target.action_execution === executionId,
    );
    const descriptions = {
        awaiting_execution_result:
            "The action was selected; its execution result has not been recorded.",
        awaiting_resulting_observation:
            "The action returned; a resulting observation has not been recorded.",
        failed: "The action execution reported an error.",
        completed: "A resulting observation was recorded for this execution.",
        incomplete: "The test sequence ended before this execution was completed.",
    };
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Action execution</h2>
                <p>{action.action_type}</p>
            </div>
            <div className="detail-body">
                <span className={"badge " + record.status}>{record.status}</span>
                <p className="muted">{descriptions[record.status]}</p>
                <div className="execution-navigation">
                    <button className="quiet" onClick={() => onSelectObservation(from.id)}>
                        Open source observation ({from.observation_index})
                    </button>
                    {to && (
                        <button className="quiet" onClick={() => onSelectObservation(to.id)}>
                            Open result observation ({to.observation_index})
                        </button>
                    )}
                </div>
                <Properties
                    values={{
                        "Execution ID": record.execution.id,
                        "Action ID": action.id,
                        "Source observation": from.id,
                        "Result observation": record.resultingObservation,
                        "Target widget": record.execution.target_widget,
                        Parameters: record.execution.parameters,
                        "Execution error": record.executionResult?.error,
                    }}
                />
                <details>
                    <summary>Action description</summary>
                    <Properties values={action.properties} />
                </details>
                <h3>Evaluations targeting this execution</h3>
                <EvaluationList oracleResults={oracleResults} evidence={source.evidence} />
                {oracleResults.length === 0 && (
                    <p className="muted">
                        No evaluation directly targets this execution. Observation, run, and
                        sequence evaluations are available from the observation inspector.
                    </p>
                )}
            </div>
        </aside>
    );
}
