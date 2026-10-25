import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { canonical, displayValue, formatJson, parseJson } from "../src/evidence/common";
import { importDirectory } from "../src/evidence/import";
import { EvidenceReconstructor } from "../src/evidence/reconstructed-evidence";
import { manifestSchema } from "../src/evidence/schema";
import { sharedCases, fixtureFiles } from "./support";

const directory = sharedCases().find((item) => path.basename(item) === "initial-observation")!;
const initial = readFileSync(path.join(directory, "evidence.jsonl"), "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")),
);

test("preserves large integer properties through parsing, reconstruction, clone, and display", () => {
    const text = '{"large":18446744073709551615,"small":42}';
    const properties = parseJson(text);
    expect(canonical(properties)).toBe(text);
    expect(formatJson(structuredClone(properties))).toContain("18446744073709551615");
    const observation_recorded = structuredClone(initial[3]);
    observation_recorded.event.data.recorded_state.properties = properties;
    const reconstructor = new EvidenceReconstructor(manifest);
    reconstructor.apply(initial[0]);
    reconstructor.apply(initial[1]);
    reconstructor.apply(initial[2]);
    reconstructor.apply(observation_recorded);
    expect(
        reconstructor.evidence.observations.values().next().value!.recorded_state.properties.large,
    ).toBe(18446744073709551615n);
});

test("retains incomplete execution status and accepts a late evaluation", () => {
    const reconstructor = new EvidenceReconstructor(manifest);
    initial.forEach((event) => reconstructor.apply(event));
    const observation = initial[3].event.data;
    const execution = {
        id: "execution",
        test_sequence: observation.test_sequence,
        source_observation: observation.id,
        action_description: "example:activate",
        target_widget: "login",
        parameters: {},
    };
    const emit = (id: string, kind: string, data: unknown) =>
        reconstructor.apply({ schema_version: 3, id, event: { event_type: kind, data } });
    emit("selected", "action_selected", execution);
    emit("submitted", "action_execution_reported", {
        action_execution: "execution",
        outcome: "returned",
        error: null,
    });
    emit("finished", "test_sequence_finished", {
        test_sequence: observation.test_sequence,
        reason: "interrupted",
    });
    expect(reconstructor.evidence.executions.get("execution")).toMatchObject({
        status: "incomplete",
        resultingObservation: null,
    });
    emit("late-check", "oracle_result_recorded", {
        test_run: initial[0].event.data.id,
        name: "Review",
        oracle: { id: "review" },
        oracle_target: { target_type: "test_run" },
        oracle_status: "unknown",
        oracle_details: {},
    });
    expect(reconstructor.evidence.oracleResults).toHaveLength(1);
    expect(() =>
        emit("second-finish", "test_sequence_finished", {
            test_sequence: observation.test_sequence,
            reason: "done",
        }),
    ).toThrow("finished");
});

test("rejects a backward result while preserving a submitted execution", () => {
    const reconstructor = new EvidenceReconstructor(manifest);
    initial.forEach((event) => reconstructor.apply(event));
    const observation = initial[3].event.data;
    reconstructor.apply({
        schema_version: 3,
        id: "selection",
        event: {
            event_type: "action_selected",
            data: {
                id: "execution",
                test_sequence: observation.test_sequence,
                source_observation: observation.id,
                action_description: "example:activate",
                target_widget: "login",
                parameters: {},
            },
        },
    });
    reconstructor.apply({
        schema_version: 3,
        id: "execution-result",
        event: {
            event_type: "action_execution_reported",
            data: { action_execution: "execution", outcome: "returned", error: null },
        },
    });
    expect(() =>
        reconstructor.apply({
            schema_version: 3,
            id: "result",
            event: {
                event_type: "transition_recorded",
                data: { action_execution: "execution", resulting_observation: observation.id },
            },
        }),
    ).toThrow("later in the same sequence");
    expect(reconstructor.evidence.executions.get("execution")?.status).toBe(
        "awaiting_resulting_observation",
    );
    expect(reconstructor.evidence.eventCount).toBe(6);
});

test("verifies repeated screenshot references using one file read", async () => {
    const events = structuredClone(initial);
    const second = structuredClone(events[3]);
    second.id = "second-event";
    second.event.data.id = "second-observation";
    second.event.data.observation_index = 2;
    events.push(second);
    const files = fixtureFiles(directory).map((item) =>
        item.path === "evidence.jsonl"
            ? {
                  ...item,
                  file: new File(
                      [events.map((event) => JSON.stringify(event)).join("\n") + "\n"],
                      "evidence.jsonl",
                  ),
              }
            : item,
    );
    const image = files.find((item) => item.path.endsWith(".png"))!;
    const reads = vi.spyOn(image.file, "arrayBuffer");
    const sources = await importDirectory(files);
    expect(sources[0].evidence.observations.size).toBe(2);
    expect(sources[0].evidence.recordedStates.size).toBe(1);
    expect(reads).toHaveBeenCalledTimes(1);
});

test("renders unusual property objects as data", () => {
    const value = parseJson('{"toString":null,"valueOf":null}');
    expect(displayValue(value)).toContain('"toString": null');
});
