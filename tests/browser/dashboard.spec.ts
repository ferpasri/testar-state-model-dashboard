import { expect, test } from "@playwright/test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sharedCases } from "../support";

const cases = sharedCases();
const initial = cases.find((directory) => path.basename(directory) === "initial-observation")!;
const targeted = cases.find(
    (directory) => path.basename(directory) === "targeted-property-oracles",
)!;

test("imports a trace and inspects its executed actions and evaluations", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(targeted);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await expect(
        page.getByRole("region", { name: "Execution graph" }).locator("canvas").first(),
    ).toBeVisible();
    for (let index = 0; index < 10; index++) {
        await page.getByRole("button", { name: "Next observation" }).click();
    }
    await expect(page.getByRole("heading", { name: "Observation 11", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Oracle results", exact: true }).click();
    await expect(page.locator(".evaluation .badge.failed")).toHaveText("failed");
    await page.getByRole("button", { name: "Executions", exact: true }).click();
    await expect(page.locator(".evaluation .badge.completed")).toBeVisible();
    expect(errors).toEqual([]);
});

test("loads screenshots locally and renders imported strings safely", async ({ page }, info) => {
    const directory = info.outputPath("unsafe-label");
    cpSync(initial, directory, { recursive: true });
    const evidencePath = path.join(directory, "evidence.jsonl");
    const entries = readFileSync(evidencePath, "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
    const malicious = '<img src="https://example.invalid/evidence" onerror="window.injected=true">';
    entries[3].event.data.recorded_state.widgets[0].properties["ui.text"] = malicious;
    entries[3].event.data.recorded_state.properties["ui.title"] = { toString: null, valueOf: null };
    writeFileSync(evidencePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const requests: Array<{ url: string; method: string; type: string }> = [];
    page.on("request", (request) => {
        if (!request.url().startsWith("blob:")) {
            requests.push({
                url: request.url(),
                method: request.method(),
                type: request.resourceType(),
            });
        }
    });
    await page.getByLabel("Evidence directory").setInputFiles(directory);
    const image = page.getByRole("img", { name: "Screenshot for observation 1" });
    await expect(image).toBeVisible();
    await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBe(1);
    await page.getByRole("button", { name: "Widgets", exact: true }).click();
    await expect(page.locator(".widget summary")).toHaveText(malicious);
    expect(await page.locator('img[src^="https:"]').count()).toBe(0);
    expect(await page.evaluate(() => Object.hasOwn(window, "injected"))).toBe(false);
    expect(
        requests.filter(
            (request) =>
                ["fetch", "xhr", "websocket", "ping"].includes(request.type) ||
                request.method !== "GET" ||
                new URL(request.url).origin !== "http://127.0.0.1:4173",
        ),
    ).toEqual([]);
});

test("retains multiple sources and deduplicates identical reimports", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await page.getByLabel("Evidence directory").setInputFiles(targeted);
    await expect(page.getByText("2 sources", { exact: true })).toBeVisible();
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByText("2 sources", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
});

test("shows validation diagnostics and preserves the existing workspace", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    const invalid = cases.find(
        (directory) => path.basename(directory) === "invalid-oracle-widget",
    )!;
    await page.getByLabel("Evidence directory").setInputFiles(invalid);
    await expect(page.getByRole("alert")).toContainText("evidence.jsonl:4");
    await expect(page.getByRole("alert")).toContainText("target.widget");
    await expect(page.getByText("1 source", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
});

test("supports a narrow screen without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});

test("cancels a running import without adding partial evidence", async ({ page }, info) => {
    const directory = info.outputPath("large-trace");
    cpSync(initial, directory, { recursive: true });
    const log = path.join(directory, "evidence.jsonl");
    const original = readFileSync(log, "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line));
    const entries = original.slice(0, 3);
    for (let index = 1; index <= 20_000; index++) {
        const entry = structuredClone(original[3]);
        entry.id = "event:" + index;
        entry.event.data.id = "observation:" + index;
        entry.event.data.observation_index = index;
        entry.event.data.recorded_state.id = "snapshot:" + index;
        entry.event.data.artifacts = [];
        entries.push(entry);
    }
    writeFileSync(log, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(directory);
    await page.getByRole("button", { name: "Cancel import", exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open evidence folder" })).toBeVisible();
    await expect(page.locator(".source")).toHaveCount(0);
});

test("clicking a graph transition opens its exact execution and endpoint observations", async ({
    page,
}) => {
    const broader = cases.find(
        (directory) => path.basename(directory) === "broader-oracle-targets",
    )!;
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(broader);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    const graph = page.getByRole("region", { name: "Execution graph" });
    await expect(graph.locator("canvas").first()).toBeVisible();
    await graph.getByRole("button", { name: "Fit trace", exact: true }).click();
    const canvas = graph.locator(".graph");
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(
        page.getByRole("heading", { name: "Action execution", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".details .badge.completed")).toHaveText("completed");
    await expect(page.locator(".details")).toContainText(
        "example:broader-check-targets:execution:1",
    );
    await expect(page.locator(".details")).toContainText("Action has a resulting observation");
    await page.getByRole("button", { name: "Open result observation (2)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Executions", exact: true }).click();
    await page.getByRole("button", { name: "Inspect this execution", exact: true }).click();
    await expect(
        page.getByRole("heading", { name: "Action execution", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open source observation (1)", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
});

test("explains a recorded pending evaluation after its run has ended", async ({ page }) => {
    const broader = cases.find(
        (directory) => path.basename(directory) === "broader-oracle-targets",
    )!;
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(broader);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Oracle results", exact: true }).click();
    const result = page.locator(".evaluation").filter({ has: page.locator(".badge.pending") });
    await expect(result).toContainText("The test oracle had not reached a definite result");
    await expect(result).toContainText("The run has ended.");
});
