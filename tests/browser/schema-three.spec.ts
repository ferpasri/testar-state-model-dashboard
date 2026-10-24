import { expect, test } from "@playwright/test";
import path from "node:path";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { sharedCases } from "../support";

function directory(name: string): string {
    return sharedCases().find((item) => path.basename(item) === name)!;
}
test("selects individual test sequences without inventing links between them", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(directory("multiple-test-sequences"));
    await expect(page.locator(".timeline .visit")).toHaveCount(2);
    const select = page.getByLabel("Test sequence", { exact: true });
    await expect(select.locator("option")).toHaveCount(3);
    await select.selectOption({ index: 2 });
    await expect(page.locator(".timeline .visit")).toHaveCount(1);
    await page.getByRole("button", { name: "Evaluations", exact: true }).click();
    await expect(page.locator(".evaluation")).toHaveCount(1);
    await select.selectOption({ index: 0 });
    await expect(page.locator(".timeline .visit")).toHaveCount(2);
});
test("shows oracle values and optional severity independently of status", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(directory("oracle-severity"));
    await page.getByRole("button", { name: "Evaluations", exact: true }).click();
    const critical = page.locator(".evaluation").filter({ hasText: '"label": "critical"' });
    await expect(critical).toHaveCount(1);
    await expect(critical.locator(".badge.failed")).toBeVisible();
    await expect(critical).toContainText("Oracle severity");
    await expect(critical).toContainText("Expected valueDenied");
    await expect(critical).toContainText('"value": "Approved"');
    await expect(critical).toContainText('"value": 0.9');
    await expect(page.locator(".evaluation").first()).not.toContainText("Oracle severity");
});

test("keeps sequence selection available when a sequence has no observations", async ({
    page,
}, info) => {
    const folder = info.outputPath("empty-sequence");
    cpSync(directory("multiple-test-sequences"), folder, { recursive: true });
    const log = path.join(folder, "evidence.jsonl");
    let removed = false;
    const entries = readFileSync(log, "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((entry) => {
            if (!removed && entry.event.event_type === "observation_recorded") {
                removed = true;
                return false;
            }
            return true;
        });
    writeFileSync(log, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(folder);
    const select = page.getByLabel("Test sequence", { exact: true });
    await select.selectOption({ index: 1 });
    await expect(page.getByText("No observations were recorded in this selection.")).toBeVisible();
    await select.selectOption({ index: 0 });
    await expect(page.locator(".timeline .visit")).toHaveCount(1);
});
