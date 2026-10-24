import { canonical, digest } from "../evidence/common";
import { ComparisonBudget, MatchingLimitError } from "./budget";
import { validateDefinition } from "./definition";
import { buildEvidenceIndex, compare, referenceKey, runKey } from "./evidenceIndex";
import { projectObservation } from "./projection";
import {
    INTERPRETER_VERSION,
    type AnalysisSource,
    type MatchingDefinition,
    type MatchingGroup,
    type MatchingPreview,
    type MatchingProgress,
    type ObservationProjection,
    type ProjectedWidget,
    type WidgetCorrespondence,
} from "./types";

interface GroupBuilder {
    comparison: unknown;
    members: MatchingGroup["members"];
    widgetBuckets: Map<string, { description: unknown; members: ProjectedWidget["reference"][] }>;
}

export async function previewMatching(
    sources: AnalysisSource[],
    requestedDefinition: MatchingDefinition,
    selectedRuns: string[],
    report: (progress: MatchingProgress) => void = () => {},
): Promise<MatchingPreview> {
    const definition = validateDefinition(requestedDefinition);
    const policyFingerprint = await hash(canonical(definition));
    report({ stage: "Indexing selected evidence", completed: 0, total: sources.length });
    const index = buildEvidenceIndex(sources, selectedRuns);
    const builders = new Map<string, GroupBuilder>();
    const unmatched: MatchingPreview["unmatched"] = [];
    const budget = new ComparisonBudget();
    let completed = 0;
    for (const indexed of index.observations.values()) {
        let projection: ObservationProjection;
        try {
            projection = projectObservation(indexed, definition, (value) => budget.account(value));
            if (!projection.informative) {
                throw new Error("None of the selected fields has a captured value.");
            }
        } catch (error) {
            if (error instanceof MatchingLimitError) {
                throw error;
            }
            unmatched.push({
                reference: indexed.reference,
                sequence: indexed.observation.observation_index,
                reason:
                    error instanceof Error ? error.message : "The observation cannot be compared.",
            });
            completed++;
            report({ stage: "Comparing observations", completed, total: index.observations.size });
            continue;
        }
        budget.account(projection.comparison);
        const encoded = canonical(projection.comparison);
        let builder = builders.get(encoded);
        if (!builder) {
            builder = { comparison: projection.comparison, members: [], widgetBuckets: new Map() };
            builders.set(encoded, builder);
        }
        builder.members.push(projection.member);
        collectWidgets(builder, projection.widgets);
        completed++;
        if (completed % 25 === 0 || completed === index.observations.size) {
            report({ stage: "Comparing observations", completed, total: index.observations.size });
        }
    }
    const entries = [...builders.entries()];
    const groups: MatchingGroup[] = [];
    for (let start = 0; start < entries.length; start += 128) {
        groups.push(
            ...(await Promise.all(
                entries.slice(start, start + 128).map(async ([comparison, builder]) => {
                    const id = await hash(canonical([policyFingerprint, comparison]));
                    return {
                        id,
                        comparison: builder.comparison,
                        members: builder.members,
                        widgetCorrespondences: correspondences(id, builder),
                    };
                }),
            )),
        );
    }
    groups.sort((left, right) => compare(left.id, right.id));
    report({ stage: "Matching preview ready", completed, total: index.observations.size });
    return {
        definition,
        policyFingerprint,
        interpreterVersion: INTERPRETER_VERSION,
        inputScope: {
            sources: [...index.sources.values()].map((source) => ({
                id: source.id,
                label: source.label,
                fingerprint: source.fingerprint,
            })),
            runs: [...index.runs.values()].map(({ source, run }) => ({
                source: source.id,
                run: run.id,
            })),
        },
        index: index.counts,
        groups,
        unmatched,
        counts: {
            observations: index.observations.size,
            groups: groups.length,
            sharedGroups: groups.filter(
                (group) =>
                    new Set(
                        group.members.map((member) =>
                            runKey(member.reference.source, member.reference.run),
                        ),
                    ).size > 1,
            ).length,
            unmatched: unmatched.length,
        },
    };
}

function collectWidgets(builder: GroupBuilder, widgets: ProjectedWidget[]): void {
    for (const widget of widgets) {
        if (!widget.informative) {
            continue;
        }
        const key = canonical(widget.description);
        let bucket = builder.widgetBuckets.get(key);
        if (!bucket) {
            bucket = { description: widget.description, members: [] };
            builder.widgetBuckets.set(key, bucket);
        }
        bucket.members.push(widget.reference);
    }
}

function correspondences(group: string, builder: GroupBuilder): WidgetCorrespondence[] {
    return [...builder.widgetBuckets.entries()]
        .sort(([left], [right]) => compare(left, right))
        .map(([, bucket], index) => {
            const observations = new Set<string>();
            let ambiguous = false;
            for (const member of bucket.members) {
                const { widget: _widget, ...observation } = member;
                const key = referenceKey(observation);
                if (observations.has(key)) {
                    ambiguous = true;
                }
                observations.add(key);
            }
            return {
                id: group + ":widget:" + index,
                description: bucket.description,
                members: bucket.members,
                ambiguous,
            };
        });
}

async function hash(value: string): Promise<string> {
    return digest(new TextEncoder().encode(value));
}
