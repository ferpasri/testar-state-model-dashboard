import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { importDirectory } from "../src/evidence/import";
import { observationOrderLinks } from "../src/evidence/trace";
import type { EvidenceEvent } from "../src/evidence/schema";
import { EvidenceReconstructor } from "../src/evidence/reconstructed-evidence";
import { parseJson } from "../src/evidence/common";
import { oracleResultsForObservation } from "../src/Details";
import { buildAbstractModel, previewAbstraction, runKey } from "../src/analysis";
import { fixtureFiles, sharedCases } from "./support";

function directory(name: string): string {
    return sharedCases().find((item) => path.basename(item) === name)!;
}
test("separate test sequences can share an abstract state without creating a transition", async () => {
    const [source] = await importDirectory(fixtureFiles(directory("multiple-test-sequences")));
    const observations = [...source.evidence.observations.values()];
    expect(observations.map((item) => item.observation_index)).toEqual([1, 1]);
    expect(observationOrderLinks(source.evidence, observations)).toEqual([]);
    const preview = await previewAbstraction(
        [source],
        {
            version: 1,
            name: "Title",
            state: [{ name: "title", keys: ["ui.title"], required: true }],
            capture: "same",
        },
        [...source.evidence.runs.keys()].map((id) => runKey(source.id, id)),
    );
    const model = buildAbstractModel(preview, [source]);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0].members).toHaveLength(2);
    expect(model.edges).toEqual([]);
});
test("test-run results apply across its sequences while sequence results stay within their sequence", async () => {
    const [source] = await importDirectory(fixtureFiles(directory("multiple-test-sequences")));
    const [first, second] = [...source.evidence.observations.values()];
    source.evidence.oracleResults.push({
        id: "sequence-report",
        data: {
            test_run: source.evidence.sequences.get(first.test_sequence)!.test_run,
            test_sequence: first.test_sequence,
            name: "Sequence review",
            oracle: { id: "review" },
            oracle_target: { target_type: "test_sequence" },
            oracle_status: "unknown",
            oracle_details: {},
        },
    });
    expect(oracleResultsForObservation(source, first)).toHaveLength(2);
    expect(oracleResultsForObservation(source, second)).toHaveLength(1);
});
test("retains the full unsigned index range without rounding", () => {
    const fixture = directory("initial-observation");
    const events = readFileSync(path.join(fixture, "evidence.jsonl"), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => parseJson(line) as EvidenceEvent);
    for (const { event } of events) {
        if (event.event_type === "test_sequence_started") {
            event.data.sequence_index = 18446744073709551615n;
        }
        if (event.event_type === "observation_recorded") {
            event.data.observation_index = 18446744073709551615n;
            event.data.timestamp_micros = 18446744073709551615n;
        }
    }
    const reconstructor = new EvidenceReconstructor({
        schema_version: 3,
        evidence_id: "large-index",
    });
    events.forEach((event) => reconstructor.apply(event));
    expect([...reconstructor.evidence.observations.values()][0].observation_index).toBe(
        18446744073709551615n,
    );
    expect([...reconstructor.evidence.sequences.values()][0].sequence_index).toBe(
        18446744073709551615n,
    );
});
