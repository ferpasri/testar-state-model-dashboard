import { useEffect, useMemo, useState } from "react";
import type { EvidenceReference, MatchingGroup, MatchingPreview, AnalysisSource } from "./analysis";
import { displayValue, formatJson } from "./evidence/common";

interface Props {
    preview: MatchingPreview;
    sources: AnalysisSource[];
    groupFocus?: { id: string };
    onOpenObservation: (reference: EvidenceReference) => void;
}

function distinctRuns(group: MatchingGroup) {
    return new Set(
        group.members.map((member) =>
            JSON.stringify([member.reference.source, member.reference.run]),
        ),
    ).size;
}

export function MatchingResults({ preview, sources, groupFocus, onOpenObservation }: Props) {
    const [filter, setFilter] = useState("cross-run");
    const [selected, setSelected] = useState("");
    const [limit, setLimit] = useState(50);
    useEffect(() => {
        if (groupFocus) {
            setSelected(groupFocus.id);
            setFilter("all");
        }
    }, [groupFocus]);
    const groups = useMemo(
        () =>
            preview.groups
                .filter(
                    (group) =>
                        filter === "all" ||
                        (filter === "cross-run"
                            ? distinctRuns(group) > 1
                            : group.members.length > 1),
                )
                .sort(
                    (left, right) =>
                        distinctRuns(right) - distinctRuns(left) ||
                        right.members.length - left.members.length ||
                        left.id.localeCompare(right.id),
                ),
        [preview, filter],
    );
    const group = groups.find((item) => item.id === selected) ?? groups[0];

    function sourceName(reference: EvidenceReference) {
        const source = sources.find((item) => item.id === reference.source);
        const run = source?.model.runs.get(reference.run);
        return (
            (source?.label ?? reference.source) +
            " / " +
            (run?.producer ?? "Unknown producer") +
            " / " +
            (run?.source_run ?? reference.run)
        );
    }

    return (
        <section className="matching-results">
            <div className="matching-stats" aria-label="Indexed evidence">
                {Object.entries(preview.index).map(([name, count]) => (
                    <div key={name}>
                        <strong>{count}</strong>
                        <span>{name}</span>
                    </div>
                ))}
            </div>
            <p className="muted">
                Exact agreement under these rules proposes a correspondence. Each observation keeps
                its original actions, screenshots, and oracle results.
            </p>
            <div className="matching-columns">
                <section className="matching-panel">
                    <h2>Proposed groups</h2>
                    <label className="search-label">
                        Group filter
                        <select
                            aria-label="Group filter"
                            value={filter}
                            onChange={(event) => {
                                setFilter(event.target.value);
                                setLimit(50);
                                setSelected("");
                            }}
                        >
                            <option value="cross-run">Across different runs</option>
                            <option value="repeated">Two or more observations</option>
                            <option value="all">All groups</option>
                        </select>
                    </label>
                    <p className="muted">
                        {groups.length} groups in this view. {preview.counts.unmatched} observations
                        could not be compared.
                    </p>
                    {groups.length === 0 && (
                        <p className="notice">
                            No groups in this view. Inspect all groups or adjust the selected fields
                            and runs to compare the evidence you need.
                        </p>
                    )}
                    <div className="match-group-list">
                        {groups.slice(0, limit).map((item, index) => (
                            <button
                                className="match-group"
                                key={item.id}
                                aria-pressed={item.id === group?.id}
                                onClick={() => setSelected(item.id)}
                            >
                                <strong>Group {index + 1}</strong>
                                <span>
                                    {item.members.length} observations / {distinctRuns(item)} runs
                                </span>
                            </button>
                        ))}
                    </div>
                    {groups.length > limit && (
                        <button className="quiet" onClick={() => setLimit(limit + 50)}>
                            Show more groups
                        </button>
                    )}
                </section>
                {group && (
                    <GroupDetails
                        key={group.id}
                        group={group}
                        sourceName={sourceName}
                        widgetMatching={preview.definition.widgets !== undefined}
                        onOpenObservation={onOpenObservation}
                    />
                )}
            </div>
            {preview.unmatched.length > 0 && (
                <details className="matching-panel">
                    <summary>
                        Observations that could not be compared ({preview.unmatched.length})
                    </summary>
                    <p className="muted">
                        Showing up to 50. The preview download includes every reason.
                    </p>
                    {preview.unmatched.slice(0, 50).map((item) => (
                        <div className="match-member" key={JSON.stringify(item.reference)}>
                            <strong>
                                {sourceName(item.reference)} / observation {item.sequence}
                            </strong>
                            <p>{item.reason}</p>
                            <button
                                className="quiet"
                                onClick={() => onOpenObservation(item.reference)}
                            >
                                Open original observation
                            </button>
                        </div>
                    ))}
                </details>
            )}
            <details className="matching-panel">
                <summary>Matching provenance</summary>
                <p className="muted">
                    Interpreter {preview.interpreterVersion}. Definition fingerprint:{" "}
                    {preview.policyFingerprint}
                </p>
                <pre>{formatJson(preview.inputScope)}</pre>
            </details>
        </section>
    );
}

function GroupDetails({
    group,
    sourceName,
    widgetMatching,
    onOpenObservation,
}: {
    group: MatchingGroup;
    sourceName: (reference: EvidenceReference) => string;
    widgetMatching: boolean;
    onOpenObservation: (reference: EvidenceReference) => void;
}) {
    const [memberLimit, setMemberLimit] = useState(20);
    const [widgetLimit, setWidgetLimit] = useState(20);
    const [showComparison, setShowComparison] = useState(false);
    return (
        <section className="matching-panel">
            <h2>Group members</h2>
            <p className="muted">
                The selected values agree after normalization. Open an original observation to
                inspect its recorded evidence and evaluation coverage.
            </p>
            <details onToggle={(event) => setShowComparison(event.currentTarget.open)}>
                <summary>Compared values</summary>
                {showComparison && <pre>{displayValue(group.comparison)}</pre>}
                <p className="muted">
                    Display limited to 12,000 characters. Download the full preview for all values.
                </p>
            </details>
            {group.members.slice(0, memberLimit).map((member) => (
                <article className="match-member" key={JSON.stringify(member.reference)}>
                    <strong>{sourceName(member.reference)}</strong>
                    <p className="muted">
                        Observation {member.sequence} / capture: {member.capture}
                    </p>
                    <dl className="properties">
                        {member.stateFields.map((field) => (
                            <div key={field.name}>
                                <dt>
                                    {field.name}
                                    {field.key ? " (" + field.key + ")" : ""}
                                </dt>
                                <dd>
                                    {field.missing ? "Property missing" : displayValue(field.value)}
                                </dd>
                                {!field.missing && (
                                    <dd className="muted">Captured: {displayValue(field.raw)}</dd>
                                )}
                            </div>
                        ))}
                    </dl>
                    {widgetMatching && (
                        <p className="muted">
                            {member.includedWidgets} widgets compared / {member.excludedWidgets}{" "}
                            excluded
                        </p>
                    )}
                    <button className="quiet" onClick={() => onOpenObservation(member.reference)}>
                        Open original observation
                    </button>
                </article>
            ))}
            {group.members.length > memberLimit && (
                <button className="quiet" onClick={() => setMemberLimit(memberLimit + 20)}>
                    Show more members
                </button>
            )}
            <h3>Matching widget descriptions</h3>
            {!widgetMatching ? (
                <p className="muted">
                    These rules compare state properties. Select widget fields to compare widget
                    descriptions.
                </p>
            ) : (
                <>
                    <p className="muted">
                        A matching description identifies candidates for correspondence. Repeated
                        descriptions can refer to several widgets in one observation.
                    </p>
                    {group.widgetCorrespondences.slice(0, widgetLimit).map((item) => (
                        <details key={item.id}>
                            <summary>
                                {item.members.length} widget references
                                {item.ambiguous ? " / ambiguous: repeated description" : ""}
                            </summary>
                            <pre>{displayValue(item.description)}</pre>
                            {item.members.slice(0, 50).map((reference) => (
                                <p className="muted" key={JSON.stringify(reference)}>
                                    {sourceName(reference)} / {reference.observation} /{" "}
                                    {reference.widget}
                                </p>
                            ))}
                            {item.members.length > 50 && (
                                <p className="muted">
                                    First 50 references shown. Download for the complete list.
                                </p>
                            )}
                        </details>
                    ))}
                    {group.widgetCorrespondences.length === 0 && (
                        <p className="muted">No widget descriptions were included.</p>
                    )}
                    {group.widgetCorrespondences.length > widgetLimit && (
                        <button className="quiet" onClick={() => setWidgetLimit(widgetLimit + 20)}>
                            Show more widget descriptions
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
