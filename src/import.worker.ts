import { importDirectory, type InputFile } from "./evidence/import";

self.onmessage = async (message: MessageEvent<InputFile[]>) => {
    try {
        const sources = await importDirectory(message.data, (progress) =>
            self.postMessage({ kind: "progress", progress }),
        );
        self.postMessage({ kind: "complete", sources });
    } catch (error) {
        self.postMessage({
            kind: "error",
            message: error instanceof Error ? error.message : "Import failed.",
        });
    }
};
