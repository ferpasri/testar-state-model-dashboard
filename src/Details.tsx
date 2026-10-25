import { useEffect, useMemo, useState } from "react";
import { canonical, displayValue, formatJson } from "./evidence/common";
import { Properties } from "./EvidenceFields";
import { CaptureDescription, PropertyCaptureInformation } from "./CaptureInformation";
import { OracleResults } from "./OracleResults";
import { EvaluationCoverage } from "./EvaluationCoverage";
import type { ImportedSource } from "./evidence/import";
import type { Artifact, Observation } from "./evidence/schema";

function valueText(value: unknown): string {
    return (
        (typeof value === "string" ? value : formatJson(value))?.slice(0, 12_000) ?? "Not supplied"
    );
}
export function oracleResultsForObservation(source: ImportedSource, observation: Observation) {
    const run = source.evidence.sequences.get(observation.test_sequence)!.test_run;
    return source.evidence.oracleResults.filter(({ data }) => {
        if (data.test_run !== run) {
            return false;
        }
        const target = data.oracle_target;
        if (target.target_type === "test_run") {
            return true;
        }
        if (data.test_sequence !== observation.test_sequence) {
            return false;
        }
        switch (target.target_type) {
            case "test_sequence":
                return true;
            case "observation_range": {
                const first = source.evidence.observations.get(target.first_observation)!;
                const last = source.evidence.observations.get(target.last_observation)!;
                return (
                    observation.observation_index >= first.observation_index &&
                    observation.observation_index <= last.observation_index
                );
            }
            case "action_execution": {
                const record = source.evidence.executions.get(target.action_execution)!;
                return (
                    record.execution.source_observation === observation.id ||
                    record.resultingObservation === observation.id
                );
            }
            default:
                return target.observation === observation.id;
        }
    });
}
export function Screenshot({
    source,
    artifact,
    observationIndex,
}: {
    source: ImportedSource;
    artifact: Artifact;
    observationIndex: number | bigint;
}) {
    const [url, setUrl] = useState("");
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const file = source.artifacts.get(artifact.path);
        if (!file) {
            return;
        }
        const objectUrl = URL.createObjectURL(new Blob([file], { type: artifact.media_type }));
        setUrl(objectUrl);
        setFailed(false);
        return () => URL.revokeObjectURL(objectUrl);
    }, [source, artifact]);
    if (failed) {
        return <p className="notice">The browser could not decode this screenshot.</p>;
    }
    return (
        <figure className="screenshot">
            <img
                src={url || undefined}
                onError={() => setFailed(true)}
                alt={"Screenshot for observation " + observationIndex}
            />
            <figcaption>SHA-256 verified · {artifact.media_type}</figcaption>
        </figure>
    );
}
export function Details({
    source,
    observation,
    onSelectExecution,
    onSelectObservation,
}: {
    source: ImportedSource;
    observation: Observation;
    onSelectExecution: (id: string) => void;
    onSelectObservation: (id: string) => void;
}) {
    const [tab, setTab] = useState("Observation");
    const [search, setSearch] = useState("");
    const [widgetLimit, setWidgetLimit] = useState(100);
    useEffect(() => {
        setWidgetLimit(100);
        setSearch("");
    }, [observation.id, source.id]);
    const oracleResults = useMemo(
        () => oracleResultsForObservation(source, observation),
        [source, observation],
    );
    const widgets = useMemo(
        () =>
            observation.recorded_state.widgets.filter((widget) =>
                (widget.id + " " + canonical(widget.properties))
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
            ),
        [observation, search],
    );
    const executions = Array.from(source.evidence.executions.values()).filter(
        (item) =>
            item.execution.source_observation === observation.id ||
            item.resultingObservation === observation.id,
    );
    const images = observation.artifacts.filter((artifact) =>
        ["image/png", "image/jpeg"].includes(artifact.media_type),
    );
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Observation {observation.observation_index}</h2>
                <p>
                    {displayValue(
                        observation.recorded_state.properties["ui.title"] ?? "Captured observation",
                    )}
                </p>
            </div>
            <nav className="tabs" aria-label="Evidence details">
                {["Observation", "Widgets", "Oracle results", "Coverage", "Executions"].map(
                    (name) => (
                        <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
                            {name}
                        </button>
                    ),
                )}
            </nav>
            <div className="detail-body">
                {tab === "Observation" && (
                    <>
                        <div className="badge-row">
                            <span className="badge">
                                {observation.recorded_state.capture} capture
                            </span>
                            <span className="badge">
                                Available-action scope: {observation.available_action_scope}
                            </span>
                        </div>
                        {observation.recorded_state.capture === "unavailable" && (
                            <p className="notice">
                                Widget information was unavailable at capture time.
                            </p>
                        )}
                        {observation.recorded_state.capture === "filtered" && (
                            <p className="notice">
                                This recorded state contains selected information. Producer
                                properties may describe capture limits.
                            </p>
                        )}
                        {images.length === 0 && (
                            <p className="muted">
                                No PNG or JPEG screenshot was recorded for this observation.
                            </p>
                        )}
                        {images.map((artifact) => (
                            <Screenshot
                                key={artifact.id}
                                source={source}
                                artifact={artifact}
                                observationIndex={observation.observation_index}
                            />
                        ))}
                        <CaptureDescription properties={observation.recorded_state.properties} />
                        <PropertyCaptureInformation
                            properties={observation.recorded_state.properties}
                        />
                        <h3>Captured properties</h3>
                        <Properties
                            values={Object.fromEntries(
                                Object.entries(observation.recorded_state.properties).filter(
                                    ([key]) => key.startsWith("ui."),
                                ),
                            )}
                        />
                        <details
                            open={
                                !Object.keys(observation.recorded_state.properties).some((key) =>
                                    key.startsWith("ui."),
                                )
                            }
                        >
                            <summary>Additional producer properties</summary>
                            <Properties
                                values={Object.fromEntries(
                                    Object.entries(observation.recorded_state.properties).filter(
                                        ([key]) => !key.startsWith("ui."),
                                    ),
                                )}
                            />
                        </details>
                        <details>
                            <summary>Observation identity and artifacts</summary>
                            <Properties
                                values={{
                                    id: observation.id,
                                    recorded_state: observation.recorded_state.id,
                                    test_sequence: observation.test_sequence,
                                    timestamp_micros: observation.timestamp_micros,
                                    artifacts: observation.artifacts,
                                }}
                            />
                        </details>
                        <details>
                            <summary>
                                Available actions ({observation.available_actions.length})
                            </summary>
                            <pre>{valueText(observation.available_actions)}</pre>
                        </details>
                    </>
                )}
                {tab === "Widgets" && (
                    <>
                        <label className="search-label">
                            Find a widget
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Text, role, property or identifier"
                            />
                        </label>
                        <p className="muted">
                            {widgets.length} widgets · Parent identities preserve the hierarchy.
                        </p>
                        {widgets.slice(0, widgetLimit).map((widget) => (
                            <details className="widget" key={widget.id}>
                                <summary>
                                    {displayValue(
                                        widget.properties["ui.name"] ??
                                            widget.properties["ui.text"] ??
                                            widget.properties["ui.role"] ??
                                            widget.id,
                                    ).slice(0, 100) || widget.id}
                                </summary>
                                <PropertyCaptureInformation properties={widget.properties} />
                                <Properties
                                    values={{
                                        id: widget.id,
                                        parent: widget.parent,
                                        ...widget.properties,
                                    }}
                                />
                            </details>
                        ))}
                        {widgets.length > widgetLimit && (
                            <button
                                className="quiet"
                                onClick={() => setWidgetLimit((limit) => limit + 100)}
                            >
                                Show more widgets
                            </button>
                        )}
                    </>
                )}
                {tab === "Oracle results" && (
                    <>
                        <p className="muted">
                            {oracleResults.length} results target this observation, its test run or
                            test sequence, associated executions, or an observation range containing
                            it. These are test-oracle results, separate from action executions.
                            Pending means the oracle had not reached a definite outcome when
                            recorded.
                        </p>
                        <OracleResults oracleResults={oracleResults} evidence={source.evidence} />
                    </>
                )}
                {tab === "Coverage" && (
                    <EvaluationCoverage
                        source={source}
                        observation={observation}
                        onSelectObservation={onSelectObservation}
                    />
                )}
                {tab === "Executions" && (
                    <>
                        <p className="muted">
                            Recorded executions entering or leaving this observation.
                        </p>
                        {executions.map((item) => (
                            <article key={item.execution.id} className="evaluation">
                                <button
                                    className="quiet"
                                    onClick={() => onSelectExecution(item.execution.id)}
                                >
                                    Inspect this execution
                                </button>
                                <div className="evaluation-heading">
                                    <strong>
                                        {
                                            source.evidence.actions.get(
                                                item.execution.action_description,
                                            )?.action_type
                                        }
                                    </strong>
                                    <span className={"badge " + item.status}>{item.status}</span>
                                </div>
                                <Properties
                                    values={{
                                        source_observation: item.execution.source_observation,
                                        resulting_observation: item.resultingObservation,
                                        target_widget: item.execution.target_widget,
                                        parameters: item.execution.parameters,
                                        error: item.executionResult?.error,
                                    }}
                                />
                            </article>
                        ))}
                        {executions.length === 0 && <p>No associated action execution.</p>}
                    </>
                )}
            </div>
        </aside>
    );
}
