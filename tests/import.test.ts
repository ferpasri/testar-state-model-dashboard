import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { EvidenceReconstructor } from "../src/evidence/reconstructed-evidence";
import { manifestSchema } from "../src/evidence/schema";
import { importDirectory, lines, type InputFile } from "../src/evidence/import";
import { imageDimensions } from "../src/evidence/images";
import { parseJson, safePath } from "../src/evidence/common";
import { sharedCases, fixtureFiles } from "./support";

const initial = sharedCases().find(
    (directory) => path.basename(directory) === "initial-observation",
)!;
const events = readFileSync(path.join(initial, "evidence.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(path.join(initial, "manifest.json"), "utf8")),
);

function changedLog(entries: unknown[]): InputFile[] {
    return fixtureFiles(initial).map((item) =>
        item.path === "evidence.jsonl"
            ? {
                  path: item.path,
                  file: new File(
                      [entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"],
                      "evidence.jsonl",
                  ),
              }
            : item,
    );
}

describe("file import and safety", () => {
    test("qualifies colliding record IDs by independent source fingerprints", async () => {
        const other = structuredClone(events);
        other[0].event.data.producer = "another-tool";
        const input = [
            ...fixtureFiles(initial).map((item) => ({ ...item, path: "first/" + item.path })),
            ...changedLog(other).map((item) => ({ ...item, path: "second/" + item.path })),
        ];
        const sources = await importDirectory(input);
        expect(sources).toHaveLength(2);
        expect(sources[0].id).not.toBe(sources[1].id);
        expect(Array.from(sources[0].evidence.observations.keys())).toEqual(
            Array.from(sources[1].evidence.observations.keys()),
        );
    });

    test("identifies unreadable screenshots and explains how to retry", async () => {
        const input = fixtureFiles(initial).map((item) => ({
            ...item,
            path: "evidence/" + item.path,
        }));
        const artifact = input.find((item) => item.path.endsWith(".png"))!;
        vi.spyOn(artifact.file, "arrayBuffer").mockRejectedValue(
            new DOMException("A requested file could not be found.", "NotFoundError"),
        );

        await expect(importDirectory(input)).rejects.toThrow("evidence: artifacts/");
        await expect(importDirectory(input)).rejects.toThrow("shorter local path");
    });

    test("identifies an unavailable manifest before parsing it", async () => {
        const input = fixtureFiles(initial);
        const manifest = input.find((item) => item.path === "manifest.json")!;
        vi.spyOn(manifest.file, "arrayBuffer").mockRejectedValue(
            new DOMException("The file could not be read.", "NotReadableError"),
        );

        await expect(importDirectory(input)).rejects.toThrow("manifest.json: Cannot read");
        await expect(importDirectory(input)).rejects.toThrow("recording has finished");
    });

    test("explains browser file access errors while streaming evidence", async () => {
        const file = new File(["unused"], "evidence.jsonl");
        vi.spyOn(file, "stream").mockReturnValue(
            new ReadableStream<Uint8Array<ArrayBuffer>>({
                start(controller) {
                    controller.error(new DOMException("File unavailable.", "NotFoundError"));
                },
            }),
        );

        await expect(async () => {
            for await (const entry of lines(file)) {
                void entry;
            }
        }).rejects.toThrow("evidence.jsonl:1: Cannot read");
    });

    test("rejects corrupt screenshot bytes", async () => {
        const input = fixtureFiles(initial).map((item) =>
            item.path.endsWith(".png")
                ? { ...item, file: new File(["changed"], "image.png") }
                : item,
        );
        await expect(importDirectory(input)).rejects.toThrow("hash mismatch");
    });

    test.each(["../image.png", "/image.png", "C:/image.png", "a\\image.png", "a//image.png"])(
        "rejects unsafe path %s",
        (name) => {
            expect(() => safePath(name)).toThrow("Unsafe");
        },
    );

    test("rejects duplicate paths and overlapping evidence folders", async () => {
        const input = fixtureFiles(initial);
        await expect(importDirectory([...input, input[0]])).rejects.toThrow("Duplicate input");
        await expect(
            importDirectory([
                ...input,
                ...input.map((item) => ({ ...item, path: "nested/" + item.path })),
            ]),
        ).rejects.toThrow("Nested");
    });

    test("requires a complete final JSONL line", async () => {
        const file = new File(["{}"], "evidence.jsonl");
        await expect(async () => {
            for await (const entry of lines(file)) {
                void entry;
            }
        }).rejects.toThrow("terminating newline");
    });

    test("rejects unsupported schemas with a file diagnostic", async () => {
        const input = fixtureFiles(initial).map((item) =>
            item.path === "manifest.json"
                ? {
                      ...item,
                      file: new File(['{"schema_version":99,"evidence":"test"}'], "manifest.json"),
                  }
                : item,
        );
        await expect(importDirectory(input)).rejects.toThrow("manifest.json");
    });

    test("reports an invalid event line and retains the original property strings", async () => {
        const altered = structuredClone(events);
        altered[3].event.data.recorded_state.widgets[0].properties["ui.text"] =
            '<img src="https://example.invalid/leak" onerror="alert(1)">';
        const sources = await importDirectory(changedLog(altered));
        expect(
            Array.from(sources[0].evidence.observations.values())[0].recorded_state.widgets[0]
                .properties["ui.text"],
        ).toContain("onerror");
        altered[3].event.data.available_actions[0].target_widget = "missing-widget";
        await expect(importDirectory(changedLog(altered))).rejects.toThrow("evidence.jsonl:4");
    });

    test("rejects cyclic hierarchy before changing the reconstructed evidence", () => {
        const reconstructor = new EvidenceReconstructor(manifest);
        reconstructor.apply(events[0]);
        reconstructor.apply(events[1]);
        reconstructor.apply(events[2]);
        const altered = structuredClone(events[3]);
        altered.event.data.recorded_state.widgets[0].parent =
            altered.event.data.recorded_state.widgets[0].id;
        expect(() => reconstructor.apply(altered)).toThrow("cycle");
        expect(reconstructor.evidence.observations.size).toBe(0);
    });

    test("rejects conflicting repeated event identities", () => {
        const reconstructor = new EvidenceReconstructor(manifest);
        reconstructor.apply(events[0]);
        const altered = structuredClone(events[0]);
        altered.event.data.producer = "changed";
        expect(() => reconstructor.apply(altered)).toThrow("conflicting");
        expect(reconstructor.evidence.eventCount).toBe(1);
    });

    test("bounds nested JSON and image dimensions", () => {
        expect(() => parseJson("[".repeat(50) + "0" + "]".repeat(50))).toThrow("nesting");
        const image = new Uint8Array(
            readFileSync(path.join(initial, events[3].event.data.artifacts[0].path)),
        );
        new DataView(image.buffer).setUint32(16, 100_000);
        new DataView(image.buffer).setUint32(20, 100_000);
        expect(() => imageDimensions(image, "image/png")).toThrow("pixel");
    });
});
