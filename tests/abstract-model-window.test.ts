import { describe, expect, it } from "vitest";
import type { AbstractModelEdge, AbstractModelNode } from "../src/analysis";
import { abstractModelWindow } from "../src/abstract-model-presentation";

function nodes(count: number): AbstractModelNode[] {
    return Array.from({ length: count }, (_, index) => ({
        id: "node-" + index,
        label: "State " + index,
        groupId: "group-" + index,
        members: [{ source: "source", run: "run", observation: "observation-" + index }],
    }));
}

function edge(id: string, source: string, target: string): AbstractModelEdge {
    return {
        id,
        kind: "execution",
        source,
        target,
        label: "click",
        actionType: "click",
        executions: [{ source: "source", run: "run", execution: id }],
        orderLinks: [],
    };
}

function expectConnectedEndpoints(window: ReturnType<typeof abstractModelWindow>): void {
    const visible = new Set(window.nodes.map((node) => node.id));
    for (const item of window.edges) {
        expect(visible.has(item.source)).toBe(true);
        expect(visible.has(item.target)).toBe(true);
    }
}

describe("abstract model graph window", () => {
    it("retains every node and link in a small graph", () => {
        const states = nodes(3);
        const links = [
            edge("forward", "node-0", "node-1"),
            edge("reverse", "node-1", "node-0"),
            edge("loop", "node-2", "node-2"),
        ];
        expect(abstractModelWindow(states, links, "node-2", "")).toEqual({
            nodes: states,
            edges: links,
        });
    });

    it("caps disconnected nodes while bringing a selected node outside the initial window into view", () => {
        const states = nodes(1000);
        const window = abstractModelWindow(states, [], "node-999", "");
        expect(window.nodes).toHaveLength(500);
        expect(window.nodes.some((node) => node.id === "node-999")).toBe(true);
        expect(window.edges).toHaveLength(0);
    });

    it("caps links independently when the entire node set fits", () => {
        const states = nodes(10);
        const links = Array.from({ length: 2500 }, (_, index) =>
            edge("edge-" + index, "node-" + (index % 10), "node-" + ((index + 1) % 10)),
        );
        const window = abstractModelWindow(states, links, "node-0", "");
        expect(window.nodes).toHaveLength(10);
        expect(window.edges).toHaveLength(2000);
        expectConnectedEndpoints(window);
    });

    it("retains a selected link past the edge cap and both endpoints outside the initial node window", () => {
        const states = nodes(1000);
        const links = Array.from({ length: 2500 }, (_, index) =>
            edge("edge-" + index, "node-0", "node-1"),
        );
        const selected = edge("selected", "node-998", "node-999");
        links.push(selected);
        const window = abstractModelWindow(states, links, "", selected.id);
        expect(window.nodes).toHaveLength(500);
        expect(window.nodes.some((node) => node.id === selected.source)).toBe(true);
        expect(window.nodes.some((node) => node.id === selected.target)).toBe(true);
        expect(window.edges).toHaveLength(2000);
        expect(window.edges.some((item) => item.id === selected.id)).toBe(true);
        expectConnectedEndpoints(window);
    });

    it("retains selected self-loops without counting their node twice", () => {
        const states = nodes(800);
        const loop = edge("selected-loop", "node-799", "node-799");
        const window = abstractModelWindow(states, [loop], "", loop.id);
        expect(window.nodes).toHaveLength(500);
        expect(window.nodes.filter((node) => node.id === loop.source)).toHaveLength(1);
        expect(window.edges).toEqual([loop]);
        expectConnectedEndpoints(window);
    });

    it("omits links whose endpoint is outside the bounded node window", () => {
        const states = nodes(1000);
        const links = [edge("far-component", "node-998", "node-999")];
        const window = abstractModelWindow(states, links, "node-0", "");
        expect(window.nodes).toHaveLength(500);
        expect(window.edges).toHaveLength(0);
        expectConnectedEndpoints(window);
    });

    it("bounds visible nodes and links with many repeated high-degree connections", () => {
        const states = nodes(1000);
        const links = Array.from({ length: 40_000 }, (_, index) =>
            edge("edge-" + index, "node-999", "node-" + (index % 900)),
        );
        const selected = links.at(-1)!;
        const window = abstractModelWindow(states, links, "", selected.id);
        expect(window.nodes).toHaveLength(500);
        expect(new Set(window.nodes.map((node) => node.id)).size).toBe(500);
        expect(window.nodes.some((node) => node.id === selected.source)).toBe(true);
        expect(window.nodes.some((node) => node.id === selected.target)).toBe(true);
        expect(window.edges).toHaveLength(2000);
        expect(window.edges.some((item) => item.id === selected.id)).toBe(true);
        expectConnectedEndpoints(window);
    });

    it("returns a stable window without mutating the original graph or link order", () => {
        const states = nodes(700);
        const links = Array.from({ length: 2100 }, (_, index) =>
            edge("edge-" + index, "node-0", "node-" + ((index % 600) + 1)),
        );
        const originalNodeIds = states.map((node) => node.id);
        const originalEdgeIds = links.map((item) => item.id);
        states.forEach(Object.freeze);
        links.forEach(Object.freeze);
        Object.freeze(states);
        Object.freeze(links);
        const first = abstractModelWindow(states, links, "", "edge-2099");
        const second = abstractModelWindow(states, links, "", "edge-2099");
        expect(second).toEqual(first);
        expect(states.map((node) => node.id)).toEqual(originalNodeIds);
        expect(links.map((item) => item.id)).toEqual(originalEdgeIds);
        expectConnectedEndpoints(first);
    });
});
