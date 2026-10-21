import { useEffect, useMemo, useState } from "react";
import { canonical, displayValue, formatJson } from "./evidence/common";
import { Properties } from "./EvidenceFields";
import { EvaluationList } from "./EvaluationList";
import { EvaluationCoverage } from "./EvaluationCoverage";
import type { ImportedSource } from "./evidence/import";
import type { Artifact, Observation } from "./evidence/schema";

function valueText(value: unknown): string {
    return (
        (typeof value === "string" ? value : formatJson(value))?.slice(0, 12_000) ?? "Not supplied"
    );
}
export function checksForObservation(source: ImportedSource, observation: Observation) {
    return source.model.checks.filter(({ data }) => {
        if (data.run !== observation.run) {
            return false;
        }
        const target = data.target;
        switch (target.kind) {
            case "run":
                return true;
            case "sequence": {
                const from = source.model.observations.get(target.from_observation)!;
                const to = source.model.observations.get(target.to_observation)!;
                return observation.sequence >= from.sequence && observation.sequence <= to.sequence;
            }
            case "execution": {
                const execution = source.model.executions.get(target.execution)!;
                return (
                    execution.execution.source === observation.id ||
                    execution.result === observation.id
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
    sequence,
}: {
    source: ImportedSource;
    artifact: Artifact;
    sequence: number;
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
                alt={"Screenshot for observation " + sequence}
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
    const checks = useMemo(() => checksForObservation(source, observation), [source, observation]);
    const widgets = useMemo(
        () =>
            observation.state.widgets.filter((widget) =>
                (widget.id + " " + canonical(widget.properties))
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
            ),
        [observation, search],
    );
    const executions = Array.from(source.model.executions.values()).filter(
        (item) => item.execution.source === observation.id || item.result === observation.id,
    );
    const images = observation.artifacts.filter((artifact) =>
        ["image/png", "image/jpeg"].includes(artifact.media_type),
    );
    return (
        <aside className="details">
            <div className="detail-title">
                <span className="eyebrow">EVIDENCE INSPECTOR</span>
                <h2>Observation {observation.sequence}</h2>
                <p>{displayValue(observation.state.properties["ui.title"] ?? "Captured visit")}</p>
            </div>
            <nav className="tabs" aria-label="Evidence details">
                {["Observation", "Widgets", "Evaluations", "Coverage", "Executions"].map((name) => (
                    <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
                        {name}
                    </button>
                ))}
            </nav>
            <div className="detail-body">
                {tab === "Observation" && (
                    <>
                        <div className="badge-row">
                            <span className="badge">{observation.state.capture} capture</span>
                            <span className="badge">{observation.candidate_scope} candidates</span>
                        </div>
                        {observation.state.capture === "unavailable" && (
                            <p className="notice">
                                Widget information was unavailable at capture time.
                            </p>
                        )}
                        {observation.state.capture === "filtered" && (
                            <p className="notice">
                                This snapshot contains selected information. Producer properties may
                                describe capture limits.
                            </p>
                        )}
                        {images.length === 0 && (
                            <p className="muted">
                                No PNG or JPEG screenshot was recorded for this visit.
                            </p>
                        )}
                        {images.map((artifact) => (
                            <Screenshot
                                key={artifact.id}
                                source={source}
                                artifact={artifact}
                                sequence={observation.sequence}
                            />
                        ))}
                        <h3>Captured properties</h3>
                        <Properties
                            values={Object.fromEntries(
                                Object.entries(observation.state.properties).filter(([key]) =>
                                    key.startsWith("ui."),
                                ),
                            )}
                        />
                        <details
                            open={
                                !Object.keys(observation.state.properties).some((key) =>
                                    key.startsWith("ui."),
                                )
                            }
                        >
                            <summary>Additional producer properties</summary>
                            <Properties
                                values={Object.fromEntries(
                                    Object.entries(observation.state.properties).filter(
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
                                    snapshot: observation.state.id,
                                    timestamp_micros: observation.timestamp_micros,
                                    artifacts: observation.artifacts,
                                }}
                            />
                        </details>
                        <details>
                            <summary>Candidate actions ({observation.candidates.length})</summary>
                            <pre>{valueText(observation.candidates)}</pre>
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
                {tab === "Evaluations" && (
                    <>
                        <p className="muted">
                            {checks.length} results target this visit, its run, associated
                            executions, or a sequence containing it. These are test-oracle results,
                            separate from action executions. Pending means the oracle had not
                            reached a definite outcome when recorded.
                        </p>
                        <EvaluationList checks={checks} model={source.model} />
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
                        <p className="muted">Recorded executions entering or leaving this visit.</p>
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
                                        {source.model.actions.get(item.execution.action)?.kind}
                                    </strong>
                                    <span className={"badge " + item.status}>{item.status}</span>
                                </div>
                                <Properties
                                    values={{
                                        source: item.execution.source,
                                        result: item.result,
                                        target_widget: item.execution.target,
                                        parameters: item.execution.parameters,
                                        error: item.error,
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
