import type { Page } from "@playwright/test";
export async function openModelSetup(page: Page): Promise<void> {
    if (!(await page.getByLabel("Matching preset", { exact: true }).isVisible())) {
        await page.locator(".model-setup > summary").click();
    }
}
export async function openRenderingOptions(page: Page): Promise<void> {
    if (!(await page.getByLabel("Model layout", { exact: true }).isVisible())) {
        await page.locator(".render-options > summary").click();
    }
}
