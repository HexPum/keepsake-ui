import type { PersonaSeed } from "../../setup/seed";
import { getTrpcClient } from "../../utils/trpc";
import { runCheck } from "../browser";
import type { PersonaSession } from "../browser";
import { RESEARCHER_CHARTER } from "../charters";
import type { CheckReport } from "../report";

/** The row wrapper div carries Tailwind's `group` marker class (verified
 *  in `apps/web/components/dashboard/dense/DenseBookmarkRow.tsx`) — the
 *  only stable structural hook a row has, since rows carry no ARIA
 *  role/listitem semantics of their own. Scoped by containing the title
 *  link with an exact accessible name. */
function rowByTitle(session: PersonaSession, title: string) {
  return session.page.locator("div.group").filter({
    has: session.page.getByRole("link", { name: title, exact: true }),
  });
}

async function openQuickAdd(session: PersonaSession) {
  await session.page.getByRole("button", { name: "Add bookmark" }).click();
  const dialog = session.page.getByRole("dialog");
  await dialog.waitFor();
  return dialog;
}

async function submitQuickAdd(session: PersonaSession, text: string) {
  const dialog = await openQuickAdd(session);
  const input = dialog.getByRole("textbox").first();
  await input.fill(text);
  // Control+Enter (not plain Enter, which triggers EditorCard's separate
  // "quick todo" keydown branch) is the one path that always submits a new
  // bookmark, for both a URL and free text.
  await input.press("Control+Enter");
  await dialog.waitFor({ state: "hidden", timeout: 30000 });
}

async function readItemCountText(session: PersonaSession): Promise<string> {
  const meta = session.page.locator("p", { hasText: /item/ }).first();
  await meta.waitFor();
  return meta.innerText();
}

/** Title text of every bookmark row currently rendered, in DOM order. Used
 *  to identify the row a persona *just* created by diffing before/after.
 *  "The top row" is NOT that row: a background crawl/summarise update can
 *  re-sort an earlier bookmark above the new one while the persona is
 *  working (observed 2026-09-10 — check 03 read the freshly added
 *  *article's* URL and reported it as the new *note's* title, i.e. it would
 *  have passed while asserting nothing at all about the note). */
async function visibleRowTitles(session: PersonaSession): Promise<string[]> {
  return session.page
    .locator("div.group")
    .evaluateAll((rows) =>
      rows
        .map((row) => row.querySelector("a")?.textContent?.trim() ?? "")
        .filter((title) => title.length > 0),
    );
}

/** Polls until exactly one row title appears that was not present before,
 *  and returns it. Throws when the diff stays empty or becomes ambiguous,
 *  so an unidentifiable new row surfaces as a FAIL instead of being
 *  asserted against whichever bookmark happened to be on top. */
async function waitForNewRowTitle(
  session: PersonaSession,
  before: string[],
  timeoutMs = 20000,
): Promise<string> {
  const beforeSet = new Set(before);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const added = (await visibleRowTitles(session)).filter(
      (title) => !beforeSet.has(title),
    );
    if (added.length === 1) {
      return added[0]!;
    }
    if (added.length > 1) {
      throw new Error(
        `Cannot identify the newly created row: several new titles appeared at once (${added.join(", ")}).`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `No new bookmark row appeared within ${timeoutMs}ms (visible titles: ${(
          await visibleRowTitles(session)
        ).join(", ")}).`,
      );
    }
    await session.page.waitForTimeout(250);
  }
}

export async function run(
  session: PersonaSession,
  runDir: string,
  seed: PersonaSeed,
  apiKey: string,
  karakeepPort: number,
): Promise<CheckReport[]> {
  const { page, appOrigin } = session;
  const trpc = getTrpcClient(apiKey);
  void trpc;
  void karakeepPort;
  const checks: CheckReport[] = [];
  let currentCount = seed.totalBookmarkCount;
  let newArticleTitle = "";
  let newNoteTitle = "";
  const c = RESEARCHER_CHARTER.checks;

  await page.goto(`${appOrigin}${RESEARCHER_CHARTER.startPath}`, {
    waitUntil: "domcontentloaded",
  });

  checks.push(
    await runCheck(page, runDir, c[0], async () => {
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith(`${currentCount} item`)) {
        throw new Error(
          `Expected FILES header to start with "${currentCount} item", got "${metaText}".`,
        );
      }
      for (const title of [
        "QA Article",
        "QA PDF",
        "QA Video",
        "QA Note",
        "QA Feed Entry",
      ]) {
        await page
          .getByRole("link", { name: title, exact: true })
          .first()
          .waitFor({ timeout: 10000 });
      }
      return `FILES-Header zeigt "${metaText}"; alle fünf Seed-Titel (QA Article, QA PDF, QA Video, QA Note, QA Feed Entry) sind als Zeilen sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[1], async () => {
      // Distinct from the QA Article seed URL to avoid a dedup no-op.
      const titlesBefore = await visibleRowTitles(session);
      await submitQuickAdd(session, "http://nginx:80/browser-rendered.html");
      currentCount += 1;
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith(`${currentCount} item`)) {
        throw new Error(
          `Expected FILES header to read "${currentCount} item(s)" after adding the article, got "${metaText}".`,
        );
      }
      newArticleTitle = await waitForNewRowTitle(session, titlesBefore);
      return `Neuer Artikel-Titel "${newArticleTitle}" erscheint in der Liste; FILES-Zähler ist "${metaText}".`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[2], async () => {
      const titlesBefore = await visibleRowTitles(session);
      await submitQuickAdd(
        session,
        "QA persona quick note — collected while researching, kept as its own bookmark.",
      );
      currentCount += 1;
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith(`${currentCount} item`)) {
        throw new Error(
          `Expected FILES header to read "${currentCount} item(s)" after adding the note, got "${metaText}".`,
        );
      }
      // Captured so check 08 can verify this specific new note is still
      // present on return to FILES, instead of standing in for it with the
      // unrelated seed-time "QA Note" bookmark.
      newNoteTitle = await waitForNewRowTitle(session, titlesBefore);
      const noteRow = rowByTitle(session, newNoteTitle);
      const mediaCount = await noteRow
        .locator("img, picture, video[poster]")
        .count();
      if (mediaCount > 0) {
        throw new Error(
          `New note row unexpectedly renders ${mediaCount} media element(s).`,
        );
      }
      return `Neue Textnotiz "${newNoteTitle}" erscheint ohne Thumbnail/Bildvorschau; FILES-Zähler ist "${metaText}".`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[3], async () => {
      if (!newArticleTitle) {
        throw new Error(
          "No new-article title captured from check 02 — cannot locate its row.",
        );
      }
      const row = rowByTitle(session, newArticleTitle);
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Edit tags" }).click();
      // Radix's tag-suggestions popover also carries role="dialog", so a bare
      // getByRole("dialog") becomes a strict-mode violation (two matches) the
      // moment the tag input's popover has been opened — which made the
      // post-save `waitFor({ state: "hidden" })` throw even though the tag
      // change itself had already persisted (observed 2026-09-10: checks
      // 04/05 failed while 06-08 showed the tags were in fact attached).
      const dialog = page.getByRole("dialog", { name: "Edit Bookmark" });
      await dialog.waitFor();
      // The tag field is cmdk's `Command.Input`, which carries cmdk's own
      // `cmdk-input` marker. Do NOT widen this to
      // `getByRole("combobox").or(locator("input")).first()`: `.or()` unions
      // both sets and `.first()` then returns the first input in document
      // order, which is the dialog's *Title* field — the tag name was typed
      // there instead (observed 2026-09-10, which then left the dialog open
      // and cascaded into failing checks 05-08).
      const tagInput = dialog.locator("input[cmdk-input]").first();
      await tagInput.click();
      await tagInput.fill("research");
      await page.getByRole("option", { name: "research", exact: true }).click();
      // Closes via the dialog's real accessible "Save changes" control (the
      // only Save/Done control this dialog exposes), never Cancel — the
      // tag attach/detach already persisted immediately on selection
      // (BookmarkTagsEditor mutates independently of this form's submit),
      // but a persona finishing a dialog it means to keep clicks Save, not
      // Cancel.
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await dialog.waitFor({ state: "hidden" });
      await rowByTitle(session, newArticleTitle)
        .getByRole("link", { name: "research", exact: true })
        .waitFor({ timeout: 10000 });
      return `Tag-Chip "research" ist in der Zeile von "${newArticleTitle}" sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[4], async () => {
      const row = rowByTitle(session, newArticleTitle);
      await row.getByRole("button", { name: "More actions" }).click();
      await page.getByRole("menuitem", { name: "Edit tags" }).click();
      // Radix's tag-suggestions popover also carries role="dialog", so a bare
      // getByRole("dialog") becomes a strict-mode violation (two matches) the
      // moment the tag input's popover has been opened — which made the
      // post-save `waitFor({ state: "hidden" })` throw even though the tag
      // change itself had already persisted (observed 2026-09-10: checks
      // 04/05 failed while 06-08 showed the tags were in fact attached).
      const dialog = page.getByRole("dialog", { name: "Edit Bookmark" });
      await dialog.waitFor();
      // The tag field is cmdk's `Command.Input`, which carries cmdk's own
      // `cmdk-input` marker. Do NOT widen this to
      // `getByRole("combobox").or(locator("input")).first()`: `.or()` unions
      // both sets and `.first()` then returns the first input in document
      // order, which is the dialog's *Title* field — the tag name was typed
      // there instead (observed 2026-09-10, which then left the dialog open
      // and cascaded into failing checks 05-08).
      const tagInput = dialog.locator("input[cmdk-input]").first();
      await tagInput.click();
      await tagInput.fill("persona-new");
      await page
        .getByRole("option", { name: "persona-new", exact: true })
        .click();
      // Closes via the dialog's real accessible "Save changes" control (the
      // only Save/Done control this dialog exposes), never Cancel — the
      // tag attach/detach already persisted immediately on selection
      // (BookmarkTagsEditor mutates independently of this form's submit),
      // but a persona finishing a dialog it means to keep clicks Save, not
      // Cancel.
      await dialog.getByRole("button", { name: "Save changes" }).click();
      await dialog.waitFor({ state: "hidden" });
      await rowByTitle(session, newArticleTitle)
        .getByRole("link", { name: "persona-new", exact: true })
        .waitFor({ timeout: 10000 });
      await page
        .getByRole("complementary")
        .getByRole("link", { name: "persona-new", exact: true })
        .waitFor({
          timeout: 10000,
        });
      return 'Tag-Chip "persona-new" ist in der Zeile und in der Sidebar-Sektion Tags sichtbar.';
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[5], async () => {
      await page
        .getByRole("complementary")
        .getByRole("link", { name: "research", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname.includes("/dashboard/tags/"));
      const metaText = await readItemCountText(session);
      const match = /^(\d+) item/.exec(metaText);
      if (!match)
        throw new Error(`Could not parse item count from "${metaText}".`);
      const headerCount = Number(match[1]);
      const visibleRows = await page.locator("div.group").count();
      if (headerCount !== visibleRows) {
        throw new Error(
          `Tag page "research" header count (${headerCount}) does not match visible rows (${visibleRows}).`,
        );
      }
      await page
        .getByRole("link", { name: newArticleTitle, exact: true })
        .waitFor({ timeout: 10000 });
      return `Tag-Seite research: Header "${metaText}" entspricht ${visibleRows} sichtbaren Zeilen; neu getaggter Artikel ist enthalten.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[6], async () => {
      await page.goto(`${appOrigin}${RESEARCHER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("complementary")
        .getByRole("link", { name: "persona-new", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname.includes("/dashboard/tags/"));
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith("1 item")) {
        throw new Error(
          `Expected tag page "persona-new" header to read exactly "1 item", got "${metaText}".`,
        );
      }
      await page
        .getByRole("link", { name: newArticleTitle, exact: true })
        .waitFor({ timeout: 10000 });
      return `Tag-Seite persona-new: Header "${metaText}"; genau das neu angelegte Bookmark ist vorhanden.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[7], async () => {
      if (!newNoteTitle) {
        throw new Error(
          "No new-note title captured from check 03 — cannot verify its row.",
        );
      }
      const toastLocator = page.locator("text=Something went wrong");
      if (await toastLocator.count()) {
        throw new Error(
          'An error toast ("Something went wrong") is present before returning to FILES.',
        );
      }
      await page.goto(`${appOrigin}${RESEARCHER_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      const metaText = await readItemCountText(session);
      if (!metaText.startsWith(`${currentCount} item`)) {
        throw new Error(
          `Expected FILES header to read "${currentCount} item(s)" on return, got "${metaText}".`,
        );
      }
      // Both entries created *during this run* (article check 02, note
      // check 03) — not the unrelated seed-time "QA Note" bookmark, which
      // proves nothing about whether this run's own note survived.
      await page
        .getByRole("link", { name: newArticleTitle, exact: true })
        .waitFor({ timeout: 10000 });
      await page
        .getByRole("link", { name: newNoteTitle, exact: true })
        .first()
        .waitFor({ timeout: 10000 });
      return `FILES-Header ist wieder "${metaText}"; beide neuen Einträge ("${newArticleTitle}", "${newNoteTitle}") bleiben vorhanden; kein Fehler-Toast beobachtet.`;
    }),
  );

  return checks;
}
