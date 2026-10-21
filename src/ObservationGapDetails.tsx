import type { ImportedSource } from "./evidence/import";
import type { ObservationGap } from "./evidence/trace";
import { Properties } from "./EvidenceFields";

export function ObservationGapDetails({
    source,
    gap,
    onSelectObservation,
    onSelectExecution,
}: {
    source: ImportedSource;
    gap: ObservationGap;
    onSelectObservation: (id: string) => void;
    onSelectExecution: (id: string) => void;
}) {
    const from = source.model.observations.get(gap.source)!;
    const to = source.model.observations.get(gap.target)!;
    const attempts = Array.from(source.model.executions.values()).filter(
        (item) => item.execution.source === from.id,
    );
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Observation order</h2>
                <p>
                    Observation {from.sequence} to {to.sequence}
                </p>
            </div>
            <div className="detail-body">
                <span className="badge">Unknown action</span>
                <p className="notice">
                    These are consecutive captures in this run. No completed action execution
                    connects them. There may have been no action, or an action was not reported. The
                    dashed link shows observation order only.
                </p>
                <div className="execution-navigation">
                    <button className="quiet" onClick={() => onSelectObservation(from.id)}>
                        Open earlier observation ({from.sequence})
                    </button>
                    <button className="quiet" onClick={() => onSelectObservation(to.id)}>
                        Open later observation ({to.sequence})
                    </button>
                </div>
                <Properties
                    values={{
                        "Earlier observation": from.id,
                        "Later observation": to.id,
                        "Earlier capture time (microseconds)": from.timestamp_micros,
                        "Later capture time (microseconds)": to.timestamp_micros,
                    }}
                />
                {attempts.length > 0 && (
                    <>
                        <h3>Recorded executions from the earlier observation</h3>
                        {attempts.map((item) => (
                            <button
                                className="quiet"
                                key={item.execution.id}
                                onClick={() => onSelectExecution(item.execution.id)}
                            >
                                Inspect execution ({item.status})
                            </button>
                        ))}
                    </>
                )}
            </div>
        </aside>
    );
}
