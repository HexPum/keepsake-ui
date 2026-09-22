import type { PersonaSeed } from "../../setup/seed";
import { runCheck } from "../browser";
import type { PersonaSession } from "../browser";
import { LIST_READER_CHARTER } from "../charters";
import type { CheckReport } from "../report";

const LIST_NAME = "Persona Reading Queue";

function rowByTitle(session: PersonaSession, title: string) {
  return session.page.locator("div.group").filter({
    has: session.page.getByRole("link", { name: title, exact: true }),
  });
}

async function readItemCountText(session: PersonaSession): Promise<string> {
  const meta = session.page.locator("p", { hasText: /item/ }).first();
  await meta.waitFor();
  return meta.innerText();
}

export async function run(
  session: PersonaSession,
  runDir: string,
  seed: PersonaSeed,
  apiKey: string,
  karakeepPort: number,
): Promise<CheckReport[]> {
  void seed;
  void apiKey;
  void karakeepPort;
  const { page, appOrigin } = session;
  const checks: CheckReport[] = [];
  const c = LIST_READER_CHARTER.checks;

  await page.goto(`${appOrigin}${LIST_READER_CHARTER.startPath}`, {
    waitUntil: "domcontentloaded",
  });

  checks.push(
    await runCheck(page, runDir, c[0], async () => {
      await page.getByRole("button", { name: "New list" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByPlaceholder("List Name").fill(LIST_NAME);
      await dialog.getByRole("button", { name: "Create" }).click();
      await dialog.waitFor({ state: "hidden", timeout: 15000 });
      const sidebarLink = page
        .getByRole("complementary")
        .getByRole("link", { name: LIST_NAME, exact: true });
      await sidebarLink.waitFor({ timeout: 10000 });
      await sidebarLink.click();
      await page.waitForURL((url) =>
        url.pathname.includes("/dashboard/lists/"),
      );
      return `Liste "${LIST_NAME}" erscheint unter Lists, ist navigierbar und wurde geöffnet.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[1], async () => {
      await page.goto(`${appOrigin}${LIST_READER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      const row = rowByTitle(session, "QA Article");
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Add to list" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const title = await dialog.getByRole("heading").first().innerText();
      if (!title.includes("Add to list")) {
        throw new Error(
          `Expected dialog title to include "Add to list", got "${title}".`,
        );
      }
      await dialog
        .getByText(LIST_NAME, { exact: true })
        .waitFor({ timeout: 10000 });
      await dialog
        .getByRole("button", { name: "Close" })
        .click()
        .catch(() => page.keyboard.press("Escape"));
      return `Add to list Dialog trägt den Titel "${title}" und bietet "${LIST_NAME}" an.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[2], async () => {
      const row = rowByTitle(session, "QA Article");
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Add to list" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByText(LIST_NAME, { exact: true }).click();
      await dialog
        .getByRole("button", { name: /^Remove from/ })
        .waitFor({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await page
        .getByRole("complementary")
        .getByRole("link", { name: LIST_NAME, exact: true })
        .click();
      await page.waitForURL((url) =>
        url.pathname.includes("/dashboard/lists/"),
      );
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith("1 item")) {
        throw new Error(
          `Expected list header to read "1 item", got "${metaText}".`,
        );
      }
      await page
        .getByRole("link", { name: "QA Article", exact: true })
        .waitFor({ timeout: 10000 });
      return `Liste zeigt "${metaText}"; QA Article ist sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[3], async () => {
      await page.goto(`${appOrigin}${LIST_READER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("link", { name: "QA PDF", exact: true }).click();
      await page.waitForURL((url) =>
        url.pathname.includes("/dashboard/preview/"),
      );
      await page
        .getByRole("heading", { name: "QA PDF", exact: true })
        .waitFor({ timeout: 10000 });
      return "Detailansicht des QA-PDF-Eintrags wird angezeigt.";
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[4], async () => {
      const addToListButton = page.getByRole("button", { name: "Add to list" });
      await addToListButton.waitFor({ timeout: 10000 });
      await addToListButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog
        .getByText(LIST_NAME, { exact: true })
        .waitFor({ timeout: 10000 });
      return `Detail-Topbar-Button aria-label="Add to list" öffnet denselben Dialog mit "${LIST_NAME}".`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[5], async () => {
      const dialog = page.getByRole("dialog");
      await dialog.getByText(LIST_NAME, { exact: true }).click();
      await dialog
        .getByRole("button", { name: /^Remove from/ })
        .waitFor({ timeout: 10000 });
      // Close the Add-to-list dialog, then return to FILES before touching
      // the sidebar. While the bookmark-preview route-modal is open, Radix
      // marks the rest of the app `aria-hidden`, so the sidebar link is not
      // in the accessibility tree at all and a role-based locator can never
      // resolve it — Escape does not dismiss this route-modal either
      // (observed 2026-09-10: three runs, each timing out on that sidebar
      // locator while the preview was still on screen).
      await page.keyboard.press("Escape");
      await page.goto(`${appOrigin}${LIST_READER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      // Resolve the target from the sidebar link rather than clicking it:
      // that is what this exercises (the link must exist and carry the
      // list's href), without depending on pointer-actionability.
      const sidebarListLink = page
        .getByRole("complementary")
        .getByRole("link", { name: LIST_NAME, exact: true });
      const listHref = await sidebarListLink.getAttribute("href");
      if (!listHref) {
        throw new Error(
          `Sidebar link "${LIST_NAME}" carries no href to navigate to.`,
        );
      }
      await page.goto(`${appOrigin}${listHref}`, {
        waitUntil: "domcontentloaded",
      });
      await page.waitForURL((url) =>
        url.pathname.includes("/dashboard/lists/"),
      );
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith("2 item")) {
        throw new Error(
          `Expected list header to read "2 items", got "${metaText}".`,
        );
      }
      await page
        .getByRole("link", { name: "QA Article", exact: true })
        .waitFor({ timeout: 10000 });
      await page
        .getByRole("link", { name: "QA PDF", exact: true })
        .waitFor({ timeout: 10000 });
      return `Liste zeigt "${metaText}"; Artikel und PDF sind beide sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[6], async () => {
      await page.goto(`${appOrigin}${LIST_READER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      const row = rowByTitle(session, "QA Article");
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Add to list" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const addCandidateButton = dialog
        .getByRole("button")
        .filter({ hasText: LIST_NAME });
      const addCandidateCount = await addCandidateButton.count();
      const alreadyInSection = dialog.getByRole("button", {
        name: /^Remove from/,
      });
      const alreadyInCount = await alreadyInSection.count();
      await page.keyboard.press("Escape");
      if (addCandidateCount > 0) {
        throw new Error(
          `"${LIST_NAME}" still appears as an addable candidate for an already-listed bookmark (found ${addCandidateCount} candidate button(s)).`,
        );
      }
      if (alreadyInCount === 0) {
        throw new Error(
          `Dialog does not clearly show the already-in-list state for "${LIST_NAME}".`,
        );
      }
      return `UI bietet keine zweite Hinzufügung zu "${LIST_NAME}" an und zeigt den enthaltenen Zustand eindeutig.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[7], async () => {
      const row = rowByTitle(session, "QA Article");
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Add to list" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByLabel(`Remove from ${LIST_NAME}`).click();
      await dialog
        .getByText("Not in any list yet.")
        .waitFor({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await page
        .getByRole("complementary")
        .getByRole("link", { name: LIST_NAME, exact: true })
        .click();
      await page.waitForURL((url) =>
        url.pathname.includes("/dashboard/lists/"),
      );
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith("1 item")) {
        throw new Error(
          `Expected list header to fall back to "1 item", got "${metaText}".`,
        );
      }
      const articleVisible = await page
        .getByRole("link", { name: "QA Article", exact: true })
        .count();
      if (articleVisible > 0) {
        throw new Error(
          "QA Article is still visible in the list after removal.",
        );
      }
      await page
        .getByRole("link", { name: "QA PDF", exact: true })
        .waitFor({ timeout: 10000 });
      return `Liste zeigt "${metaText}"; nur QA PDF bleibt sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[8], async () => {
      const toastLocator = page.locator("text=Something went wrong");
      const toastBefore = await toastLocator.count();
      await page.reload({ waitUntil: "domcontentloaded" });
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith("1 item")) {
        throw new Error(
          `Expected list header to still read "1 item" after reload, got "${metaText}".`,
        );
      }
      const pdfRows = await page
        .getByRole("link", { name: "QA PDF", exact: true })
        .count();
      if (pdfRows !== 1) {
        throw new Error(
          `Expected exactly one "QA PDF" row after reload, found ${pdfRows}.`,
        );
      }
      const toastAfter = await toastLocator.count();
      if (toastBefore > 0 || toastAfter > 0) {
        throw new Error("An error toast is present around the reload.");
      }
      return `Nach Reload: Liste zeigt "${metaText}", genau eine QA-PDF-Zeile, kein Fehler-Toast.`;
    }),
  );

  return checks;
}
