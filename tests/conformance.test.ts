import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { Replay, type ReconstructedEvidence } from "../src/evidence/reconstructed-evidence";
import { manifestSchema } from "../src/evidence/schema";
import { EvidenceError, parseJson } from "../src/evidence/common";
import { importDirectory } from "../src/evidence/import";
import { sharedCases, fixtureFiles } from "./support";

export function normalized(evidence: ReconstructedEvidence) {
    const byId = <T extends { id: string }>(values: Iterable<T>) =>
        [...values].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const observations = byId(evidence.observations.values());
    const executions = [...evidence.executions.values()];
    const transitions = executions.filter((record) => record.status === "completed");
    return {
        status: "accepted",
        counts: {
            evidence_events: evidence.eventCount,
            test_runs: evidence.runs.size,
            test_sequences: evidence.sequences.size,
            observations: observations.length,
            action_descriptions: evidence.actions.size,
            action_executions: executions.length,
            recorded_transitions: transitions.length,
            oracle_results: evidence.oracleResults.length,
            artifact_references: observations.reduce((sum, item) => sum + item.artifacts.length, 0),
            recorded_states: evidence.recordedStates.size,
        },
        test_runs: byId(evidence.runs.values()).map((item) => ({
            id: item.id,
            status: item.status,
        })),
        test_sequences: byId(evidence.sequences.values()).map((item) => ({
            id: item.id,
            test_run: item.test_run,
            sequence_index: item.sequence_index,
            status: item.status,
        })),
        observations: observations.map((item) => ({
            id: item.id,
            test_sequence: item.test_sequence,
            observation_index: item.observation_index,
            recorded_state: item.recorded_state.id,
            capture: item.recorded_state.capture,
            available_action_scope: item.available_action_scope,
            widget_ids: item.recorded_state.widgets.map((widget) => widget.id),
            available_actions: item.available_actions,
            artifact_ids: item.artifacts.map((artifact) => artifact.id),
        })),
        action_descriptions: byId(evidence.actions.values()).map((item) => ({
            id: item.id,
            action_type: item.action_type,
        })),
        action_executions: executions.map((item) => ({
            action_execution: item.execution,
            status: item.status,
            execution_result: item.executionResult,
            resulting_observation: item.resultingObservation,
        })),
        recorded_transitions: transitions.map((item) => ({
            action_execution: item.execution.id,
            test_sequence: item.execution.test_sequence,
            source_observation: item.execution.source_observation,
            resulting_observation: item.resultingObservation,
            action_description: item.execution.action_description,
            target_widget: item.execution.target_widget,
        })),
        oracle_results: evidence.oracleResults.map((item) => item.data),
        recorded_states: [...evidence.recordedStates.keys()].sort(),
    };
}

for (const directory of sharedCases()) {
    describe(path.basename(directory), () => {
        const expected = JSON.parse(readFileSync(path.join(directory, "expected.json"), "utf8"));
        test("replays the released evidence and matches its expected evidence", () => {
            const manifest = manifestSchema.parse(
                JSON.parse(readFileSync(path.join(directory, "manifest.json"), "utf8")),
            );
            const replay = new Replay(manifest);
            const entries = readFileSync(path.join(directory, "evidence.jsonl"), "utf8")
                .trimEnd()
                .split("\n");
            let failure: EvidenceError | undefined;
            for (const line of entries) {
                const before = normalized(replay.evidence);
                try {
                    const event = parseJson(line);
                    replay.apply(event);
                    replay.apply(event);
                } catch (error) {
                    failure = error as EvidenceError;
                    expect(normalized(replay.evidence)).toEqual(before);
                    break;
                }
            }
            if (expected.status === "rejected") {
                expect(failure).toMatchObject(expected.error);
                expect(normalized(replay.evidence)).toEqual(expected.accepted_prefix);
            } else {
                expect(failure).toBeUndefined();
                expect(normalized(replay.evidence)).toEqual(expected);
            }
        });
        test("validates the selected local files and artifact bytes", async () => {
            if (expected.status === "accepted") {
                const sources = await importDirectory(fixtureFiles(directory));
                expect(normalized(sources[0].evidence)).toEqual(expected);
                expect(sources[0].fingerprint).toMatch(/^[a-f0-9]{64}$/u);
            } else {
                await expect(importDirectory(fixtureFiles(directory))).rejects.toThrow(
                    expected.error.field,
                );
            }
        });
    });
}
