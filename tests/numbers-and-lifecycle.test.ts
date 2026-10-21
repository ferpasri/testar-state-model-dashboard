import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, vi } from "vitest";
import { canonical, displayValue, formatJson, parseJson } from "../src/evidence/common";
import { importDirectory } from "../src/evidence/import";
import { Replay } from "../src/evidence/model";
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

test("preserves large integer properties through parsing, replay, clone, and display", () => {
    const text = '{"large":18446744073709551615,"small":42}';
    const properties = parseJson(text);
    expect(canonical(properties)).toBe(text);
    expect(formatJson(structuredClone(properties))).toContain("18446744073709551615");
    const observed = structuredClone(initial[2]);
    observed.event.data.state.properties = properties;
    const replay = new Replay(manifest);
    replay.apply(initial[0]);
    replay.apply(initial[1]);
    replay.apply(observed);
    expect(replay.model.observations.values().next().value!.state.properties.large).toBe(
        18446744073709551615n,
    );
});

test("retains incomplete execution status and accepts a late evaluation", () => {
    const replay = new Replay(manifest);
    initial.forEach((event) => replay.apply(event));
    const observation = initial[2].event.data;
    const execution = {
        id: "execution",
        run: observation.run,
        source: observation.id,
        action: "example:activate",
        target: "login",
        parameters: {},
    };
    const emit = (id: string, kind: string, data: unknown) =>
        replay.apply({ schema_version: 2, id, event: { kind, data } });
    emit("selected", "action_selected", execution);
    emit("submitted", "action_submitted", { execution: "execution", accepted: true });
    emit("finished", "run_finished", { run: observation.run, reason: "interrupted" });
    expect(replay.model.executions.get("execution")).toMatchObject({
        status: "incomplete",
        result: null,
    });
    emit("late-check", "checked", {
        run: observation.run,
        name: "Review",
        rule: { id: "review" },
        target: { kind: "run" },
        status: "unknown",
    });
    expect(replay.model.checks).toHaveLength(1);
    expect(() =>
        emit("second-finish", "run_finished", { run: observation.run, reason: "done" }),
    ).toThrow("running run");
});

test("rejects a backward result while preserving a submitted execution", () => {
    const replay = new Replay(manifest);
    initial.forEach((event) => replay.apply(event));
    const observation = initial[2].event.data;
    replay.apply({
        schema_version: 2,
        id: "selection",
        event: {
            kind: "action_selected",
            data: {
                id: "execution",
                run: observation.run,
                source: observation.id,
                action: "example:activate",
                target: "login",
                parameters: {},
            },
        },
    });
    replay.apply({
        schema_version: 2,
        id: "submission",
        event: { kind: "action_submitted", data: { execution: "execution", accepted: true } },
    });
    expect(() =>
        replay.apply({
            schema_version: 2,
            id: "result",
            event: {
                kind: "action_result",
                data: { execution: "execution", observation: observation.id },
            },
        }),
    ).toThrow("later observation");
    expect(replay.model.executions.get("execution")?.status).toBe("submitted");
    expect(replay.model.eventCount).toBe(5);
});

test("verifies repeated screenshot references using one file read", async () => {
    const events = structuredClone(initial);
    const second = structuredClone(events[2]);
    second.id = "second-event";
    second.event.data.id = "second-observation";
    second.event.data.sequence = 2;
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
    expect(sources[0].model.observations.size).toBe(2);
    expect(sources[0].model.snapshots.size).toBe(1);
    expect(reads).toHaveBeenCalledTimes(1);
});

test("renders unusual property objects as data", () => {
    const value = parseJson('{"toString":null,"valueOf":null}');
    expect(displayValue(value)).toContain('"toString": null');
});
