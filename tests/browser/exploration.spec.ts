import { expect, test } from "@playwright/test";
import path from "node:path";
import { sharedCases } from "../support";

const initial = sharedCases().find(
    (directory) => path.basename(directory) === "initial-observation",
)!;

async function construct(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.getByLabel("Evidence directory").setInputFiles(initial);
    await expect(page.getByRole("heading", { name: "Observation 1", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(
        page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
}

test("standalone visualization offers no server exploration transfer", async ({ page }) => {
    await construct(page);
    await expect(page.getByRole("button", { name: "Explore and enrich" })).toHaveCount(0);
});

test("confirmed exploration transfers original files and the constructed model rules to a new tab", async ({
    page,
}) => {
    await page.route("http://127.0.0.1:4173/", async (route) => {
        const response = await route.fetch();
        await route.fulfill({
            response,
            body: (await response.text()).replace(
                "</head>",
                '<meta name="testar-server" content="same-origin"></head>',
            ),
        });
    });
    await page.context().route("**/explorer/", (route) =>
        route.fulfill({
            contentType: "text/html",
            body: `<script>
            addEventListener('message', event => { window.received = event.data; });
            opener.postMessage({type:'testar:explorer-ready'}, location.origin);
        </script>`,
        }),
    );
    await construct(page);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Explore and enrich" }).click();
    expect(page.context().pages()).toHaveLength(1);
    page.once("dialog", (dialog) => dialog.accept());
    const opened = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Explore and enrich" }).click();
    const explorer = await opened;
    await explorer.waitForFunction(
        () => (window as unknown as { received?: unknown }).received !== undefined,
    );
    const received = await explorer.evaluate(async () => {
        const data = (
            window as unknown as {
                received: {
                    type: string;
                    abstraction: string;
                    traces: { files: { path: string; file: File }[] }[];
                };
            }
        ).received;
        return {
            type: data.type,
            rules: JSON.parse(data.abstraction),
            paths: data.traces[0].files.map((item) => item.path),
            manifest: JSON.parse(
                await data.traces[0].files
                    .find((item) => item.path === "manifest.json")!
                    .file.text(),
            ),
        };
    });
    expect(received.type).toBe("testar:explore-and-enrich");
    expect(received.rules.version).toBe(1);
    expect(received.paths).toContain("evidence.jsonl");
    expect(received.paths.some((name: string) => name.startsWith("artifacts/"))).toBe(true);
    expect(received.manifest.schema_version).toBe(3);
    await expect(
        page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
});
