import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { EvidenceEvent } from "../../src/evidence/schema";
import { sharedCases } from "../support";

const directories = new Map(
    sharedCases().map((directory) => [path.basename(directory), directory]),
);

export function readEvidenceCase(name: string): { manifest: Buffer; events: EvidenceEvent[] } {
    const directory = directories.get(name);
    if (!directory) {
        throw new Error("Shared conformance case not found: " + name);
    }
    return {
        manifest: readFileSync(path.join(directory, "manifest.json")),
        events: readFileSync(path.join(directory, "evidence.jsonl"), "utf8")
            .trimEnd()
            .split("\n")
            .map((line) => JSON.parse(line)),
    };
}

export function writeEvidenceCase(
    directory: string,
    manifest: Buffer,
    events: EvidenceEvent[],
): void {
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, "manifest.json"), manifest);
    writeFileSync(
        path.join(directory, "evidence.jsonl"),
        events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
}
