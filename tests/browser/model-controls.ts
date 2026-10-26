import { expect, type Page } from "@playwright/test";
export async function openModelSetup(page: Page): Promise<void> {
    if (!(await page.getByLabel("Abstraction preset", { exact: true }).isVisible())) {
        await page.locator(".model-setup > summary").click();
    }
}
export async function openRenderingOptions(page: Page): Promise<void> {
    if (!(await page.getByLabel("Model layout", { exact: true }).isVisible())) {
        await page.locator(".render-options > summary").click();
    }
}

export async function openConstructedModel(page: Page, directories: string[]): Promise<void> {
    await page.goto("/");
    for (const [index, directory] of directories.entries()) {
        await page.getByLabel("Evidence directory").setInputFiles(directory);
        await expect(page.locator(".source")).toHaveCount(index + 1);
    }
    await page.getByRole("button", { name: "Construct model", exact: true }).click();
    await page
        .getByLabel("Abstraction preset", { exact: true })
        .selectOption({ label: "Page address" });
    await page.getByRole("button", { name: "Build model", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Abstract model", exact: true })).toBeVisible();
    await expect(
        page
            .getByRole("region", { name: "Abstract model graph", exact: true })
            .locator("canvas")
            .first(),
    ).toBeVisible();
    await page
        .getByRole("checkbox", { name: "Show observation-order links", exact: true })
        .uncheck();
}
