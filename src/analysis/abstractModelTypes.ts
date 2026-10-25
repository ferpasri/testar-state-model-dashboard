import type { RecordedExecution } from "../evidence/reconstructed-evidence";
import type { EvidenceReference } from "./types";

export interface ExecutionReference {
    source: string;
    run: string;
    execution: string;
}

export interface AbstractModelNode {
    id: string;
    label: string;
    groupId?: string;
    members: EvidenceReference[];
    unmatchedReason?: string;
}

export interface AbstractModelOrderLink {
    source: EvidenceReference;
    target: EvidenceReference;
}

export interface AbstractModelEdge {
    id: string;
    kind: "execution" | "observation_order";
    source: string;
    target: string;
    label: string;
    actionType?: string;
    executions: ExecutionReference[];
    orderLinks: AbstractModelOrderLink[];
}

export interface UnlinkedExecution {
    reference: ExecutionReference;
    sourceNode: string | null;
    reason: string;
    status: RecordedExecution["status"];
}

export interface AbstractModel {
    nodes: AbstractModelNode[];
    edges: AbstractModelEdge[];
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
