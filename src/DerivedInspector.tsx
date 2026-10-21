import { useState } from "react";
import type {
    DerivedEdge,
    DerivedModel,
    DerivedNode,
    EvidenceReference,
    ExecutionReference,
    MatchingPreview,
} from "./analysis";
import type { ImportedSource } from "./evidence/import";
import { displayValue } from "./evidence/common";
import { evidenceLabel } from "./derived-presentation";
import { Screenshot } from "./Details";

interface Props {
    node?: DerivedNode;
    edge?: DerivedEdge;
    model: DerivedModel;
    preview: MatchingPreview;
    sources: ImportedSource[];
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
    onInspectGroup: (id: string) => void;
}

export function DerivedInspector(props: Props) {
    const { node, edge } = props;
    return (
        <aside className="matching-panel derived-inspector">
            <span className="eyebrow">MODEL INSPECTOR</span>
            {edge ? (
                <EdgeInspector key={edge.id} {...props} edge={edge} />
            ) : node ? (
                <NodeInspector key={node.id} {...props} node={node} />
            ) : (
                <>
                    <h2>Select a state or transition</h2>
                    <p className="muted">
                        Use the graph or the lists to inspect contributing evidence.
                    </p>
                </>
            )}
        </aside>
    );
}

function NodeInspector({
    node,
    preview,
    sources,
    onOpenObservation,
    onInspectGroup,
}: Props & { node: DerivedNode }) {
    const [limit, setLimit] = useState(20);
    const [showScreenshots, setShowScreenshots] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const group = preview.groups.find((item) => item.id === node.groupId);
    const screenshots = [];
    for (const reference of node.members) {
        const source = sources.find((item) => item.id === reference.source);
        const observation = source?.model.observations.get(reference.observation);
        const artifact = observation?.artifacts.find(
            (item) => item.media_type === "image/png" || item.media_type === "image/jpeg",
        );
        if (source && observation && artifact) {
            screenshots.push({ source, observation, artifact, reference });
        }
        if (screenshots.length === 4) {
            break;
        }
    }
    return (
        <>
            <h2>{node.unmatchedReason ? "Unmatched observation" : "State group"}</h2>
            <p className="derived-selection-label">{node.label}</p>
            <p className="muted">
                {node.members.length} original observations. Oracle results remain attached to their
                original targets.
            </p>
            {node.unmatchedReason && <p className="notice">{node.unmatchedReason}</p>}
            {group && (
                <>
                    <details onToggle={(event) => setShowComparison(event.currentTarget.open)}>
                        <summary>Compared values</summary>
                        {showComparison && <pre>{displayValue(group.comparison)}</pre>}
                    </details>
                    <button className="quiet" onClick={() => onInspectGroup(group.id)}>
                        Inspect matching group
                    </button>
                </>
            )}
            {screenshots.length > 0 && (
                <details onToggle={(event) => setShowScreenshots(event.currentTarget.open)}>
                    <summary>Original screenshots</summary>
                    <p className="muted">
                        Up to four original visits. Open any observation for its full evidence.
                    </p>
                    {showScreenshots &&
                        screenshots.map((item) => (
                            <div
                                key={JSON.stringify(item.reference)}
                                className="derived-screenshot"
                            >
                                <p className="muted">{evidenceLabel(sources, item.reference)}</p>
                                <Screenshot
                                    source={item.source}
                                    artifact={item.artifact}
                                    sequence={item.observation.sequence}
                                />
                            </div>
                        ))}
                </details>
            )}
            <h3>Original observations</h3>
            {node.members.slice(0, limit).map((reference) => {
                const source = sources.find((item) => item.id === reference.source);
                const observation = source?.model.observations.get(reference.observation);
                return (
                    <article className="derived-member" key={JSON.stringify(reference)}>
                        <strong>{evidenceLabel(sources, reference)}</strong>
                        <p className="muted">
                            Observation {observation?.sequence} / capture:{" "}
                            {observation?.state.capture}
                        </p>
                        <p>
                            {displayValue(
                                observation?.state.properties["ui.title"] ?? reference.observation,
                            )}
                        </p>
                        <p className="muted">
                            {displayValue(observation?.state.properties["ui.url"] ?? "")}
                        </p>
                        <button className="quiet" onClick={() => onOpenObservation(reference)}>
                            Open original observation
                        </button>
                    </article>
                );
            })}
            {node.members.length > limit && (
                <button className="quiet" onClick={() => setLimit(limit + 20)}>
                    Show more observations
                </button>
            )}
        </>
    );
}

function EdgeInspector({
    edge,
    model,
    sources,
    onOpenObservation,
    onOpenExecution,
}: Props & { edge: DerivedEdge }) {
    const [limit, setLimit] = useState(20);
    const from = model.nodes.find((node) => node.id === edge.source);
    const to = model.nodes.find((node) => node.id === edge.target);
    return (
        <>
            <h2>{edge.kind === "execution" ? "Recorded transitions" : "Observation order"}</h2>
            <p className="derived-selection-label">{edge.label}</p>
            <p className="muted">
                {from?.label} → {to?.label}
            </p>
            {edge.kind === "execution" ? (
                <>
                    <p className="muted">
                        {edge.executions.length} completed executions share these endpoint groups
                        and the recorded action kind. Their original targets and parameters remain
                        distinct.
                    </p>
                    {edge.executions.slice(0, limit).map((reference) => {
                        const source = sources.find((item) => item.id === reference.source);
                        const record = source?.model.executions.get(reference.execution);
                        const action = record && source?.model.actions.get(record.execution.action);
                        const sourceObservation =
                            record && source?.model.observations.get(record.execution.source);
                        const resultObservation = record?.result
                            ? source?.model.observations.get(record.result)
                            : undefined;
                        return (
                            <article className="derived-execution" key={JSON.stringify(reference)}>
                                <strong>{evidenceLabel(sources, reference)}</strong>
                                <p>
                                    {action?.kind} / observation {sourceObservation?.sequence} →{" "}
                                    {resultObservation?.sequence}
                                </p>
                                <p className="muted">
                                    Target widget: {record?.execution.target ?? "No widget target"}
                                </p>
                                <details>
                                    <summary>Recorded execution details</summary>
                                    <pre>
                                        {displayValue({
                                            execution: reference.execution,
                                            action: record?.execution.action,
                                            parameters: record?.execution.parameters,
                                            target: record?.execution.target,
                                        })}
                                    </pre>
                                </details>
                                <button
                                    className="quiet"
                                    onClick={() => onOpenExecution(reference)}
                                >
                                    Open original execution
                                </button>
                            </article>
                        );
                    })}
                    {edge.executions.length > limit && (
                        <button className="quiet" onClick={() => setLimit(limit + 20)}>
                            Show more executions
                        </button>
                    )}
                </>
            ) : (
                <>
                    <p className="notice">
                        These observations are consecutive in their original runs. No completed
                        execution connects each pair. The evidence does not establish that an action
                        happened.
                    </p>
                    {edge.orderLinks.slice(0, limit).map((link) => (
                        <article className="derived-order-link" key={JSON.stringify(link)}>
                            <strong>{evidenceLabel(sources, link.source)}</strong>
                            <p className="muted">
                                {link.source.observation} → {link.target.observation}
                            </p>
                            <div className="execution-navigation">
                                <button
                                    className="quiet"
                                    onClick={() => onOpenObservation(link.source)}
                                >
                                    Open source observation
                                </button>
                                <button
                                    className="quiet"
                                    onClick={() => onOpenObservation(link.target)}
                                >
                                    Open following observation
                                </button>
                            </div>
                        </article>
                    ))}
                    {edge.orderLinks.length > limit && (
                        <button className="quiet" onClick={() => setLimit(limit + 20)}>
                            Show more observation pairs
                        </button>
                    )}
                </>
            )}
        </>
    );
}
