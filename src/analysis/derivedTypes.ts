import type { RecordedExecution } from "../evidence/model";
import type { EvidenceReference } from "./types";

export interface ExecutionReference {
    source: string;
    run: string;
    execution: string;
}

export interface DerivedNode {
    id: string;
    label: string;
    groupId?: string;
    members: EvidenceReference[];
    unmatchedReason?: string;
}

export interface DerivedOrderLink {
    source: EvidenceReference;
    target: EvidenceReference;
}

export interface DerivedEdge {
    id: string;
    kind: "execution" | "observation_order";
    source: string;
    target: string;
    label: string;
    actionKind?: string;
    executions: ExecutionReference[];
    orderLinks: DerivedOrderLink[];
}

export interface UnlinkedExecution {
    reference: ExecutionReference;
    sourceNode: string | null;
    reason: string;
    status: RecordedExecution["status"];
}

export interface DerivedModel {
    nodes: DerivedNode[];
    edges: DerivedEdge[];
    unlinkedExecutions: UnlinkedExecution[];
    counts: {
        matchedNodes: number;
        unmatchedNodes: number;
        observations: number;
        executionEdges: number;
        completedExecutions: number;
        unlinkedExecutions: number;
        orderEdges: number;
        orderLinks: number;
    };
}
