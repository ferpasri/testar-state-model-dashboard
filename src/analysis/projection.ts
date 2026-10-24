import { canonical } from "../evidence/common";
import { ComparisonBudget } from "./budget";
import type { Observation } from "../evidence/schema";
import { matchesPredicate, projectFields } from "./fields";
import { compare, type IndexedObservation } from "./evidenceIndex";
import {
    MATCHING_LIMITS,
    type MatchingDefinition,
    type ObservationProjection,
    type ProjectedWidget,
} from "./types";

interface WidgetNode {
    widget: Observation["recorded_state"]["widgets"][number];
    children: WidgetNode[];
    parent: WidgetNode | null;
}

export function projectObservation(
    indexed: IndexedObservation,
    definition: MatchingDefinition,
    account: (value: unknown) => void = () => {},
): ObservationProjection {
    const { observation, reference } = indexed;
    const state = projectFields(observation.recorded_state.properties, definition.state);
    const projectionBudget = new ComparisonBudget();
    projectionBudget.account(state.projection);
    const comparison: Record<string, unknown> = { state: state.projection };
    if (definition.capture === "same") {
        comparison.capture = observation.recorded_state.capture;
    }
    const member = {
        reference,
        sequence: observation.observation_index,
        capture: observation.recorded_state.capture,
        stateFields: state.explanations,
        includedWidgets: 0,
        excludedWidgets: 0,
    };
    if (!definition.widgets) {
        return { comparison, member, widgets: [], informative: state.informative };
    }
    if (observation.recorded_state.capture === "unavailable") {
        throw new Error("Widget capture is unavailable for this observation.");
    }
    const policy = definition.widgets;
    const nodes = makeTree(observation.recorded_state.widgets);
    const excluded = new Set<WidgetNode>();
    for (const node of nodes) {
        if (
            (policy.exclude ?? []).some((predicate) =>
                matchesPredicate(node.widget.properties, predicate),
            )
        ) {
            excluded.add(node);
        }
    }
    if (policy.descendants === "exclude") {
        const pending = [...excluded];
        while (pending.length > 0) {
            for (const child of pending.pop()!.children) {
                if (!excluded.has(child)) {
                    excluded.add(child);
                    pending.push(child);
                }
            }
        }
    }
    const selected = new Map<WidgetNode, ProjectedWidget>();
    let informative = state.informative;
    for (const node of nodes) {
        if (excluded.has(node)) {
            continue;
        }
        const fields = projectFields(node.widget.properties, policy.fields);
        projectionBudget.account(fields.projection);
        informative ||= fields.informative;
        selected.set(node, {
            reference: { ...reference, widget: node.widget.id },
            fields: fields.projection,
            informative: fields.informative,
            description: fields.projection,
        });
    }
    const widgets = [...selected.values()];
    member.includedWidgets = widgets.length;
    member.excludedWidgets = excluded.size;
    if (policy.hierarchy === "flat") {
        const descriptions = widgets.map((widget) => {
            if (widget.informative) {
                account(widget.description);
            }
            return widget.fields;
        });
        comparison.widgets = policy.order === "sort" ? sortValues(descriptions) : descriptions;
    } else {
        const childLists = new Map<WidgetNode | null, WidgetNode[]>();
        for (const node of selected.keys()) {
            let parent = node.parent;
            while (parent && excluded.has(parent)) {
                parent = parent.parent;
            }
            const children = childLists.get(parent) ?? [];
            children.push(node);
            childLists.set(parent, children);
        }
        const serialize = (parent: WidgetNode | null, path: unknown[]): unknown[] => {
            const values = (childLists.get(parent) ?? []).map((node) => {
                const item = selected.get(node)!;
                const nextPath = [...path, item.fields];
                item.description = { path: nextPath };
                if (item.informative) {
                    account(item.description);
                }
                return { fields: item.fields, children: serialize(node, nextPath) };
            });
            return policy.order === "sort" ? sortValues(values) : values;
        };
        comparison.widgets = serialize(null, []);
    }
    return { comparison, member, widgets, informative };
}

function makeTree(widgets: Observation["recorded_state"]["widgets"]): WidgetNode[] {
    const nodes = widgets.map((widget) => ({ widget, children: [], parent: null }) as WidgetNode);
    const byId = new Map(nodes.map((node) => [node.widget.id, node]));
    for (const node of nodes) {
        if (node.widget.parent !== null) {
            const parent = byId.get(node.widget.parent);
            if (!parent) {
                throw new Error("A captured widget has an unavailable parent.");
            }
            parent.children.push(node);
            node.parent = parent;
        }
    }
    const visited = new Set<WidgetNode>();
    const pending = nodes
        .filter((node) => node.parent === null)
        .map((node) => ({ node, depth: 1 }));
    while (pending.length > 0) {
        const { node, depth } = pending.pop()!;
        if (depth > MATCHING_LIMITS.hierarchyDepth) {
            throw new Error("The widget hierarchy exceeds the supported depth of 128.");
        }
        visited.add(node);
        for (const child of node.children) {
            pending.push({ node: child, depth: depth + 1 });
        }
    }
    if (visited.size !== nodes.length) {
        throw new Error("The captured widget hierarchy contains a cycle.");
    }
    return nodes;
}

function sortValues<T>(values: T[]): T[] {
    if (values.length < 2) {
        return values;
    }
    return values
        .map((value) => ({ value, key: canonical(value) }))
        .sort((left, right) => compare(left.key, right.key))
        .map((item) => item.value);
}
