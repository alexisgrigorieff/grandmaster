import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Two separate browser contexts (= two different computers) register, see each
 * other in the lobby, challenge, play a game to checkmate, chat, refresh
 * mid-game, rematch, and check their histories.
 *
 * Uses the 2D board for deterministic clicks; the 3D board shares the same
 * move pipeline (and is exercised by tests/e2e/board3d.spec.ts).
 */

const tag = Math.random().toString(36).slice(2, 7);
const ALICE = { username: `alice_${tag}`, email: `alice_${tag}@example.test`, password: "queen-gambit-42" };
const BOB = { username: `bob_${tag}`, email: `bob_${tag}@example.test`, password: "sicilian-najdorf-7" };

async function newPlayer(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      const raw = localStorage.getItem("grandmaster-settings");
      if (!raw) localStorage.setItem("grandmaster-settings", JSON.stringify({ state: { boardMode: "2d", animationSpeed: "fast", sound: false }, version: 1 }));
    } catch {}
  });
  return { ctx, page: await ctx.newPage() };
}

async function register(page: Page, u: typeof ALICE) {
  await page.goto("/register");
  await page.getByLabel("Username").fill(u.username);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByLabel("Confirm password").fill(u.password);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.getByTestId("dashboard-name")).toHaveText(u.username);
}

async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-testid="board-2d"] [data-square="${from}"]`).click();
  await page.locator(`[data-testid="board-2d"] [data-square="${to}"]`).click();
}

const pieceOn = (page: Page, sq: string, piece: string) => page.locator(`[data-testid="board-2d"] [data-on="${sq}"][data-piece="${piece}"]`);

test("two players find each other, play a full game, chat, refresh and rematch", async ({ browser }) => {
  test.setTimeout(300_000);
  const a = await newPlayer(browser);
  const b = await newPlayer(browser);

  await register(a.page, ALICE);
  await register(b.page, BOB);

  // --- Presence -----------------------------------------------------------
  await a.page.goto("/lobby");
  const bobRow = a.page.locator(`[data-testid="player-row"][data-username="${BOB.username}"]`);
  await expect(bobRow).toHaveAttribute("data-status", "available");

  // --- Challenge ----------------------------------------------------------
  await bobRow.getByTestId("challenge-button").click();
  const dialog = a.page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "White" }).click();
  await dialog.locator('[data-tc="10+0"]').click();
  await a.page.getByTestId("send-challenge").click();
  await expect(a.page.getByTestId("outgoing-challenge")).toContainText(BOB.username);

  // Bob gets it immediately wherever he is.
  const card = b.page.getByTestId("incoming-challenge");
  await expect(card).toContainText(ALICE.username);
  await expect(card).toContainText("you play black");
  await card.getByTestId("accept-challenge").click();

  await b.page.waitForURL("**/game/*");
  await a.page.waitForURL("**/game/*");
  expect(a.page.url()).toBe(b.page.url());
  const gameUrl = a.page.url();

  await expect(a.page.getByTestId("game-status")).toHaveText("Your move");
  await expect(b.page.getByTestId("game-status")).toContainText("Waiting for");
  await expect(a.page.getByTestId("clock-white")).toHaveText("10:00");

  // Each player sees their own pieces at the bottom.
  const aBox = await a.page.locator('[data-square="e1"]').boundingBox();
  const bBox = await b.page.locator('[data-square="e1"]').boundingBox();
  const a8 = await a.page.locator('[data-square="e8"]').boundingBox();
  const b8 = await b.page.locator('[data-square="e8"]').boundingBox();
  expect(aBox!.y).toBeGreaterThan(a8!.y);
  expect(bBox!.y).toBeLessThan(b8!.y);

  // --- Moves sync both ways ----------------------------------------------
  await move(a.page, "e2", "e4");
  await expect(pieceOn(b.page, "e4", "wp")).toBeVisible();
  await expect(b.page.getByTestId("game-status")).toHaveText("Your move");

  // Bob can't move White's pieces, and nothing is movable out of turn.
  await move(b.page, "d2", "d4");
  await expect(pieceOn(b.page, "d2", "wp")).toBeVisible();

  await move(b.page, "e7", "e5");
  await expect(pieceOn(a.page, "e5", "bp")).toBeVisible();
  await move(a.page, "f1", "c4");
  await expect(pieceOn(b.page, "c4", "wb")).toBeVisible();
  await move(b.page, "b8", "c6");
  await expect(pieceOn(a.page, "c6", "bn")).toBeVisible();

  // Clocks are running now (both players have moved).
  await expect(a.page.getByTestId("clock-white")).not.toHaveText("10:00", { timeout: 5000 });

  // --- Chat ---------------------------------------------------------------
  await b.page.getByTestId("chat-input").fill("good luck!");
  await b.page.getByTestId("chat-input").press("Enter");
  await expect(a.page.getByTestId("chat")).toContainText("good luck!");

  // --- Refresh mid-game ---------------------------------------------------
  await move(a.page, "d1", "h5");
  await expect(pieceOn(b.page, "h5", "wq")).toBeVisible();
  await b.page.reload();
  await expect(pieceOn(b.page, "h5", "wq")).toBeVisible();
  await expect(pieceOn(b.page, "c6", "bn")).toBeVisible();
  await expect(b.page.getByTestId("game-status")).toHaveText("Your move");
  await expect(b.page.getByTestId("move-list")).toContainText("Qh5");

  // Server rejects a forged out-of-turn move from Bob's browser.
  const forged = await b.page.evaluate(async (url) => {
    const id = url.split("/game/")[1];
    const r = await fetch(`/api/games/${id}/move`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uci: "h5f7", ply: 6 }) });
    return { status: r.status, body: await r.json() };
  }, gameUrl);
  expect(forged.status).toBe(409);
  expect(forged.body.error).toMatch(/NOT_YOUR_TURN|STALE_PLY/);

  await move(b.page, "g8", "f6");
  await expect(pieceOn(a.page, "f6", "bn")).toBeVisible();

  // --- Checkmate ------------------------------------------------------------
  await move(a.page, "h5", "f7");
  await expect(a.page.getByTestId("result-dialog")).toContainText("You won");
  await expect(b.page.getByTestId("result-dialog")).toContainText("You lost");
  await expect(b.page.getByTestId("result-dialog")).toContainText("Checkmate");
  await expect(a.page.getByTestId("game-room")).toHaveAttribute("data-status", "finished");

  // Replay navigation after the game.
  await a.page.getByTestId("review-game").click();
  await a.page.getByTestId("move-list").getByRole("button", { name: "e4", exact: true }).click();
  await expect(pieceOn(a.page, "e2", "wp")).toHaveCount(0);
  await expect(pieceOn(a.page, "f1", "wb")).toBeVisible();
  await a.page.keyboard.press("End");
  await expect(pieceOn(a.page, "f7", "wq")).toBeVisible();

  // --- Rematch --------------------------------------------------------------
  await b.page.getByTestId("review-game").click();
  await b.page.getByTestId("offer-rematch").click();
  await expect(a.page.getByTestId("accept-rematch")).toBeVisible();
  await a.page.getByTestId("accept-rematch").click();
  await a.page.waitForURL((u) => u.toString() !== gameUrl && u.toString().includes("/game/"));
  await b.page.waitForURL((u) => u.toString() !== gameUrl && u.toString().includes("/game/"));
  expect(a.page.url()).toBe(b.page.url());
  // Colours swapped: Bob is White now.
  await expect(b.page.getByTestId("game-status")).toHaveText("Your move");

  await move(b.page, "d2", "d4");
  await expect(pieceOn(a.page, "d4", "wp")).toBeVisible();
  await move(a.page, "d7", "d5");
  await expect(pieceOn(b.page, "d5", "bp")).toBeVisible();

  // Draw offer → decline, then resignation with confirmation.
  await b.page.getByTestId("offer-draw").click();
  await expect(a.page.getByTestId("draw-offer")).toBeVisible();
  await a.page.getByRole("button", { name: "Decline" }).click();
  await expect(b.page.getByTestId("offer-draw")).toHaveText("Offer draw");
  await a.page.getByTestId("resign").click();
  await a.page.getByTestId("confirm-resign").click();
  await expect(b.page.getByTestId("result-dialog")).toContainText("You won");

  // --- History on both dashboards ----------------------------------------
  for (const { page } of [a, b]) {
    await page.goto("/dashboard");
    await expect(page.getByTestId("game-history").locator("li")).toHaveCount(2);
    await expect(page.locator('[data-stat="Games"]')).toHaveText("2");
    await expect(page.locator('[data-stat="Wins"]')).toHaveText("1");
  }

  // --- Going offline -------------------------------------------------------
  await a.page.goto("/lobby");
  await expect(a.page.locator(`[data-testid="player-row"][data-username="${BOB.username}"]`)).toHaveAttribute("data-status", "available");
  await b.ctx.close();
  await a.page.getByRole("radio", { name: /Everyone/ }).click();
  await expect(a.page.locator(`[data-testid="player-row"][data-username="${BOB.username}"]`)).toHaveAttribute("data-status", "offline");

  await a.ctx.close();
});

test("quick play pairs two waiting players", async ({ browser }) => {
  const t = Math.random().toString(36).slice(2, 7);
  const c = await newPlayer(browser);
  const d = await newPlayer(browser);
  await register(c.page, { username: `carol_${t}`, email: `carol_${t}@example.test`, password: "endgame-tablebase" });
  await register(d.page, { username: `dave_${t}`, email: `dave_${t}@example.test`, password: "opposition-9" });
  for (const p of [c.page, d.page]) {
    await p.goto("/lobby");
    await p.locator('[data-testid="quick-play"] [data-tc="3+2"]').click();
  }
  await c.page.getByTestId("quick-play-button").click();
  await expect(c.page.getByTestId("quick-play-waiting")).toBeVisible();
  await d.page.getByTestId("quick-play-button").click();
  await c.page.waitForURL("**/game/*");
  await d.page.waitForURL("**/game/*");
  expect(c.page.url()).toBe(d.page.url());
  await expect(c.page.getByTestId("clock-white")).toHaveText("3:00");
  // Abort before anyone moves.
  await c.page.getByTestId("abort").click();
  await expect(d.page.getByTestId("game-room")).toHaveAttribute("data-status", "aborted");
  await c.ctx.close();
  await d.ctx.close();
});

test("password reset by email", async ({ browser, request }) => {
  test.skip(!process.env.E2E_MAIL_URL, "Needs a mail catcher (local stack sets E2E_MAIL_URL)");
  const t = Math.random().toString(36).slice(2, 7);
  const u = { username: `erin_${t}`, email: `erin_${t}@example.test`, password: "first-password-1" };
  const p = await newPlayer(browser);
  await register(p.page, u);
  await p.page.getByTestId("user-menu").click();
  await p.page.getByTestId("sign-out").click();
  await p.page.waitForURL((x) => new URL(x).pathname === "/");

  await p.page.goto("/forgot-password");
  await p.page.getByLabel("Email").fill(u.email);
  await p.page.getByRole("button", { name: "Send reset link" }).click();
  await expect(p.page.getByText("Check your inbox")).toBeVisible();

  let link: string | null = null;
  for (let i = 0; i < 20 && !link; i++) {
    const msgs = (await (await request.get(process.env.E2E_MAIL_URL!)).json()) as { to: string[]; data: string }[];
    const m = msgs.reverse().find((x) => x.to.includes(u.email));
    if (m) {
      const body = m.data.replace(/=\r\n/g, "").replace(/=3D/g, "=");
      link = /href="([^"]+verify[^"]+)"/.exec(body)?.[1]?.replace(/&amp;/g, "&") ?? null;
    }
    if (!link) await p.page.waitForTimeout(500);
  }
  expect(link).toBeTruthy();
  await p.page.goto(link!);
  await p.page.waitForURL("**/reset-password");
  await p.page.getByLabel("New password", { exact: true }).fill("second-password-2");
  await p.page.getByLabel("Confirm new password").fill("second-password-2");
  await p.page.getByRole("button", { name: "Update password" }).click();
  await p.page.waitForURL("**/dashboard");

  // Old password no longer works; new one does.
  await p.page.getByTestId("user-menu").click();
  await p.page.getByTestId("sign-out").click();
  await p.page.waitForURL((x) => new URL(x).pathname === "/");
  await p.page.goto("/login");
  await p.page.getByLabel("Email").fill(u.email);
  await p.page.getByLabel("Password").fill(u.password);
  await p.page.getByRole("button", { name: "Sign in" }).click();
  await expect(p.page.getByText("Wrong email or password")).toBeVisible();
  await p.page.getByLabel("Password").fill("second-password-2");
  await p.page.getByRole("button", { name: "Sign in" }).click();
  await p.page.waitForURL("**/dashboard");
  await p.ctx.close();
});
