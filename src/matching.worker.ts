import {
    buildDerivedModel,
    parseDefinition,
    previewMatching,
    type AnalysisSource,
} from "./analysis";

interface MatchingRequest {
    sources: AnalysisSource[];
    definition: string;
    selectedRuns: string[];
}

self.onmessage = async (message: MessageEvent<MatchingRequest>) => {
    try {
        const { sources, definition, selectedRuns } = message.data;
        const preview = await previewMatching(
            sources,
            parseDefinition(definition),
            selectedRuns,
            (progress) => self.postMessage({ kind: "progress", progress }),
        );
        self.postMessage({
            kind: "progress",
            progress: {
                stage: "Building derived model",
                completed: 0,
                total: preview.counts.observations,
            },
        });
        const model = buildDerivedModel(preview, sources);
        self.postMessage({ kind: "complete", preview, model });
    } catch (error) {
        self.postMessage({
            kind: "error",
            message: error instanceof Error ? error.message : "Matching could not be completed.",
        });
    }
};
