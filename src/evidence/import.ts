import { canonical, digest, EvidenceError, parseJson, requireEvidence, safePath } from "./common";
import { EvidenceReconstructor, type ReconstructedEvidence } from "./reconstructed-evidence";
import { manifestSchema } from "./schema";
import { imageDimensions } from "./images";

export const LIMITS = {
    files: 10_000,
    totalBytes: 256 * 1024 ** 2,
    logBytes: 128 * 1024 ** 2,
    artifactBytes: 32 * 1024 ** 2,
    recordBytes: 2 * 1024 ** 2,
    events: 100_000,
};
export interface InputFile {
    path: string;
    file: File;
}
export interface ImportedSource {
    id: string;
    label: string;
    fingerprint: string;
    evidence: ReconstructedEvidence;
    artifacts: Map<string, File>;
    bytes: number;
}
export interface Progress {
    stage: string;
    completed: number;
    total: number;
}
type Reporter = (progress: Progress) => void;

export async function* lines(file: File): AsyncGenerator<{ text: string; line: number }> {
    let reader: ReadableStreamDefaultReader<string> | undefined;
    let remainder = "";
    let line = 0;
    try {
        reader = file
            .stream()
            .pipeThrough(new TextDecoderStream("utf-8", { fatal: true }))
            .getReader();
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }
            remainder += result.value;
            let boundary: number;
            while ((boundary = remainder.indexOf("\n")) >= 0) {
                const text = remainder.slice(0, boundary).replace(/\r$/u, "");
                requireEvidence(
                    new TextEncoder().encode(text).byteLength <= LIMITS.recordBytes,
                    "JSONL record exceeds 2 MiB.",
                );
                line++;
                yield { text, line };
                remainder = remainder.slice(boundary + 1);
            }
            requireEvidence(remainder.length <= LIMITS.recordBytes, "JSONL record exceeds 2 MiB.");
        }
        requireEvidence(
            remainder.length === 0,
            "Incomplete final JSONL record: a terminating newline is required.",
        );
    } catch (error) {
        throw new EvidenceError(
            "evidence.jsonl:" +
                (line + 1) +
                ": " +
                (fileAccessMessage(error) ??
                    (error instanceof Error ? error.message : "Cannot decode evidence.")),
        );
    } finally {
        if (reader) {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }
    }
}

export async function importDirectory(
    input: InputFile[],
    report: Reporter = () => {},
): Promise<ImportedSource[]> {
    requireEvidence(
        input.length > 0 && input.length <= LIMITS.files,
        "Select between 1 and 10,000 files.",
    );
    const totalBytes = input.reduce((total, item) => total + item.file.size, 0);
    requireEvidence(
        totalBytes <= LIMITS.totalBytes,
        "Selected files exceed the 256 MiB import limit.",
    );
    const files = new Map<string, File>();
    for (const item of input) {
        const path = safePath(item.path);
        requireEvidence(!files.has(path), "Duplicate input path: " + path);
        files.set(path, item.file);
    }
    const roots = Array.from(files.keys())
        .filter((path) => path === "manifest.json" || path.endsWith("/manifest.json"))
        .map((path) => path.slice(0, -"manifest.json".length));
    requireEvidence(
        roots.length > 0 && roots.length <= 20,
        "Select an evidence folder, or a parent folder containing up to 20 traces.",
    );
    requireEvidence(
        !roots.some((root) => roots.some((other) => other !== root && root.startsWith(other))),
        "Nested evidence directories must be imported separately.",
    );
    const sources: ImportedSource[] = [];
    for (const root of roots) {
        try {
            sources.push(await importTrace(root, files, report));
        } catch (error) {
            throw new EvidenceError(
                (root ? root.replace(/\/$/u, "") + ": " : "") +
                    (error instanceof Error ? error.message : "Import failed."),
            );
        }
    }
    return sources;
}

async function importTrace(
    root: string,
    files: Map<string, File>,
    report: Reporter,
): Promise<ImportedSource> {
    const manifestFile = files.get(root + "manifest.json")!;
    requireEvidence(manifestFile.size <= LIMITS.recordBytes, "manifest.json exceeds 2 MiB.");
    const manifestResult = manifestSchema.safeParse(await readManifest(manifestFile));
    requireEvidence(
        manifestResult.success,
        "manifest.json: expected an evidence identity and supported schema_version (3).",
    );
    const evidence = files.get(root + "evidence.jsonl");
    requireEvidence(
        evidence && evidence.size <= LIMITS.logBytes,
        "evidence.jsonl is missing or exceeds 128 MiB.",
    );
    const reconstructor = new EvidenceReconstructor(manifestResult.data);
    let processed = 0;
    for await (const entry of lines(evidence)) {
        try {
            requireEvidence(
                entry.line <= LIMITS.events,
                "Evidence exceeds the 100,000-record limit.",
            );
            requireEvidence(entry.text.trim().length > 0, "Empty JSONL record.");
            reconstructor.apply(parseJson(entry.text));
        } catch (error) {
            throw new EvidenceError(
                "evidence.jsonl:" +
                    entry.line +
                    ": " +
                    (error instanceof Error ? error.message : "Invalid record."),
            );
        }
        processed++;
        if (processed % 100 === 0) {
            report({ stage: "Validating " + root, completed: processed, total: 0 });
        }
    }
    const artifacts = new Map<string, File>();
    const references = Array.from(reconstructor.evidence.observations.values()).flatMap(
        (item) => item.artifacts,
    );
    const verified = new Map<string, string>();
    const imageMetadata = new Map<string, { width: number; height: number } | null>();
    for (const [index, artifact] of references.entries()) {
        const key = safePath(artifact.path);
        const file = files.get(root + key);
        requireEvidence(
            file && file.size <= LIMITS.artifactBytes,
            "Artifact is missing or exceeds 32 MiB: " + key,
        );
        const metadataKey = canonical([key, artifact.media_type]);
        const isImage = ["image/png", "image/jpeg"].includes(artifact.media_type);
        if (verified.has(key)) {
            requireEvidence(
                verified.get(key) === artifact.sha256,
                "Conflicting artifact hashes: " + key,
            );
            if (isImage && !imageMetadata.has(metadataKey)) {
                imageMetadata.set(
                    metadataKey,
                    imageDimensions(
                        new Uint8Array(await readBytes(file, key)),
                        artifact.media_type,
                    ),
                );
            }
        } else {
            const bytes = new Uint8Array(await readBytes(file, key));
            requireEvidence(
                (await digest(bytes)) === artifact.sha256,
                "Artifact hash mismatch: " + key,
            );
            verified.set(key, artifact.sha256);
            if (isImage) {
                imageMetadata.set(metadataKey, imageDimensions(bytes, artifact.media_type));
            }
        }
        const metadata = imageMetadata.get(metadataKey);
        if (metadata) {
            requireEvidence(
                (artifact.width == null || artifact.width === metadata.width) &&
                    (artifact.height == null || artifact.height === metadata.height),
                "Artifact dimensions do not match its metadata: " + key,
            );
        }
        artifacts.set(key, file);
        report({ stage: "Verifying screenshots", completed: index + 1, total: references.length });
    }
    const logHash = await digest(await readBytes(evidence, "evidence.jsonl"));
    const fingerprint = await digest(
        new TextEncoder().encode(canonical(reconstructor.evidence.manifest) + ":" + logHash),
    );
    report({ stage: "Ready", completed: processed, total: processed });
    return {
        id: fingerprint,
        fingerprint,
        label:
            root.replace(/\/$/u, "").split("/").at(-1) ||
            reconstructor.evidence.manifest.evidence_id,
        evidence: reconstructor.evidence,
        artifacts,
        bytes:
            evidence.size +
            manifestFile.size +
            Array.from(artifacts.values()).reduce((sum, file) => sum + file.size, 0),
    };
}

async function readManifest(file: File): Promise<unknown> {
    const bytes = await readBytes(file, "manifest.json");
    try {
        return parseJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
        throw new EvidenceError(
            "manifest.json: " +
                (error instanceof Error ? error.message : "Cannot decode manifest."),
        );
    }
}

async function readBytes(file: File, path: string): Promise<ArrayBuffer> {
    try {
        return await file.arrayBuffer();
    } catch (error) {
        throw new EvidenceError(
            path +
                ": " +
                (fileAccessMessage(error) ??
                    (error instanceof Error ? error.message : "Cannot read this file.")),
        );
    }
}

function fileAccessMessage(error: unknown): string | undefined {
    if (!(error instanceof Error)) {
        return undefined;
    }
    if (error.name === "NotFoundError") {
        return (
            "Cannot read this selected file. Select the complete evidence folder again. " +
            "If the file still exists, copy the complete evidence folder to a shorter local path and select that copy."
        );
    }
    if (error.name === "NotReadableError") {
        return (
            "Cannot read this selected file. It may have changed or become unavailable. " +
            "Select the complete evidence folder again after recording has finished."
        );
    }
    return undefined;
}
