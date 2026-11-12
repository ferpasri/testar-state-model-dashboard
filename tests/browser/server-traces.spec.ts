import { expect, test, type Page } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { sharedCases } from "../support";

const cases = sharedCases();
const initial = cases.find((directory) => path.basename(directory) === "initial-observation")!;
const targeted = cases.find(
    (directory) => path.basename(directory) === "targeted-property-oracles",
)!;
const traceId = "12345678-1234-4234-8234-123456789012";
function traceFiles(directory: string, prefix = ""): [string, Buffer][] {
    return readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            return traceFiles(directory, name + "/");
        }
        return name === "manifest.json" ||
            name === "evidence.jsonl" ||
            name.startsWith("artifacts/")
            ? [[name, readFileSync(path.join(directory, name))]]
            : [];
    });
}
async function host(page: Page, directory = initial) {
    const files = new Map(traceFiles(directory));
    await page.route(
        (url) => url.pathname === "/",
        async (route) => {
            const response = await route.fetch();
            const headers = { ...response.headers() };
            headers["content-security-policy"] = headers["content-security-policy"].replace(
                "connect-src 'none'",
                "connect-src 'self'",
            );
            const body = (await response.text())
                .replace("connect-src 'none'", "connect-src 'self'")
                .replace("</head>", '<meta name="testar-server" content="same-origin"></head>');
            await route.fulfill({ response, headers, body });
        },
    );
    await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/session") {
            await route.fulfill({ json: { token: "test-token" } });
        } else if (route.request().headers().authorization !== "Bearer test-token") {
            await route.fulfill({ status: 401 });
        } else if (url.pathname === "/api/traces") {
            await route.fulfill({
                json: [{ id: traceId, label: "Recorded exploration", fileCount: files.size }],
            });
        } else if (url.pathname.endsWith("/files")) {
            await route.fulfill({ json: [...files.keys()] });
        } else if (url.pathname.endsWith("/file")) {
            const file = files.get(url.searchParams.get("path") ?? "");
            await route.fulfill({ status: file ? 200 : 404, body: file });
        } else {
            await route.fulfill({ status: 404 });
        }
    });
}

test("loads registered traces and screenshots without selecting a Windows directory", async ({
    page,
}) => {
    await host(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Load server traces", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Server traces" });
    await dialog.getByRole("checkbox", { name: /Recorded exploration/ }).check();
    await dialog.getByRole("button", { name: "Load selected traces", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    const screenshot = page.getByRole("img", { name: "Screenshot for observation 1" });
    await expect(screenshot).toBeVisible();
    await expect
        .poll(() => screenshot.evaluate((image) => (image as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    // A direct explorer link can load the same evidence into a fresh dashboard tab.
    await page.goto("/?traces=" + traceId);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await expect(page.locator(".source")).toHaveCount(1);
});

test("returning exploration evidence rebuilds the existing model with the same rules", async ({
    page,
}) => {
    await host(page, targeted);
    await page.context().route("**/explorer/", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: `<script>addEventListener('message', e => { window.handoff = e.data; });opener.postMessage({type:'testar:explorer-ready'},location.origin);</script>`,
        }),
    );
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    const rules = await page.getByLabel("Abstraction rules (JSON)", { exact: true }).inputValue();
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(
        page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    const opened = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Explore and enrich", exact: true }).click();
    const explorer = await opened;
    await explorer.waitForFunction(
        () => (window as unknown as { handoff?: unknown }).handoff !== undefined,
    );
    // Messages from an unrelated window do not change the dashboard.
    await page.evaluate(
        (id) => window.postMessage({ type: "testar:load-traces", traceIds: [id] }, location.origin),
        traceId,
    );
    await expect(page.locator(".source")).toHaveCount(1);
    await explorer.evaluate(
        (id) =>
            opener.postMessage(
                { type: "testar:load-traces", traceIds: [id], requestId: "update-1" },
                location.origin,
            ),
        traceId,
    );
    await expect(page.locator(".source")).toHaveCount(2);
    await expect(
        page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
    expect(await page.getByLabel("Abstraction rules (JSON)", { exact: true }).inputValue()).toBe(
        rules,
    );
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download model", exact: true }).click();
    const file = await downloaded;
    const model = JSON.parse(readFileSync((await file.path())!, "utf8"));
    expect(model.inputScope.sources).toHaveLength(2);
});
