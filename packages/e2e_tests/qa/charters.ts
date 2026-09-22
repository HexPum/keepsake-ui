/**
 * The three QA persona charters, transcribed word-for-word from
 * `.claude/pipeline/qa-persona-lane/architect-spec.md` ("Die drei
 * Persona-Charter"). Each check's `title`/`reproduction`/`expected` text is
 * the static half of the report block defined in that document's "Exaktes
 * Reportformat" section — the `observed` half is filled in at runtime by
 * the persona script that executes the check.
 *
 * Design-token expected values (design-guardian checks 06/07/08) are
 * transcribed from `design/README.md`'s token table (the `--bg`,
 * `--surface-1`, `--border`, `--accent`, `--fg`, `--fg-muted` rows) and its
 * "Content column — header row" section (the FILES label typography), not
 * read back from rendered CSS — per the architecture spec's explicit
 * instruction in section 2, item 4.
 */

export type PersonaId = "researcher" | "list-reader" | "design-guardian";

export interface PersonaCheck {
  /** Two-digit, 1-indexed order — also the report block's `NN` prefix and
   *  the screenshot filename prefix. */
  id: string;
  /** kebab-case, used in screenshot filenames: `NN-<slug>-pass|fail.png`. */
  slug: string;
  /** Short title after the `NN — ` prefix in the report block heading. */
  title: string;
  reproduction: string;
  expected: string;
}

export interface PersonaCharter {
  id: PersonaId;
  title: string;
  brief: string;
  startPath: string;
  checks: PersonaCheck[];
}

/** Common run parameters every charter shares (architecture spec, "Die
 *  drei Persona-Charter" preamble). */
export const PERSONA_VIEWPORT = { width: 1440, height: 900 } as const;

export const RESEARCHER_CHARTER: PersonaCharter = {
  id: "researcher",
  title: "Sammelwütiger Researcher",
  brief:
    "Ich sammle während einer Recherche schnell heterogene Quellen. Ich will neue Links und Notizen ohne Kontextverlust ablegen, sie sofort mit konsistenten Tags versehen und mich darauf verlassen können, dass die sichtbaren Tag-Zähler den tatsächlichen Bestand widerspiegeln.",
  startPath: "/dashboard/bookmarks",
  checks: [
    {
      id: "01",
      slug: "files-seed-total",
      title: "FILES zeigt Seed-Gesamtstand und alle fünf Inhaltstypen",
      reproduction:
        "Nach Login FILES-Liste öffnen und Header sowie Zeilen prüfen.",
      expected:
        "FILES-Header zeigt den bekannten Seed-Gesamtstand; Liste enthält Artikel, PDF, Video, Notiz und mindestens einen Feed-Eintrag anhand ihrer eindeutigen Seed-Titel.",
    },
    {
      id: "02",
      slug: "add-article",
      title: "Add bookmark legt neuen Artikel-Link an",
      reproduction:
        "Add bookmark öffnen → interne Fixture-URL einfügen → speichern.",
      expected:
        "Neuer Titel erscheint in der dichten Liste; FILES-Zähler steigt exakt um eins.",
    },
    {
      id: "03",
      slug: "add-note",
      title: "Add bookmark legt neue Textnotiz an",
      reproduction:
        "Add bookmark öffnen → Freitext ohne URL eingeben → speichern.",
      expected:
        "Notiz erscheint ohne Thumbnail/Bildvorschau; FILES-Zähler steigt erneut exakt um eins.",
    },
    {
      id: "04",
      slug: "assign-existing-tag",
      title: "Vorhandenen Tag research über Row-Overflow zuweisen",
      reproduction:
        "Row-Overflow des neuen Artikels → Edit tags → Tag research zuweisen → speichern.",
      expected: "Tag-Chip research ist in der Zeile sichtbar.",
    },
    {
      id: "05",
      slug: "assign-new-tag",
      title: "Neuen Tag persona-new über denselben Dialog vergeben",
      reproduction:
        "Denselben Bookmark im selben Edit-tags-Dialog mit neuem Tag persona-new versehen.",
      expected:
        "Neuer Tag erscheint als Chip in der Zeile und in der Sidebar-Sektion Tags.",
    },
    {
      id: "06",
      slug: "tag-page-research",
      title: "Tag-Seite research zeigt konsistenten Zähler",
      reproduction: "Sidebar → Tags → research öffnen.",
      expected:
        "Header-Zähler entspricht der Zahl der sichtbaren/gezählten Treffer und enthält den neu getaggten Artikel.",
    },
    {
      id: "07",
      slug: "tag-page-persona-new",
      title: "Tag-Seite persona-new zeigt genau 1 item",
      reproduction: "Sidebar → Tags → persona-new öffnen.",
      expected:
        "Header zeigt exakt 1 item; genau das neu angelegte Bookmark ist vorhanden.",
    },
    {
      id: "08",
      slug: "return-to-files-consistent",
      title: "Rückkehr zu FILES bleibt konsistent",
      reproduction: "Zurück zu FILES navigieren.",
      expected:
        "Beide neu erstellten Einträge bleiben vorhanden, alle zuvor beobachteten Zähler bleiben konsistent, kein Fehler-Toast bei irgendeiner Mutation.",
    },
  ],
};

export const LIST_READER_CHARTER: PersonaCharter = {
  id: "list-reader",
  title: "Listen-Leser",
  brief:
    "Ich kuratiere Quellen in klar benannte Leselisten. Ich will Listen direkt in der Navigation anlegen, Bookmarks aus beiden relevanten Arbeitskontexten hinzufügen und sofort sehen, dass Listeninhalt und FILES-Header dieselbe Wahrheit zeigen.",
  startPath: "/dashboard/bookmarks",
  checks: [
    {
      id: "01",
      slug: "create-list-sidebar",
      title: "Liste Persona Reading Queue über Sidebar anlegen",
      reproduction:
        "Sidebar → Listen-Aktion (New list) → Name Persona Reading Queue → anlegen.",
      expected: "Liste erscheint unter LISTS und ist navigierbar.",
    },
    {
      id: "02",
      slug: "add-to-list-dialog-row-overflow",
      title: "Add to list Dialog aus Row-Overflow des Seed-Artikels",
      reproduction: "Row-Overflow des Seed-Artikels → Add to list öffnen.",
      expected:
        "Dialog trägt den Titel Add to list und bietet Persona Reading Queue an.",
    },
    {
      id: "03",
      slug: "add-article-files-1-item",
      title: "Seed-Artikel zur Liste hinzufügen: 1 item",
      reproduction: "Seed-Artikel hinzufügen → zur Liste navigieren.",
      expected: "FILES-Header 1 item; genau der erwartete Artikel sichtbar.",
    },
    {
      id: "04",
      slug: "open-pdf-detail",
      title: "Seed-PDF-Eintrag öffnen (Detailansicht)",
      reproduction: "Zur Hauptliste zurückkehren, Seed-PDF-Eintrag öffnen.",
      expected: "Detailansicht des PDF-Eintrags wird angezeigt.",
    },
    {
      id: "05",
      slug: "add-to-list-detail-topbar",
      title: "Add to list über Detail-Topbar aria-label",
      reproduction:
        'In der Detail-Topbar den Button mit aria-label="Add to list" verwenden.',
      expected: "Derselbe Dialog und dieselbe Liste sind erreichbar.",
    },
    {
      id: "06",
      slug: "add-pdf-files-2-items",
      title: "PDF-Eintrag hinzufügen: 2 items",
      reproduction: "PDF-Eintrag hinzufügen → Liste erneut öffnen.",
      expected: "FILES-Header 2 items; Artikel und PDF sind beide sichtbar.",
    },
    {
      id: "07",
      slug: "already-in-list-state",
      title: "Bereits enthaltener Artikel zeigt eindeutigen Zustand",
      reproduction:
        "Bereits enthaltenen Artikel erneut über Row-Overflow → Add to list öffnen.",
      expected:
        "UI bietet keine zweite Hinzufügung zur selben Liste an bzw. zeigt den enthaltenen Zustand eindeutig.",
    },
    {
      id: "08",
      slug: "remove-article-files-1-item",
      title: "Artikel aus Liste entfernen: 1 item",
      reproduction: "Artikel über den Listen-Dialog aus der Liste entfernen.",
      expected:
        "FILES-Header fällt exakt auf 1 item; nur das PDF bleibt sichtbar.",
    },
    {
      id: "09",
      slug: "reload-persists",
      title: "Seite neu laden erhält Listenmitgliedschaft",
      reproduction: "Seite neu laden.",
      expected:
        "Listenmitgliedschaft und FILES-Header 1 item bleiben erhalten, ohne Fehler-Toast und ohne doppelte Zeilen.",
    },
  ],
};

export const DESIGN_GUARDIAN_CHARTER: PersonaCharter = {
  id: "design-guardian",
  title: "Design-Wächter",
  brief:
    "Ich schütze Keepsakes feste visuelle Mission. Die Oberfläche soll wie ein dichtes Briefing funktionieren: AI-Titel und Zusammenfassung statt Galerie, flache tokenbasierte Flächen statt Schatten und eine konsistente dichte Hierarchie in Liste und Detail.",
  startPath: "/dashboard/bookmarks",
  checks: [
    {
      id: "01",
      slug: "no-media-in-rows",
      title: "Alle fünf Seed-Typen als Textzeilen, keine Bildvorschauen",
      reproduction: "FILES-Liste und Bookmark-Zeilen/-Karten im DOM prüfen.",
      expected:
        "Keine sichtbaren img, picture, Video-Poster, CSS-Hintergrundbilder oder Screenshot-/PDF-Vorschauen in den Zeilen.",
    },
    {
      id: "02",
      slug: "five-rows-no-scroll",
      title: "Mindestens fünf Zeilen ohne vertikales Scrollen bei 1440×900",
      reproduction:
        "Listenansicht bei 1440×900 Viewport prüfen (Default-Ansicht).",
      expected:
        "Listenansicht ist standardmäßig aktiv; mindestens fünf Bookmark-Zeilen sind gleichzeitig ohne vertikales Scrollen sichtbar.",
    },
    {
      id: "03",
      slug: "title-and-summary-hierarchy",
      title: "Titel und Summary führen, Metadaten nachgeordnet",
      reproduction: "Zeilen-Inhalt und Metadaten-Reihenfolge prüfen.",
      expected:
        "Jede Zeile zeigt Titel und Summary bzw. den definierten Summary-Fallback; Metadaten bleiben visuell nachgeordnet.",
    },
    {
      id: "04",
      slug: "article-detail-no-preview",
      title: "Artikel-Detail ohne Bildvorschau",
      reproduction:
        "FILES → QA Article öffnen → initial sichtbaren Detailbereich und DOM prüfen.",
      expected:
        "Keine Thumbnail-/Hero-/Screenshot-/Open-Graph-Bildvorschau im initial sichtbaren Lesebereich; Titel und Summary führen die Hierarchie an.",
    },
    {
      id: "05",
      slug: "all-details-no-preview",
      title: "PDF/Video/Notiz/Feed-Detail ohne ungefragte Bildvorschau",
      reproduction:
        "PDF-, Video-, Notiz- und Feed-Eintrag nacheinander öffnen.",
      expected:
        "Keine Detailansicht zeigt ungefragt eine Bildvorschau; Originalinhalt/Attachments nur als explizite, funktionale Disclosure.",
    },
    {
      id: "06",
      slug: "no-box-shadow",
      title: "Keine Elevation: boxShadow: none überall",
      reproduction:
        "getComputedStyle(...).boxShadow für html, body, Dashboard-Shell, Sidebar, FILES-Header, Zeilen, Dialoge und Detail-Topbar auslesen.",
      expected:
        "Jeweils boxShadow: none (ein rein inset-basierter Auswahlindikator ist als Grenzlinie erlaubt, nicht als Elevation).",
    },
    {
      id: "07",
      slug: "default-color-tokens",
      title: "Default-Farbwerte stimmen mit design/README.md überein",
      reproduction:
        "getComputedStyle(document.documentElement) für --k-bg, --k-surface-1, --k-border, --k-fg, --k-fg-muted, --k-accent auslesen.",
      expected:
        "--k-bg=#0d0d0e, --k-surface-1=#141516, --k-border=#232427, --k-fg=#eceae7, --k-fg-muted=#a9a6a1, --k-accent=#7ee2b8 (design/README.md Tabelle, Zeilen 197-207).",
    },
    {
      id: "08",
      slug: "files-label-typography",
      title: "FILES-Label-Typografie und Dense-Tokens",
      reproduction: "getComputedStyle des FILES-Label-Elements auslesen.",
      expected:
        "Schriftgröße 15-16px, font-weight 600, letter-spacing ≈0.06em; Zeilenabstände, Radien und Border-Trennung folgen den dokumentierten Dense-Tokens statt ad-hoc Elevation.",
    },
    {
      id: "09",
      slug: "baseline-screenshots",
      title: "Baseline-Screenshots von FILES, Artikel- und PDF-Detail",
      reproduction:
        "Screenshot der vollständigen FILES-Ansicht sowie je einer von Artikel- und PDF-Detail erzeugen.",
      expected:
        "Alle drei Screenshots werden auch bei PASS als Baseline-Artefakte gespeichert.",
    },
  ],
};

export const CHARTERS: Record<PersonaId, PersonaCharter> = {
  researcher: RESEARCHER_CHARTER,
  "list-reader": LIST_READER_CHARTER,
  "design-guardian": DESIGN_GUARDIAN_CHARTER,
};

/** Expected default design-token values, transcribed verbatim from
 *  `design/README.md`'s token table (see design-guardian check 07). Kept
 *  as a separate named export (not just inline in the check text above) so
 *  `qa/personas/design-guardian.ts` reads its expectations from one place
 *  instead of parsing them back out of `expected` prose. */
export const EXPECTED_DEFAULT_TOKENS: Record<string, string> = {
  "--k-bg": "#0d0d0e",
  "--k-surface-1": "#141516",
  "--k-border": "#232427",
  "--k-fg": "#eceae7",
  "--k-fg-muted": "#a9a6a1",
  "--k-accent": "#7ee2b8",
};
