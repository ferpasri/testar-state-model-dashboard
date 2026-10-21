import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { Replay, type EvidenceModel } from "../src/evidence/model";
import { manifestSchema } from "../src/evidence/schema";
import { EvidenceError, parseJson } from "../src/evidence/common";
import { importDirectory } from "../src/evidence/import";
import { sharedCases, fixtureFiles } from "./support";

function normalized(model: EvidenceModel) {
    const observations = Array.from(model.observations.values()).sort((left, right) =>
        left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    );
    const byId = <T extends { id: string }>(values: Iterable<T>) =>
        Array.from(values).sort((left, right) =>
            left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
        );
    return {
        status: "accepted",
        counts: {
            events: model.eventCount,
            runs: model.runs.size,
            observations: model.observations.size,
            actions: model.actions.size,
            executions: model.executions.size,
            checks: model.checks.length,
            artifact_references: observations.reduce((sum, item) => sum + item.artifacts.length, 0),
            concrete_states: model.snapshots.size,
        },
        runs: byId(model.runs.values()).map((item) => ({ id: item.id, status: item.status })),
        observations: observations.map((item) => ({
            id: item.id,
            run: item.run,
            sequence: item.sequence,
            concrete_state: item.state.id,
            capture: item.state.capture,
            candidate_scope: item.candidate_scope,
            widget_ids: item.state.widgets.map((widget) => widget.id),
            candidates: item.candidates,
            artifact_ids: item.artifacts.map((artifact) => artifact.id),
        })),
        actions: byId(model.actions.values()).map((item) => ({ id: item.id, kind: item.kind })),
        executions: Array.from(model.executions.values()),
        checks: model.checks.map((item) => item.data),
        concrete_states: Array.from(model.snapshots.keys()).sort(),
    };
}

for (const directory of sharedCases()) {
    describe(path.basename(directory), () => {
        const expected = JSON.parse(readFileSync(path.join(directory, "expected.json"), "utf8"));
        test("replays the released evidence and matches its expected model", () => {
            const manifest = manifestSchema.parse(
                JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")),
            );
            const replay = new Replay(manifest);
            const entries = readFileSync(path.join(directory, "evidence.jsonl"), "utf8")
                .trimEnd()
                .split("\n");
            let failure: EvidenceError | undefined;
            for (const line of entries) {
                const before = normalized(replay.model);
                try {
                    const event = parseJson(line);
                    replay.apply(event);
                    replay.apply(event);
                } catch (error) {
                    failure = error as EvidenceError;
                    expect(normalized(replay.model)).toEqual(before);
                    break;
                }
            }
            if (expected.status === "rejected") {
                expect(failure).toMatchObject(expected.error);
                expect(normalized(replay.model)).toEqual(expected.accepted_prefix);
            } else {
                expect(failure).toBeUndefined();
                expect(normalized(replay.model)).toEqual(expected);
            }
        });
        test("validates the selected local files and artifact bytes", async () => {
            if (expected.status === "accepted") {
                const sources = await importDirectory(fixtureFiles(directory));
                expect(normalized(sources[0].model)).toEqual(expected);
                expect(sources[0].fingerprint).toMatch(/^[a-f0-9]{64}$/u);
            } else {
                await expect(importDirectory(fixtureFiles(directory))).rejects.toThrow(
                    expected.error.field,
                );
            }
        });
    });
}
