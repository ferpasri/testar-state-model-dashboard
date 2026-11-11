import {
    constructAbstractModel,
    parseAbstractionRules,
    type AnalysisSource,
} from "testar-abstraction";
import { decodeWorkerValues, encodeWorkerValues, type WorkerValues } from "./worker-values";

interface AbstractionRequest {
    sources: WorkerValues<AnalysisSource[]>;
    definition: string;
    selectedRuns: string[];
}

self.onmessage = async (message: MessageEvent<AbstractionRequest>) => {
    try {
        const { sources, definition, selectedRuns } = message.data;
        const result = await constructAbstractModel(
            decodeWorkerValues(sources),
            parseAbstractionRules(definition),
            selectedRuns,
            (progress) => self.postMessage({ kind: "progress", progress }),
        );
        self.postMessage({ kind: "complete", result: encodeWorkerValues(result) });
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
