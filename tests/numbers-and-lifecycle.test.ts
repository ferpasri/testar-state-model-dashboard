import { JsonNumber } from "testar-evidence";
import {
    constructAbstractModel,
    parseAbstractionRules,
    runKey,
    type AnalysisSource,
} from "testar-abstraction";
import { encodeWorkerValues, decodeWorkerValues } from "../src/worker-values";
import { abstractionStateCase } from "./support";
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

test("preserves precise decimals and keeps ordinary text objects distinct during worker transfer", () => {
    const original = parseJson(
        '{"first":0.10000000000000001,"second":0.10000000000000002,"ordinary":{"text":"0.10000000000000001"}}',
    ) as Record<string, unknown>;
    const data = { properties: original, lookup: new Map([["measurement", original.first]]) };
    const restored = decodeWorkerValues(structuredClone(encodeWorkerValues(data)));
    expect(restored.properties.first).toBeInstanceOf(JsonNumber);
    expect(restored.lookup.get("measurement")).toBe(restored.properties.first);
    expect(restored.properties.ordinary).not.toBeInstanceOf(JsonNumber);
    expect(canonical(restored.properties)).toBe(canonical(original));
    expect(displayValue(restored.properties.first)).toBe("0.10000000000000001");
    expect(formatJson(restored.properties)).toContain('"second": 0.10000000000000002');
    expect(canonical(original.first)).not.toBe(canonical(original.second));
    expect(canonical(parseJson("1.000"))).toBe(canonical(1));
    expect(canonical(parseJson("1e1000000"))).toBe("1e1000000");
    expect(() => parseJson('{"value":1,"value":2}')).toThrow();
});

test("worker-transferred exact numbers produce the groups defined by the shared abstraction case", async () => {
    const directory = abstractionStateCase("precise-numeric-values");
    const input = parseJson(readFileSync(path.join(directory, "input.json"), "utf8")) as any;
    const sources = input.sources.map((source: any) => ({
        ...source,
        evidence: {
            runs: new Map(source.evidence.runs.map((record: any) => [record.id, record])),
            sequences: new Map(source.evidence.sequences.map((record: any) => [record.id, record])),
            observations: new Map(
                source.evidence.observations.map((record: any) => [record.id, record]),
            ),
            actions: new Map(source.evidence.actions.map((record: any) => [record.id, record])),
            executions: new Map(
                source.evidence.executions.map((record: any) => [record.execution.id, record]),
            ),
        },
    })) as AnalysisSource[];
    const result = await constructAbstractModel(
        decodeWorkerValues(structuredClone(encodeWorkerValues(sources))),
        parseAbstractionRules(readFileSync(path.join(directory, "rules.json"), "utf8")),
        input.selected_runs.map((reference: { source: string; run: string }) =>
            runKey(reference.source, reference.run),
        ),
    );
    const restored = decodeWorkerValues(structuredClone(encodeWorkerValues(result)));
    const expected = JSON.parse(readFileSync(path.join(directory, "expected.json"), "utf8"));
    const groups = (values: unknown[][]) =>
        values
            .map((group) => group.map(canonical).sort())
            .map(canonical)
            .sort();
    expect(
        groups(
            restored.preview.groups.map((group) => group.members.map((member) => member.reference)),
        ),
    ).toEqual(groups(expected.groups));
    expect(restored.model.counts.observations).toBe(input.sources.length);
});
