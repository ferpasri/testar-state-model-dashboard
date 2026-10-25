import type { ImportedSource } from "./evidence/import";
import type { ObservationOrderLink } from "./evidence/trace";
import { Properties } from "./EvidenceFields";

export function ObservationOrderLinkDetails({
    source,
    orderLink,
    onSelectObservation,
    onSelectExecution,
}: {
    source: ImportedSource;
    orderLink: ObservationOrderLink;
    onSelectObservation: (id: string) => void;
    onSelectExecution: (id: string) => void;
}) {
    const from = source.evidence.observations.get(orderLink.source)!;
    const to = source.evidence.observations.get(orderLink.target)!;
    const attempts = Array.from(source.evidence.executions.values()).filter(
        (item) => item.execution.source_observation === from.id,
    );
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Observation order</h2>
                <p>
                    Observation {from.observation_index} to {to.observation_index}
                </p>
            </div>
            <div className="detail-body">
                <span className="badge">Observation-order link</span>
                <p className="notice">
                    These are consecutive observations in this test sequence. No completed action
                    execution connects them. There may have been no action, or an action was not
                    reported. The dashed link shows observation order only.
                </p>
                <div className="execution-navigation">
                    <button className="quiet" onClick={() => onSelectObservation(from.id)}>
                        Open earlier observation ({from.observation_index})
                    </button>
                    <button className="quiet" onClick={() => onSelectObservation(to.id)}>
                        Open later observation ({to.observation_index})
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
