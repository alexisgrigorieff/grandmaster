import { expect, test } from "@playwright/test";

// 8x8 red PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC",
  "base64",
);

test("profile editing, avatar upload and settings sync", async ({ page, browser }) => {
  const t = Math.random().toString(36).slice(2, 7);
  await page.goto("/register");
  await page.getByLabel("Username").fill(`frida_${t}`);
  await page.getByLabel("Email").fill(`frida_${t}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill("bishop-pair-77");
  await page.getByLabel("Confirm password").fill("bishop-pair-77");
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/dashboard");

  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Frida the Bold");
  await page.getByLabel("Bio").fill("Bishops > knights.");
  await page.getByRole("button", { name: "rook" }).click();
  await page.getByTestId("save-profile").click();
  await expect(page.getByText("Profile saved")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Photo updated")).toBeVisible();
  await expect(page.getByTestId("user-menu").locator("img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/avatars\//);

  // Switch to the 2D board — saved to the account, so a new device picks it up.
  await page.getByRole("radio", { name: "2D" }).click();
  await page.waitForTimeout(2000);

  await page.goto(`/profile/frida_${t}`);
  await expect(page.getByTestId("profile-name")).toHaveText("Frida the Bold");
  await expect(page.getByText("Bishops > knights.")).toBeVisible();

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto("/login");
  await p2.getByLabel("Email").fill(`frida_${t}@example.test`);
  await p2.getByLabel("Password").fill("bishop-pair-77");
  await p2.getByRole("button", { name: "Sign in" }).click();
  await p2.waitForURL("**/dashboard");
  await p2.goto("/settings");
  await expect(p2.getByRole("radio", { name: "2D" })).toHaveAttribute("aria-checked", "true");
  await other.close();
});
