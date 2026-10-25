import { expect, test } from "vitest";
import path from "node:path";
import { importDirectory } from "../src/evidence/import";
import {
    evaluationCoverage,
    coverageForObservation,
    propertiesWithoutResults,
} from "../src/evidence/coverage";
import { observationOrderLinks } from "../src/evidence/trace";
import type { ReconstructedEvidence } from "../src/evidence/reconstructed-evidence";
import type { OracleResult, Observation } from "../src/evidence/schema";
import { fixtureFiles, sharedCases } from "./support";

async function modelFor(name = "initial-observation"): Promise<ReconstructedEvidence> {
    const directory = sharedCases().find((item) => path.basename(item) === name)!;
    return (await importDirectory(fixtureFiles(directory)))[0].evidence;
}

function report(
    evidence: ReconstructedEvidence,
    observation: Observation,
    oracle_target: OracleResult["oracle_target"],
    status: OracleResult["oracle_status"] = "passed",
) {
    evidence.oracleResults.push({
        id: "test:check:" + evidence.oracleResults.length,
        data: {
            test_run: evidence.sequences.get(observation.test_sequence)!.test_run,
            test_sequence: observation.test_sequence,
            name: "Condition",
            oracle: { id: "test:rule" },
            oracle_target,
            oracle_status: status,
            oracle_details: {},
        },
    });
}

test("run, execution, and sequence results do not imply direct property coverage", async () => {
    const evidence = await modelFor("broader-oracle-targets");
    evidence.oracleResults = evidence.oracleResults.filter(({ data }) =>
        ["run", "execution", "sequence"].includes(data.oracle_target.target_type),
    );
    const index = evaluationCoverage(evidence);
    expect(index.size).toBe(0);
    for (const observation of evidence.observations.values()) {
        expect(coverageForObservation(index, observation).directResults).toBe(0);
    }
});

test("whole observation and widget results leave individual properties without results", async () => {
    const evidence = await modelFor();
    evidence.oracleResults = [];
    const observation = Array.from(evidence.observations.values())[0];
    const widget = observation.recorded_state.widgets[0];
    widget.properties = { "ui.enabled": true, "ui.name": "Continue" };
    report(evidence, observation, { target_type: "observation", observation: observation.id });
    report(evidence, observation, {
        target_type: "widget",
        observation: observation.id,
        widget: widget.id,
    });
    const coverage = coverageForObservation(evaluationCoverage(evidence), observation);
    expect(coverage.directResults).toBe(2);
    expect(coverage.observationResults).toBe(1);
    expect(coverage.widgets.get(widget.id)?.results).toBe(1);
    expect(
        propertiesWithoutResults(widget.properties, coverage.widgets.get(widget.id)!.properties),
    ).toEqual(["ui.enabled", "ui.name"]);
    expect(coverage.stateProperties.size).toBe(0);
});

test("all recorded statuses count, while aliases and later observations remain independent", async () => {
    const evidence = await modelFor();
    evidence.oracleResults = [];
    const observation = Array.from(evidence.observations.values())[0];
    const widget = observation.recorded_state.widgets[0];
    widget.properties = { "ui.alt": "Help", "producer.alt": "Help" };
    for (const status of ["passed", "failed", "pending", "unknown", "error"] as const) {
        report(
            evidence,
            observation,
            {
                target_type: "widget_property",
                observation: observation.id,
                widget: widget.id,
                property: "ui.alt",
            },
            status,
        );
    }
    const later = structuredClone(observation);
    later.id = "later";
    later.observation_index++;
    later.recorded_state.id = "later-snapshot";
    evidence.observations.set(later.id, later);
    const index = evaluationCoverage(evidence);
    expect(index.get(observation.id)?.widgets.get(widget.id)?.properties.get("ui.alt")).toBe(5);
    expect(
        propertiesWithoutResults(
            widget.properties,
            index.get(observation.id)!.widgets.get(widget.id)!.properties,
        ),
    ).toEqual(["producer.alt"]);
    expect(coverageForObservation(index, later).directResults).toBe(0);
});

test("state-property evaluations retain absent targets without expanding captured data", async () => {
    const evidence = await modelFor();
    evidence.oracleResults = [];
    const observation = Array.from(evidence.observations.values())[0];
    observation.recorded_state.properties = { "ui.title": "Page" };
    report(evidence, observation, {
        target_type: "state_property",
        observation: observation.id,
        property: "missing",
    });
    const coverage = coverageForObservation(evaluationCoverage(evidence), observation);
    expect(coverage.stateProperties.get("missing")).toBe(1);
    expect(
        propertiesWithoutResults(observation.recorded_state.properties, coverage.stateProperties),
    ).toEqual(["ui.title"]);
});

test("completed adjacent executions need no order-only link and are not modified", async () => {
    const evidence = await modelFor("broader-oracle-targets");
    const observations = Array.from(evidence.observations.values());
    const executions = structuredClone(evidence.executions);
    expect(observationOrderLinks(evidence, observations)).toEqual([]);
    expect(evidence.executions).toEqual(executions);
});

test("rejected and incomplete executions leave only observation order known", async () => {
    const evidence = await modelFor("broader-oracle-targets");
    const observations = Array.from(evidence.observations.values()).sort((a, b) =>
        a.observation_index < b.observation_index
            ? -1
            : a.observation_index > b.observation_index
              ? 1
              : 0,
    );
    const execution = Array.from(evidence.executions.values())[0];
    execution.resultingObservation = null;
    for (const status of ["failed", "incomplete"] as const) {
        execution.status = status;
        const orderLinks = observationOrderLinks(evidence, [...observations].reverse());
        expect(orderLinks).toHaveLength(1);
        expect(orderLinks[0]).toMatchObject({
            source: observations[0].id,
            target: observations[1].id,
        });
        expect(evidence.executions.size).toBe(1);
    }
});

test("order-only links never join different runs or skip hidden observations", async () => {
    const evidence = await modelFor("broader-oracle-targets");
    evidence.executions.clear();
    const observations = Array.from(evidence.observations.values()).sort((a, b) =>
        a.observation_index < b.observation_index
            ? -1
            : a.observation_index > b.observation_index
              ? 1
              : 0,
    );
    const third = structuredClone(observations[1]);
    third.id = "third";
    third.observation_index++;
    evidence.observations.set(third.id, third);
    expect(observationOrderLinks(evidence, [observations[0], third])).toEqual([]);
    const other = structuredClone(third);
    other.id = "other-run";
    other.test_sequence = "separate-run";
    evidence.sequences.set(other.test_sequence, {
        ...evidence.sequences.values().next().value!,
        id: other.test_sequence,
    });
    evidence.observations.set(other.id, other);
    expect(observationOrderLinks(evidence, [third, other])).toEqual([]);
});
