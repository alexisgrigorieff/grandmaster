import { expect, test, type Page } from "@playwright/test";

/** Moves made on the 3D board (click-to-move and drag-and-drop) reach the opponent. */
const tag = Math.random().toString(36).slice(2, 7);

async function register(page: Page, name: string) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(`${name}_${tag}`);
  await page.getByLabel("Email").fill(`${name}_${tag}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("three-dimensional");
  await page.getByLabel("Confirm password").fill("three-dimensional");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

async function screenPoint(page: Page, sq: string) {
  await page.waitForFunction(() => Boolean((window as never as { __gm3d?: unknown }).__gm3d));
  return page.evaluate((s) => (window as never as { __gm3d: { squareToClient: (q: string) => { x: number; y: number } } }).__gm3d.squareToClient(s), sq);
}

async function click3d(page: Page, sq: string) {
  const p = await screenPoint(page, sq);
  await page.mouse.click(p.x, p.y);
}

async function drag3d(page: Page, from: string, to: string) {
  const a = await screenPoint(page, from);
  const b = await screenPoint(page, to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12);
  await page.mouse.up();
}

test("click and drag moves on the 3D board", async ({ browser }) => {
  test.setTimeout(180_000);
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  for (const c of [ctxA, ctxB]) await c.addInitScript(() => localStorage.setItem("grandmaster-settings", JSON.stringify({ state: { boardMode: "3d", quality: "low", animationSpeed: "fast", sound: false }, version: 1 })));
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await register(a, "tri");
  await register(b, "cube");

  await a.goto("/lobby");
  const row = a.locator(`[data-testid="player-row"][data-username="cube_${tag}"]`);
  await expect(row).toHaveAttribute("data-status", "available");
  await row.getByTestId("challenge-button").click();
  const dlg = a.getByRole("dialog");
  await dlg.getByRole("radio", { name: "White" }).click();
  await dlg.locator('[data-tc="none"]').click();
  await dlg.getByTestId("send-challenge").click();
  await b.getByTestId("accept-challenge").click();
  await a.waitForURL("**/game/*");
  await b.waitForURL("**/game/*");
  await expect(a.getByTestId("board-3d")).toBeVisible();
  await a.waitForTimeout(1500); // camera settles

  // Click-to-move.
  await click3d(a, "e2");
  await click3d(a, "e4");
  await expect(b.getByTestId("move-list")).toContainText("e4");

  // Drag-and-drop (Black's view is rotated 180°).
  await b.waitForTimeout(1000);
  await drag3d(b, "c7", "c5");
  await expect(a.getByTestId("move-list")).toContainText("c5");

  // Clicking an opponent's piece or an illegal square does nothing.
  await click3d(a, "c5");
  await click3d(a, "g1");
  await click3d(a, "g4");
  await expect(a.getByTestId("move-list")).not.toContainText("Ng4");
  await click3d(a, "g1");
  await click3d(a, "f3");
  await expect(b.getByTestId("move-list")).toContainText("Nf3");

  // Toolbar: flip and switch to 2D mid-game.
  await a.getByTestId("flip-board").click();
  await a.getByRole("radio", { name: "", exact: false }).nth(1).click();
  await expect(a.getByTestId("board-2d")).toBeVisible();
  await expect(a.locator('[data-on="f3"][data-piece="wn"]')).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});
