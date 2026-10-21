import { expect, test } from "vitest";
import path from "node:path";
import { importDirectory } from "../src/evidence/import";
import {
    evaluationCoverage,
    coverageForObservation,
    propertiesWithoutResults,
} from "../src/evidence/coverage";
import { observationGaps } from "../src/evidence/trace";
import type { EvidenceModel } from "../src/evidence/model";
import type { Check, Observation } from "../src/evidence/schema";
import { fixtureFiles, sharedCases } from "./support";

async function modelFor(name = "initial-observation"): Promise<EvidenceModel> {
    const directory = sharedCases().find((item) => path.basename(item) === name)!;
    return (await importDirectory(fixtureFiles(directory)))[0].model;
}

function report(
    model: EvidenceModel,
    observation: Observation,
    target: Check["target"],
    status: Check["status"] = "passed",
) {
    model.checks.push({
        id: "test:check:" + model.checks.length,
        data: {
            run: observation.run,
            name: "Condition",
            rule: { id: "test:rule" },
            target,
            status,
            details: {},
        },
    });
}

test("run, execution, and sequence results do not imply direct property coverage", async () => {
    const model = await modelFor("broader-check-targets");
    model.checks = model.checks.filter(({ data }) =>
        ["run", "execution", "sequence"].includes(data.target.kind),
    );
    const index = evaluationCoverage(model);
    expect(index.size).toBe(0);
    for (const observation of model.observations.values()) {
        expect(coverageForObservation(index, observation).directResults).toBe(0);
    }
});

test("whole observation and widget results leave individual properties without results", async () => {
    const model = await modelFor();
    model.checks = [];
    const observation = Array.from(model.observations.values())[0];
    const widget = observation.state.widgets[0];
    widget.properties = { "ui.enabled": true, "ui.name": "Continue" };
    report(model, observation, { kind: "observation", observation: observation.id });
    report(model, observation, { kind: "widget", observation: observation.id, widget: widget.id });
    const coverage = coverageForObservation(evaluationCoverage(model), observation);
    expect(coverage.directResults).toBe(2);
    expect(coverage.observationResults).toBe(1);
    expect(coverage.widgets.get(widget.id)?.results).toBe(1);
    expect(
        propertiesWithoutResults(widget.properties, coverage.widgets.get(widget.id)!.properties),
    ).toEqual(["ui.enabled", "ui.name"]);
    expect(coverage.stateProperties.size).toBe(0);
});

test("all recorded statuses count, while aliases and later visits remain independent", async () => {
    const model = await modelFor();
    model.checks = [];
    const observation = Array.from(model.observations.values())[0];
    const widget = observation.state.widgets[0];
    widget.properties = { "ui.alt": "Help", "producer.alt": "Help" };
    for (const status of ["passed", "failed", "pending", "unknown", "error"] as const) {
        report(
            model,
            observation,
            {
                kind: "widget_property",
                observation: observation.id,
                widget: widget.id,
                property: "ui.alt",
            },
            status,
        );
    }
    const later = structuredClone(observation);
    later.id = "later";
    later.sequence++;
    later.state.id = "later-snapshot";
    model.observations.set(later.id, later);
    const index = evaluationCoverage(model);
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
    const model = await modelFor();
    model.checks = [];
    const observation = Array.from(model.observations.values())[0];
    observation.state.properties = { "ui.title": "Page" };
    report(model, observation, {
        kind: "state_property",
        observation: observation.id,
        property: "missing",
    });
    const coverage = coverageForObservation(evaluationCoverage(model), observation);
    expect(coverage.stateProperties.get("missing")).toBe(1);
    expect(
        propertiesWithoutResults(observation.state.properties, coverage.stateProperties),
    ).toEqual(["ui.title"]);
});

test("completed adjacent executions need no order-only link and are not modified", async () => {
    const model = await modelFor("broader-check-targets");
    const visits = Array.from(model.observations.values());
    const executions = structuredClone(model.executions);
    expect(observationGaps(model, visits)).toEqual([]);
    expect(model.executions).toEqual(executions);
});

test("rejected and incomplete executions leave only observation order known", async () => {
    const model = await modelFor("broader-check-targets");
    const visits = Array.from(model.observations.values()).sort((a, b) => a.sequence - b.sequence);
    const execution = Array.from(model.executions.values())[0];
    execution.result = null;
    for (const status of ["rejected", "incomplete"] as const) {
        execution.status = status;
        const gaps = observationGaps(model, [...visits].reverse());
        expect(gaps).toHaveLength(1);
        expect(gaps[0]).toMatchObject({ source: visits[0].id, target: visits[1].id });
        expect(model.executions.size).toBe(1);
    }
});

test("order-only links never join different runs or skip hidden visits", async () => {
    const model = await modelFor("broader-check-targets");
    model.executions.clear();
    const visits = Array.from(model.observations.values()).sort((a, b) => a.sequence - b.sequence);
    const third = structuredClone(visits[1]);
    third.id = "third";
    third.sequence++;
    model.observations.set(third.id, third);
    expect(observationGaps(model, [visits[0], third])).toEqual([]);
    const other = structuredClone(third);
    other.id = "other-run";
    other.run = "separate-run";
    model.observations.set(other.id, other);
    expect(observationGaps(model, [third, other])).toEqual([]);
});
