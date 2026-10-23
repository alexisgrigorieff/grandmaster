import { devices, expect, test, type Page } from "@playwright/test";

/**
 * A phone player loses their connection mid-game: the opponent sees them as
 * disconnected, moves made meanwhile are not lost, and the game resyncs as
 * soon as the connection returns. Moves are made by tapping (touch).
 */
const tag = Math.random().toString(36).slice(2, 7);

async function register(page: Page, name: string) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(`${name}_${tag}`);
  await page.getByLabel("Email").fill(`${name}_${tag}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("reconnect-please");
  await page.getByLabel("Confirm password").fill("reconnect-please");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
}

const sq = (p: Page, s: string) => p.locator(`[data-testid="board-2d"] [data-square="${s}"]`);
const pieceOn = (p: Page, s: string, piece: string) => p.locator(`[data-testid="board-2d"] [data-on="${s}"][data-piece="${piece}"]`);

test("a temporary disconnection does not corrupt the game", async ({ browser }) => {
  test.setTimeout(180_000);
  const desk = await browser.newContext();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  for (const c of [desk, phone]) await c.addInitScript(() => localStorage.setItem("grandmaster-settings", JSON.stringify({ state: { boardMode: "2d", animationSpeed: "off", sound: false }, version: 1 })));
  const a = await desk.newPage();
  const b = await phone.newPage();
  await register(a, "desk");
  await register(b, "phone");

  await a.goto("/lobby");
  const row = a.locator(`[data-testid="player-row"][data-username="phone_${tag}"]`);
  await expect(row).toHaveAttribute("data-status", "available");
  await row.getByTestId("challenge-button").click();
  const dlg = a.getByRole("dialog");
  await dlg.getByRole("radio", { name: "Black" }).click(); // phone plays White
  await dlg.locator('[data-tc="none"]').click();
  await dlg.getByTestId("send-challenge").click();
  await b.getByTestId("accept-challenge").tap();
  await a.waitForURL("**/game/*");
  await b.waitForURL("**/game/*");

  // Tap-to-move on the phone.
  await sq(b, "e2").tap();
  await sq(b, "e4").tap();
  await expect(pieceOn(a, "e4", "wp")).toBeVisible();
  await sq(a, "e7").click();
  await sq(a, "e5").click();
  await expect(pieceOn(b, "e5", "bp")).toBeVisible();

  // The phone's network drops: its move can't reach the server and is rolled back.
  await phone.setOffline(true);
  await sq(b, "g1").tap();
  await sq(b, "f3").tap();
  await expect(b.getByText("Move not accepted")).toBeVisible();
  await expect(pieceOn(b, "g1", "wn")).toBeVisible();
  await expect(b.getByTestId("move-list")).not.toContainText("Nf3");

  // Back online: the same move goes through.
  await phone.setOffline(false);
  await sq(b, "g1").tap();
  await sq(b, "f3").tap();
  await expect(pieceOn(a, "f3", "wn")).toBeVisible();

  // The phone leaves entirely (app closed / tab killed).
  const gameUrl = b.url();
  await b.goto("about:blank");
  await expect(a.getByTestId("player-white")).toContainText("Disconnected", { timeout: 30_000 });
  // The game carries on: desk moves while the phone is away.
  await sq(a, "b8").click();
  await sq(a, "c6").click();
  await expect(a.getByTestId("move-list")).toContainText("Nc6");

  // The phone comes back and is fully in sync.
  await b.goto(gameUrl);
  await expect(pieceOn(b, "c6", "bn")).toBeVisible();
  await expect(b.getByTestId("game-status")).toHaveText("Your move");
  await expect(a.getByTestId("player-white")).not.toContainText("Disconnected", { timeout: 30_000 });
  await sq(b, "f1").tap();
  await sq(b, "b5").tap();
  await expect(pieceOn(a, "b5", "wb")).toBeVisible();

  await desk.close();
  await phone.close();
});
