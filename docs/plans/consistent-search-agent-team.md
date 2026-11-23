# Bauplan: Konsistente Suche mit Sammlungskontext und Filterchips

Stand: 2026-11-17 · Status: **Planung, keine Implementierungs- oder Dispatchfreigabe**

Projekt: Keepsake-ui (`/Users/rrosenzopf/keepsake-ui`). Alle nachfolgenden
Dateipfade sind relativ zum Projekt-Root, sofern nicht anders angegeben.

## 0. Auftrag und Ausgangslage

Eine nachvollziehbare Suche bauen, die aus einer Sammlung heraus starten und
ohne Verlust von Suchtext, Modus oder zusätzlichen Filtern global werden kann.
GUI und getippte Kurzbefehle bedienen denselben strukturierten Suchzustand.

Dieser Plan hält die Produktentscheidungen aus der wiederhergestellten
Pi-Sitzung vom 17. November und ihrer Fortsetzung fest. Er ersetzt insbesondere
die frühere, falsche Annahme „global schließt das Archiv ein“.

### Tatsächlich geprüft, nicht nur angenommen

- Referenz-HEAD beim Schreiben: `0029c080`.
- Der Arbeitsbaum `/Users/rrosenzopf/keepsake-ui` ist **nicht sauber**. Es gibt
  laufende Suchänderungen sowie weitere untracked Dateien. Nichts davon wurde
  für diesen Plan verändert, gestasht, übernommen oder als fertig abgenommen.
- Der Plan liegt deshalb im separaten Worktree
  `/Users/rrosenzopf/keepsake-search-plan`, Branch
  `docs/search-agent-team-plan`. Dort sind nur Dokumentationsänderungen erlaubt.
- Der Codegraph `graphify-out/graph.json` vom 2. September wurde zur Orientierung
  abgefragt. Die unten genannten Anknüpfungspunkte wurden anschließend im
  aktuellen Hauptarbeitsbaum gelesen; der Graph ist kein Nachweis des aktuellen
  Implementierungsstands.
- Es wurden **keine Produkt-, Build-, Browser- oder Laufzeittests ausgeführt**.
  Die folgenden Befehle sind zukünftige Prüfschritte, keine PASS-Meldungen.

### Vorhandene Sucharbeit: zuerst sichern, nicht parallel überschreiben

Der offene Stand umfasst mindestens:

- `apps/web/app/dashboard/search/page.tsx`
- `apps/web/components/dashboard/dense/mobile/MobileSearchHome.tsx`
- `apps/web/components/dashboard/search/{SearchInput,SearchModeSelector}.tsx`
- `apps/web/components/dashboard/search/SearchGuidance.tsx` (untracked)
- `apps/web/lib/bookmarkSearchMode.ts` und dessen Tests
- `apps/web/lib/hooks/bookmark-search.ts` und dessen Tests (Testdatei untracked)
- `packages/trpc/routers/bookmarks.ts` und `bookmarks.search.test.ts`
- `packages/shared/semanticSearchQuery.ts` und dessen Tests (untracked)
- DE/EN-Übersetzungen, `README.md`, `MISTAKES.md`, `package.json`, `pnpm-lock.yaml`.

Dies ist eine Momentaufnahme, keine Staging-Liste. Paketmanager-/Lockfile-
Änderungen gesondert prüfen. Sonstige lokale Verzeichnisse und Artefakte sind
nicht automatisch Teil des Suchpakets.

## 1. Verbindliche Produktentscheidungen

### 1.1 Suchbereich und Archiv

1. **Global** heißt: eigene gespeicherte Inhalte ohne Sammlungseinschränkung,
   standardmäßig **ohne archivierte Inhalte**.
2. „Nicht archiviert“ ist der Standard und bekommt **keinen eigenen Chip**.
   Files ist keine separate Inbox-Sammlung.
3. Ein Sammlungschip begrenzt die Suche auf die aktuelle Liste, Favoriten,
   das Archiv, einen Tag oder einen Feed. Bei Files gibt es keinen Bereichschip.
4. Sammlungschip entfernen: derselbe Suchtext, derselbe Modus und dieselben
   zusätzlichen Filter, jetzt global. Kein stiller Wechsel bei null Treffern.
5. `+archiviert` schaltet archivierte Inhalte **zusätzlich** hinzu. Es bedeutet
   nicht „nur Archiv“ und entfernt keine Listen-/Tag-/Favoriteneinschränkung.
6. Einstieg über Archiv: **nur archivierte Inhalte**. Entfernen des Archiv-
   Sammlungschips: global, wieder ohne Archiv, sofern kein eigenständiger
   Einschlussfilter aktiv ist.
7. Innerhalb des Archivbereichs ist `+archiviert` redundant: Hinweis geben,
   keinen zweiten Archivchip erzeugen und den Bereich nicht erweitern.
8. Die globale Suche erweitert sich beim Entfernen einer geteilten Liste nicht
   auf sämtliche fremden, irgendwie zugänglichen Inhalte. Global bleibt der
   eigene Bestand; die geteilte Liste hat ihren expliziten Berechtigungskontext.

Beispiel (runde Klammern aus der Unterhaltung stehen für Chips, nicht für neue
Pflichtsyntax):

```text
[+archiviert ×] [#technik ×] iPhone 14 Pro
```

Bedeutung: nach `iPhone 14 Pro` suchen, Tag `technik` muss vorhanden sein,
archivierte und nicht archivierte Treffer dürfen vorkommen.

### 1.2 Tags und Eingabe

- `#technik` ist ein Tagfilter. Mehrteilige Eingaben verwenden Bindestriche:
  `#machine-learning`, **keine neuen Anführungszeichen als Bedienkonzept**.
- Mehrere Tagchips sind **UND**: `#technik #apple` verlangt beide Tags.
- Ein vollständig ausgeschriebener, gültiger Ausdruck wird durch das
  **darauffolgende Leerzeichen** zum Chip. Vorher bleibt er bearbeitbarer Text.
- Normale Suchwörter wie `iPhone 14 Pro` bleiben Text.
- Unbekannte Tags/Befehle bleiben Text mit Vorschlägen bzw. Hinweis. Sie dürfen
  weder als aktiver Filter aussehen noch unbemerkt vom Backend als Filter gelten.
- Kein Tag wird durch eine Suche angelegt, umbenannt oder zusammengeführt.
- Direkt hinter einem Chip bei leerem nachfolgenden Text: erstes DEL markiert
  den vorherigen Chip, zweites DEL entfernt ihn. Der Bereichschip ist ebenfalls
  entfernbar; seine Bereichsänderung folgt denselben Navigationsregeln wie ×.
- Steht Text rechts vom Chip, wird zuerst Text normal gelöscht. Niemals einen
  Chip löschen, solange der Cursor mitten in Text oder eine Textauswahl aktiv ist.
- × ist die gleichwertige sichtbare Maus-/Touch-Alternative.

### 1.3 Modi und Zustände

- Keyword (`fts`), Hybrid und Semantisch auch in Sammlungen.
- Standard Hybrid, wenn verfügbar, sonst Keyword.
- Bereich und Filter ändern **wo**, der Modus ändert **wie** gesucht wird.
- Nur Filter, kein Freitext: ohne Query-Embedding ausführen; die Modusauswahl
  darf erhalten bleiben, der tatsächlich verwendete Pfad ist Keyword/Filter.
- Relevanz für Hybrid/Semantisch; Datum zusätzlich für Keyword.
- Zustände unterscheiden: bereit ohne Anfrage, initiales Laden, Aktualisieren,
  keine Treffer im aktuellen Bereich, Fehler mit Wiederholen, weitere Seite.
- Semantisch nicht verfügbar: verständlicher Fehler und ausdrückliche Aktion
  „Mit Keywords suchen“. Keine Umdeutung des Fehlers in „keine Treffer“.
- Bestehendes Hybrid-Fallback nicht nebenbei neu erfinden. Gewählter und
  effektiver Modus dürfen nicht widersprüchlich angezeigt werden.

## 2. Technischer Befund und unverhandelbare Schutzregeln

| Anknüpfungspunkt | Befund beim Lesen | Konsequenz |
| --- | --- | --- |
| `packages/shared/searchQueryParser.ts` | Kennt bereits `#`, `tag:`, `list:`, `is:archived`, Negation, AND/OR und Klammern | Keine zweite unvereinbare allgemeine Querysprache bauen |
| `packages/shared/searchQueryParser.test.ts` | Große bestehende Syntaxmatrix | Bestehende Fälle müssen unverändert grün bleiben |
| `packages/shared/utils/tag.ts` | `normalizeTagName` entfernt führende #; `tagCaseInsensitiveKey` ist enger als AI-Normalisierung; Tagstil ist konfigurierbar | Bindestriche nicht mit einer globalen Tagmigration verwechseln |
| `packages/shared/types/bookmarks.ts` | Suchrequest hat bisher keinen strukturierten Sammlungskontext | Additiv erweitern; Aufrufe ohne neue Felder kompatibel halten |
| `packages/trpc/routers/bookmarks.ts` | FTS und Vektorpfad teilen Filter, derzeit eigener `userId`; Treffer werden anschließend geladen | Autorisierung und Sammlung vor Kandidatenauswahl, Ranking und Pagination anwenden |
| `packages/trpc/lib/search.ts` | Matcherauflösung ist überwiegend auf eigenen Nutzer begrenzt | Geteilte Listen nicht durch Entfernen eines Nutzerfilters „reparieren“ |
| `packages/trpc/models/lists.ts` | `List.fromId`, Rollen und `getBookmarkIds`; Smart-List-Rekursion hat Schutz | Autorisierungsmodell wiederverwenden, Rekursionsschutz erhalten |
| `packages/trpc/models/bookmarks.ts` | Sammlungsladen und Bookmark-Zugriff haben eigene Berechtigungslogik | Trefferladen muss denselben bewiesenen Zugriff erlauben, keine pauschale Aufweichung |
| `apps/web/components/dashboard/dense/DenseFilesView.tsx` | Eigene lokale Suche, immer `fts`, ohne `query`-Sammlungskontext | An gemeinsamen Controller anschließen, nicht nur Ergebniszeilen filtern |
| `apps/web/lib/hooks/bookmark-search.ts` | URL-Zustand und Preview-Erhalt derzeit an `/dashboard/search` gebunden | Sammlungspfade, Filter und Bereich ausdrücklich einbeziehen |
| `apps/web/lib/bookmarkSearchMode.ts` | Baut bisher nur Links auf `/dashboard/search` | Zentralen URL-Codec erweitern, keine manuellen Stringverkettungen |
| Listen-/Tag-Routen | Beachten `includeArchived` und `archiveDisplayBehaviour` für die normale Ansicht | Suchstandard und Browse-Einstellung ausdrücklich trennen; keine stille Änderung der Einstellungen |
| `SearchInput.tsx`, Suchseite, `MobileSearchHome.tsx` | Mehrere Suchfelder; vorhandenes Autocomplete und IME-Behandlung | Ein wiederverwendbares Chip-Control, keine drei unabhängigen Parser |

**Zwingend:** Zugriffsrecht ∩ Sammlung ∩ Archivregel ∩ Tags ∩ Suchmatcher,
auf jeder Ergebnisseite und in beiden Suchquellen. Kein nachträgliches Filtern
nur der schon geladenen Seite. Bei leerer erlaubter ID-Menge sofort leeres
Ergebnis; ein leeres `in` niemals weglassen und dadurch global suchen.

## 3. Zielarchitektur und Vertrags-Gate

Die Produktentscheidungen oben stehen fest. Die folgenden technischen Details
muss der Architekt in A1 als konkrete Typen, Beispiele und Tests einfrieren,
**bevor** Executor-Agenten implementieren. Unaufgelöste Fragen sind keine
Erlaubnis für Executor-Agenten, spontan Produktentscheidungen zu treffen.

### 3.1 Ein strukturierter Suchzustand

Zielmodell (Entwurf für den Vertrags-Freeze; Feldnamen danach verbindlich):

```ts
type SearchScope =
  | { kind: "global" }
  | { kind: "favourites" }
  | { kind: "archive" }
  | { kind: "list"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "feed"; id: string };

type ArchiveMode = "exclude" | "include" | "only";

interface SearchContextV1 {
  version: 1;
  scope: SearchScope;
  archiveMode: ArchiveMode;
  tagIds: string[]; // dedupliziert, UND, nicht sichtbare Namen als Identität
}
```

- Optionales `searchContext` im vorhandenen Suchrequest; kein neues Endpoint.
- Fehlt der Kontext, bleibt die bisherige API-Semantik unverändert. Die neue
  Websuche übergibt ihn immer, einschließlich des Standard-Archivausschlusses.
- Scope `archive` verlangt `only`; andere Scopes verwenden standardmäßig
  `exclude`. Inkonsistente/manipulierte Requests validieren statt erraten.
- Anzeigenamen separat aus autorisierten Entitäten auflösen. Umbenennung ändert
  den aktiven ID-Filter nicht. Gelöschte/unzugängliche IDs dürfen nie still
  entfallen und dadurch die Suche erweitern.
- Query-Key und Pagination berücksichtigen Text, Modus, Sortierung **und den
  gesamten normalisierten Kontext**. Jede relevante Änderung verwirft Cursor.
- Drafttext, markierter Chip und offene Vorschläge sind lokale UI-Zustände;
  committed Filter und Suchtext sind navigierbarer Suchzustand.

### 3.2 Pflichtentscheidungen in A1

| ID | Zu lösender technischer Punkt | Geforderter Nachweis |
| --- | --- | --- |
| K1 | `+archiviert` als v1-Befehl, case-insensitive; keine ungefragte Alias-Sammlung | `+ARCHIVIERT` und `+archiviert` haben dieselbe Wirkung; nicht `archived=true` |
| K2 | Alte Suchsyntax und neue Chips verlustfrei verbinden | Alte `q`-Links, `is:archived`, `-is:archived`, OR/Klammern, Smart Lists und `||` behalten ihre Bedeutung |
| K3 | Unbekanntes `#foo` darf nicht später vom bestehenden Parser zum aktiven Filter werden | Expliziter Literal-/Legacy-Übergabevertrag oder gleichwertige Lösung, client- und serverseitig getestet |
| K4 | Bindestrich-Eingabe trifft existierende Tags eindeutig | Vorhandene Tag-IDs und `tagCaseInsensitiveKey` nutzen; keine lose AI-Normalisierung. Bei Legacy-Tags mit Leerzeichen/mehrdeutigen Schreibweisen Vorschläge statt erfundener Identität |
| K5 | Shared-List-Zugriff durch Suchfilter und Trefferladen tragen | Fremder erlaubter Listentreffer sichtbar; fremder Treffer außerhalb dieser Liste nie sichtbar, auch nach Rechteentzug |
| K6 | Browse-Einstellung „Archiv anzeigen“ vs. neuer Suchstandard | Normale Ansicht bleibt unangetastet; neue Suche startet ohne Archiv außer im Archivbereich. Verhalten bestehender expliziter Archiv-URLs dokumentieren |
| K7 | Leerer Text mit aktiven Chips | Tag-/Archivfilter können Ergebnisse liefern; reine leere globale Suchseite sendet keine unnötige Anfrage. Leere Listensuche kann zur Sammlung zurückkehren |

Für K2/K3 empfohlen: Chipzustand strukturiert übertragen, normale Suche als
Literaltext kennzeichnen und alte komplexe Queries über einen ausdrücklich
getrennten Kompatibilitätspfad erhalten. Ein Legacy-OR-Ausdruck darf nicht zu
UND-Chips umgedeutet werden. **Die genaue Transportform ist ein A1-Blocker**, kein
Implementierungsdetail, das B und C unabhängig entscheiden dürfen.

Ein fehlender Indexeintrag bei erlaubten fremden Listeneinträgen ist ein Befund,
kein Anlass für eine globale Neuindexierung oder einen SQL-Suchersatz. Falls der
bestehende Index den erforderlichen Inhalt nicht sicher durchsuchen kann:
STOP, Befund an Architekten, separaten Lösungsschritt freigeben lassen.

### 3.3 URL und Navigation

- Auf Sammlungspfaden bleibt die Suche in der bestehenden Ansicht. Der Scope
  kommt aus der Route; freie Eingaben dürfen ihn nur per bewusster Aktion lösen.
- Sammlungschip entfernen: mit `push` zur globalen Suchroute, übrigen Zustand
  vollständig mitnehmen. Browser-Zurück stellt die Sammlungssuche wieder her.
- Tippen: debounced `replace`, keine Historie pro Zeichen. Explizite Filter-/
  Modusaktionen erhalten klar definierte, getestete Zurück-Schritte.
- Ziel-Codec versionieren; vorhandene Parameter `q` und `mode` lesen. Neue
  Archiv-/Tagparameter nur über zentralen Codec, nicht pro Komponente erfinden.
- Explizit gewählten Modus serialisieren, damit ein geteilter Link nicht wegen
  anderer Server-Defaults seine Bedeutung wechselt.
- Reload und kopierter Link stellen Text, Tags, Archivzustand und Modus her.
- Preview öffnen/schließen erhält Zustand und möglichst die Scrollposition;
  aktuelle Schutzlogik gegen verspätete URL-Updates nicht verlieren.
- Bewusste Navigation in eine andere Sammlung startet dort ohne alten Suchtext.
- Nach reiner Textleerung bleiben bewusst gesetzte Filter bestehen. Eine
  ausdrückliche Aktion „Suche zurücksetzen/schließen“ stellt die Ursprungssammlung
  wieder her; im globalen Kontext bleibt die leere globale Suche.
- Sammlungseinschränkungen nicht als angehängtes `list:"Name"` kodieren.

## 4. Interaktionsvertrag des gemeinsamen Controls

### Eingabe und Tokenisierung

1. Vorschläge ab `#` bzw. `+` zeigen; nur autorisierte existierende Tags anbieten.
2. Tokenisierung erst an echter Leerzeichen-Grenze nach gültigem Ausdruck.
3. Async-Tagauflösung bindet sich an Input-Version, Tokenposition und Bereich:
   eine verspätete Antwort darf geänderten Text weder löschen noch zum Chip machen.
4. IME-Komposition nicht unterbrechen. Kein Tokenisieren während `isComposing`;
   mobile Tastaturen über Input-/Composition-Ereignisse mitprüfen, nicht nur Keydown.
5. Einfügen von `+archiviert #technik iPhone 14 Pro` darf abgeschlossene gültige
   Tokens übernehmen; der Rest bleibt Text. Keine Tokenisierung mitten in URLs,
   Code oder Worten. Verkettetes `+archiviert#technik` gehört **nicht** zu v1.
6. Doppelte Tags oder Archivbefehle ergeben keinen zweiten wirksamen Chip.
7. Enter bestätigt eine gewählte gültige Vorschlagsoption; ohne gewählte Option
   führt es die aktuelle Suche aus. Nicht heimlich eine andere Syntax voraussetzen.

### Löschen und Fokus

- Nutzer-DEL auf der Mac-Tastatur ist für den beschriebenen Rückwärtsfall
  `KeyboardEvent.key === "Backspace"`. Nicht nur auf den Web-Key `Delete` hören.
- Erster Rückwärtsschritt markiert den letzten Chip, zweiter entfernt ihn.
  Auto-Repeat eines einzelnen gehaltenen Tastendrucks zählt nicht als zwei
  bewusste Schritte. Esc oder erneutes Tippen hebt die Markierung auf.
- Textauswahl, Cursorposition und System-/Screenreader-Shortcuts respektieren.
- Native Vorwärts-Delete-Taste nur in einem nachvollziehbaren Fokuszustand
  behandeln; keine globale Delete-Abfangroutine.
- Nach × oder Entfernen Fokus sinnvoll ins Eingabefeld zurückgeben; beim
  Sammlungschip zusätzlich die Navigation atomar mit dem Zustand durchführen.

### GUI-Gleichwertigkeit

- Bestehenden Filterzugang für Tagwahl und „Archiv einschließen“ nutzen.
- GUI-Tagwahl erzeugt denselben Chip mit derselben ID wie Texteingabe.
- GUI-Archivschalter erzeugt/entfernt denselben Einschlussfilter.
- Keine vollständige neue Sammlungsverwaltung oder beliebige Bereichsauswahl
  in v1. Sammlung erneut über Navigation/Browser-Zurück wählen.
- Sammlungschip optisch von zusätzlichen Filterchips unterscheiden, ohne
  ausschließlich Farbe als Bedeutungsmerkmal zu verwenden.

### Gestaltung und Barrierefreiheit

`design/README.md` ist maßgeblich: bestehende Tokens/Typografie, keine Schatten,
keine Thumbnails, kein Redesign. Wiederverwendbares React-Control mit normalem
Input und echten Chip-Buttons bevorzugen; kein Rich-Text-Editor als neue Abhängigkeit.

Benannte Suchleiste; benannte Entfernen-Buttons (z. B. „Tag technik entfernen“),
Fokusring und erkennbare Chipmarkierung. Vorschläge mit passender Combobox-/
Listbox-Semantik, Tastatursteuerung und nicht verschachtelten interaktiven Rollen.
Chip-Erzeugung/Entfernen für Screenreader dezent ansagen. DE und EN vollständig.
Mobile: umbrechende Chips, erreichbare Touch-Ziele, keine horizontale Seiten-
Überbreite. Textskalierung und vorhandene Theme-/Scale-Einstellungen prüfen.

Bei Scope-/Filterwechseln keine alten Treffer aus einem weiteren Bereich als
scheinbar aktuelle Treffer stehen lassen. Bisherige Treffer nur bei sicher
unverändertem Kontext als „wird aktualisiert“ behalten. Ein Fehler darf ebenso
wenig eine alte globale Liste als neue scoped Treffer ausgeben.

## 5. Team, Besitzgrenzen und Reihenfolge

Die Rollen folgen `AGENTS.md`: Codex als Architekt/Reviewer, Claude als
eng abgegrenzter Executor. QA darf günstigere Agenten verwenden, aber keine
Produktfixes vornehmen. Namen bezeichnen Rollen, nicht eine jetzt laufende Crew.

Maximal **drei gleichzeitig aktive Agenten**, jeder mit eigenem Worktree.
Ein gemeinsames Sandbox-Image ist erlaubt, ein gemeinsamer laufender Container
oder ein gemeinsam beschriebener Arbeitsbaum nicht.

```text
A0 Baseline sichern (Architekt + Eigentümerfreigabe)
  └─ A1 Schnittstellen/Kompatibilität einfrieren (Architekt)
       ├─ B Backend/Autorisierung (Executor)
       └─ C Chip-Control (Executor; nur freigegebene Typen/Callbacks)
            B + C ── Review/Integration ── D Web-Anbindung (Executor)
                                            └─ E unabhängige QA
                                                 └─ R Review + menschliche Abnahme
```

### A0 — Baseline und Wiederaufnahme-Gate

**Ziel:** Der offene Suchstand ist vollständig erfasst, zugeordnet, geprüft und
als gemeinsame Startrevision reproduzierbar. Keine fremden Änderungen verlieren.

**Schritte:**

1. `git status --short`, `git diff --stat`, gezielte Diffs und relevante
   `.claude/pipeline/*/implementation-log.md`/`review.md` lesen.
2. Lokale Änderungen nach Suchbasis, Toolchainänderungen und fremden Artefakten
   trennen. Untracked Suchquellen ausdrücklich erfassen; HEAD allein genügt nicht.
3. Mit Eigentümer klären, welche Änderungen in die Baseline gehören. Kein
   `git stash`, `reset`, `clean`, automatisches Kopieren ganzer lokaler Verzeichnisse.
4. Runtime und Tests nach Abschnitt 7 prüfen. Falls blockiert, Befund berichten,
   Baseline nicht als grün kennzeichnen.
5. Nur freigegebene exakte Pfade committen; Start-SHA und Testprotokoll im
   Übergabereport festhalten. Ab hier leiten sich neue Task-Worktrees davon ab.

**Dateien:** Nur die oben tatsächlich zugeordneten Suchbasis-Dateien; keine
neue Feature-Implementierung. Die genaue Liste vor dem Commit festhalten.

**Abnahme:** Baseline-SHA vorhanden; Suchquellen/Tests vollständig; unabhängig
geprüft; fremder Arbeitsstand unverändert. Bei fehlender Freigabe: STOP.

### A1 — Gemeinsamer Vertrag (Architekt, keine Executor-Exploration)

**Ziel:** K1–K7 entschieden und an Beispielen überprüfbar, kein Parallelteam mit
unterschiedlicher Vorstellung von Text, Filtern, Archiv oder IDs.

**Dateien:**

- **Neu:** `docs/plans/consistent-search-contract.md`: endgültige Feldnamen,
  Zod-/TS-Formen, Literal-/Legacy-Abgrenzung, URL-Codec, Controller-/Control-Props,
  Autorisierungsweg, Fälle für Fehler, Leerzustand, DEL und bestehende Archivlinks.
- **Neu:** `packages/shared/types/bookmarkSearch.ts`: freigegebene gemeinsame
  Scope-/Kontexttypen und Schemata, ohne Laufzeitänderung bestehender Endpoints.
- Diesen Bauplan nur aktualisieren, wenn Pfade/Prüfbefehle präzisiert werden.

**Pflicht:** Je ein JSON-Request und eine URL für global, Liste, Tags + Archiv,
Archiv-only, unbekanntes Tag und eine alte komplexe Query. Ausdrücklich erklären,
wie ein unbekannter Hash-Ausdruck literal bleibt. Kein nur abstraktes Diagramm.

**Abnahme:** Architektenreview; bei einer neuen nötigen Produktentscheidung
zurück zum Nutzer. Erst danach B und C freigeben. Test-/Dateinamen unten bei
abweichender endgültiger Architektur vor Dispatch in einem Zug aktualisieren.

### B — Server, Sammlungskontext und Zugriff

**Besitzt ausschließlich:**

- `packages/shared/types/bookmarks.ts`: optionalen Kontext in Request aufnehmen.
- **Neu:** `packages/trpc/lib/bookmarkSearchScope.ts` und `.test.ts`: Scope,
  Archiv und Tag-IDs validieren und autorisiert auflösen.
- `packages/trpc/routers/bookmarks.ts`, `bookmarks.search.test.ts`: Kontext in
  FTS/Vektorpfad anwenden; leere Menge, Cursor, reine Filter und bestehende
  Kompatibilitätsaufrufe absichern.
- **Nur nach A1 explizit zugewiesen:** kleinste notwendige Anpassung in
  `packages/trpc/models/bookmarks.ts` bzw. `packages/trpc/lib/search.ts` für den
  bewiesenen Shared-List-Pfad. Keine neue pauschale Zugriffsfreigabe.

**Arbeit:** Auflösung einmal pro Request; gemeinsame Filter vor Ranking und
Pagination; IDs nicht nur vom Client glauben. Alle Tag-IDs autorisiert prüfen,
UND-Schnitt bilden. Suchtext für Embeddings enthält keine Chips/Scopebefehle.
Bisherige Score-/RRF-/Candidate-Limits und Sicherheitsgrenzen nicht verändern.

**Abnahme:** Positive und negative Zugriffstests, Shared-List-Rechteentzug,
Smart Lists inkl. Rekursionsschutz; gleiche Regeln in FTS/Hybrid/Semantisch und
auf Folgeseiten. Bestehende API ohne Kontext und Parserfälle unverändert.

**Prüfung:** Abschnitt 7, S1 und S2, danach `pnpm preflight`.
**Fehler:** Einmal ausführen, ersten unerwarteten Fehler samt Log melden; keine
neue Suchengine, Paginationstrategie oder Berechtigungsabkürzung improvisieren.

### C — Gemeinsames Chip-Control und Eingabelogik

**Besitzt ausschließlich (neue Dateien):**

- `packages/shared/bookmarkSearchInput.ts` und `.test.ts`: reine Token-/
  Reducerlogik nach A1, Kandidatenerkennung, Duplikate, Textreste. Keine DB/React.
- `apps/web/lib/hooks/useTokenizedSearchInput.ts` und `.test.tsx`: lokaler Draft,
  Cursor/Selektion, pending Kandidaten, IME und zweistufige Chipmarkierung.
- `apps/web/components/dashboard/search/TokenizedSearchBar.tsx` und `.test.tsx`:
  kontrolliertes Control, GUI-Filterzugang, Vorschläge, Chips, Fokus und a11y.

**Nicht besitzen:** existierende Suchhooks, Routen, Autocomplete oder gemeinsame
Übersetzungsdateien. Sichtbare Texte über festgelegte Props/Übersetzungsschlüssel
liefern; endgültige DE/EN-Einträge gehören D.

**Arbeit:** Callbacks/Typen aus A1 verwenden; Tagkatalog/Resolver vom Controller
injizieren. Nicht selbst tRPC, URL oder Suchbackend integrieren. Kein Contenteditable
und keine neue Editorbibliothek. Testfälle für mobile Input-Ereignisse und
veraltete asynchrone Antworten einschließen.

**Abnahme:** Ein GUI-Filter und ein getippter Filter erzeugen identische Zustände;
Leerzeichen/zweimal DEL funktionieren, unbekanntes Tag bleibt unwirksam; sämtliche
Text-/Cursor-/IME-Fälle aus Abschnitt 6 sind automatisiert geprüft.

**Prüfung:** Abschnitt 7, S1 und S3, danach `pnpm preflight`.
**Fehler:** STOP/Report; keine bestehenden Dateien „zum schnellen Anschließen“ ändern.

### D — Web-Integration und navigierbare Suche

**Start erst nach Integration der geprüften B- und C-Commits. Besitzt:**

- `apps/web/lib/bookmarkSearchMode.ts` und `.test.ts`: zentrale kompatible URL-Codec-
  Erweiterung oder Delegation an das in A1 festgelegte State-Modul.
- **Neu:** `apps/web/lib/bookmarkSearchState.ts` und `.test.ts`: normalisierten
  Zustand, Kontext-/Routeauflösung, Codec, Cursor-/History-Regeln bündeln.
- `apps/web/lib/hooks/bookmark-search.ts` und `.test.tsx`: gemeinsamer Controller,
  Query-Key, Debounce, Preview-Erhalt, explizite Historyaktionen.
- `apps/web/components/dashboard/dense/{DenseFiles,DenseFilesView}.tsx`:
  Bereich übergeben, lokale FTS-Sonderlösung entfernen, Zustände vereinheitlichen.
- `apps/web/app/dashboard/search/page.tsx`
- `apps/web/components/dashboard/dense/mobile/MobileSearchHome.tsx`
- `apps/web/components/dashboard/search/{SearchInput,SearchGuidance}.tsx`
- `apps/web/components/dashboard/search/useSearchAutocomplete.ts`: existierende
  Vorschläge über Adapter weiterverwenden, keine zweite aktive Tokenisierung.
- `apps/web/lib/i18n/locales/{de,en}/translation.json`
- **Neu:** `apps/web/components/dashboard/search/SearchIntegration.test.tsx`.

**Grenzen:** Existierende Collection-Routen und Browse-Einstellungen nicht
nebenbei ändern. Wenn zusätzliche Props dort unabweisbar sind, legt A1 die
exakte Zusatzdateiliste vor Dispatch fest. Die schreibenden Quick-Add-Kontexte
nicht an Suchfilter koppeln: eine Suche darf neue Bookmarks nicht versehentlich
archivieren, taggen oder in die falsche Liste legen.

**Abnahme:** Alle vier Suchfelder nutzen denselben Zustand/Control; keine doppelten
⌘K-Handler, keine versteckten Desktop/Mobile-Doppelanfragen. Entfernen des
Sammlungschips funktioniert mit Back/Reload und ohne Verlust anderer Filter.
Alte breitere Treffer werden bei Kontextwechsel nicht als aktuelle angezeigt.
Collection-Gesamtzahl nicht als Suchtrefferzahl ausgeben; keine erfundenen Totals.
Reine Filter aktivieren den Suchpfad auch bei leerem Freitext.

**Prüfung:** Abschnitt 7, S1–S4, danach `pnpm preflight`.
**Fehler:** STOP/Report; kein Umbau des gesamten Dashboards oder der mobilen Queue.

### E — Unabhängige QA, keine Produktfixes

**Dateien ausschließlich:**

- **Neu:** `packages/e2e_tests/tests/qa/scoped-search.test.ts`
- **Neu:** `packages/e2e_tests/tests/qa/search-chips.test.ts`
- **Neu:** `packages/e2e_tests/tests/qa/search-fixtures.ts`

Vorhandene Infrastruktur aus `setup/startContainers.ts`, `setup/seed.ts` und
`qa/browser.ts` wiederverwenden. Kontext per Vitest `inject` beziehen. Keine
persönlichen Browser, keine festen Produktivports, keine Live-Daten.

Fixtures mit eindeutigen Titeln/IDs; aktive/archivierte, zwei Tags, eine manuelle
und eine Smart List, Favorit, Feed sowie zweiter Nutzer mit geteilter und privater
Liste. Nach Indexierung mit begrenztem Polling auf definierte Fixture-Bedingung
warten, nicht blind schlafen. Echte Ergebnis-IDs prüfen, nicht nur Chipdarstellung.
Keine Rankingqualität mit konstanten Mock-Embeddings als bewiesen ausgeben.

**Abnahme:** Abschnitt 6 und S5, Desktop und mobile Webbreite, DE/EN, Tastatur
und Touch-Klickpfad. Wenn Semantic-Stack-Voraussetzungen fehlen: BLOCKED mit
Begründung, nicht SKIP als PASS. Ein neues Stack-Setup ist ein separater Auftrag.

### R — Review, Integration und Abnahme (Architekt + Mensch)

- Jeden Taskdiff gegen freigegebenen Vertrag prüfen; Executor zertifiziert sich
  nicht selbst. Architektur/Sicherheit und UX jeweils unabhängig überprüfen.
- Review ist read-only, Findings mit Datei/Zeile, Risiko und Reproduktion melden.
- Fixes nur nach neuer begrenzter Spezifikation im zuständigen Task-Worktree.
- Nach Integration S1–S5 und Preflight auf **derselben Revision** wiederholen.
- Vor einem Merge visuelle Abnahme durch den Nutzer: beide Hauptbeispiele,
  Chip-Löschung und Listensuche → global. Kein automatisches Deployment.
- Dokumentation/MISTAKES nur durch Integrator zusammenführen, keine konkurrierenden
  Agenten an denselben Berichtsdateien.

## 6. Verbindliche Abnahmematrix

Alle Bereichs-/Archiv-/Tagfälle für `fts`, `hybrid`, `semantic` prüfen. Reine
Filter laufen ohne Query-Embedding. Die Kombinationen müssen auf Folgeseiten
genauso gelten wie auf Seite eins.

| ID | Fall | Erwartung |
| --- | --- | --- |
| P01 | Files/global + `iPhone 14 Pro` | Nur eigener nicht archivierter Bestand; kein „Nicht archiviert“-Chip |
| P02 | P01 + `+archiviert ` | Einschlusschip; aktive und archivierte Treffer, keine privaten fremden |
| P03 | `+archiviert #technik iPhone 14 Pro` | Zwei Chips, Freitext unverändert; nur Tag technik, beide Archivzustände |
| P04 | `#technik #apple iPhone` | Beide Tags müssen vorhanden sein, nicht ODER |
| P05 | `#machine-learning ` | Gültiger existierender Bindestrich-Tag wird Chip, keine Anführungszeichen nötig |
| P06 | Unbekanntes `#tehnik ` / `+unbekannt ` | Kein Filterchip, verständlicher Hinweis/Vorschlag; Backend aktiviert keinen versteckten Filter |
| P07 | `+ARCHIVIERT ` | Gleicher Einschluss wie Kleinschreibung, kein zweiter Chip bei Wiederholung |
| P08 | Liste Dev + Begriff; Chip entfernen | Global ohne Archiv, Begriff/Modus/Tag-/Archivfilter erhalten |
| P09 | Favoriten/Tag/Feed + Begriff | Ergebnis erfüllt Basisbereich und zusätzliche Filter |
| P10 | Archiv + Begriff | Nur Archiv; zusätzlicher Einschlussbefehl erklärt redundant, kein zweiter Archivchip |
| P11 | Archivchip entfernen | Global ohne Archiv; andere Filter bleiben erhalten |
| P12 | Kein Treffer in Liste | Kein automatischer globaler Fallback; ausdrücklich entfernbarer Bereich |
| P13 | Nicht autorisierte/manipulierte Liste/Tag/Feed-ID | Keine fremden Inhalte und keine stillschweigende globale Suche |
| P14 | Shared List mit fremdem erlaubtem Eintrag | Treffer wie reguläre autorisierte Liste; privater Eintrag desselben Eigentümers nie sichtbar |
| P15 | Zugriff nach erster Ergebnisseite entziehen | Nächste Anfrage liefert keinen fremden Inhalt; Client zeigt keinen stale Shared-Treffer als aktuell |
| P16 | Smart List, umbenannte Liste/Tag, Rekursionszyklus | IDs korrekt; Smart-Membership beachtet; Zyklus endet sicher |
| P17 | Später Treffer jenseits Seite eins | Wird mit denselben Filtern gefunden; keine scopefremden Treffer/Duplikate durch Kontextwechsel |
| P18 | Leere globale Suchseite ohne Chips | Bereit-Zustand, keine sinnlose Suchanfrage |
| P19 | Nur `#technik ` oder `+archiviert ` | Wirksame Filtersuche ohne Freitext/Embedding; kein endloser Skeleton |
| I01 | Gültiges Token ohne/nach Leerzeichen | Erst Text, dann Chip; normale Worte werden nicht zu Chips |
| I02 | Direkt nach Chip-Leerzeichen zweimal DEL | Erst markiert, dann vollständig entfernt; Cursor bleibt sinnvoll |
| I03 | Text hinter Chip, Cursor mitten im Text, Textauswahl | Normales Textlöschen, keine ungewollte Chipentfernung |
| I04 | Ein gehaltenes DEL, dann Escape/Weitertippen | Kein unbeabsichtigter Zweischritt; Markierung sinnvoll aufgehoben |
| I05 | IME, mobile Tastatur, Paste mehrerer Tokens | Kein Zeichenverlust, keine vorzeitigen Chips, gültige abgeschlossene Tokens korrekt |
| I06 | Verzögerte Tagantwort nach Edit/Navigation | Keine nachträgliche Umwandlung falschen Texts oder falscher Sammlung |
| I07 | Derselbe Tag per GUI und Text | Gleiche ID, gleiche Treffer, ein Chip, gleiche Entfernung |
| N01 | Tippen, Mode-/Filteraktion, Browser Back/Forward | Keine Zeichenhistorie; bewusste Zustandswechsel reproduzierbar |
| N02 | Reload/geteilter Link | Text, Modus, Bereich, Tags und Archivzustand bleiben erhalten |
| N03 | Preview öffnen/schließen | Zustand und Ergebnisposition erhalten; kein überschreibender verspäteter Debounce |
| N04 | Neue Sammlung über Navigation | Kein alter Suchtext; keine übrig gebliebenen alten zusätzlichen Filter |
| N05 | Suche schließen/zurücksetzen | Ursprungsansicht korrekt; Quick Add unverändert im richtigen Browse-Kontext |
| F01 | FTS-Backend ausgefallen | Fehler + Wiederholen, niemals „keine Treffer“ |
| F02 | Semantisch nicht verfügbar | Fehler + bewusster Keyword-Wechsel mit gleichem Bereich/Filtern |
| F03 | Filterwechsel während Anfrage, Fehler auf nächster Seite | Keine scopefremden/stale Treffer als aktuell; schon geladene gültige Seiten bei Paginationfehler nicht verlieren |
| C01 | Alte API ohne Kontext, alte Links und Smart Lists | Bisherige explizite Syntax und Bedeutungen erhalten |
| C02 | Legacy `is:archived`, Negation, OR/Klammern | Nicht mit Archiveinschluss verwechseln oder in UND umformen |
| C03 | `|| idea || other idea` mit Filtern | Shortcut/Modus erhalten; Embeddings nur aus Text, Filter gelten für jede Idee |
| A01 | Tastatur/Screenreader, DE/EN, 390px/1440px | Benannte Controls, sichtbarer Fokus, verständliche Chips, kein horizontaler Seitenoverflow |

## 7. Exakte Prüfreihenfolge für spätere Ausführung

**Hier nicht ausgeführt.** Befehle gelten im jeweiligen Task-Worktree nach
A0/A1. Namen neuer Tests gehören zum Auftrag und müssen dann existieren.
Keine leeren Test-Globs als Erfolg ausgeben.

### S0 — Vor jedem Task: Isolation, Runtime, Abhängigkeiten

```bash
pwd
git status --short
node --version
command -v pnpm
pnpm --version
node -p 'require("./package.json").packageManager'
```

`.nvmrc` verlangt derzeit Node 24. Im offenen Hauptarbeitsbaum steht
`pnpm@11.2.1`; dieser Wert ist selbst Teil offener Änderungen. Nach A0 gilt
**der eingefrorene** `packageManager`-/Lockfile-Stand, nicht blind dieser Text.
Fehlendes/falsches Node oder pnpm: STOP und melden. Bestehende `node_modules`
sind kein ABI-Nachweis. Abhängigkeiten nur im eigenen Worktree und mit passender
Runtime installieren, falls ausdrücklich freigegeben:

```bash
pnpm install --frozen-lockfile
```

Kein Lockfile-Update, kein stiller Paketmanagerwechsel, keine automatischen
Reparatur-/Rebuildversuche am produktiven Arbeitsbaum. Vor Next-Codeänderungen
relevante lokale Next-Dokumentation gemäß `apps/web/AGENTS.md` lesen.

### S1 — Gemeinsame Pure-Logic-Tests

A0 nur vorhandene Parser-/Semantic-Tests; ab C zusätzlich den neuen Inputtest:

```bash
pnpm --filter @karakeep/shared exec vitest run searchQueryParser.test.ts semanticSearchQuery.test.ts
pnpm --filter @karakeep/shared exec vitest run bookmarkSearchInput.test.ts
```

### S2 — Router/Scopes, ausschließlich isolierter DATA_DIR

Vor B existiert der neue Scope-Test noch nicht; A0 führt nur den Routertest aus.
Für den vollständigen B-/Integrationslauf:

```bash
set -e
SEARCH_TEST_DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/keepsake-search-tests.XXXXXX")"
DATA_DIR="$SEARCH_TEST_DATA_DIR" pnpm --filter @karakeep/trpc exec vitest run lib/bookmarkSearchScope.test.ts routers/bookmarks.search.test.ts
```

Test-DB über `testUtils.ts`/In-Memory-Fixtures. Niemals `DATA_DIR` aus dem
Benutzerbetrieb übernehmen. Bei SQLite-ABI-, pnpm- oder Umgebungsfehlern:
**BLOCKED vor Testausführung**, nicht „bekannter Fehler, also bestanden“.
Nur den selbst erzeugten Tempordner nach Run-Ende gezielt bereinigen.

### S3 — Chip-/Interaktionstests

```bash
pnpm --filter @karakeep/web exec vitest run lib/hooks/useTokenizedSearchInput.test.tsx components/dashboard/search/TokenizedSearchBar.test.tsx
```

### S4 — Gemeinsamer Controller und Integration

```bash
pnpm --filter @karakeep/web exec vitest run lib/bookmarkSearchMode.test.ts lib/bookmarkSearchState.test.ts lib/hooks/bookmark-search.test.tsx components/dashboard/search/SearchIntegration.test.tsx
pnpm preflight
```

A0 prüft hier nur die bereits vorhandenen `bookmarkSearchMode.test.ts` und
`lib/hooks/bookmark-search.test.tsx`, anschließend Preflight.

### S5 — Echte Browser-/Ergebnisprüfung im vorhandenen isolierten Stack

```bash
pnpm --filter @karakeep/e2e_tests exec vitest run tests/qa/scoped-search.test.ts tests/qa/search-chips.test.ts
```

Der bestehende Global-Setup startet für diesen Run seinen eigenen
`keepsake-qa-*`-Compose-Stack mit dynamischen Ports und eigenem MinIO-Volume.
Die Tests starten **keinen zweiten Stack**. Browser über `qa/browser.ts` und die
injizierten `chromeCdpPort`/`browserBaseUrl` verbinden. Niemals `docker-web-1`,
Port 3000/9222 als Fallback oder den persönlichen Browser verwenden.

Der E2E-AIO-Build ist der Buildnachweis dieser Prüfung. Build, Preflight,
fokussierte Tests und visuelle Abnahme separat berichten. Ein vorhandenes altes
Image (`E2E_TEST_NO_BUILD`) beweist die neue Revision nicht. Netzwerk-, Font-,
Docker- oder Registryprobleme als Blocker protokollieren, nicht umgehen.

### Fehlerprotokoll und Stop-Regel

Executor: beim ersten unerwarteten Fehler stoppen, keine Retry-Schleifen oder
selbst erfundene Alternativlösung. Folgende Angaben zurückgeben:

```text
Task / Worktree / Branch / Baseline-SHA / Ergebnis-SHA
Exakt geänderte Dateien
PASS / FAIL / BLOCKED je Befehl und Abnahme-ID
Erster Fehler: exakter Befehl + relevante Ausgabe + Logpfad
Noch nicht geprüft
Abweichung vom Vertrag oder nötige Entscheidung
```

Reviewer schreibt nur Findings. QA: PASS/FAIL/BLOCKED je Check + kurzer
Reproduktionsschritt + beobachtet vs. erwartet + Evidenzpfad. Keine Secrets,
Cookies oder realen persönlichen Inhalte in Reports.

## 8. Dispatchvorlage für jeden Executor

Erst nach expliziter Umsetzungsfreigabe verwenden. Dispatcher fügt den
vollständigen freigegebenen Tasktext, dessen Vertragsauszug und konkrete SHAs
inline hinzu; kein Auftrag „erst einmal das ganze Repository untersuchen“.

```text
Task: <B | C | D | E>
Ziel + Erfolgskriterien: <vollständigen Tasktext einfügen>
Worktree / Branch: <eigener sauberer Arbeitsbaum>
Baseline-SHA / Vertrags-SHA: <konkrete Revisionen>
Erlaubte Dateien + exakte Änderungen: <vollständige Besitzliste>
Verbindliche Semantik/Typen/Beispiele: <A1-Auszug inline>
Prüfbefehle in Reihenfolge: <S0 + taskbezogene S-Schritte>
Pflichttests und Abnahme-IDs: <konkrete Liste>
Out of scope: <Abschnitt 9 + Taskgrenzen>
Bei Überraschung/Fehler: STOP, Report nach Abschnitt 7. Nicht improvisieren.
Keine Subagentenkaskade, keine fremden Dateien, kein Live-Stack.
```

Vor jedem Commit Status und staged Pfade prüfen. Nur exakte Dateipfade stagen,
niemals `git add .` / `git add -A`. Pre-Commit-Gate nicht mit `--no-verify`
umgehen. Integration/Cherry-Picks erledigt allein der Integrator; bei Konflikten
STOP statt fremde Taskdateien eigenmächtig aufzulösen.

## 9. Ausdrücklich nicht enthalten

- Neues Ranking, neue Relevanzschwellen, neue Suchengine oder Embeddingmodell.
- Globale Neuindexierung, Migration des Tagbestands oder neue Tagstilvorgaben.
- Ein echter CLI-Client oder neue Shellbefehle; „CLI“ meint hier Texteingabe in
  derselben Websuchleiste.
- Neue Liste-/Feed-Kurzbefehle, freie Befehlssprache, neue OR-Chip-Bedienung,
  verkettete Tokens ohne Leerzeichen oder eine neue Suchhistorie.
- Änderung der vorhandenen Smart-List- oder externen API-Semantik.
- Beliebige neue Sammlungsauswahl in der Searchbar.
- Allgemeine Mobile-Queue-/Browse-Reparaturen, Detail-Editor, Highlights,
  ähnliche Einträge, Dashboard-/Theme-Redesign.
- Änderungen an nativer Expo-App, Browserextension, CLI, SDK oder Workerlogik.
- Neue Abhängigkeiten oder Lockfile-/Toolchainupdates als Beifang.
- Live-Daten, Produktionscontainer, private Browser oder automatisches Deployment.

## 10. Definition of Done / nächster erlaubter Schritt

Fertig ist das Paket erst mit: freigegebenem Vertrag, überprüften Einzelcommits,
S1–S5 auf gemeinsamer Revision, nachgewiesenen negativen Berechtigungsfällen,
Browser-Evidenz für Chips und Navigation sowie menschlicher visueller Abnahme.
BLOCKED ist kein PASS. Offene Kriterien verhindern die Abschlussmeldung.

**Aktuell erlaubt:** Bauplan prüfen und A0/A1 zur Vorbereitung konkretisieren.
**Aktuell nicht erlaubt:** Agententeam starten oder Anwendungscode implementieren.
Die Zustimmung zur Planerstellung ist keine Freigabe zur Umsetzung.
