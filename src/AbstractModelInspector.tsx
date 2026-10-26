import { useState } from "react";
import type {
    AbstractAction,
    AbstractModelEdge,
    AbstractModel,
    AbstractModelNode,
    EvidenceReference,
    ExecutionReference,
    AbstractionPreview,
} from "testar-abstraction";
import type { ImportedSource } from "./evidence/import";
import { displayValue } from "./evidence/common";
import { evidenceLabel } from "./abstract-model-presentation";
import { actionLabel } from "./abstract-action-presentation";
import { AbstractActionInspector } from "./AbstractActionInspector";
import { Screenshot } from "./Details";

interface Props {
    action?: AbstractAction;
    outcomeActions?: AbstractAction[];
    onSelectAction: (id: string) => void;
    node?: AbstractModelNode;
    edge?: AbstractModelEdge;
    model: AbstractModel;
    preview: AbstractionPreview;
    sources: ImportedSource[];
    onOpenObservation: (reference: EvidenceReference) => void;
    onOpenExecution: (reference: ExecutionReference) => void;
    onInspectGroup: (id: string) => void;
}

export function AbstractModelInspector(props: Props) {
    const { node, edge } = props;
    return (
        <aside className="abstraction-panel abstract-model-inspector">
            <span className="eyebrow">MODEL INSPECTOR</span>
            {props.outcomeActions ? (
                <>
                    <h2>Outcome not observed</h2>
                    <p className="muted">
                        These available actions have no connected resulting-state evidence in the
                        model. This shared marker is not an abstract state.
                    </p>
                    <div className="abstract-model-list">
                        {props.outcomeActions.slice(0, 50).map((item) => (
                            <button
                                className="abstract-model-node"
                                key={item.id}
                                onClick={() => props.onSelectAction(item.id)}
                            >
                                {actionLabel(item)}
                            </button>
                        ))}
                    </div>
                    {props.outcomeActions.length > 50 && (
                        <p className="muted">
                            Showing the first 50 actions. Use the abstract actions list to inspect
                            more.
                        </p>
                    )}
                </>
            ) : props.action ? (
                <AbstractActionInspector key={props.action.id} {...props} action={props.action} />
            ) : edge ? (
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
}: Props & { node: AbstractModelNode }) {
    const [limit, setLimit] = useState(20);
    const [showScreenshots, setShowScreenshots] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const group = preview.groups.find((item) => item.id === node.groupId);
    const screenshots = [];
    for (const reference of node.members) {
        const source = sources.find((item) => item.id === reference.source);
        const observation = source?.evidence.observations.get(reference.observation);
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
            <h2>{node.unmatchedReason ? "Unmatched observation" : "Abstract state"}</h2>
            <p className="abstract-model-selection-label">{node.label}</p>
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
                        Inspect observation group
                    </button>
                </>
            )}
            {screenshots.length > 0 && (
                <details onToggle={(event) => setShowScreenshots(event.currentTarget.open)}>
                    <summary>Original screenshots</summary>
                    <p className="muted">
                        Up to four original observations. Open any observation for its full
                        evidence.
                    </p>
                    {showScreenshots &&
                        screenshots.map((item) => (
                            <div
                                key={JSON.stringify(item.reference)}
                                className="abstract-model-screenshot"
                            >
                                <p className="muted">{evidenceLabel(sources, item.reference)}</p>
                                <Screenshot
                                    source={item.source}
                                    artifact={item.artifact}
                                    observationIndex={item.observation.observation_index}
                                />
                            </div>
                        ))}
                </details>
            )}
            <h3>Original observations</h3>
            {node.members.slice(0, limit).map((reference) => {
                const source = sources.find((item) => item.id === reference.source);
                const observation = source?.evidence.observations.get(reference.observation);
                return (
                    <article className="abstract-model-member" key={JSON.stringify(reference)}>
                        <strong>{evidenceLabel(sources, reference)}</strong>
                        <p className="muted">
                            Observation {observation?.observation_index} / capture:{" "}
                            {observation?.recorded_state.capture}
                        </p>
                        <p>
                            {displayValue(
                                observation?.recorded_state.properties["ui.title"] ??
                                    reference.observation,
                            )}
                        </p>
                        <p className="muted">
                            {displayValue(observation?.recorded_state.properties["ui.url"] ?? "")}
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
}: Props & { edge: AbstractModelEdge }) {
    const [limit, setLimit] = useState(20);
    const from = model.nodes.find((node) => node.id === edge.source);
    const to = model.nodes.find((node) => node.id === edge.target);
    return (
        <>
            <h2>{edge.kind === "execution" ? "Abstract transition" : "Observation-order links"}</h2>
            <p className="abstract-model-selection-label">{edge.label}</p>
            <p className="muted">
                {from?.label} → {to?.label}
            </p>
            {edge.kind === "execution" ? (
                <>
                    <p className="muted">
                        {edge.executions.length} completed executions share these endpoint groups
                        and the recorded action type. Their original targets and parameters remain
                        distinct.
                    </p>
                    {edge.executions.slice(0, limit).map((reference) => {
                        const source = sources.find((item) => item.id === reference.source);
                        const record = source?.evidence.executions.get(reference.execution);
                        const action =
                            record &&
                            source?.evidence.actions.get(record.execution.action_description);
                        const sourceObservation =
                            record &&
                            source?.evidence.observations.get(record.execution.source_observation);
                        const resultObservation = record?.resultingObservation
                            ? source?.evidence.observations.get(record.resultingObservation)
                            : undefined;
                        return (
                            <article
                                className="abstract-model-execution"
                                key={JSON.stringify(reference)}
                            >
                                <strong>{evidenceLabel(sources, reference)}</strong>
                                <p>
                                    {action?.action_type} / observation{" "}
                                    {sourceObservation?.observation_index} →{" "}
                                    {resultObservation?.observation_index}
                                </p>
                                <p className="muted">
                                    Target widget:{" "}
                                    {record?.execution.target_widget ?? "No widget target"}
                                </p>
                                <details>
                                    <summary>Recorded execution details</summary>
                                    <pre>
                                        {displayValue({
                                            execution: reference.execution,
                                            action: record?.execution.action_description,
                                            parameters: record?.execution.parameters,
                                            target: record?.execution.target_widget,
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
                        These observations are consecutive in their original test sequences. No
                        completed execution connects each pair. The model does not establish that an
                        action happened.
                    </p>
                    {edge.orderLinks.slice(0, limit).map((link) => (
                        <article className="abstract-model-order-link" key={JSON.stringify(link)}>
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
