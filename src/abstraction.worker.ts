import {
    buildAbstractModel,
    parseAbstractionRules,
    previewAbstraction,
    type AnalysisSource,
} from "./analysis";

interface AbstractionRequest {
    sources: AnalysisSource[];
    definition: string;
    selectedRuns: string[];
}

self.onmessage = async (message: MessageEvent<AbstractionRequest>) => {
    try {
        const { sources, definition, selectedRuns } = message.data;
        const preview = await previewAbstraction(
            sources,
            parseAbstractionRules(definition),
            selectedRuns,
            (progress) => self.postMessage({ kind: "progress", progress }),
        );
        self.postMessage({
            kind: "progress",
            progress: {
                stage: "Building abstract model",
                completed: 0,
                total: preview.counts.observations,
            },
        });
        const model = buildAbstractModel(preview, sources);
        self.postMessage({ kind: "complete", preview, model });
    } catch (error) {
        self.postMessage({
            kind: "error",
            message:
                error instanceof Error
                    ? error.message
                    : "Model construction could not be completed.",
        });
    }
};
