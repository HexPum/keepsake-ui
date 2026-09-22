import type { PersonaSeed } from "../../setup/seed";
import {
  countVisibleMedia,
  getBoxShadow,
  getComputedFont,
  getRootCssVar,
  runCheck,
  saveBaselineScreenshot,
} from "../browser";
import type { PersonaSession } from "../browser";
import {
  DESIGN_GUARDIAN_CHARTER,
  EXPECTED_DEFAULT_TOKENS,
  PERSONA_VIEWPORT,
} from "../charters";
import type { CheckReport } from "../report";

const ALL_SEED_TITLES = [
  "QA Article",
  "QA PDF",
  "QA Video",
  "QA Note",
  "QA Feed Entry",
];

/** boxShadow targets sampled on the FILES list view, named per architecture
 *  spec section "Die drei Persona-Charter" design-guardian check 06.
 *  Selectors are grounded in verified source: `<main>`
 *  (app/dashboard/layout.tsx) is the dashboard shell, `<aside>`
 *  (DenseSidebar.tsx) is the sidebar, the row wrapper carries Tailwind's
 *  `group` marker class (DenseBookmarkRow.tsx). All six exist on this view
 *  — a missing one is a FAIL, not "not applicable". */
const LIST_VIEW_BOX_SHADOW_TARGETS: { name: string; selector: string }[] = [
  { name: "html", selector: "html" },
  { name: "body", selector: "body" },
  { name: "Dashboard-Shell (main)", selector: "main" },
  { name: "Sidebar (aside)", selector: "aside" },
  { name: "FILES-Header (h1)", selector: "h1" },
  { name: "Zeile (row)", selector: "div.group" },
];

/** boxShadow targets that only exist on a detail page with a dialog open —
 *  sampled there instead of the list view. The detail topbar is the only
 *  `sticky border-b` element on a detail page (DenseBookmarkDetail.tsx). */
const DETAIL_VIEW_BOX_SHADOW_TARGETS: { name: string; selector: string }[] = [
  { name: "Dialog", selector: '[role="dialog"]' },
  { name: "Detail-Topbar", selector: "div.sticky.border-b" },
];

/** An inset shadow is the one elevation-free selection indicator the
 *  design doc explicitly allows (a "Grenzlinie", not elevation) — e.g.
 *  DenseBookmarkRow's selected-row `shadow-[inset_2px_0_0_0_var(--k-accent)]`.
 *  `null` means the target selector matched nothing on the view it was
 *  sampled from — every target here is expected to exist on that view, so
 *  a missing element is a violation, never silently skipped. */
function isAcceptableBoxShadow(value: string | null): boolean {
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "none" || normalized.includes("inset");
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
  const c = DESIGN_GUARDIAN_CHARTER.checks;

  await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
    waitUntil: "domcontentloaded",
  });
  const viewportSize = page.viewportSize();
  if (
    !viewportSize ||
    viewportSize.width !== PERSONA_VIEWPORT.width ||
    viewportSize.height !== PERSONA_VIEWPORT.height
  ) {
    throw new Error(
      `Design-guardian requires the fixed 1440×900 viewport; got ${JSON.stringify(viewportSize)}.`,
    );
  }

  checks.push(
    await runCheck(page, runDir, c[0], async () => {
      for (const title of ALL_SEED_TITLES) {
        await page
          .getByRole("link", { name: title, exact: true })
          .first()
          .waitFor({ timeout: 10000 });
      }
      const mediaCount = await countVisibleMedia(page, "main");
      if (mediaCount !== 0) {
        throw new Error(
          `Expected 0 visible media elements in the FILES rows, found ${mediaCount}.`,
        );
      }
      return "Alle fünf Seed-Typen sind als Textzeilen dargestellt; 0 sichtbare img/picture/Video-Poster/Hintergrundbilder.";
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[1], async () => {
      // The charter asks for "at least five rows simultaneously visible
      // without scrolling" — not "the whole list container never
      // scrolls" (a longer seed list legitimately scrolls past row five;
      // that's not a design violation). Count only rows whose full
      // bounding box already sits inside the viewport.
      const visibleRowCount = await page.evaluate((viewportHeight) => {
        const rows = Array.from(document.querySelectorAll("div.group"));
        return rows.filter((row) => {
          const rect = row.getBoundingClientRect();
          return (
            rect.height > 0 && rect.top >= 0 && rect.bottom <= viewportHeight
          );
        }).length;
      }, PERSONA_VIEWPORT.height);
      if (visibleRowCount < 5) {
        throw new Error(
          `Expected at least 5 bookmark rows fully visible within the ${PERSONA_VIEWPORT.height}px viewport without scrolling, found ${visibleRowCount}.`,
        );
      }
      return `Listenansicht ist aktiv; ${visibleRowCount} Zeilen sind gleichzeitig ohne vertikales Scrollen bei 1440×900 sichtbar.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[2], async () => {
      // Every seed row, not just the first — a summary/fallback regression
      // limited to one content type must not slip past as a PASS.
      const results: string[] = [];
      for (const title of ALL_SEED_TITLES) {
        const row = page
          .locator("div.group")
          .filter({ has: page.getByRole("link", { name: title, exact: true }) })
          .first();
        const rowText = await row.innerText();
        const remainder = rowText.replace(title, "").trim();
        if (remainder.length === 0) {
          throw new Error(
            `Row "${title}" has no content beyond its title — no summary or fallback text found.`,
          );
        }
        results.push(`${title}: "${remainder.slice(0, 40)}…"`);
      }
      return `Alle fünf Seed-Zeilen zeigen Titel und zusätzlichen Summary-/Fallback-Text: ${results.join(", ")}.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[3], async () => {
      await page
        .getByRole("link", { name: "QA Article", exact: true })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "QA Article", exact: true })
        .waitFor({ timeout: 10000 });
      const mediaCount = await countVisibleMedia(page, "body");
      if (mediaCount !== 0) {
        throw new Error(
          `Expected 0 visible media elements in the article detail, found ${mediaCount}.`,
        );
      }
      return "Artikel-Detail: Titel führt die Hierarchie an; 0 sichtbare Preview-Medien im initialen Lesebereich.";
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[4], async () => {
      const results: string[] = [];
      for (const title of ["QA PDF", "QA Video", "QA Note", "QA Feed Entry"]) {
        await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
          waitUntil: "domcontentloaded",
        });
        await page
          .getByRole("link", { name: title, exact: true })
          .first()
          .click();
        await page
          .getByRole("heading", { name: title, exact: true })
          .waitFor({ timeout: 10000 });
        const mediaCount = await countVisibleMedia(page, "body");
        if (mediaCount !== 0) {
          throw new Error(
            `Expected 0 visible media in "${title}" detail, found ${mediaCount}.`,
          );
        }
        results.push(`${title}: 0`);
      }
      return `Keine Detailansicht zeigt ungefragt eine Bildvorschau (${results.join(", ")}).`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[5], async () => {
      // List-view targets (FILES header, row) are sampled on the list view
      // itself — they don't exist on a detail page, so sampling them there
      // would silently skip them instead of actually checking them.
      await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 10000 });

      const results: { name: string; value: string | null }[] = [];
      const violations: string[] = [];
      for (const target of LIST_VIEW_BOX_SHADOW_TARGETS) {
        const value = await getBoxShadow(page, target.selector);
        results.push({ name: target.name, value });
        if (!isAcceptableBoxShadow(value)) {
          violations.push(
            `${target.name} (${target.selector}) = "${value ?? "missing"}"`,
          );
        }
      }

      // Dialog + Detail-Topbar only exist on a detail page with a dialog
      // open — sampled there instead.
      await page
        .getByRole("link", { name: "QA Article", exact: true })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "QA Article", exact: true })
        .waitFor({ timeout: 10000 });
      await page.getByRole("button", { name: "Add to list" }).click();
      await page.getByRole("dialog").waitFor({ timeout: 10000 });

      for (const target of DETAIL_VIEW_BOX_SHADOW_TARGETS) {
        const value = await getBoxShadow(page, target.selector);
        results.push({ name: target.name, value });
        if (!isAcceptableBoxShadow(value)) {
          violations.push(
            `${target.name} (${target.selector}) = "${value ?? "missing"}"`,
          );
        }
      }

      if (violations.length > 0) {
        throw new Error(
          `Non-none, non-inset (or missing) box-shadow found: ${violations.join("; ")}.`,
        );
      }
      return `boxShadow ist none (oder ein erlaubter inset-Auswahlindikator) für: ${results
        .map((r) => `${r.name}=${r.value ?? "missing"}`)
        .join(", ")}.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[6], async () => {
      await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      const mismatches: string[] = [];
      const actuals: Record<string, string> = {};
      for (const [name, expected] of Object.entries(EXPECTED_DEFAULT_TOKENS)) {
        const actual = await getRootCssVar(page, name);
        actuals[name] = actual;
        if (actual.toLowerCase() !== expected.toLowerCase()) {
          mismatches.push(
            `${name}: expected "${expected}" (design/README.md), got "${actual}"`,
          );
        }
      }
      if (mismatches.length > 0) {
        throw new Error(
          `Default token drift from design/README.md: ${mismatches.join("; ")}.`,
        );
      }
      return `Alle geprüften Default-Farbwerte stimmen mit design/README.md überein: ${JSON.stringify(actuals)}.`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[7], async () => {
      const font = await getComputedFont(page, "h1");
      if (!font) throw new Error("Could not find the FILES h1 label element.");
      const fontSizePx = parseFloat(font.fontSize);
      if (!(fontSizePx >= 15 && fontSizePx <= 16)) {
        throw new Error(
          `FILES label font-size ${font.fontSize} is not in the expected 15–16px range.`,
        );
      }
      const weight = Number(font.fontWeight);
      if (weight !== 600) {
        throw new Error(
          `FILES label font-weight ${font.fontWeight} is not 600.`,
        );
      }
      const letterSpacingPx = parseFloat(font.letterSpacing);
      const letterSpacingEm = isNaN(letterSpacingPx)
        ? 0
        : letterSpacingPx / fontSizePx;
      if (Math.abs(letterSpacingEm - 0.06) > 0.02) {
        throw new Error(
          `FILES label letter-spacing ${font.letterSpacing} (${letterSpacingEm.toFixed(3)}em) is not ≈0.06em.`,
        );
      }
      return `FILES-Label: font-size ${font.fontSize}, font-weight ${font.fontWeight}, letter-spacing ${font.letterSpacing} (≈${letterSpacingEm.toFixed(3)}em).`;
    }),
  );

  checks.push(
    await runCheck(page, runDir, c[8], async () => {
      await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 10000 });
      const filesShot = await saveBaselineScreenshot(
        page,
        runDir,
        c[8].id,
        "files-view",
      );

      await page
        .getByRole("link", { name: "QA Article", exact: true })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "QA Article", exact: true })
        .waitFor({ timeout: 10000 });
      const articleShot = await saveBaselineScreenshot(
        page,
        runDir,
        c[8].id,
        "article-detail",
      );

      await page.goto(`${appOrigin}${DESIGN_GUARDIAN_CHARTER.startPath}`, {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("link", { name: "QA PDF", exact: true })
        .first()
        .click();
      await page
        .getByRole("heading", { name: "QA PDF", exact: true })
        .waitFor({ timeout: 10000 });
      const pdfShot = await saveBaselineScreenshot(
        page,
        runDir,
        c[8].id,
        "pdf-detail",
      );

      return {
        observed: `Drei Baseline-Screenshots gespeichert: ${filesShot}, ${articleShot}, ${pdfShot}.`,
        baselineEvidence: [filesShot, articleShot, pdfShot],
      };
    }),
  );

  return checks;
}
