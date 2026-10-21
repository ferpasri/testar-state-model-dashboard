import type { ImportedSource } from "../evidence/import";
import type { Observation } from "../evidence/schema";

export const INTERPRETER_VERSION = "1.1.0";
export const MATCHING_LIMITS = {
    definitionBytes: 64 * 1024,
    observations: 10_000,
    widgets: 100_000,
    hierarchyDepth: 128,
    comparisonBytes: 32 * 1024 * 1024,
    normalizedValueBytes: 1024 * 1024,
};

export type AnalysisSource = Pick<ImportedSource, "id" | "label" | "fingerprint" | "model">;

export type Transform =
    | { op: "trim" | "collapse_whitespace" | "lowercase" }
    | { op: "replace"; find: string; with: string }
    | { op: "map"; values: Record<string, string> }
    | {
          op: "url";
          remove_path_parameters?: string[];
          remove_query?: string[];
          remove_fragment?: boolean;
      };

export interface Field {
    name: string;
    keys: string[];
    required?: boolean;
    transforms?: Transform[];
}

export type Predicate =
    | { keys: string[]; op: "present" }
    | { keys: string[]; op: "equals"; value: unknown }
    | { keys: string[]; op: "contains"; value: string };

export interface MatchingDefinition {
    version: 1;
    name: string;
    state: Field[];
    capture: "same" | "ignore";
    widgets?: {
        fields: Field[];
        exclude?: Predicate[];
        hierarchy: "flat" | "tree";
        order: "preserve" | "sort";
        descendants: "exclude" | "keep";
    };
}

export interface EvidenceReference {
    source: string;
    run: string;
    observation: string;
    widget?: string;
}

export interface FieldExplanation {
    name: string;
    key?: string;
    raw?: unknown;
    value?: unknown;
    missing: boolean;
}

export interface MatchingMember {
    reference: EvidenceReference;
    sequence: number;
    capture: Observation["state"]["capture"];
    stateFields: FieldExplanation[];
    includedWidgets: number;
    excludedWidgets: number;
}

export interface WidgetCorrespondence {
    id: string;
    description: unknown;
    members: EvidenceReference[];
    ambiguous: boolean;
}

export interface MatchingGroup {
    id: string;
    comparison: unknown;
    members: MatchingMember[];
    widgetCorrespondences: WidgetCorrespondence[];
}

export interface IndexCounts {
    sources: number;
    runs: number;
    observations: number;
    widgets: number;
    actions: number;
    executions: number;
}

export interface MatchingPreview {
    definition: MatchingDefinition;
    policyFingerprint: string;
    interpreterVersion: string;
    inputScope: {
        sources: Array<{ id: string; label: string; fingerprint: string }>;
        runs: Array<{ source: string; run: string }>;
    };
    index: IndexCounts;
    groups: MatchingGroup[];
    unmatched: Array<{ reference: EvidenceReference; sequence: number; reason: string }>;
    counts: { observations: number; groups: number; sharedGroups: number; unmatched: number };
}

export interface MatchingProgress {
    stage: string;
    completed: number;
    total: number;
}

export interface Reading {
    kind: "value" | "missing";
    value?: unknown;
}

export interface ProjectedField {
    name: string;
    reading: Reading;
}

export interface ProjectedWidget {
    reference: EvidenceReference;
    fields: ProjectedField[];
    informative: boolean;
    description: unknown;
}

export interface ObservationProjection {
    comparison: unknown;
    member: MatchingMember;
    widgets: ProjectedWidget[];
    informative: boolean;
}
