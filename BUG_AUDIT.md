# Bug- & Performance-Audit — gesammelte Befunde

Statische Suche nach Fehlern, überflüssigem und performance-verschlechterndem
Code in Keepsake. **Keine Umsetzung** — diese Datei sammelt nur Befunde.

- **Stand:** Commit `71d42740` (`perf(search): parallelize embedding jobs`)
- **Methode:** mehrere parallele Audit-Agents, jeweils read-only in eigenem
  Git-Worktree; jeder Befund muss über Aufrufketten im Quellcode belegt sein.
  Performance-Aussagen sind ausdrücklich als *statisch belegt* oder
  *ungemessen* markiert — es wurden keine Benchmarks gefahren.
- **Nicht ausgeführt:** keine Tests, keine Builds, keine Server, keine
  Container, keine Verbindung zu laufenden Instanzen.
- **Sprache:** Berichte teils Deutsch, teils Englisch (so von den Agents
  geliefert); unverändert übernommen.

## Überblick

Statische Suche in **fünf Runden**, jede read-only auf Commit `71d42740`:

| Runde | Agents | Bereiche | Befunde |
|-------|--------|----------|---------|
| 1 | 3 | Dense-UI · API/Datenbank · Hintergrundjobs | 23 |
| 2 | 3 | Dense-UI · API/Datenbank · Hintergrundjobs | 21 (+1 Perf-Kandidat) |
| 3 | 8 | Expo-Mobile · CLI/Extension/MCP/SDK · Verifikation · Performance Web · DB/Shared-Layer · restliche Web-Bereiche · restliche tRPC-Router · shared-react-Hooks | ~83 |
| 4 | 3 | Crawler-Subsystem · Import/Export-Parser · Dense-UI-Tiefenprüfung | ~35 |
| 5 | 3 | restliche Worker · Suchsprache/Ranking · Deployment/Container/Ops | ~34 |

Dazu der Abschnitt **„Eigene Nachprüfung"** mit rund 37 Befunden, die direkt
am Quellcode gegengeprüft wurden — inklusive der vier Korrekturen an den
Runde-1/2-Meldungen und der ausdrücklich verworfenen Hypothesen.

### Die kritischsten Befunde (P1)

1. **Entzogene Adminrechte bleiben wirksam** — JWT-Strategie ohne `maxAge`,
   Rolle wird nur beim Login geschrieben → bis zu **30 Tage** Admin-Zugriff
   für herabgestufte oder gelöschte Konten. *(V1)*
2. **Zyklische Listen blockieren den Server** — `getChildren` ohne
   Visited-Set, `parentId`-Validierung nur gegen Selbstreferenz → Endlosschleife
   bis OOM. *(V4)*
3. **Bekanntes NextAuth-Secret im Dev-Stack** — Fallback
   `super-secure-nextauth-secret`, Stack per `.env` auf eine LAN-IP verdrahtet,
   `auth.ts` ohne `secret:` → Admin-Token mit Repo-Wissen fälschbar.
4. **`tidy_assets` löscht ohne Alters-/In-Flight-Guard** — Dateien werden vor
   ihren DB-Zeilen geschrieben; im S3-Modus wird der ganze Bucket ohne Prefix
   gelistet → Datenverlust bzw. Löschen fremder Objekte.
5. **Crawler: `execa` ohne `reject:false`** — beide Fehlerzweige sind toter
   Code, die Temp-Datei leakt, und jeder monolith-Fehler reißt den ganzen
   Crawl-Job mit *(V6)*.
6. **Crawler: Timeout-Budget umgekehrt** — ASR 900 s in einem 60-s-Job →
   Sub-Timeouts können nie greifen *(V6)*.
7. **`or` zwischen Freitext wird zu UND** — der Parser konkateniert beide Texte,
   der Router sucht mit `matchingStrategy:"all"` *(V7)*.
8. **`-age:` liefert die Gegenteil-Menge** — der `age:`-Zweig ignoriert `minus`,
   der Matcher-Typ hat kein `inverse` *(V7)*.
9. **Listen-Merge entkoppelt fremde Bookmarks von der Freigabe** — Kopien ohne
   `listMembershipId` überleben den Austritt des Collaborators.
10. **Redis beim Prozessstart unerreichbar → API-Anfragen hängen** statt
    Fail-open (endlose Reconnect-Strategie vor dem ersten Rate-Limit-Zugriff).
11. **Ollama vor Empfang der HTTP-Header nicht abbrechbar** — weder Fetch- noch
    Job-Timeout greifen.

### Was ausdrücklich *kein* Befund ist

Jeder Agent hat „Verworfene Hypothesen" mit Gegenbelegen dokumentiert. Das ist
für die Triage ebenso wichtig wie die Befunde selbst — belegt widerlegt wurden
u. a.: Schema-/Migrations-Drift in `packages/db`, Path-Traversal über
`assetId`, IDORs in Webhook-/Backup-/Invite-/Asset-Routern, API-Key-Scope-Bypass,
SSRF über Webhook-URLs, katastrophales Backtracking im Suchparser,
Meilisearch-Filterinjection, CORS-Konfiguration, ReactQueryDevtools im
Prod-Bundle, `useCursorV2`-Cursor-Mismatch und ein fehlender Service Worker.

---

# Runde 1

## Oberfläche / Web (Dense-UI)

Runde 1 abgeschlossen, Worktree unverändert. Acht belastbare Findings; ausschließlich statische Prüfung, keine Laufzeitmessungen.

1. **P2 – Suche innerhalb einer Liste/Favoriten/Archiv verliert sämtliche Filter.**  
   `apps/web/components/dashboard/dense/DenseFilesView.tsx:173–179` übergibt nur Text, Suchmodus und Sortierung. `finalQuery` enthält dagegen `listId`, `tagId`, `archived`, `favourited` und ggf. Feed-Filter (`131–136`). Das Feld verspricht ausdrücklich `Search ${label}` (`340`). Repro: Favoriten öffnen, Begriff eines ausschließlich nicht favorisierten Bookmarks eingeben → Ergebnis erscheint trotzdem. Gleiches gilt für Listen, Tags, Archiv. Die Search-API nimmt Filter nur über Suchqualifier im Text entgegen (`packages/shared/types/bookmarks.ts:375–382`), keine implizite Kontextübernahme. **Deterministisch aus Datenfluss.**

2. **P2 – Mobile Filter sperren den Zugriff auf passende Treffer späterer Seiten.**  
   `apps/web/components/dashboard/dense/mobile/MobileSearchHome.tsx:107–113`, `239–243`, `295–305`. Favoriten/Unread/Tags werden ausschließlich auf bereits geladenen Bookmarks gefiltert. Bei null passenden geladenen Einträgen wird „No matches“ gerendert; der einzige „Load more“-Button liegt im anderen Zweig. Repro: Mindestens 21 Inbox-Einträge, nur der älteste favorisiert, erste Seite laden, „Favourites“ wählen → „No matches“, ohne Möglichkeit, Seite 2 zu laden. Standardseite umfasst 20 Einträge (`packages/shared/types/bookmarks.ts:288`). **Deterministisch.**

3. **P2 – Mobile Archivierung verschwindet auch bei fehlgeschlagener Speicherung; Favoriten bleiben ebenfalls falsch.**  
   `MobileSearchHome.tsx:371–375`, `473–479`, `570–576`; lokale Archivliste `65`, Filter `108`. `updateBookmark` ist `mutate`, wird nicht abgewartet; direkt danach versteckt `onArchive()` den Eintrag dauerhaft für diesen Komponentenmount. Kein `onError`, Rollback oder serverabhängiger Erfolgspfad. Favoriten ändern separaten lokalen State ohne Rollback und ohne Synchronisierung bei neuen Props. Repro: Netzwerk ausfallen lassen → archivieren/favorisieren → UI behauptet Erfolg, Serverzustand bleibt unverändert. Selbst ein späterer Query-Refetch entfernt die lokale Archiv-Sperre nicht. **Deterministischer Fehlerpfad.**

4. **P2 – Mobile Queue aktualisiert ausstehende Zusammenfassungen nicht.**  
   `MobileSearchHome.tsx:70–85`, `283–292`, `354–375`, `598–623`. Queue-Query besitzt keinen Polling-Mechanismus; ihre `DenseRow` verwendet unmittelbar das Page-Bookmark statt `useLiveBookmark`. Ein während des Crawlens geöffneter leerer Suchscreen bleibt damit bei „SUMMARISING“, auch wenn der Job fertig ist; erforderlich ist ein unabhängiger Refetch/Reload/Fokuswechsel. Desktop löst denselben Vertrag explizit mit `useLiveBookmark` (`apps/web/lib/dense/useLiveBookmark.ts:14–26`). Der globale `staleTime: 60_000` (`packages/shared-react/providers/trpc-provider.tsx:18–24`) startet keinen Timer-Refetch. **Deterministisch bei unverändertem Fokus ohne weitere Mutation.**

5. **P2 Performance – Vollständige Highlights pro Listeneintrag laden, um nur deren Anzahl anzuzeigen.**  
   `apps/web/components/dashboard/dense/DenseBookmarkRow.tsx:45–53`. Jeder geladene Row führt `highlights.getForBookmark` aus. Der Server autorisiert jeden Bookmark einzeln (`packages/trpc/routers/highlights.ts:61–69`; `routers/bookmarks.ts:115–130`) und lädt anschließend alle Highlight-Datensätze einschließlich Text/Notiz (`packages/trpc/models/highlights.repo.ts:45–49`). HTTP-Batching beseitigt weder diese einzelnen Datenbankabfragen noch die übertragenen Inhalte. Mit wachsender Pagination wachsen Query-Observer und unnötige Payloads linear. Zusätzlich passiert das auf Mobilgeräten für die versteckte Desktop-Suchliste: `apps/web/app/dashboard/search/page.tsx:78`, `160–167`, `201–206`. **Mehrarbeit statisch belegt; Ausmaß ungemessen.**

6. **P2 – Nach Wechsel des Breakpoints kann ein geöffnetes Preview vollständig verschwinden.**  
   `apps/web/app/dashboard/@modal/(.)preview/[bookmarkId]/page.tsx:34–38`, `47–53`; `MobileBookmarkDetail.tsx:233`. `isMobile` wird nur einmal beim Mount ausgewertet. Öffnet man unter 640 px ein Bookmark und vergrößert anschließend über 640 px, bleibt ausschließlich `MobileBookmarkDetail` gemountet, das sich selbst durch `sm:hidden` versteckt. Die URL bleibt im Preview, eine Desktop-Ansicht wird nicht gerendert. Repro: schmales Fenster → Preview öffnen → Fenster verbreitern/Tablet drehen. **Deterministisch aus React-State/CSS.**

7. **P2 – Unterlisten sind über die mobile Listenoberfläche unerreichbar.**  
   `apps/web/components/dashboard/dense/mobile/MobileBrowse.tsx:26`, `114–173`; `apps/web/app/dashboard/lists/page.tsx:18`, `45–46`. MobileBrowse verwirft alle Listen mit `parentId`; Zeilen navigieren direkt zu Parent-Bookmarks, besitzen keine Expansion oder Kindnavigation. Auch `apps/web/app/dashboard/lists/[listId]/page.tsx:55–63` rendert nur `DenseFiles`. Die vorhandene rekursive Listenansicht ist auf Mobilgeräten versteckt. Repro: Liste A mit Unterliste B anlegen → mobiles „Browse“ → B lässt sich nicht auswählen. **Deterministisch.**

8. **P2 – Mobile Suchfehler werden als „No matches“ ausgegeben.**  
   `MobileSearchHome.tsx:88–96`, `228–242`. Der Suchhook liefert `error`, aber diese Komponente liest und rendert ihn nicht. Bei fehlgeschlagenem Request endet `isPending`, `data` fehlt, `visible` ist leer → „No matches“. Desktop hat dafür explizit Fehlertext und Retry (`apps/web/app/dashboard/search/page.tsx:126–143`), ist mobil jedoch CSS-versteckt. Repro: Suchbackend ausfallen lassen → mobil suchen → falsches Nulltreffer-Ergebnis ohne Wiederholungsmöglichkeit. **Deterministischer Fehlerpfad.**

Weitere statisch bestätigte, schwächere Kandidaten: Mobile-Row-Plusbutton ohne Handler (`MobileSearchHome.tsx:550–568`); Kollision eigener Tagnamen `all`, `unread`, `favourites` mit Filter-IDs (`104–112`); Sidebar-Tags ausschließlich aus `initialTags` (`DenseSidebar.tsx:423–436`, bereits in MISTAKES dokumentiert).

Geprüft: Dense list/grid/query composition, live polling, row menus, detail/mobile detail, Preview-Routen, mobile search/browse/navigation, Tags-Rename/Merge/Delete, Listenpicker und Sidebar-Datenfluss.

Verworfen: SSR-Cursor-V1/V2-Mismatch (`useCursorV2` laut Schema inzwischen wirkungslos); vermeintlicher sofortiger `getBookmark`-Fetch für jede Row (60 Sekunden `staleTime` + `initialData`); ungeöffnete Listenpicker mit unbedingten Netzabfragen (korrekt `enabled: open`); doppelte gleichlautende Search-Requests bloß wegen Desktop/Mobile-Mount (gleicher React-Query-Key dedupliziert).

---

## API / Datenbank

Runde 1 abgeschlossen, Worktree unverändert. Nur statische Analyse; keine Tests, Server oder Browser ausgeführt.

1. **P1 – Zyklische Listenhierarchie blockiert den Server beim rekursiven Löschen.**  
   `packages/trpc/models/lists.ts:622–628`, Ursache `:634–647`; Schema `packages/shared/types/lists.ts:90–94`.  
   **Szenario:** A erstellen, B mit Parent A erstellen, A per API auf Parent B setzen; anschließend `lists.delete({listId:A,deleteChildren:true})`. Das Schema verbietet nur direkte Selbstreferenz, das Modell prüft keine Vorfahren. `getChildren()` besitzt weder Besuchsmenge noch Iterationsgrenze und füllt synchron Queue und Ergebnis immer weiter. Erwartet: Zyklus beim Update ablehnen beziehungsweise sicher abbrechen. REST-PATCH führt zum selben Modell; Aufruf des problematischen Traversals: `packages/trpc/routers/lists.ts:126–129`.  
   **Konfidenz:** hoch. UI blendet Nachkommen im Parent-Selector aus (`EditListModal.tsx:298–300`); deshalb API oder konkurrierende Änderungen als Trigger nennen. Runtime-Nachweis nur isoliert, da Endlosschleife/OOM möglich.

2. **P1 – Listen-Merge entkoppelt fremde Bookmarks von ihrer Freigabe und erhält Zugriff nach Austritt.**  
   `packages/trpc/models/lists.ts:1155–1166`; relevante Relation `packages/db/schema.ts:577–583`.  
   **Szenario:** A besitzt Listen S und T. B fügt als Editor sein eigenes Bookmark zu S hinzu. A merged S nach T. B verlässt S oder wird entfernt. Beim Merge werden nur `bookmarkId` und `listId` kopiert; `listMembershipId` bleibt null. Der Austritt löscht per FK-Cascade lediglich die ursprüngliche, an Bs Mitgliedschaft gebundene Relation. T behält Bs Bookmark; A und die Teilnehmer von T können weiterhin darauf zugreifen. Direkter Transfer fremder Bookmarks wäre durch `ensureBookmarkOwnership` im Add-Endpunkt gesperrt (`routers/lists.ts:140–144`).  
   **Konfidenz:** hoch für den verbliebenen Zugriff. Produktentscheidung offen: gewünschte Merge-Policy für Kollaborator-Inhalte; vorhandene Merge-Tests decken nur eigene Bookmarks und verbotene Collaborator-Merges ab. Keine Absicht unterstellen.

3. **P2 – Öffentliche Listen und RSS verlieren alle Beiträge von Kollaboratoren.**  
   `packages/trpc/models/lists.ts:231–239` und `:248`; Filter in `packages/trpc/models/bookmarks.ts:643–648`.  
   **Szenario:** Geteilte Liste enthält ein Bookmark des Besitzers und eines Editors; Liste öffentlich machen oder per RSS-Token lesen. `getPublicListContents()` sammelt alle Mitgliedschafts-IDs, lädt sie dann ausschließlich über `ids` im Kontext des Listenbesitzers. `loadMulti()` fügt ohne `listId` zwingend `bookmarks.userId = Besitzer` hinzu. Das Editor-Bookmark fehlt, während `numItems` weiterhin beide zählt. Intern lädt der List-Pfad dagegen alle Mitglieder korrekt.  
   **Konfidenz:** hoch. Zu verifizieren: sichtbare Darstellung auf Public-Seite und RSS; falls absichtliche Beschränkung, muss zumindest der Zähler angepasst und das Verhalten erklärt werden.

4. **P2 – Jeder Listenabruf lädt große Inhaltsspalten mehrfach, obwohl `includeContent=false`.**  
   `packages/trpc/models/bookmarks.ts:679–690`, Wegwerfen erst `:707–711` und `:743–745`; Deduplizierung `:761–778`.  
   **Szenario:** Ein PDF mit großem extrahiertem Text oder Link mit inline HTML und mehreren Tags/Assets wird in Dashboard oder Suche geladen. Das unqualifizierte `.select()` über beide unabhängigen 1:n-Joins erzeugt pro Bookmark `Tags × Assets` Ergebniszeilen, jeweils inklusive vollständiger `bookmarkAssets.content`/`bookmarkLinks.htmlContent` und weiterer großer Linkspalten. Erst JavaScript entfernt Duplikate und setzt Inhalte auf null. Beispiel: 8 Tags × 5 Assets = 40 Kopien der breiten Bookmark-Zeile für einen Listeneintrag.  
   **Konfidenz:** hoch für unnötige Arbeit und Multiplikation; tatsächliche Latenz/RAM-Auswirkung muss anhand repräsentativer Daten gemessen werden. Kein behaupteter Benchmark.

5. **P2 – Textinhalt lässt sich über die reguläre Update-API nicht leeren.**  
   `packages/trpc/routers/bookmarks.ts:622–638`; erlaubter Input `packages/shared/types/bookmarks.ts:344–345`; REST-Aufruf `packages/api/routes/bookmarks.ts:317–329`.  
   **Szenario:** Text-Bookmark mit Inhalt anlegen, `PATCH /bookmarks/:id` mit `{"text":""}` oder `{"text":null}` senden. Das Schema erlaubt beide Werte, aber `if (input.text)` überspringt die Änderung; erfolgreicher Response enthält alten Inhalt. Erwartet: explizit übergebenen leeren Inhalt speichern oder den Wert klar ablehnen. Der veraltete Endpunkt `updateBookmarkText` kann `""` dagegen speichern (`:769–775`).  
   **Konfidenz:** hoch; API-Reproduktion ausstehend.

6. **P2 – URL-Existenzprüfung übersieht bereits gespeicherte URLs mit Slash vor Querystring.**  
   `packages/trpc/routers/bookmarks.ts:1187–1208`.  
   **Szenario:** Gespeichert ist `https://example.com/article/?x=1`; `checkUrl` wird mit derselben URL aufgerufen. Normalisierung entfernt den Slash zu `/article?x=1`; der vorgeschaltete SQL-Filter sucht nun `LIKE 'https://example.com/article?x=1%'` gegen die rohe gespeicherte URL. Sie kommt nicht in die Kandidatenmenge und wird nie durch den anschließenden normalisierten Vergleich geprüft. Ergebnis fälschlich `bookmarkId:null`.  
   **Konfidenz:** hoch; auch REST `/bookmarks/check-url` betroffen. Keine Aussage zur deduplizierenden Create-Logik, die separat arbeitet.

7. **P2 – Negierter Listenfilter leert Ergebnisse nach Umbenennen/Löschen der referenzierten Liste.**  
   `packages/trpc/lib/search.ts:146–157`, inkonsistenter Vergleichspfad `:176–181`.  
   **Szenario:** Suche oder Smart-Liste `-list:Inbox` verwenden, anschließend Inbox löschen oder umbenennen. Wenn die Liste existiert und leer ist, liefert der inverse Filter alle eigenen Bookmarks. Wenn keine Liste dieses Namens existiert, liefert er unmittelbar `[]`, ohne `matcher.inverse` zu beachten. Andere Bedingungen in einer AND-Suche verlieren dadurch ebenfalls alle Ergebnisse.  
   **Konfidenz:** hoch für die Inkonsistenz; Suchparser-Syntax vor Runtime-Reproduktion anhand UI/Parser bestätigen. Erwartet ist Komplement der leeren Mitgliedermenge oder eine explizite ungültige-Referenz-Meldung.

Gelesene Bereiche: Bookmark-Laden/CRUD/Suche/Sharing; List-Modelle, Router, Hierarchie, Merge, Public/RSS; Tag-CRUD/Merge; relevante SQLite-Relationen und vorhandene Bookmark-/List-/SharedList-Tests; REST-Bookmarks/Listen.

Verworfene beziehungsweise nicht hochgestufte Hypothesen:

- Aufsteigende Pagination ist nicht einfach wegen äußerem `DESC` kaputt: anschließend erfolgt JavaScript-Sortierung.
- Collaborator-Entfernung ohne explizites Bookmark-DELETE ist korrekt durch `listMembershipId ON DELETE CASCADE` abgedeckt.
- Smart-List-Rekursion besitzt eine kopierte Besuchsmenge und Tiefengrenze; der belegte Zyklus betrifft die separate Parent-Hierarchie.
- Initial scheinbar falsche Screenshot-Präferenz wird beim weiteren Asset-Loop korrigiert.
- Hybrid-Suche begrenzt absichtlich ihren Kandidatenpool; ohne gegenteilige Produktspezifikation kein eigenständiger Bugbericht.
- Merge einer leeren Liste könnte wegen `.values([])` fehlschlagen; ohne lokalen Drizzle-Lauf nur Reservehypothese, nicht als bestätigten Befund werten.

---

## Hintergrundjobs / Worker

Read-only audit of `71d42740`; worktree remained clean. No tests, app, containers or network services run.

**8 source-backed findings**

1. **P2 — Imports never finish when tagging is skipped. High confidence.**  
   `apps/workers/workers/importWorker.ts:604–609` accepts only `null`, `"success"` and `"failure"` as terminal tagging states. `inference/inferenceWorker.ts:78–80` now writes `"skipped"` for disabled tagging, missing provider or missing content (`tagging.ts:591–595,616–620`; `inferenceWorker.ts:111–117`). Such imported items remain `"processing"` indefinitely. The stale reset explicitly excludes items with `resultBookmarkId` (`importWorker.ts:718–722`). Once 50 accumulate, capacity is exhausted until their one-hour age drops them out of capacity counting (`108–110,683–700`), while sessions still never complete. Static causal chain complete.

2. **P2 — Failed RSS bookmark creation permanently discards that entry. High confidence.**  
   `apps/workers/workers/feedWorker.ts:361–374` inserts every GUID into `rssFeedImportsTable`, including rejected `createBookmark` calls with `bookmarkId: null`. Future runs exclude every GUID already present, without checking whether a bookmark exists (`271–286`). Trigger: transient database/queue error, quota reached midway, or other recoverable creation failure. Once recorded, the item is never retried; job still returns `"success"` (`380`). A pre-fetch quota check does not cover partial failures inside the batch.

3. **P2 — Semantic vectors stay outdated after summaries, tags and content edits. High confidence.**  
   `apps/workers/workers/embeddingsWorker.ts:262–274` embeds title, tags, summary and note, but the initial workflow deliberately embeds **before** tagging (`483–496`), with summarization independently enqueued afterward (`crawlerWorker.ts:367–391`). Tag completion only reindexes lexical search (`inference/tagging.ts:674–694`); summary completion likewise (`inference/summarize.ts:267–279`). `packages/trpc/routers/bookmarks.ts:742–754` also only reindexes lexical search after editing content/title/note. Repository-wide `EmbeddingsQueue.enqueue` search confirms no mutation-driven vector refresh. Newly generated tags are absent from the initial vector, summaries are absent when generated later, and edited text continues matching its previous meaning until manual reindex/recrawl.

4. **P2 — Setting webhook retries to zero disables all delivery. High confidence.**  
   `apps/workers/workers/webhookWorker.ts:129–134` sets `maxRetries=retryTimes` then performs requests only while `attempt < maxRetries`. `WEBHOOK_RETRY_TIMES=0` is explicitly accepted (`packages/shared/config.ts:247`) and documented as number of **retries** (`docs/docs/03-configuration/01-environment-variables.md:228`). Result: zero initial attempts, job completes normally. Default `3` produces only three total attempts instead of initial attempt plus three retries. Worker timeout calculation itself uses `retryTimes + 1` (`webhookWorker.ts:49–52`), supporting intended semantics.

5. **P2 — `$aiTags` contains human tags because it filters the wrong counter. High confidence.**  
   `apps/workers/workers/inference/tagging.ts:187–190` filters on `tag.numBookmarksByAttachedType.human`, effectively copying the user-tag criterion (`191–194`). A purely human-attached tag with `human > 0, ai = 0` is included in `$aiTags`; AI tags can also be incorrectly excluded when `human` is explicitly zero. Docs define `$aiTags` as AI-generated tags (`docs/docs/03-configuration/01-environment-variables.md:132`). Settings preview repeats the same defect in `apps/web/components/settings/AISettings.tsx:739–742`, so preview does not reveal it.

6. **P2 — RSS processing has no per-feed concurrency bound and quadratic deduplication. Static performance defect; impact needs measurement.**  
   `apps/workers/workers/feedWorker.ts:302–310` starts `createBookmark` for **every** new feed entry simultaneously. Queue worker concurrency `1` only limits feed jobs, not this fan-out. The tag phase repeats unbounded dispatch (`337–358`). Before that, `newEntries` does `existingEntries.some` for every item (`281–286`): O(N×M), quadratic on unchanged large feeds. Trigger: large first import or feed containing thousands of entries. Produces thousands of simultaneous tRPC/DB/queue operations in one worker; no pagination or item cap found in the execution path. Exact latency/memory effect unmeasured.

7. **P2 — Automatic video summarization overwrites a manually chosen bookmark title. High confidence.**  
   `apps/workers/workers/inference/summarize.ts:267–274` writes the generated title directly into `bookmarks.title` whenever transcript-summary JSON contains a nonempty title. The initial query fetches no existing bookmark title (`37–55`), so it cannot preserve a user title or detect a concurrent user rename during inference. Trigger: create/import video with custom title and transcript, or edit its title while automatic summarization is queued/in progress. The resulting title is replaced without checking user intent. The crawler explicitly documents that user title should take precedence (`crawlerWorker.ts:307–312`), but this subsequent write bypasses it.

8. **P2 — A deleted bookmark’s vector can be resurrected by an outstanding embedding job. High confidence in race; runtime reproduction pending.**  
   `apps/workers/workers/embeddingsWorker.ts:461–494` performs remote generation then queues an `"index"` payload containing a snapshot. `case "index"` writes that payload without checking bookmark existence (`379–385`). Deleting the bookmark queues `"delete"` immediately after deleting the DB row (`packages/trpc/models/bookmarks.ts:1110–1137`). Interleaving: embedding has fetched bookmark → user deletes, enqueuing delete → generation finishes, enqueuing index → delete runs before late index → orphan vector survives. This is possible even with default single embedding worker because the deletion enters the queue before the later index child. DB-backed search hydration may hide the ghost, but vector storage and limited neighbor candidate slots remain polluted.

**Scope inspected:** worker startup/shutdown, crawler initialization/post-crawl dispatch/context reaper, inference/tagging/summarization, embeddings/search workers, feeds/imports/webhooks, shared queue interfaces/deferred queues; relevant bookmark mutation/deletion callers, configuration and Meilisearch batching to validate causal paths.

**Rejected or held back:** double browser initialization is guarded by a shared `initPromise`; transient vector-provider initialization failures already clear their cached promise; same-batch Meilisearch add/delete deduplication correctly retains the latest operation. Generic retry duplication and timeout-cancellation concerns need queue-runner/backend semantics and were not reported as proven bugs.

---

# Runde 2

## Oberfläche / Web (Dense-UI)

Runde 2: sechs neue aktive Findings. Worktree sauber; keine Änderungen oder Tests.

1. **P2 – Checkbox-Klick kann Markdown-Codebeispiele statt der gewählten Aufgabe verändern.**  
   `apps/web/components/ui/markdown/markdown-readonly.tsx:39–61`: Checkbox-Index kommt aus gerenderten `.todo-checkbox`-Elementen, die Ersetzung zählt dagegen alle Regex-Treffer im Markdown, auch innerhalb von Codefences. Beispiel: zuerst Codeblock mit `- [ ] Beispiel`, danach echte Aufgabe `- [ ] Einkauf`. Klick auf Einkauf hat DOM-Index 0 und ändert den Codeblock. `BookmarkMarkdownComponent.tsx:30–35`, `39–42` persistiert diesen falschen Gesamttext. **Deterministisch aus Parser/Regex-Unterschied.**

2. **P2 – Zwei schnelle Checkbox-Änderungen überschreiben sich.**  
   `markdown-readonly.tsx:49–63`; `apps/web/components/dashboard/bookmarks/BookmarkMarkdownComponent.tsx:19–35`, `39–45`. Beide Klicks berechnen den neuen vollständigen Text aus derselben unveränderten `markdown`-Prop. Die Readonly-Checkboxen werden während `isPending` weder gesperrt noch optimistisch aktualisiert. Repro: zwei unterschiedliche Aufgaben anklicken, bevor die erste Mutation/refetch abgeschlossen ist → zweiter Gesamttext enthält den alten Zustand der ersten Aufgabe und kann ihn wieder überschreiben. **Belegbarer Konkurrenzfehler; genaue Reihenfolge benötigt Laufzeit-Repro.**

3. **P2 – Gespeicherte Textbookmarks besitzen im aktuellen Dense-UI keinen Editor mehr.**  
   `apps/web/components/dashboard/preview/TextContentSection.tsx:32–35` rendert `BookmarkMarkdownComponent` mit standardmäßig `readOnly=true` (`BookmarkMarkdownComponent.tsx:7–10`, `39–46`). Dense-Overflow öffnet lediglich `EditBookmarkDialog` (`dense/DenseRowOverflowMenu.tsx:67–71`, `124–126`), dessen Formular kein `text`-Feld besitzt; es bearbeitet die separate Zusatznotiz `note`, nicht den eigentlichen Bookmark-Inhalt. `BookmarkedTextEditor` wird ausschließlich durch das alte `BookmarkOptions.tsx:491–495` eingebunden; dieser alte Menüpfad wird von Dense-Rows/Details nicht genutzt. Repro: Textbookmark anlegen → Inhalt später korrigieren → nur Titel/Tags/Zusatznotiz zugänglich. **Statisch über aktive Aufrufketten bestätigt.**

4. **P2 – Upload-Fehlerbehandlung wirft bei üblichen Netzwerk-/Proxyfehlern selbst eine Exception.**  
   `apps/web/lib/hooks/upload-file.ts:21–32`: `fetch` kann z. B. `TypeError: Failed to fetch` werfen; HTTP-Fehler können HTML/Plaintext enthalten. `onError` parst jedoch jedes `error.message` ungeprüft als JSON und danach als `{error:string}`. Dadurch wird der eigentliche `onError`-Callback (`33–35`) nicht erreicht. Betroffen unter anderem Avatar-Upload (`settings/UserAvatar.tsx:36–52`) und Attachments (`preview/AttachmentBox.tsx:99–105`). Repro: offline hochladen oder Proxy-413/502 → zusätzlicher Parsingfehler statt vorgesehener Fehlermeldung. **Deterministischer Fehlerpfad.**

5. **P2 – Highlight-Navigation funktioniert im Standardzustand des Detailviews nicht.**  
   `apps/web/components/dashboard/highlights/HighlightCard.tsx:38–44` sucht lediglich ein bereits vorhandenes `[data-highlight-id]` und scrollt dorthin. `preview/HighlightsBox.tsx:43–46` aktiviert diese Klickfunktion immer. Im Dense-Detail ist „Saved page“ für Links standardmäßig geschlossen, der Reader samt Highlight-DOM wird erst bei `contentOpen` gemountet (`dense/DenseBookmarkDetail.tsx:149–151`, `486`, `509–519`). Repro: Bookmark mit Highlight öffnen, Highlight anklicken → keine Aktion, weil das Ziel nicht existiert. Dasselbe Problem bleibt bei geöffneter Screenshot/PDF-Sektion bestehen. **Deterministisch.**

6. **P2 – AI-Provider-Speichern löscht Eingaben, die während des Requests weiterbearbeitet werden.**  
   `apps/web/components/settings/AIProviderSettings.tsx:125–143`, `145–152`, `294–298`. Nur der Save-Button ist während der Mutation gesperrt; Base-URL-/Modellfelder bleiben editierbar (`62–89`). Bei Erfolg invalidiert die Mutation den Query; dessen neue Antwort setzt sämtliche Formfelder ungeprüft zurück. Repro: Textmodell A speichern, während der langsamen Antwort B eintippen → erfolgreicher Refetch setzt das Feld wieder auf A, B geht verloren. Ein währenddessen neu eingegebener API-Key wird zusätzlich direkt von `setOpenaiApiKey("")` gelöscht. **Deterministisch bei entsprechendem Ablauf.**

**Performance-Kandidat, noch ohne Bundlemessung:** `BookmarkMarkdownComponent.tsx:1` importiert den gesamten Lexical-Editor statisch, obwohl aktive Dense-Textansichten ihn ausschließlich readonly verwenden. `markdown-editor.tsx:4–32` zieht mehrere Lexical-Pakete/Plugins ein. Statische Abhängigkeit bestätigt; tatsächliche zusätzliche Produktions-Chunkgröße wurde nicht gemessen.

**Verworfene aktive Findings:** Bulk-Teilfehler und unnötige `BulkTagModal`-Queries existieren im Code, aber die aktuelle App bindet `BookmarksGrid`/`Header`/`GlobalActions` nicht aktiv ein. Deshalb keine Behauptung, dass diese Altpfade gegenwärtig Laufzeitperformance verschlechtern. Raw-Markdown-Truncation auf `getFirstChild()` nicht als bestätigt gemeldet, weil Lexicals tatsächliche Plaintext-Knotenstruktur dafür geprüft werden müsste.

---

## API / Datenbank

Runde 2 abgeschlossen; Worktree weiterhin sauber. Acht neue Befunde, ausschließlich statisch validiert, ohne Tests oder App-Ausführung.

1. **P1 – Entzogene Adminrechte bleiben in bestehenden Sessions wirksam.**  
   **Primär:** `apps/web/server/auth.ts:281–295`.  
   **Kette:** `apps/web/server/api/client.ts:45–59` → `packages/trpc/index.ts:220–225`; Demotion `packages/trpc/routers/admin.ts:545–571`.  
   Beim Login werden ID und Rolle ins JWT geschrieben; spätere JWT-/Session-Aufrufe prüfen den Nutzer nicht erneut. Der Request-Kontext übernimmt diese Daten unverändert, die Admin-Middleware vertraut ausschließlich `ctx.user.role`.  
   **Trigger:** Admin B ist eingeloggt; Admin A stuft B auf `user` zurück. Bs bestehende Session kann weiterhin Admin-Endpunkte nutzen. Auch Löschen von B entfernt zwar die DB-Zeile, aber nicht dessen bereits ausgestellte Adminberechtigung; Endpunkte wie `admin.stats` oder `admin.updateUser` benötigen keine existierende Zeile des Aufrufers.  
   **Konfidenz:** hoch. Sandbox-Reproduktion mit zwei getrennten Sessions ausstehend. Passwortänderung/-Reset hat denselben fehlenden Session-Widerruf, aber als gemeinsame Ursache führen, nicht separat zählen.

2. **P2 – Gleichzeitige Uploads können das Speicherlimit überschreiten.**  
   **Primär:** `packages/api/utils/upload.ts:81–117`; Quotenprüfung `packages/shared-server/src/services/quotaService.ts:71–82`.  
   Die Quotenprüfung liest die bisherige Summe und stellt nur ein In-Memory-Token aus. Erst nach vollständigem Schreiben einer temporären Datei wird die neue Asset-Zeile eingefügt. Zwischen Prüfung und Buchung gibt es weder Reservierung noch Transaktion oder erneute Prüfung.  
   **Trigger:** 90 MB von 100 MB belegt; zwei parallele Uploads à 8 MB bestehen beide gegen 90 MB und buchen anschließend insgesamt 106 MB.  
   **Konfidenz:** hoch für die Race-Bedingung. Reproduktion mit kontrollierter paralleler Verarbeitung ausstehend. Tokenprüfung in `packages/shared/assetdb.ts:720–733` prüft nur die Nutzerbindung und reserviert ebenfalls nichts.

3. **P2 – Fehlgeschlagene Speicherung hinterlässt Assets, die weiter Speicherquote verbrauchen.**  
   **Primär:** `packages/api/utils/upload.ts:104–125` und `:133–142`.  
   Die DB-Zeile inklusive `size` wird vor `saveAssetFromFile()` dauerhaft geschrieben. Bei Dateisystem-/S3-Fehlern beseitigt `finally` nur die temporäre Datei, nicht die Asset-Zeile. Die Quote summiert weiterhin diese Zeilen (`quotaService.ts:85–94`).  
   **Trigger:** Upload bei vorübergehend fehlgeschlagenem S3-Put oder fehlendem Platz im endgültigen Asset-Verzeichnis. Nutzer erhält einen Fehler, aber die fehlgeschlagene Datei steht als Asset in der Verwaltung und reduziert seine Quote. Wiederholungen addieren weitere Einträge.  
   **Konfidenz:** hoch. Fehler-Injektion im isolierten Speicherbackend ausstehend.

4. **P2 – Download-Adapter ignoriert Backpressure und Abbruch.**  
   **Primär:** `packages/api/utils/upload.ts:28–39`; Verwendung `packages/api/utils/assets.ts:62–73`.  
   `toWebReadableStream()` schaltet den Node-Stream per `data`-Listener in fließenden Modus und ruft für jeden Chunk `enqueue()` auf. Es existieren weder `pull`/`pause`/`resume` nach Bedarf noch ein `cancel`, das die Quelle beendet. Dadurch kann das Lesen schneller sein als die Netzwerkübertragung, und die JS-Warteschlange hält den ungelesenen Rest des Assets. Ein abgebrochener Empfänger beendet die Quelldatei/S3-Anfrage nicht.  
   **Trigger:** Große PDF-/Video-/Archivdatei über langsame Verbindung herunterladen oder früh abbrechen; mehrere Downloads vervielfachen den unnötigen Speicher-/I/O-Bedarf. Lokale Quelle ist ein regulärer `fs.createReadStream` (`packages/shared/assetdb.ts:258–278`).  
   **Konfidenz:** hoch für fehlende Fluss-/Abbruchsteuerung; konkrete RAM-Spitzen und Fehler nach Cancel noch zu messen.

5. **P2 – Asset-Range-Handling erzeugt ungültige Bereiche und falsche Längen.**  
   **Primär:** `packages/api/utils/assets.ts:46–61`.  
   **Trigger A:** `Range: bytes=-500`. Der Parser produziert `start=NaN`, `end=500`, statt die letzten 500 Bytes zu lesen; dieser Wert gelangt direkt zum Dateistream.  
   **Trigger B:** Assetgröße 1000 Bytes, `Range: bytes=0-999999`. Der Response behauptet `Content-Length:1000000` und einen Endpunkt außerhalb der Datei, obwohl nur 1000 Bytes existieren. Kein Clamping, kein Bereichscheck und kein kontrollierter 416-Pfad.  
   **Konfidenz:** hoch. Reale PDF-/Medienclient-Symptome und Verhalten beider Speicherbackends ausstehend.

6. **P2 – Neue Nutzer umgehen die konfigurierte Sperre für Browser-Crawling.**  
   **Primär:** `packages/trpc/models/users.ts:114–126`.  
   `createRaw()` übernimmt die kostenlosen Bookmark- und Storage-Quoten, aber nicht `serverConfig.quotas.free.browserCrawlingEnabled`. Die DB-Spalte hat keinen Default (`packages/db/schema.ts:61–63`), bleibt also `NULL`. Der Crawler beschränkt nur einen expliziten `false`-Wert (`apps/workers/workers/crawler/crawlPage.ts:602–617`); `NULL` startet weiterhin den Browser.  
   **Trigger:** `FREE_BROWSER_CRAWLING_ENABLED=false`, neuen Nutzer registrieren und Link speichern. Der Nutzer erhält trotzdem den ressourcenintensiven Browserpfad. Sowohl Passwort- als auch OAuth-Registrierung verwenden `createRaw()`.  
   **Konfidenz:** hoch. Konfigurations-/Sandbox-Nachweis ausstehend. Stripe-Synchronisation setzt denselben Wert korrekt; das Problem liegt bei der Erstellung.

7. **P2 – Netscape-Export verändert bereits codierte URLs.**  
   **Primär:** `packages/shared/import-export/exporters.ts:129–133`; Export-Aufruf `apps/web/app/api/bookmarks/export/route.tsx:99–102`.  
   `encodeURI()` wird auf bereits gespeicherte URLs angewandt. Vorhandene Prozentcodierungen werden erneut codiert.  
   **Trigger:** Gespeicherter Link `https://example.com/a%20b?x=%2F` wird mit `%2520` und `%252F` exportiert. Import in einen Browser führt dadurch zu einer anderen URL; betroffen sind beispielsweise URLs mit codierten Leerzeichen, Slashes oder Signaturparametern. HTML-Escaping wäre separat vorhanden, daher ist die erneute URL-Codierung nicht für Attributsicherheit erforderlich.  
   **Konfidenz:** hoch; Roundtrip im Browserimport ausstehend.

8. **P2 – Export lädt und hält sämtliche Volltexte, obwohl beide Exportformate sie verwerfen.**  
   **Primär:** `apps/web/app/api/bookmarks/export/route.tsx:31–47`; Verbraucher `packages/shared/import-export/exporters.ts:44–79` und `:109–133`.  
   Der Export lädt jede Seite mit `includeContent:true` und sammelt alle vollständigen Bookmarks im RAM. Das löst zusätzlich Reads aller ausgelagerten HTML-Assets aus (`packages/trpc/models/bookmarks.ts:834–848`). JSON exportiert bei Links nur die URL und schließt Asset-Bookmarks aus; Netscape nutzt nur Link-Metadaten. Die geladenen HTML-/PDF-Inhalte werden vollständig weggeworfen. Zusätzlich kopiert `bookmarks = [...bookmarks, ...resp.bookmarks]` den gesamten bisherigen Arraybestand bei jeder Seite.  
   **Trigger:** JSON- oder Netscape-Export einer großen Sammlung mit archivierten Artikeln/PDFs. Unnötige Massendateizugriffe und Volltextspeicher werden durch die Sammlungsgröße bestimmt, nicht durch die kleine Exportdatei.  
   **Konfidenz:** hoch; Laufzeit-/RAM-Gewinn noch nicht gemessen. Als eigenständigen Export-Aufruferbefund zum allgemeinen breiten Bookmark-JOIN aus Runde 1 abgrenzen.

**Offen beziehungsweise verworfen:**

- Import `rootListId`/`listIds` ohne Eingangsprüfung ist **kein bestätigter Rechte-Bypass**: Der Worker verwendet letztlich `caller.lists.addToList()` und damit dessen Eigentums-/Rollenchecks (`importWorker.ts:368–375`).
- Admin-Quotenänderung mit `manualTierName:null` kann aktive Paid-Quoten zurücksetzen (`subscriptions.ts:639–658`); Policy-/UI-Aufrufkontext ungeklärt, daher nicht hochgestuft.
- Asset-Ersetzung mit identischem `oldAssetId/newAssetId` löscht die Zeile und Datei (`models/assets.ts:150–164`); Eingabeschema verhindert Gleichheit nicht. Konkreter normaler UI-Trigger ungeklärt; Reserve für API-Robustheitsprüfung.
- Import-Statuswechsel verwenden gelesenen Zustand statt atomarem Vergleich. Ein nachweisbares vom Worker nicht geheiltes Endresultat konnte in dieser Runde nicht isoliert werden.
- Bestehende Tests gelesen, keine ausgeführt. Keine Änderungen.

---

## Hintergrundjobs / Worker

Runde 2 abgeschlossen, Worktree weiterhin sauber. Keine Tests, Änderungen oder laufenden Dienste verwendet. Sieben neue Befunde:

1. **P1 — Redis beim Prozessstart unerreichbar: API-Anfragen hängen statt Fail-open. Hohe Sicherheit.**  
   `packages/plugins/ratelimit-redis/src/index.ts:156–162` konfiguriert endlose Wiederverbindung (`reconnectStrategy: () => 3000`). `initializeClient()` wartet ohne Gesamtdeadline auf `redis.connect()` (`182–198`); sämtliche weiteren Aufrufer warten auf dasselbe Initialisierungspromise (`202–219`). Der vorgesehene Catch/Backoff wird bei dauernd fehlschlagender Verbindung nicht erreicht. tRPC wartet vor jeder betroffenen Operation auf `getRateLimitClient()` (`packages/trpc/lib/rateLimit.ts:31–35`).  
   Trigger: Redis ist beim ersten Zugriff nicht erreichbar oder Zugangsdaten werden abgewiesen. Keine Wiederherstellung ohne Redis-Erholung. `disableOfflineQueue` hilft nicht gegen wartendes `connect()`. Gegen den tatsächlich verwendeten Redis-5.11.0-Verbindungsloop geprüft. [Versionsquelle](https://raw.githubusercontent.com/redis/node-redis/redis@5.11.0/packages/client/lib/client/socket.ts)

2. **P1/P2 — Ollama kann vor Empfang der HTTP-Header weder durch Fetch- noch durch Job-Timeout abgebrochen werden. Hohe Sicherheit.**  
   `packages/shared/customFetch.ts:15–18` setzt ein Timeout-Signal und überschreibt es anschließend mit `...init`. Ollama-Streaming liefert immer ein eigenes `init.signal`. Zusätzlich ruft der Jobabbruch lediglich `this.ollama.abort()` auf (`packages/shared/inference.ts:528–535`): Ollama 0.5.17 registriert den abbrechbaren Iterator erst **nach** dem abgeschlossenen HTTP-Fetch; vorher findet `abort()` nichts.  
   Trigger: Ollama nimmt Verbindung an, schickt lange keine Response-Header, z.B. beim Modellstart. Fetch bleibt über das konfigurierte Timeout hinaus offen. Restate kann den Job nach `1.1 × timeoutSecs` erneut dispatchen (`queue-restate/src/runner.ts:108–111`), während die alte HTTP-Arbeit noch lebt. App-Code und tatsächlich gepinnter SDK-Pfad geprüft. [Ollama 0.5.17](https://raw.githubusercontent.com/ollama/ollama-js/v0.5.17/src/browser.ts)

3. **P2 — Ollama erzwingt JSON bei normalen Zusammenfassungen ohne Schema. Hohe Sicherheit.**  
   `packages/shared/inference.ts:537–547` sendet in Konfiguration `INFERENCE_OUTPUT_SCHEMA=json` immer `format: "json"`, selbst bei `schema: null`. Normale Artikel-Zusammenfassungen reichen ausdrücklich `schema: null` durch (`apps/workers/workers/inference/summarize.ts:224–229`) und speichern die unverarbeitete Antwort als Summary (`248,267–274`). Damit landen JSON-Hüllen/Strings in dem für Fließtext vorgesehenen Summaryfeld oder die Ausgabe leidet unter widersprüchlichen Formatvorgaben.  
   Gegenargument geprüft: Der analoge OpenAI-Pfad besitzt bereits den fehlenden Null-Schema-Guard (`inference.ts:209–215`); Ollama hat ihn nicht.

4. **P2 — Ein fehlgeschlagenes Meilisearch-Embedder-Setup wird dauerhaft als erfolgreiche Initialisierung gecacht. Hohe Sicherheit.**  
   `packages/plugins/vectorstore-meilisearch/src/index.ts:271–285` fängt Fehler von `updateEmbedders(...).waitTask()` ab und kehrt normal zurück. Danach wird `vectorClient` gesetzt (`229–237`); alle späteren Zugriffe umgehen die Konfiguration (`168–171`).  
   Trigger: neuer Vektorindex oder geänderte Dimension, während der Konfigurationsrequest vor erfolgreicher Änderung transient scheitert. Subsequent Queries/Indexierungen arbeiten weiter gegen einen Index ohne passenden Embedder; erneute Jobversuche korrigieren das Setup nicht. Neustart/manuelle Konfiguration nötig. Die vorhandene Reparatur des abgelehnten `initPromise` hilft hier nicht, weil der Fehler bereits verschluckt wurde.

5. **P2 — Restate `clearGroupId` hinterlässt dauerhaft wartende Dispatcher. Hohe Sicherheit; betrifft administrativen Restate-Pfad.**  
   `packages/plugins/queue-restate/src/semaphore.ts:456–470` entfernt Queueitems samt Idempotenzschlüsseln, ohne die in jedem Item gespeicherte Awakeable aufzulösen oder abzulehnen. Der wartende Dispatcher befindet sich weiter in `await awk.promise` (`545–575`), während alle Referenzen für seine Fortsetzung gelöscht wurden. `clearState()` hat denselben Effekt (`439–443`).  
   Trigger: Gruppe/Queue mit wartenden Jobs administrativ leeren. Queuezahl fällt auf null, aber durable Aufrufe bleiben verwaist. Gegenbeispiel im selben Modul: `reject()` beendet die Awakeables ausdrücklich (`429–433`). Vorhandener Test prüft nur die Queuezahl (`src/tests/semaphore.test.ts:451–467`), nicht die Aufrufbeendigung.

6. **P2 — Restate startet nach Resume nur einen Job, unabhängig von konfigurierter Parallelität. Hohe Sicherheit.**  
   `packages/plugins/queue-restate/src/semaphore.ts:370–377` setzt `paused=false`, ruft dann aber `tick(..., 1)` auf. Normales Acquire/Release übergibt die konfigurierte Kapazität (`334,355`; Dispatcher `73–76`).  
   Trigger: Queue mit Parallelität >1 pausieren, laufende Jobs abarbeiten lassen, mehrere Jobs aufstauen, Resume ohne zusätzliche Enqueues. Nur ein Job startet; weitere freie Slots bleiben bis zu dessen Ende ungenutzt. Bei langen Crawl-/Inference-Jobs merkliche vermeidbare Wartezeit. Der Resume-Test verdeckt das Problem durch zusätzlichen manuellen `tick()` (`tests/semaphore.test.ts:520–522`).

7. **P2 — Meilisearch-Batching kann durch Mutex-Wartezeit vermeidbare Timeouts und doppelte Indexierung erzeugen. Hohe Sicherheit der Ursache; reale Häufigkeit ungemessen.**  
   `packages/plugins/lib/batchingDocumentQueue.ts:67–147` hält den globalen Mutex über sämtliche Netzwerk-/Task-Wartezeiten. Die erlaubte Wartezeit von 90 % des Job-Timeouts wird anschließend für jeden einzelnen Task neu berechnet (`182–185`), ohne bisherige Mutex-/Batchwartezeit abzuziehen. Abgebrochene Jobs werden nicht aus `pendingOperations` entfernt.  
   Konkreter Ablauf bei `SEARCH_NUM_WORKERS≥2`, 30-s-Joblimit: Batch A läuft 20 s; Job B kommt 5 s später, wartet 15 s auf den Mutex und benötigt weitere 20 s Indexzeit. B überschreitet sein Joblimit, obwohl beide individuellen Meili-Tasks unter 27 s bleiben. Sein alter Batch läuft dennoch weiter; Queue-Retry verursacht zusätzliche Arbeit. Standardparallelität 1 vermeidet diese spezielle Überlappung, höhere Parallelität wird dokumentiert empfohlen.

Zurückgestellt/verworfen: lexikalisches Filterescaping ist schwächer als beim Vektorspeicher, aber aktuelle Filterwerte stammen aus servergenerierten IDs — keine belegte nutzerkontrollierte Injection-Kette. Restate-`tickUnlimited` ignoriert Kapazität ausdrücklich und wird als administrativer Override getestet; deshalb kein Bugbefund. Leck-/Timeoutvermutungen beim Liteque-Adapter ohne nachweisbare Librarysemantik nicht als Fakten aufgenommen.

---

# Eigene Nachprüfung (Koordinator)

Unabhängige Gegenprüfung der als kritisch markierten Befunde sowie ergänzende
Fundstellen. Nur Quellcode gelesen, nichts geändert.

## V1 — P1 Admin-Sitzung bestätigt, mit Zusatzdetail zum Zeitfenster

Der Befund „Entzogene Adminrechte bleiben in bestehenden Sessions wirksam“
ist bestätigt und **schwerwiegender als zunächst beschrieben**: die Session
läuft als JWT (`apps/web/server/auth.ts:209–211`, `strategy: "jwt"`) und es
ist **kein `maxAge` gesetzt** — es gilt also NextAuths Standard von 30 Tagen.
Damit behält ein herabgestufter oder gelöschter Admin seine Rechte bis zu
30 Tage lang, ohne dass der Rollenwechsel je nachgeladen wird.

Belegkette:
- `apps/web/server/auth.ts:281–292` — `jwt`-Callback schreibt `token.user`
  **nur wenn `user` gesetzt ist**, also ausschließlich beim Login.
- `apps/web/server/auth.ts:293–296` — `session`-Callback kopiert
  `token.user` unverändert in die Session.
- `apps/web/server/api/client.ts:45–59` — Kontext übernimmt `session?.user`
  direkt, ohne DB-Nachschlag.
- `packages/trpc/index.ts:220–225` — `isAdmin` prüft ausschließlich
  `ctx.user.role`.
- `packages/trpc/routers/admin.ts:544–577` — die Herabstufung schreibt nur
  die `users`-Zeile; es gibt keinen Session-Widerruf und keine
  Token-Invalidierung.

## V2 — Checkbox-Befund bestätigt, zusätzlicher Auslöser gefunden

Der Indexfehler in `apps/web/components/ui/markdown/markdown-readonly.tsx:39–61`
ist bestätigt. Über den bereits gemeldeten Codefence-Fall hinaus gibt es
einen **zweiten Auslöser derselben Ursache**: Das Muster
`/^(\s*[-*+]\s*\[)( |x|X)(\])/gm` verlangt den Aufgabentext am Zeilenanfang
und kann ein vorangestelltes `>` nicht erfassen. `remark-gfm` rendert
Aufgabenlisten in Blockzitaten (`> - [ ] …`) aber sehr wohl als Checkbox.
Jede so gerenderte Checkbox fehlt in der Regex-Zählung, verschiebt den
DOM-Index und lässt den Klick eine **andere** Aufgabe umschalten — ohne dass
ein Codefence im Spiel sein muss. Zusätzlich sind `\r\n`-Zeilenenden und
eingebettete HTML-Blöcke als weitere Abweichungsquellen ungeprüft.

## V3 — Neuer Befund: Chat-Stream wird beim Verbindungsabbruch nicht beendet

**P2 — Bricht der Client den Chat ab, läuft die Modellanfrage serverseitig
weiter. Statisch belegt.**

- `apps/web/app/api/chat/route.ts:193–217` — der `ReadableStream` definiert
  **nur `start(controller)`, kein `cancel()`**; auch `request.signal` wird
  nirgends verwendet.
- `packages/shared/chatInference.ts` — `streamChatCompletion(prompt, override?)`
  nimmt **keinen `AbortSignal` entgegen**; `streamFromOpenAI` und
  `streamFromOllama` erzeugen bzw. konsumieren den Stream ohne Abbruchpfad.

**Auswirkung:** Navigiert der Nutzer weg, schließt den Tab oder bricht die
Antwort ab, wird der Async-Generator nicht beendet, `return()` nie
aufgerufen und die Upstream-Anfrage an OpenAI/Ollama läuft bis zum Ende
weiter. Das verbraucht Tokens/Kosten und hält den Worker, obwohl niemand die
Ausgabe mehr liest. Zusätzlich schreibt die Schleife weiter in einen bereits
abgebrochenen `controller`, was `Invalid state: Controller is already
closed` auslöst.

**Erwartet:** `request.signal` an einen `AbortController` binden, dessen
Signal durch `streamChatCompletion` bis zum Provider-Fetch reichen, und im
`cancel()`-Handler des Streams abbrechen.

## V4 — P1 Zyklische Listen bestätigt (Server-Hang)

Der Befund „Zyklische Listenhierarchie blockiert den Server“ ist bestätigt.

- `packages/shared/types/lists.ts:85–94` — das Edit-Schema prüft per
  `.refine` **nur** `parentId != listId`, also direkte Selbstreferenz. Eine
  Vorfahrenprüfung fehlt.
- `packages/trpc/routers/lists.ts` (`edit`) — die Mutation ruft direkt
  `ctx.list.update(input)`; kein Zyklus-Check davor.
- `packages/trpc/models/lists.ts:600–629` — `getChildren` baut eine
  Adjazenzliste und arbeitet sie mit `queue.pop()` ab, **ohne besuchte IDs
  zu merken**. Bei A→B→A wächst `resultIds` unbegrenzt; die Schleife endet
  nie (Heap wächst bis OOM, Request hängt).

**Erwartet:** `update` lehnt einen `parentId` ab, der ein Nachkomme der
eigenen Liste ist (oder die Traversierung bricht bei bereits besuchten IDs
ab). **Trigger:** über die REST-/tRPC-API (die UI blendet Nachkommen im
Parent-Selector aus, sperrt den Pfad also nicht).

## V5 — Geprüft und verworfen (kein Befund)

- `packages/shared-react/hooks/bookmarks.ts:221–263`: Der Guard
  `gridQueryCtx.favourited ?? gridQueryCtx.archived` ist fragil, aber kein
  aktueller Aufrufer setzt `favourited: false`. Archive übergibt
  `{ archived: true }`, Inbox `{ archived: false }` — Verhalten korrekt.
- `packages/shared/import-export/parsers.ts:96,130,462`: `parseInt` ohne
  Radix kann `NaN` liefern; `importer.ts:253–254` behandelt das über die
  Falsy-Prüfung (`NaN` ist falsy) korrekt ab.
- `apps/web/lib/dense/theme.ts:233` und `apps/web/lib/readerSettings.tsx:22–28`:
  `JSON.parse` auf `localStorage` ist jeweils in `try/catch` gefasst.

## V6 — Nachträglich quellcode-verifizierte Runde-3-Befunde

Direkt am Code gegengeprüft (nicht nur Agent-Aussage):

- **Open-Redirect-Bypass bestätigt (`/\host`).**
  `packages/shared/utils/redirectUrl.ts:17–19` prüft ausschließlich
  `startsWith("/") && !startsWith("//")`; `/\evil.com` passiert und wird vom
  Browser (Backslash = `/` bei Special-Schemes) als protokoll-relativ
  aufgelöst. Der Test `redirectUrl.test.ts` deckt nur `//evil.com` ab.
- **Lexical/Prism im Bundle der öffentlichen Route bestätigt.**
  `apps/web/components/dashboard/bookmarks/BookmarkMarkdownComponent.tsx:1–2`
  importiert `MarkdownEditor` **und** `MarkdownReadonly` statisch; die Wahl
  hängt nur an der Laufzeit-Prop `readOnly` (:39–47). `PublicBookmarkGrid.tsx:6,80,93`
  nutzt die Komponente ausschließlich mit `readOnly={true}` — die
  unauthentifizierte Route `/public/lists/[listId]` lädt also den Editor mit.
- **Toter Grid-Teilbaum bestätigt.** `BookmarksGrid` wird nirgends
  importiert (nur noch in Kommentaren erwähnt, z. B.
  `dense/DenseFiles.tsx:14`); `components/wrapped/*` hat null externe
  Referenzen; `setInBookmarkGrid` wird ausschließlich aus
  `BookmarksGrid.tsx:209` aufgerufen, das Flag ist im lebenden Code also
  dauerhaft `false`.
- **Mobile Favourite-Toggle bestätigt.**
  `apps/mobile/components/bookmarks/card/use-bookmark-actions.ts:60–84`:
  `const { mutate: favouriteBookmark, variables } = useUpdateBookmark(...)`
  und `isFavourited = Boolean(variables ? variables.favourited : bookmark.favourited)`.
  `variables` bleibt nach einem Fehler gesetzt und überstimmt dauerhaft die
  Server-Wahrheit; `toggleFavourite` sendet `!bookmark.favourited` statt
  `!isFavourited`.
- **Breite Query-Invalidierung bestätigt.**
  `packages/shared-react/hooks/bookmarks.ts:113–125`: `onSuccess` invalidiert
  `api.bookmarks.getBookmarks.pathFilter()` (filterunabhängig, trifft also
  auch die aktive Infinite-Query) und zusätzlich `searchBookmarks.pathFilter()`.
- **Fehlendes `React.memo` + Query pro Zeile bestätigt.**
  `apps/web/components/dashboard/dense/DenseBookmarkRow.tsx:29` ist eine
  Plain-Function, `:45–53` abonniert `highlights.getForBookmark` pro Zeile
  (der Kommentar dort begründet das mit `httpBatchLink`).
- **Fehlender Caller-Cache bestätigt.**
  `apps/web/server/api/trpc.ts:8` nutzt `cache(...)` für den QueryClient,
  `apps/web/server/api/client.ts:66–68` setzt `api` aber ohne `cache()`.
- **Quota-Asymmetrie bestätigt.** `packages/shared/assetdb.ts:697–702` prüft
  im Buffer-Pfad `quotaApproved.approvedSize < asset.byteLength` und wirft;
  `:721` prüft im Datei-Pfad **nur** `userId`. Der Kommentar `:722–723`
  („we'll verify the file size … when the underlying store implementation
  reads the file“) ist falsch: `quotaApproved`/`approvedSize` kommen in
  keiner Store-Implementierung vor (Repo-weiter Treffer nur `:688,694,697,700`
  und `:712,718,721`, alles Wrapper). Heutige Aufrufer liefern passende
  Werte, daher latent (P3), nicht akut ausnutzbar.
- **Fehlender Index bestätigt.** `packages/db/schema.ts:585–593` definiert für
  `bookmarksInLists` nur den PK `(bookmarkId, listId)` und
  `bookmarksInLists_listId_bookmarkId_idx` auf `(listId, bookmarkId)`.
  `listMembershipId` (`:579–584`) hat `onDelete: "cascade"`, aber **keinen**
  Index — der Cascade-Delete kann die Spalte also nicht indexiert auflösen.
- **i18n-Lücke bestätigt.** `useTranslation` kommt in **0 von 30** `.tsx`-Dateien
  unter `apps/web/components/dashboard/dense/` vor (grep-basiert gezählt) —
  die Spracheinstellung kann auf der gesamten Fork-Oberfläche nicht wirken.
- **`summarizeBookmark` ohne Override bestätigt.**
  `packages/trpc/routers/bookmarks.ts:1551` ruft `InferenceClientFactory.build()`
  **ohne Argument**, während `/api/chat` und der Inference-Worker die effektive
  Konfiguration auflösen.
- **`/settings/ai` ist env-gated bestätigt.** `apps/web/app/settings/layout.tsx:93`
  blendet den einzigen Link auf die AI-Einstellungen ein, wenn
  `serverConfig.inference.isConfigured` — die Flagge prüft nur
  `OPENAI_API_KEY`/`OLLAMA_BASE_URL` (`config.ts:407–408`, `:696`). Bei reiner
  Override-Konfiguration ist die Seite, auf der man den Override setzt, damit
  nicht über die UI erreichbar (Henne-Ei).
- **Settings-Font-Fehler bestätigt.** `app/settings/layout.tsx:50` registriert
  IBM Plex Sans als `--font-k-sans`, `app/dashboard/layout.tsx:46` dieselbe
  Schrift dagegen als `--font-k-sans-plex`. `lib/dense/theme.ts:271` schreibt
  inline `--font-k-sans: var(--font-k-sans-plex)`; `dense-theme.css:76,80`
  nutzt `font-family: var(--font-k-sans), "IBM Plex Sans", sans-serif`.
  `settings/layout.tsx:183` wendet `k-dense k-dense-zoom` an und mountet den
  `DenseThemeProvider` (`:7`) — auf `/settings` ist `--font-k-sans-plex` aber
  nie definiert, die Referenz ist damit ungültig und die Schriftdeklaration
  wird verworfen → Inter erbt sich aus `app/layout.tsx` durch.
- **Webhook-Secret-Verlust bestätigt.** `WebhookSettings.tsx:316–321` setzt beim
  Öffnen von „Edit auth token“ `token: ""`; das Save-Formular ist auf
  `zUpdateWebhookSchema.pick({webhookId, token}).required({token: true})`
  beschränkt, und `zUpdateWebhookSchema.token` ist `z.string().max(…).nullish()`
  (`packages/shared/types/webhooks.ts:31–36`) — der Leerstring ist also gültig
  und wird von `webhooks.repo.ts:65–73` **wörtlich** gespeichert. Da
  `toPublicWebhook` `hasToken: token !== null` setzt (`routers/webhooks.ts:20`),
  zeigt die Tabelle danach weiter `*******`, während der Worker den
  `Authorization`-Header nur bei truthy Token sendet (`webhookWorker.ts:128–145`).
  Speichern ohne Eingabe zerstört das Secret also still und tarnt es als
  vorhanden; echtes Löschen ist der Trash-Button mit `token: null` (`:411–424`).
- **Rate-Limit-Umgehung bestätigt.** `apps/web/server/api/client.ts:13–15` leitet
  `ip` ausschließlich aus `requestIp.getClientIp({headers})` ab (keine
  Socket-Adresse als Vorrang), und `packages/trpc/lib/rateLimit.ts:25–40` baut
  den Schlüssel als `` `${ip}${userSegment}:${opts.path}` ``. Für die
  unauthentifizierten Endpunkte (`users.create`, `forgotPassword`,
  `apiKeys.exchange`) ist `userSegment` leer — der Bucket hängt also allein an
  einem per Header fälschbaren Wert. Greift nur bei
  `rateLimiting.enabled` (`:22–24`).
- **`attachAsset`-Typ-Bypass bestätigt.** `packages/trpc/routers/assets.ts:44–54`
  nimmt `assetType` **vom Client** entgegen; `models/assets.ts:102–106` prüft
  genau diesen deklarierten Wert gegen `isAllowedToAttachAsset` und
  persistiert ihn anschließend (`:109–116`). `ensureOwnership()` (`:99`)
  begrenzt das auf eigene Assets — ein eigenes Backup-/Avatar-Asset lässt sich
  also als „screenshot“ deklarieren und an einen Bookmark hängen.
- **Bulk-Layer-Unerreichbarkeit bestätigt.** `SidebarLayout` wird nur in
  `apps/web/app/admin/layout.tsx:56` gerendert, `GlobalActions` nur in
  `components/dashboard/header/Header.tsx:24`, und das Gating hängt an
  `inBookmarkGrid`, das ausschließlich das von niemandem importierte
  `BookmarksGrid.tsx` setzt. Der Bulk-/Tastatur-Layer ist damit nicht nur
  ungenutzt, sondern im Dashboard gar nicht gemountet.
- **`selected={i === 0}` bestätigt, und `searchQuery` fehlt dort tatsächlich.**
  `DenseFilesView.tsx:621–626` rendert `<DenseBookmarkRow key={bookmark.id}
  bookmark={bookmark} selected={i === 0} />` — ohne den optionalen Prop
  `searchQuery`. Damit ist sowohl der Dauerhaft-ausgewählt-Effekt als auch der
  fehlende Treffer-Highlight/Snippet in der Inline-Suche der FILES-Ansicht
  quelltextlich bestätigt (die beiden anderen Trefferflächen übergeben ihn:
  `app/dashboard/search/page.tsx:165`, `dense/mobile/MobileSearchHome.tsx:291`).
- **Stiller Import-Datenverlust bestätigt.**
  `packages/trpc/models/importSessions.service.ts:95–104` filtert Links ohne
  `url` und Texte ohne `content` **stumm** heraus (bei null Treffern früher
  `return`). Der Importer zählt dagegen `staged += batch.length` auf der
  **ungefilterten** Batch-Größe (`importer.ts:270`) und meldet
  `total: parsedBookmarks.length` (`:282`), wobei `successes`/`failures`
  ohnehin hart `0` sind. Fortschritt läuft also auf 100 %, der Toast meldet
  „Staged N“, obwohl die Session ggf. 0 Staging-Zeilen enthält.
- **TSM-Zeiteinheiten-Fehler bestätigt.** `parsers.ts:358` setzt
  `addDate: tab.lastAccessed` (Chrome/TSM liefert **Millisekunden**), während
  die übrigen Parser Sekunden liefern; `importer.ts:253–255` multipliziert
  pauschal mit 1000 ⇒ `createdAt` im Jahr ~55.800 für alle TSM-Importe.
- **Crawler-P1 „tote Fehlerzweige“ bestätigt.**
  `assetStorage.ts:405–423` ruft `execa({input, cancelSignal, env})("monolith", …)`
  **ohne `reject: false`**. execa v9 wirft per Default bei Exit-Code ≠ 0 und bei
  Abbruch, deshalb sind sowohl der `res.isCanceled`-Zweig (`:425–431`) als auch
  der `res.exitCode !== 0`-Zweig (`:433–439`) unerreichbar — samt ihrer
  `fs.unlink`-Aufräumung. Ein monolith-Fehler propagiert als Exception und
  lässt den gesamten Crawl-Job scheitern, die Temp-Datei bleibt liegen.
- **Crawler-P1 „Timeout-Budget-Inversion“ bestätigt.**
  `config.ts:127` `CRAWLER_JOB_TIMEOUT_SEC` = 60 (als `timeoutSecs` in
  `crawlerWorker.ts:203` gesetzt) gegen `config.ts:219`
  `CRAWLER_ASR_TIMEOUT_SEC` = 15 × 60 = 900 sowie
  `config.ts:176` `CRAWLER_VIDEO_TRANSCRIPT_TIMEOUT_SEC` = 60. Der
  Sub-Schritt-Timeout (900 s) kann also nie greifen; der Job bricht zuerst ab.
- **Asset-vor-Commit bestätigt (Kurzprüfung).** Die Store-Schreibpfade
  (`assetStorage.ts` `store*`) laufen vor der Phase-2-Transaktion in
  `crawlAndParse.ts`; die Quota summiert DB-Zeilen
  (`quotaService.ts:55–80`) — verwaisen die Dateien, sind sie quotenneutral
  und nur über den manuellen `tidyAssets`-Task entfernbar.
- **`tidy_assets`-TOCTOU bestätigt.** `adminMaintenance/tasks/tidyAssets.ts:22–40`
  prüft ausschließlich `assets.findFirst({ where: eq(assets.id, asset.assetId) })`
  und ruft bei fehlender Zeile **ohne Alters- oder In-Flight-Kriterium**
  `deleteAsset(...)`. Zusammen mit der bestätigten Reihenfolge „Datei vor
  DB-Zeile“ (Crawl/Video/PDF) kann ein laufender Job seine gerade geschriebene
  Datei verlieren; der anschließende Commit hinterlässt eine DB-Zeile ohne
  Datei (Vorschau/Download 404).
- **Fehlender Bucket-Prefix bestätigt.** `packages/shared/assetdb.ts:567–612`
  (`S3AssetStore.getAllAssets`) listet mit `ListObjectsV2Command` **ohne
  `Prefix`** und behandelt jeden Key mit genau zwei Pfadsegmenten als
  `userId/assetId` — in einem geteilt genutzten Bucket können damit fremde
  Objekte als verwaiste Assets gelöscht werden.
- **Bekanntes NextAuth-Secret im Dev-Stack bestätigt.**
  `docker/docker-compose.dev.yml:27,85,149,184` setzen alle
  `NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-super-secure-nextauth-secret}`; in
  `docker/.env` ist die Variable nur auskommentiert (Zeile 18), der Fallback
  greift also. Dieselbe Datei biegt `NEXTAUTH_URL` und
  `ALLOWED_DEV_ORIGINS` auf eine LAN-IP (172.20.10.2), der Stack ist damit
  netzwerkweit erreichbar. `apps/web/server/auth.ts` enthält **keine**
  `secret`-Option (grep ohne Treffer) → NextAuth v4 zieht
  `process.env.NEXTAUTH_SECRET`, hier also den öffentlich bekannten Wert.
  Da das JWT `user.id` und `role` trägt und die Session daraus rekonstruiert
  wird, ist ein Admin-Token mit Repo-Wissen fälschbar.

## V7 — Suchsprache: beide P1 quellcode-verifiziert

- **`age:` ignoriert die Negation.** In `packages/shared/searchQueryParser.ts:287–302`
  liefert `case "age:"` im Erfolgsfall
  `{ text: "", matcher: { type: "age", relativeDate: {…} } }` — `minus` wird
  dort **nie** ausgewertet, obwohl es im selben Scope verfügbar ist: der
  `catch`-Zweig direkt darunter verwendet `minus?.text` (`:299`). Der
  Matcher-Typ `age` (`packages/shared/types/search.ts:57–64`) hat zudem kein
  `inverse`-Feld, und `packages/trpc/lib/search.ts:359–370` kehrt nur nach
  `direction` um. `-age:>1y` liefert damit exakt die Menge „älter als 1 Jahr“
  statt des Komplements.
- **`or` zwischen Freitext wird zu UND.** Im `TokenType.Or`-Zweig
  (`searchQueryParser.ts:346–362`) wird der Text als
  `[toks.text, next[1].text].join(" ").trim()` **konkateniert**; haben beide
  Seiten keinen Matcher, ist `matcher` anschließend `undefined`. `hello or world`
  ergibt also `{ text: "hello world", matcher: undefined }`, und der Router
  (`routers/bookmarks.ts:1000`) schickt genau diesen Text mit
  `matchingStrategy: "all"` (`search-meilisearch/src/index.ts:93`) an
  Meilisearch — alle Wörter müssen vorkommen, also Schnittmenge statt Vereinigung.

---

# Runde 3 — Clients, Verifikation, Performance

Read-only-Agents auf Commit `71d42740`, jeweils eigener Scope. Die folgenden
Abschnitte sind die unveränderten Agent-Berichte.

## Expo-Mobile-Client (`apps/mobile`)

Statische Analyse, keine Edits, kein Build/Netz. 9 Befunde (P2/P3).

**P2 – Upload-Fehler werden nie gemeldet, weil der onError-Handler selbst wirft. Hohe Konfidenz.**
- Primär: `apps/mobile/lib/upload.ts:73–78` (Konsumenten: `apps/mobile/app/sharing.tsx:40–45`, `apps/mobile/app/dashboard/(tabs)/(home)/index.tsx:28–43`)
- Szenario: Foto/Datei teilen bzw. "Photo Library" – Server antwortet 4xx/5xx (z. B. Rate-Limit 30/min in `packages/api/routes/assets.ts:22–24`, Scope-Fehler, "file too large") oder das Gerät ist offline.
- Erwartet vs. tatsächlich: `ReactNativeBlobUtil.fetch` **resolved auch bei HTTP-Fehlern** (node_modules/react-native-blob-util/fetch.js: `reject` nur bei nativem `err`), der Fehlerbody ist `{error: "..."}`. `zUploadResponseSchema.parse(...)` wirft daher eine ZodError; in zod 4 ist `error.message = JSON.stringify(issues)` also **ein JSON-Array-String** → `JSON.parse(e.message)` liefert ein Array → `zUploadErrorSchema.parse(array)` (strenges Objekt) wirft erneut. Bei echtem Netzwerkfehler wirft schon `JSON.parse` ("Network request failed" ist kein JSON). In beiden Fällen wird `options.onError(...)` nie erreicht: Sharing-Screen bleibt im Idle-Spinner (nur nach 5 s Escape-Hatch), Home-Tab lässt den "Uploading image…"-Loading-Toast dauerhaft stehen. Erwartet: Fehlermeldung des Servers im Toast.

**P2 – PDF-Tempdatei wird gelöscht, während der Pfad noch aus dem React-Query-Cache kommt. Hohe Konfidenz.**
- Primär: `apps/mobile/components/bookmarks/PDFViewer.tsx:24–43` + `:67–74`
- Szenario: PDF-Bookmark öffnen, zurücknavigieren, dasselbe PDF innerhalb von 60 s erneut öffnen (staleTime-Default aus `lib/offlineCache.ts:24`; gcTime = 7 Tage).
- Erwartet vs. tatsächlich: Beim Unmount löscht der Cleanup `unlink(localPath)`, der Pfad bleibt aber als Query-Data unter `queryKey: ["pdf", source]` im QueryClient (bzw. wird sogar in MMKV persistiert, da `shouldDehydrateQuery` den Key nicht ausschließt). Beim erneuten Mount ist die Query "fresh" → kein Refetch → `<Pdf source={{uri:"file://<gelöscht>"}}` → `onError` → "Failed to render PDF". Zusätzlich ist `headers` (aus `useAssetUrl`/`buildApiHeaders`, `lib/utils.ts:51–58`, bei jedem Render neu) in den Effect-Deps: damit läuft der Cleanup bei **jedem** Re-Render des PDFViewers und löscht die gerade angezeigte Datei. Erwartet: Cleanup abhängig von der Query-Data bzw. Neudownload statt Fehlerzustand.

**P2 – Sharing-Crash bei leerem `files`-Array. Mittlere Konfidenz.**
- Primär: `apps/mobile/app/sharing.tsx:73–79`
- Szenario: Teilen eines Anhangs, den `expo-share-intent` verwirft (Einträge ohne `path`/`contentUri`; die Bibliothek dokumentiert das: "some array value are empty").
- Erwartet vs. tatsächlich: `parseShareIntent` liefert dann `files: []`, `isValueAvailable` (`useShareIntent.js`) hält `[]` für truthy → `hasShareIntent` true → `_layout.tsx:41–47` navigiert auf "sharing" → der `else if (... shareIntent?.files)`-Zweig greift → `shareIntent.files[0].mimeType` wirft TypeError (`files[0]` undefined) im Effect → Error-Boundary/"Error!"-Screen statt Fehlermeldung. Zusätzlich kann `path` laut Normalisierung `null` sein (`type`/`fileName` sind dort ebenfalls nullable), das wird ungeprüft an BlobUtil gereicht. Erwartet: Längen-/Null-Check vor dem Upload.

**P2 – Fehlgeschlagener Favourite-Toggle bleibt dauerhaft als Zustand stehen. Hohe Konfidenz.**
- Primär: `apps/mobile/components/bookmarks/card/use-bookmark-actions.ts:60–84` (gleiches Muster in `app/dashboard/bookmarks/[slug]/info.tsx:311–324`)
- Szenario: Stern auf einer Bookmark-Karte antippen, während das Gerät offline ist oder der Request fehlschlägt (`networkMode: "always"` in `lib/offlineCache.ts:36` lässt die Mutation sofort failen).
- Erwartet vs. tatsächlich: `isFavourited = variables ? variables.favourited : bookmark.favourited` – `variables` ist die letzte Mutations-Variable **auch im Fehlerfall** und überstimmt danach `bookmark.favourited` für immer (die Komponente bleibt gemountet). Der `onError`-Toast erscheint, aber Stern/Optik zeigen weiter den nie persistierten Zustand; ein späterer erfolgreicher Refetch korrigiert die Anzeige nicht. Zusatz: `toggleFavourite` sendet `!bookmark.favourited` (Server-Wahrheit) statt `!isFavourited`; bei schnellem Doppeltipp vor dem Refetch wird derselbe Wert erneut gesendet. Erwartet: nach Fehler auf Server-Wahrheit zurückfallen.

**P2 – Einstellungs-Load ohne Fehlerbehandlung: App hängt dauerhaft im Splash. Mittlere Konfidenz.**
- Primär: `apps/mobile/lib/settings.ts:96–114` (Aufrufer `lib/providers.tsx:25–29`, `:42–45`, `components/SplashScreenController.tsx:4–11`)
- Szenario: Der SecureStore-Wert unter "settings" ist kein gültiges JSON (Legacy-Wert, abgebrochener Schreibvorgang, Android-Restore ohne Keystore-Key o. ä.) oder `SecureStore.getItemAsync` wirft (z. B. Android Auto-Backup-Restore).
- Erwartet vs. tatsächlich: `JSON.parse(strVal)` (Zeile 107) steht außerhalb jedes try/catch; `load()` rejected unbehandelt (kein `.catch` an den Aufrufstellen), `isLoading` bleibt true → `Providers` rendert für immer `<FullPageSpinner/>` und `SplashScreenController` ruft nie `SplashScreen.hide()` → App startet nicht mehr, kein Weg zurück außer Deinstallation. Ebenso ungeprüft: `setSettings` (92–95) – schlägt der SecureStore-Write fehl, wird der Store nie aktualisiert (z. B. Logout/Login passiert stillschweigend nicht), Aufrufer awaiten nur teilweise.

**P2 (Perf) – Pro Bookmark-Karte eine eigene getBookmark-Query samt eigenem Polling. Hohe Konfidenz.**
- Primär: `apps/mobile/components/bookmarks/BookmarkCard.tsx:253–270` (Rendering: `components/bookmarks/BookmarkList.tsx:41`)
- Szenario: Liste mit vielen frisch importierten (noch crawlenden/taggenden) Bookmarks.
- Erwartet vs. tatsächlich: Die Liste liefert bereits vollständige Bookmarks (`UpdatingBookmarkList.tsx:30–42`, `includeContent: false`) und übergibt sie als `initialData`; trotzdem abonniert jede Karte zusätzlich `bookmarks.getBookmark` und `getBookmarkRefreshInterval` liefert für junge Bookmarks **1 000 ms** (`packages/shared/utils/bookmarkUtils.ts:56–66`). Bei 50 Karten entstehen bis zu 50 Einzel-Prozeduren pro Sekunde (Batching greift nur bei zeitgleichem Tick, die Intervalle laufen versetzt), plus ein Query-Shard pro Karte im persistierten Cache. Erwartet: eine Listen-Query mit Polling statt N Einzel-Queries.

**P3 – Pull-to-Refresh zeigt nie einen Spinner. Hohe Konfidenz.**
- Primär: `apps/mobile/components/bookmarks/UpdatingBookmarkList.tsx:62`, `app/dashboard/(tabs)/(lists)/index.tsx:98–100,260`, `app/dashboard/(tabs)/(tags)/index.tsx:47–49,113`, `app/dashboard/(tabs)/(highlights)/index.tsx:42`
- Szenario: Auf einer der Listen nach unten ziehen.
- Erwartet vs. tatsächlich: `isRefreshing` wird aus `isPending || isPlaceholderData` gespeist; `isPending` ist bei `useInfiniteQuery` nur beim allerersten Laden true, `placeholderData` ist nirgends gesetzt → `refreshing` ist nach dem Erstladen permanent `false`, der RefreshControl-Spinner verschwindet sofort, obwohl der Refetch weiterläuft (datenloser Eindruck). Erwartet: `isFetching` (bzw. der tatsächliche Refresh-Zustand).

**P3 – Delete/Leave List schlägt still fehl. Hohe Konfidenz.**
- Primär: `apps/mobile/app/dashboard/lists/[slug]/index.tsx:69–83`
- Szenario: Liste offline oder bereits serverseitig gelöscht (404) löschen/verlassen.
- Erwartet vs. tatsächlich: Beide `useMutation(api.lists.delete/leaveList.mutationOptions({ onSuccess }))` haben **keinen** `onError`; es gibt auch keinen globalen QueryCache-/MutationCache-Fehlerhandler in `makeMobileQueryClient` (`lib/offlineCache.ts:20–40`). Der Alert schließt, nichts passiert, keinerlei Feedback; `onSuccess` (Navigation zu /dashboard/lists) bleibt aus. Erwartet: Fehlermeldung/Toast.

**P3 – In-App-Browser prüft Origin per String-Präfix. Mittlere Konfidenz.**
- Primär: `apps/mobile/components/bookmarks/BookmarkLinkPreview.tsx:60–70` (identisches Muster `:282–295` mit der Asset-URL)
- Szenario: Bookmark `https://example.com`, im "Browser"-View wird ein Link zu `https://example.com.angreifer.tld/` geklickt.
- Erwartet vs. tatsächlich: `request.url.startsWith(new URL(bookmarkUrl).origin)` vergleicht Zeichenketten: `https://example.com.evil.tld` passiert die Prüfung und wird **im App-WebView** geladen, während echte Subdomains (`https://www.example.com/...`) fälschlich nach außen an Safari abgegeben werden. Erwartet: Vergleich von Hostname/Origin (bzw. Suffix-Match auf `.host`), Konsequenz hier gering (WebView ohne Session/Cookies), aber die Logik ist in beide Richtungen falsch.

### Verworfene Hypothesen (Mobile)
- Persistierter Query-Cache gibt Artikel-HTML an MMKV weiter: `dehydrateOptions.shouldDehydrateQuery` (`lib/offlineCache.ts:296–316`) prüft `part.input.includeContent === true`, und die tRPC-Query-Key-Form ist tatsächlich `[path, {input, type}]` (verifiziert in `@trpc/tanstack-react-query/dist/index.mjs:298`) – der Ausschluss greift. Kein Befund.
- `logout()` während des Renderns (`app/dashboard/settings/index.tsx:110–112`) sei eine Endlosschleife: `logout()` ist zwar ein Render-Seiteneffekt, aber `dashboard/_layout.tsx:25–29` leitet bei `isLoggedIn === false` sofort per `router.replace("signin")` um und beendet die Kette; `setSettings` ist zudem async (Store-Update erst nach dem SecureStore-Write). Unschön, aber der Guard verhindert den Schaden → nicht gemeldet.
- API-Key-Login speichert kein `apiKeyId` (`app/signin.tsx:92–103`): führt zu Scope/Buster "anon" (`lib/offlineLibrary.ts:230–234`, `lib/providers.tsx:31`) und dazu, dass Logout den Key nicht revoked. Ein Kontowechsel ohne Logout ist über die UI nicht möglich, und `logout()` leert Query-Cache + Offline-Library explizit → kein Datenschutz-Leak, daher verworfen.
- `useClientConfig().search` könnte bei leerem Cache crashen: `packages/shared-react/providers/client-config-provider.tsx:33,44–74` liefert einen gemergten Default – kein Befund.
- `Avatar`-Memo mit fehlendem `assetUrl`-Dep (`components/ui/Avatar.tsx:52–59`): wäre stale, wird aber durch den `key={buster}`-Remount in `Providers` (`lib/providers.tsx:48–51`) bei Adresswechsel maskiert → verworfen.
- Signup-Redirect in Dev-Builds: `app/signin.tsx:114–116` nutzt hart `karakeep://signin`, der Dev-Build hat laut `app.config.js:5–13` aber das Scheme `karakeep-dev`; `packages/shared/utils/redirectUrl.ts:22` akzeptiert nur `karakeep://`. Real, aber ausschließlich Dev-Builds und vermutlich bewusst → nicht als Befund gezählt.
- Geprüft und unauffällig: `lib/offlineLibrary.ts` (Split/Manifest/Reconcile/Rollback), `lib/shareBookmark.ts`, `useConnectionStatus.tsx` (Abort/Timeout-Logik), `lib/settings.ts`-Toolbar-Merge, `toolbar-settings.tsx` (keine Duplikate/Verluste), `manage_tags.tsx`/`manage_lists.tsx` (Invalidierung vorhanden), Suche/Paginierung (`useBookmarkSearchState.ts`), `readerSettings.tsx`, `settings/offline.tsx`, FAB/Theme/Form-Sheet-Helpers, Expo-Config-Plugins.

### Geprüfter Umfang (Mobile)
Alle Dateien unter `apps/mobile/{app,lib,components,plugins}` (Stand 71d42740), zusätzlich die mobil allein genutzten Abhängigkeiten `@karakeep/shared-react/hooks/reading-progress.ts`, `providers/trpc-provider.tsx`, `providers/client-config-provider.tsx`, `hooks/bookmarks.ts`, `hooks/lists.ts`, `hooks/query-invalidation.ts`, `@karakeep/shared/utils/bookmarkUtils.ts`, `redirectUrl.ts`, `@karakeep/shared/types/uploads.ts` sowie zur Absicherung die Lesepfade in `node_modules` (expo-share-intent v7 `parseShareIntent`/`useShareIntent`, react-native-blob-util `fetch.js`, zod v4 Fehlermeldung, react-native-mmkv v4 API, @expo/ui Menu-Typen) und `packages/api/routes/assets.ts`.

## CLI / Browser-Extension / MCP / SDK

Read-only, nur Quelltext gelesen. 10 Findings, keine P1.

**P2 – OpenAPI/SDK-Response-Schemas driften von den tatsächlichen Routen ab (`summarize`, `update`). Hoch.**
- Primär: `packages/open-api/lib/bookmarks.ts:441–473` (summarize, 200 → `zBareBookmarkSchema`) und `398–439` (update); `packages/api/routes/bookmarks.ts:425–431`; `packages/trpc/routers/bookmarks.ts:1539–1543`; SDK-Typ `packages/sdk/src/karakeep-api.d.ts:1551` ff.
- Erwartet vs. tatsächlich: Die Route liefert über den tRPC-Caller `{ summary: string }`, der Spec/SDK-Typ deklariert ein vollständiges Bare-Bookmark → alle deklarierten Felder sind zur Laufzeit `undefined`. Gegenstück: `PATCH /bookmarks/{id}` liefert real das volle Bookmark (mit tags/content/assets), der Spec nur das Bare-Bookmark — der MCP umgeht das mit einem zweiten GET (`apps/mcp/src/bookmarks.ts:256–289`), also zwei Round-Trips statt einem (überflüssige I/O).

**P2 – `karakeep auth init`: eigene `--api-key`/`--server-addr`-Optionen werden ignoriert. Hoch.**
- Primär: `apps/cli/src/commands/auth.ts:61–70` (Optionen am `init`-Subcommand, aber `opts` wird aus `command.parent?.parent?.opts()` = Root-Programm gebaut; nur `rawOpts.force` wird gelesen), Fehlerpfad `108–115`.
- Szenario: `karakeep auth init --api-key K --server-addr S` (so zeigt es `--help`), typischerweise CI/non-TTY.
- Erwartet vs. tatsächlich: Die lokalen Optionen sollten übernommen werden; sie landen in `rawOpts` und werden verworfen. Non-TTY: Abbruch „Both server address and API key are required“ (Exit 1); im TTY wird trotz Flags interaktiv nachgefragt. Nur `karakeep --api-key K auth init` funktioniert.

**P2 – CLI meldet Fehler, beendet sich aber mit Exit-Code 0. Hoch.**
- Primär: `apps/cli/src/index.ts:104–107` (setzt `exitCode` nur für geworfene Fehler), `apps/cli/src/lib/output.ts:48–52` (`printError` setzt keinen `exitCode`), `apps/cli/src/commands/migrate.ts:289–292`, `wipe.ts:203–206`, `bookmarks.ts:661–663` und `754–759`.
- Szenario: `karakeep wipe -y` bricht mitten im Löschen ab oder `karakeep migrate` scheitert → `karakeep migrate … && deploy` läuft weiter; `whoami`/`bookmarks get|list|search|delete|update|add`, `tags *`, `lists *`, `highlights delete`, `admin *` verhalten sich identisch.
- Erwartet vs. tatsächlich: Fehler → Exit ≠ 0. Tatsächlich nur stderr-Ausgabe und Exit 0. Inkonsistent: `assets download` (`assets.ts:115`), `bookmarks content`/`import-singlefile` (373/491), `auth init` (142) und `dump` (rethrow) setzen Exit 1 korrekt.

**P2 – CLI-tRPC-Client nutzt das interne URL-Längenlimit (14000) statt des externen (4000). Hoch.**
- Primär: `apps/cli/src/lib/trpc.ts:14` (und `31`) `maxURLLength: TRPC_MAX_URL_LENGTH_INTERNAL`; Contract in `packages/shared/trpc.ts:3–25` (INTERNAL = Web-App; EXTERNAL = 4000 für Mobile/Extension, weil nginx `large_client_header_buffers` 4×8 KB defaultet).
- Szenario: CLI hinter nginx (typisches Self-Hosting), Batch-URL > 8 KB, z. B. Massen-`bookmarks add`/`update-tags`.
- Erwartet vs. tatsächlich: CLI ist externer Client → 4000; tatsächlich bis 14000 Zeichen → 431 Request Header Fields Too Large.

**P3 – Browser-Extension fordert `fullaccess`-API-Keys an und legt sie in `chrome.storage.sync` ab. Hoch.**
- Primär: `apps/browser-extension/src/SignInPage.tsx:26–33,65–70` (Exchange ohne `scopes`), `utils/settings.ts:7–19,36` (`STORAGE = chrome.storage.sync`), `packages/trpc/routers/apiKeys.ts:183–186` (`scopes ?? [API_KEY_FULL_ACCESS_SCOPE]`), `packages/shared/types/apiKeys.ts:89–100` (`fullaccess` erfüllt jede Scope, inkl. `admin:*`).
- Erwartet vs. tatsächlich: Die Extension braucht nur bookmarks/lists/tags/assets (+`users:read`) → Minimal-Scopes möglich, da `exchange` `scopes` akzeptiert. Tatsächlich voller Zugriff (inkl. Admin-Scopes bei Admin-Nutzern) und Ablage im Sync-Storage (Google-/Firefox-Konto) statt lokal.

**P3 – MCP-Tool-Schemas versprechen unbeschränkte `limit`, die API lehnt sie ab. Hoch.**
- Primär: `apps/mcp/src/bookmarks.ts:28–32`, `lists.ts:260–265`, `tags.ts:97–102,250–255`, `highlights.ts:10–15`; Servergrenzen `packages/api/utils/pagination.ts:6–23` (max 100), `shared/types/bookmarks.ts:288–297,375–382`, `tags.ts:5,55` (max 1000).
- Erwartet vs. tatsächlich: Tool-Schema sollte die Caps der API abbilden (`.max(100)`/`.int()`); tatsächlich fehlen Obergrenzen (search sogar `.int()`/`.min(1)`) → Request scheitert als BAD_REQUEST statt vorab abgelehnt zu werden.

**P3 – Extension: Badge-Pfad verursacht pro Tab-Event mehrfache Settings-Reads und hinterlässt Persister-Subscriptions. Mittel-hoch.**
- Primär: `background/background.ts:312–325` (`checkAndUpdateIcon`) und `:337–343` (`onUpdated` ohne `changeInfo`-Filter), `utils/trpc.ts:23–29,51–54,82–96,122–126`, `utils/badgeCache.ts:32–47`.
- Szenario: jede Seiten-Navigation (`onUpdated` feuert für loading/complete/favicon/title) und wiederholte Settings-Änderungen.
- Erwartet vs. tatsächlich: ein Settings-Read pro Event; tatsächlich ~4 `chrome.storage.sync.get` + 4 Schema-Parses pro Event, Badge-Löschen bei jedem Nicht-`complete`-Update (Flicker). Zusätzlich: bei Änderung von `badgeCacheExpireMs`/`useBadgeCache` wird ein neuer QueryClient erzeugt und `persistQueryClient` erneut aufgerufen, ohne die zurückgegebene Unsubscribe-Funktion zu nutzen (51–54 vs. 82–96) → alte Subscriptions bleiben am Leben.

**P3 – Extension `TagsSelector` sortiert das React-Query-Cache-Array in-place. Mittel-hoch.**
- Primär: `components/TagsSelector.tsx:95–96` (`allTags?.tags.sort(...)`), Datenquelle `:27` (`useQuery(api.tags.list.queryOptions({}))`).
- Erwartet vs. tatsächlich: Kopie sortieren (`[...tags].sort()`); tatsächlich Mutation des im Query-Cache liegenden Arrays ohne Re-Render-Notification — andere Konsumenten desselben Keys sehen eine still veränderte Liste.

**P3 – OpenAPI-Spec dokumentiert zwei existierende Endpunkte nicht. Hoch.**
- Primär: `packages/api/routes/bookmarks.ts:120–121` (`POST /bookmarks/singlefile`, vom CLI genutzt) und `:349–354` (`GET /bookmarks/{bookmarkId}/assets`) fehlen in `packages/open-api/lib/bookmarks.ts` und `karakeep-openapi-spec.json`. SDK-Typen sind dagegen deckungsgleich (55/55 Operation-IDs, 19/19 Schemas, Feld-für-Feld).

**P3 – `SavePage`: unbehandelte Rejection lässt das Popup dauerhaft im Spinner hängen. Mittel.**
- Primär: `apps/browser-extension/src/SavePage.tsx:69–120` (Aufruf `loadBookmarkRequest()` in `:119` ohne `.catch`), Spinnerpfade `190–192` und `287–292`, Storage-Parse `71–79`.
- Szenario: `chrome.storage.session` enthält einen Request, der nicht dem aktuellen `zNewBookmarkRequestSchema` entspricht (ältere Extension-Version), oder `chrome.tabs.query`/`storage` schlägt fehl.
- Erwartet vs. tatsächlich: Fehler sichtbar machen bzw. auf Tab-URL zurückfallen; tatsächlich wirft `zNewBookmarkRequestSchema.parse(req)` **nach** dem `remove()` (`:77`) — der Request ist bereits konsumiert, `pendingBookmark`/`hasCheckedRequest` bleiben ungesetzt, es gibt keinen Catch-Zweig → dauerhaft „Saving Bookmark …“ ohne Fehler und ohne manuelle Speichermöglichkeit.

### Verworfene Hypothesen (Clients)
- CLI-`--asset`-Upload: falscher `assetType` bei PDFs — widerlegt, `uploadAsset` sniffed Magic Bytes (`file-type`), `packages/api/utils/upload.ts:62–76`.
- `dump`/`migrate`/`wipe` ohne `archived`-Filter würden nur nicht-archivierte Bookmarks verarbeiten — widerlegt, `input.archived === undefined` setzt keinen Filter (`models/bookmarks.ts:504–512`).
- Cursor-Roundtrip des CLI (`base64` + JSON-Reviver) würde Daten verlieren — widerlegt, alle Cursor-Typen sind `{id, createdAt}` (`shared/types/pagination.ts:3–6`).
- MCP-Befehle mit 204-Antworten würden fälschlich als Fehler gemeldet — widerlegt, Handler prüfen `res.error`.
- SingleFile-Injection über `chrome.scripting` würde das Content-Script nicht finden — widerlegt anhand des Build-Outputs (`dist/manifest.json`).
- MCP mit fehlendem `KARAKEEP_API_ADDR` — dokumentiert (`docs/docs/05-integrations/03-mcp.md:44`).
- `bookmark.url === currentTabUrl` (`SavePage.tsx:133`) als zu strikter Vergleich — nur spekulativ.
- `chrome.action.openPopup()` vs. nicht-awaitetes `storage.session.set` (`background.ts:180–183,132`) — Race theoretisch, nicht belegt.
- `Layout.tsx:15` (`navigate()` im Render) — Anti-Pattern, aber keine statisch belegbare Fehlfunktion.
- CLI `migrate` ist für Feeds/Webhooks/Prompts nicht idempotent (`migrate.ts:410–485` vs. Listen-Dedup `337–360`) und CLI-`--limit` akzeptiert NaN/0 bzw. ungekappte Werte (`bookmarks.ts:605–610,673–678`) — beides real, aber unterhalb des 10er-Caps zurückgestellt.

### Geprüfter Umfang (Clients)
`apps/cli` (alle 12 Command-Dateien, `lib/{config,globals,http,output,trpc}.ts`, `index.ts`, `vite.config.mts`), `apps/browser-extension` (background/, content-scripts/, utils/ inkl. settings/trpc/badgeCache/storagePersister/permissions/singlefile/url, alle Popup-Seiten und Komponenten, manifest.json, Dist-Manifest als Gegenprobe), `apps/mcp` (alle Tools + shared/utils), `packages/sdk` (index.ts + generierte Typen gegen den Spec diffed), `packages/open-api` (alle lib/-Registries + `karakeep-openapi-spec.json`) sowie als Gegenprobe die REST-Routen (`packages/api/routes/*`, `utils/{types,pagination,readableContent,upload}.ts`) und tRPC-Output-Schemas.

## Verifikation der Runde-1/2-Behauptungen

Read-only, reine Quelltextprüfung. **Ergebnis: 15/15 BESTÄTIGT**, keine
Widerlegung. Korrekturen: 2 Zeilenspannen ungenau, 1 Auslöser falsch
zugeschrieben, 1 Behauptung ist stärker als gemeldet.

**Duplikat-Wurzel:** #3 + #4 (Checkbox) haben dieselbe Wurzel —
positionsbasierte Neuberechnung des Toggles aus der `markdown`-Prop, ohne
Zustand/Autorität; unterschiedliche Symptome am selben Ort. #13/#14 teilen
nur das Thema „Collaborator-Bookmarks“, haben aber verschiedene Wurzeln
(Schreibpfad Merge vs. Lesepfad `userId`-Filter) → **kein** Duplikat.

| # | Behauptung | Verdikt | Kernbeleg / Korrektur |
|---|-----------|---------|----------------------|
| 1 | Admin-Rechte nach DB-Entzug | BESTÄTIGT | `auth.ts:209–211` JWT ohne `maxAge`; `:281–291` Rolle nur beim Login; `trpc/index.ts:220–225`; `admin.ts:536–547` keine Invalidierung |
| 2 | `FREE_BROWSER_CRAWLING_ENABLED` umgangen | BESTÄTIGT | `users.ts:124–125` setzt nur Quotas; `config.ts:610` liefert das Flag im selben Objekt; `schema.ts:61–63` + `drizzle/0059_*` → NULL; `crawlPage.ts:613` blockt nur `false` |
| 3 | Checkbox editiert falsche Task | BESTÄTIGT | `markdown-readonly.tsx:43–47` DOM-Index vs. `:49–53` Regex über Rohtext; Gegenrichtung `> - [ ]` ebenfalls kaputt |
| 4 | Zwei schnelle Klicks | BESTÄTIGT | `markdown-readonly.tsx:45–63`; `BookmarkMarkdownComponent.tsx:19–35` (`isPending` nur im Editor-Zweig); `hooks/bookmarks.ts:110–129` kein `onMutate` |
| 5 | Upload-Fehlerbehandlung wirft | BESTÄTIGT | `upload-file.ts:25–26` wirft `resp.text()`; `:31–36` parst ungeprüft als JSON |
| 6 | Listen-Zyklus hängt Server | BESTÄTIGT (Zeilen ±3) | Loop real `models/lists.ts:619–631` (nicht 622–628); `routers/lists.ts:127–130`; Falsifikationsversuch gescheitert, weil `asZBookmarkList()` bei eigenen Listen `parentId` behält (`:48–51`) |
| 7 | Text nicht leerbar | BESTÄTIGT | `routers/bookmarks.ts:622–628` `if (input.text)`; `:689` `somethingChanged` false → **gar kein Update**, aber Erfolgsantwort |
| 8 | Webhook-Retry off-by-one | BESTÄTIGT (Nuance) | `webhookWorker.ts:129–133`; `config.ts:247` `min(0).default(3)`; Doku sagt „retry“ → 3 = 3 Gesamtversuche, `0` = null Requests |
| 9 | `$aiTags` falscher Zähler | BESTÄTIGT (**stärker**) | `tagging.ts:187–190` filtert `human`; `models/tags.ts:389–399` initialisiert `{ai:0,human:0}` → beide `??` wirkungslos ⇒ **`$aiTags` == `$userTags`**, AI-only-Tags fehlen in beiden |
| 10 | Asset-Adapter ohne Backpressure/Cancel | BESTÄTIGT (qualifiziert) | `api/utils/upload.ts:33–39` kein `pull`/`cancel`; Hono-Pipe erzeugt Senkendruck, die Quelle ignoriert ihn → Speicherwachstum/kein Cleanup |
| 11 | Range-Header unbegrenzt | BESTÄTIGT | `api/utils/assets.ts:48–50`: `bytes=-500` → `start=NaN`; `bytes=0-999999` bei size 1000 → `Content-Length: 1000000`; kein 416 |
| 12 | Netscape-Export doppelt kodiert | BESTÄTIGT | `exporters.ts:129–133` `encodeURI` auf bereits kodierte URL; `%20` → `%2520` (per Node verifiziert) |
| 13 | Merge entkoppelt Collaborator-Bookmarks | BESTÄTIGT (**Auslöser korrigiert**) | `models/lists.ts:1155–1166` ohne `listMembershipId`; Merge verlangt `owner` (`routers/lists.ts:110–111`, `models/lists.ts:455–461`) — **der Eigentümer** merged eine geteilte Quellliste, die Kopien bleiben dauerhaft im Ziel |
| 14 | Public/RSS verlieren Collaborator-Bookmarks | BESTÄTIGT | `models/lists.ts:221,231,234–240,248` (`loadMulti` ohne `listId`, `numItems` zählt trotzdem alle); `bookmarks.ts:643–649` erzwingt `userId = owner` |
| 15 | Parallele Uploads sprengen Quota | BESTÄTIGT (Teil-Mitigation) | `upload.ts:81–93/104–117/119–125` ohne Transaktion; Rate-Limit 30/min (`routes/assets.ts:17–21`) begrenzt, verhindert nicht |

### Neue Befunde aus der Verifikation

**N1 (P2) — Fehlgeschlagener/nie angehängter Upload hinterlässt eine quotenwirksame Asset-Zeile ohne Datei.**
`packages/api/utils/upload.ts:104–117` fügt die Zeile (`size`, `assetType: UNKNOWN`) **vor** `saveAssetFromFile` (`:119–125`) ein; das `finally` (`:133–143`) löscht nur die Temp-Datei. `quotaService.ts:85–94` summiert `assets.size` **aller** Zeilen → dauerhafter Quota-Verbrauch. Kein Aufräumpfad: `adminMaintenance/tasks/tidyAssets.ts:25–40` räumt nur Dateien **ohne** DB-Zeile auf — der umgekehrte Fall wird nie bereinigt.

**N2 (P2) — Öffentliche Listen/RSS laden alle Listen-IDs in ein unbegrenztes `IN (…)`.**
`models/lists.ts:231–240` lädt alle IDs ohne Pagination (`limit` begrenzt nur das Ergebnis) und übergibt sie an `models/bookmarks.ts:504–512` `inArray(bookmarks.id, ids)`. Drizzle erzeugt pro Wert einen Bind-Parameter ohne Chunking; `SQLITE_MAX_VARIABLE_NUMBER` = 32766 → ab ~32.767 Einträgen harter Fehler der **unauthentifizierten** Endpunkte. Verstärker: `packages/db/instrumentation.ts:36–44` hängt das volle SQL an jeden Span.

**N3 (P2) — `deleteChildren` ist nicht atomar; `Promise.all` bricht nicht ab.**
`packages/trpc/routers/lists.ts:127–131`: `getChildren()` → `Promise.all(children.map(l => l.delete()))` → `ctx.list.delete()`, jeder `delete()` in eigener Transaktion (`models/lists.ts:580–596`). Fehler bei einem Kind ⇒ Elternliste bleibt, andere Kinder sind gelöscht (kein Rollback; Enkel via `onDelete: "set null"` werden zu Wurzeln, `schema.ts:551–554`). Nach dem ersten Reject laufen die übrigen Löschungen weiter (fire-and-forget) → gemeldeter ≠ tatsächlicher Endzustand.

## Performance Web / shared-react

Read-only, nur Quelltext gelesen. 12 Findings.

> **Überschneidung:** Finding „Eine eigene highlights.getForBookmark-Query pro
> Zeile“ hat dieselbe Ursache wie der bereits bekannte Runde-1-Befund
> „Vollständige Highlights pro Listeneintrag laden, um nur deren Anzahl
> anzuzeigen“ (#5). Neu ist hier die Client-Seite: N Cache-Einträge/Observer
> und erneute Validierung aller N Queries bei jedem Fokuswechsel.

**P1 – Lexical-Editor + Syntax-Highlighter im Bundle der öffentlichen Listen-Seite. Konfidenz: hoch.**
Primär: apps/web/components/dashboard/bookmarks/BookmarkMarkdownComponent.tsx:1–2 (mit :39–47); apps/web/components/public/lists/PublicBookmarkGrid.tsx:6,80,93; apps/web/components/ui/markdown/markdown-editor.tsx:1–32; apps/web/components/ui/markdown/markdown-readonly.tsx:4–6
Problem: BookmarkMarkdownComponent importiert statisch MarkdownEditor (lexical, @lexical/react, @lexical/code/markdown/rich-text/list/link) und MarkdownReadonly (react-markdown, react-syntax-highlighter/Prism, refractor, dracula-Theme). Beide Zweige liegen im selben Modul und werden über die Laufzeit-Prop readOnly gewählt, der Bundler kann keinen wegwerfen. PublicBookmarkGrid nutzt ihn ausschließlich mit readOnly=true und ist Teil der nicht authentifizierten Route /public/lists/[listId] (app/public/layout.tsx gated nicht). Repo-weit existiert außer MobileEmptyQueueHero und i18n kein einziger `import(...)` in apps/web.
Auswirkung: Jeder (auch anonyme) Besucher einer geteilten Liste lädt Lexical + Prism/refractor (Quellgrößen in node_modules: lexical 1,2 MB, refractor 5,5 MB, react-syntax-highlighter/dist/esm 3,0 MB), obwohl die Seite nur statisches Markdown rendert. (statisch belegt für Importgraph + fehlenden Dynamic-Import; tatsächliche Chunk-/gzip-Größe ungemessen)

**P2 – gsap wird auf jeder Dashboard-Seite eager mitgeladen. Konfidenz: hoch.**
Primär: apps/web/app/dashboard/layout.tsx:15,157 → apps/web/components/dashboard/dense/mobile/MobileShell.tsx:5,24 → apps/web/components/dashboard/dense/mobile/MobileCaptureSheet.tsx:7 (Nutzung erst :86–113,:157–174,:201–219)
Problem: MobileShell wird im Dashboard-Layout gemountet und rendert MobileCaptureSheet unbedingt; das Modul importiert gsap statisch. Genutzt wird gsap erst beim Öffnen des Sheets, das zudem sm:hidden ist (auf Desktop nie sichtbar).
Auswirkung: gsap (gsap-core.js 168 KB Quelle) liegt im eager geladenen Layout-Chunk jeder /dashboard-Seite. (statisch belegt; Bundle-Bytes ungemessen)

**P2 – Chat rendert pro gestreamtem Token die ganze Konversation neu. Konfidenz: hoch.**
Primär: apps/web/components/dashboard/dense/chat/DenseChat.tsx:267–277,:215–224,:288–324,:83–85,:310–312
Problem: appendToLastAssistantMessage erzeugt pro SSE-Delta ein neues messages-Array; DenseChat mappt darüber, ChatTurn ist nicht memoisiert und rendert auch bei unverändertem message-Objekt neu — inkl. MarkdownReadonly, das den vollen Markdown-String pro Render erneut durch remark/rehype schickt. Zusätzlich läuft der Effekt :83–85 bei jeder messages-Änderung, ruft also pro Token scrollIntoView({behavior:"smooth"}) und startet die Animation neu.
Auswirkung: Aufwand ~ Token-Rate × Turns × Markdown-Länge plus Layout/Scroll-Thrashing pro Token. (statisch belegt; Größenordnung ungemessen)

**P2 – Dense-Zeilen ohne memo: jeder Tastendruck rendert alle Zeilen neu. Konfidenz: hoch.**
Primär: apps/web/components/dashboard/dense/DenseFilesView.tsx:124,336,621–627 → apps/web/components/dashboard/dense/DenseBookmarkRow.tsx:29,55–62 (Derivate: lib/dense/format.ts:57–63 `new URL`, lib/dense/summary.ts:69–79 split+Regex)
Problem: searchText ist State von DenseFilesView und wird pro Zeichen gesetzt; danach wird bookmarks.map neu gerendert. DenseBookmarkRow ist eine normale Funktion ohne React.memo, obwohl die Props (bookmark-Referenz aus dem memoisierten bookmarks-Array, selected-Boolean, searchQuery) stabil sind. Pro Zeile laufen dabei erneut Titel-/Domain-Ableitung, Reading-Time und summaryPreview sowie ein vollständiger Subtree-Render.
Auswirkung: O(geladene Zeilen) Renderarbeit + String-/URL-Parsing pro Tastendruck ohne Anzeigeänderung. Gegenbeleg geprüft: memo ist im Projekt üblich (tags/TagPill.tsx:12; BookmarksGrid.tsx:52) — hier fehlt es. (statisch belegt; CPU ungemessen)

**P2 – Jeder Favoriten-/Archiv-Toggle refetcht die komplette Infinite-Query. Konfidenz: mittel-hoch.**
Primär: packages/shared-react/hooks/bookmarks.ts:113–125 (Invalidierung :114–117); apps/web/components/dashboard/dense/DenseBookmarkRow.tsx:192–199 (Auslöser); apps/web/components/dashboard/dense/DenseFilesView.tsx:145–164,233–247
Problem: useUpdateBookmark.onSuccess invalidiert getBookmarks.pathFilter() — das matcht jede getBookmarks-Query (alle Filter, auch Infinite-Queries). Die gemountete Infinite-Query ist aktiv und wird refetcht; query-core/infiniteQueryBehavior lädt beim Refetch jede geladene Seite einzeln nach (`do { fetchPage } while (currentPage < oldPages.length)`), mit httpBatchLink also ein HTTP-Request je Seite. Dabei ist die Zeile über useLiveBookmark/getBookmark bereits aktualisiert.
Auswirkung: Ein Klick erzeugt so viele zusätzliche Requests/serverseitige Arbeit, wie Seiten geladen sind (durch Auto-Pagination unbegrenzt wachsend). (Mechanismus statisch belegt; reale Seitenzahl/Latenz ungemessen)

**P2 – Eine eigene highlights.getForBookmark-Query pro Zeile. Konfidenz: hoch.** *(Ursache = bekannter Befund #5)*
Primär: apps/web/components/dashboard/dense/DenseBookmarkRow.tsx:50–53 (mit :42); apps/web/components/dashboard/dense/DenseFilesView.tsx:233–247
Problem: Jede gerenderte Zeile abonniert ihre eigene Query (eigener Cache-Eintrag + Observer), nur um eine Zahl anzuzeigen; die Zeilenzahl ist durch Sentinel-Auto-Pagination unbegrenzt. Bei staleTime 60s und Default-refetchOnWindowFocus werden beim Fokuswechsel alle N Zeilen-Queries neu validiert. Gegenbeleg: httpBatchLink bündelt die Requests netzwerkseitig (shared-react/providers/trpc-provider.tsx:45 bzw. apps/web/lib/providers.tsx:72).
Auswirkung: N Observer/Cache-Einträge, linear skalierend. (statisch belegt; Client-Anteil ungemessen)

**P2 – Kein Request-Cache für den tRPC-Caller: Queries laufen pro Seitenaufbau mehrfach. Konfidenz: hoch.**
Primär: apps/web/server/api/client.ts:66–68; apps/web/app/dashboard/lists/[listId]/page.tsx:12,32,35; apps/web/app/dashboard/tags/[tagId]/page.tsx:12,34,43; apps/web/app/dashboard/layout.tsx:86–90; Kosten: packages/trpc/models/users.ts:59–61 + :474–493
Problem: `export const api = createCaller(createContext)` ist — anders als getQueryClient (server/api/trpc.ts:8) — nicht in Reacts cache() gewickelt. Jeder await api.x() ist ein frischer Call (neuer Context: getServerAuthSession + headers(), erneute Procedure). lists.get läuft in generateMetadata und im Seitencode zweimal, tags.get ebenso, users.settings() im Layout UND in beiden Detailseiten noch einmal; jeder users.settings()-Aufruf kostet zwei DB-Queries (fromCtx + getSettings).
Auswirkung: Für /dashboard/tags/[tagId] z. B. 8 tRPC-Aufrufe (tags.get + users.settings doppelt) statt 4 fachlich nötigen, bei jedem harten Aufruf (Full Load/Direktaufruf; bei reiner Client-Navigation laufen Layouts nicht neu). (statisch belegt; Latenz ungemessen)

**P2 – Mobiler Such-/Queue-Screen wird auf dem Desktop mitgemountet. Konfidenz: hoch.**
Primär: apps/web/app/dashboard/search/page.tsx:201–207; apps/web/components/dashboard/dense/mobile/MobileSearchHome.tsx:165,67,70–85,237–238,122–160; apps/web/components/dashboard/dense/mobile/MobileEmptyQueueHero.tsx:5,56–87
Problem: Die Route rendert SearchComp (Desktop, hidden sm:flex) und MobileSearchHome gleichzeitig; das Verstecken ist reines CSS (sm:hidden, :165), die Komponente bleibt gemountet. Dadurch läuft die Queue-InfiniteQuery (:70–85, enabled: !hasQuery) auch auf dem Desktop und lädt eine dort nie gezeigte Bookmarks-Seite; im Leer-Fall rendert MobileEmptyQueueHero (:238), dessen Modul three statisch importiert (:5) und in einem display:none-Container eine Vanta-WebGL-Szene mit rAF-Loop startet (:56–87). Der Lenis-Loop daneben ist per matchMedia("(max-width: 639.98px)") geschützt (:122–160) — der Hero nicht.
Auswirkung: unnötiger Request bei jedem Aufruf von /dashboard/search; bei leerer Queue zusätzlich three.js-Chunk + dauerhaft laufende 3D-Animation in unsichtbarem Element (CPU/GPU/Akku). (statisch belegt; Messwerte ungemessen)

**P3 – Effekt-Dependency-Bug bricht das Auto-Nachladen. Konfidenz: mittel.**
Primär: apps/web/components/public/lists/PublicBookmarkGrid.tsx:221–225; apps/web/components/dashboard/highlights/AllHighlights.tsx:69–73
Problem: Beide Effekte prüfen hasNextPage/isFetchingNextPage und rufen fetchNextPage(), haben aber nur [loadMoreButtonInView] als Dependency. Sie laufen nur beim Umschlagen des Sichtbarkeitswerts und mit den Werten des Renders, in dem er sich geändert hat. Bleibt der Sentinel nach dem Nachladen im Viewport oder ist gerade ein Fetch aktiv, folgt kein weiterer Fetch.
Auswirkung: Nachladen kann hängen bleiben bis zum manuellen „Load more". Funktionaler Bug. Gegenbeleg/Vergleich: DenseFilesView.tsx:234–247 und BookmarksGrid.tsx:215–219 haben vollständige Dependencies. (statisch belegt)

**P3 – Ungenutzter Vor-Fork-Grid-Teilbaum + davon abhängige Bulk-UI. Konfidenz: hoch.**
Primär: apps/web/components/dashboard/bookmarks/{BookmarksGrid.tsx, BookmarksGridSkeleton.tsx, BookmarkCard.tsx, LinkCard.tsx, TextCard.tsx, AssetCard.tsx, UnknownCard.tsx, BookmarkLayoutAdaptingCard.tsx (514 Z.), NotePreview.tsx, TagList.tsx, BookmarkActionBar.tsx, BookmarkOwnerIcon.tsx}, apps/web/components/dashboard/KeyboardShortcutsDialog.tsx, apps/web/lib/hooks/useBookmarkKeyboardNavigation.ts — zusammen 2.412 Zeilen; apps/web/components/dashboard/GlobalActions.tsx:9–16; apps/web/lib/bulkActions.ts:9,58,77–81
Problem: BookmarksGrid wird von keiner Datei importiert (auch nicht relativ) → gesamter Teilbaum unerreichbar; er ist zugleich einziger Aufrufer von setInBookmarkGrid(true) (BookmarksGrid.tsx:209), hinter dem GlobalActions ViewOptions/BulkBookmarksAction/SortOrderToggle einblendet (dort also nur ein leeres div). visibleBookmarks im bulkActions-Store wird nur von BookmarksGrid:199 geschrieben, wodurch getSelectedBookmarks()/selectAll() auf lebenden Seiten immer leer bleiben.
Auswirkung: ~2.400 Zeilen toter Pflegeaufwand + Illusion vorhandener Bulk-Aktionen. Kein Bundle-Effekt, da nichts importiert. (statisch belegt)

**P3 – components/wrapped/* ist komplett unerreichbar. Konfidenz: hoch.**
Primär: apps/web/components/wrapped/WrappedModal.tsx:1–92, WrappedContent.tsx:1–390, ShareButton.tsx:1–92, index.ts:1–3 (577 Zeilen)
Problem: Keine Datei in app/, components/, lib/ referenziert components/wrapped oder einen Export daraus (Suche nach „wrapped" außerhalb des Verzeichnisses: kein Treffer); das Barrel hat keinen Abnehmer. ShareButton.tsx:6 ist der einzige Nutzer von modern-screenshot.
Auswirkung: toter Code + ungenutzte Abhängigkeit (modern-screenshot, 212 KB in node_modules). Kein Laufzeit-/Bundle-Effekt. (statisch belegt)

**P3 – React-Query-Cache wird im Cleanup-Screen in-place sortiert. Konfidenz: hoch.**
Primär: apps/web/components/dashboard/cleanups/TagDuplicationDetention.tsx:228–255 (Sortierung :230)
Problem: `allTags.tags.sort(...)` mutiert das Array der Query-Cache-Daten in-place statt zu kopieren, d. h. der geteilte Cache-Eintrag von tags.list({}) ändert sich für alle Konsumenten ohne Invalidierung/Refetch. Zusätzlich wird die destrukturierte Variable allTags im Effekt neu zugewiesen (:229).
Auswirkung: Konsistenz-/Korrektheitsbug (Reihenfolge-Effekte bei anderen Lesern desselben Keys). (statisch belegt; kein messbarer Perf-Effekt)

### Verworfene Hypothesen (Performance Web)
- refetchOnMount: true (DenseFilesView.tsx:158, PublicBookmarkGrid.tsx:216, settings/rules/page.tsx:29) als Doppel-Fetch: widerlegt — in React Query v5 bedeutet true „nur wenn stale"; mit initialData (frisch) und globalem staleTime 60s erfolgt kein Refetch. Nur "always" erzwingt (so in DenseSidebar.tsx:265).
- ReactQueryDevtools im Root-Layout (app/layout.tsx:74) im Prod-Bundle: widerlegt — der Paket-Entry ersetzt die Komponente bei NODE_ENV !== "development" durch () => null und deklariert sideEffects: false (Paketindex geprüft), der Devtools-UI-Teil wird weggetree-shaked.
- useSearchHistory-Memo ohne adapter-Dependency (shared-react/hooks/search-history.ts:72) als Stale-Adapter-Bug: widerlegt für alle drei Aufrufer (SearchInput.tsx:91, app/logout/page.tsx:11, apps/mobile) — die Adapter sind zustandslose localStorage/AsyncStorage-Closures.
- Cursor-Mismatch zwischen SSR-erster Seite und useCursorV2-Folgeseiten: widerlegt — useCursorV2 (shared/types/bookmarks.ts:302) wird vom Router/Model nie gelesen (No-op), beide Pfade nutzen dieselbe Cursor-Kodierung.
- resolveConfig(tailwindConfig) pro Resize (BookmarksGrid.tsx:78,96) als Hot-Path-Kosten: nur in totem Code; die lebende Variante PublicBookmarkGrid.tsx:227 ist memoisiert.
- „Keine Thumbnails"-Verstoß auf /public/lists: bewusst nicht gemeldet (Route außerhalb der Dashboard-Design-Mission).
- Unbounded DOM/fehlende Virtualisierung in DenseFilesView: nicht als eigenes Finding gemeldet (dense list/grid composition gilt als bereits abgedeckt); nur die konkreten Zeilen-Folgen (Per-Zeilen-Query, fehlendes memo).
- .sort() in-place in preview/AttachmentBox.tsx:108 (abgedeckte Preview-Route) und lists/CollapsibleBookmarkLists.tsx:64 (frisches Object.values()-Array, idempotent).
- Doppeltes getUserLocalSettings() in app/layout.tsx: einfacher Cookie-Read, keine messbaren Kosten.

### Geprüfter Umfang (Performance Web)
apps/web: app/dashboard/* (layout, bookmarks, search, favourites, archive, lists, tags, feeds, highlights, chat, cleanups-Page), app/admin/layout, app/public/*, app/settings/* (Stichproben), app/layout; components/dashboard/** (dense inkl. mobile/, bookmarks/, lists/, tags/, highlights/, preview-Stichproben, chat, cleanups, header, shared/sidebar), components/public/**, components/settings-Stichproben, components/wrapped, components/ui/markdown; lib/dense/*, lib/hooks/*, lib/store/*, lib/userLocalSettings/*, lib/readerSettings, lib/providers, lib/bulkActions; server/api/client.ts, server/api/trpc.ts, server/auth.ts. packages/shared-react: hooks/* (bookmarks, lists, tags, highlights, assets, reading-progress, search-history, query-invalidation, bookmark-grid-context), providers/trpc-provider. Quer-Checks: Importgraph (Importer-/Referenz-Grep je Komponente), globaler staleTime, Query-Core-Refetch-Verhalten für Infinite Queries, Bundle-Größen aus node_modules.

## Datenbank & Shared-Layer (`packages/db`, `packages/shared*`, `packages/trpc/lib`)

Read-only, keine Datei geändert. 9 Findings.

> **Überschneidung:** Finding 1 hat dieselbe Ursache wie der bereits bekannte
> Runde-2-Befund „Ollama kann vor Empfang der HTTP-Header weder durch Fetch-
> noch durch Job-Timeout abgebrochen werden“ (#40). Neu ist die Präzisierung,
> dass der `signal`-Schlüssel von ollama-js **immer** gesetzt wird (auch bei
> Embeddings) und der Timeout damit für jeden ollama-js-Aufruf wirkungslos
> ist — nicht nur für Streaming.

1. **P2 – customFetch verwirft den Timeout, sobald `init.signal` gesetzt ist (bei ollama-js immer). Hoch.**
Primär: `packages/shared/customFetch.ts:15–19`
Szenario: ollama-js baut sein fetch-init immer mit einem eigenen `signal`-Schlüssel, auch wenn der Wert `undefined` ist (`node_modules/ollama/dist/browser.mjs:126–137`, `signal: options?.signal`), für Streaming zusätzlich mit echtem AbortController-Signal (`browser.mjs:257`). Karakeep reicht `customFetch` als `fetch` an Ollama durch (`packages/shared/inference.ts:497–499, 548`; `packages/shared/chatInference.ts:86, 92`). Weil `{ signal: AbortSignal.timeout(timeout), ...init }` das init **nach** dem Timeout-Signal spreadet, überschreibt der Property-Schlüssel `signal` (Wert egal) den Timeout.
Erwartet vs. tatsächlich: `INFERENCE_FETCH_TIMEOUT_SEC` (Default 300 s) soll jeden Inferenz-/Embedding-Request begrenzen; tatsächlich ist der Timeout für **jeden** ollama-js-Aufruf wirkungslos — auch für Embeddings (`post` ohne options.signal setzt den Schlüssel trotzdem). Chat-Streaming (`streamChatCompletion`) hängt damit unbegrenzt an einem blockierten Ollama; der gequeute Inferenz-Pfad wird nur noch vom Job-Timeout (`serverConfig.inference.jobTimeoutSec`, 30 s) begrenzt. OpenAI-Pfad unbetroffen (SDK-eigenes `timeout`).

2. **P2 – `validateRedirectUrl` lässt `/\host` durch (Open-Redirect-Bypass). Hoch.**
Primär: `packages/shared/utils/redirectUrl.ts:17–19`
Szenario: Der Guard prüft nur `startsWith("/") && !startsWith("//")`. `/\evil.com` passiert ihn; der WHATWG-URL-Parser behandelt `\` in Special-Schemes wie `/`, d. h. der Browser löst es als protokoll-relative URL `//evil.com` auf. Senken: `apps/web/app/signup/page.tsx:19,28` (`redirect(redirectUrl)`), `check-email/page.tsx:28`, `verify-email/page.tsx:35` und `packages/trpc/routers/users.ts:83` (Redirect-URL nach Signup/Mail-Bestätigung); Test-Suite deckt nur `//evil.com` ab (`redirectUrl.test.ts:26–29`).
Erwartet vs. tatsächlich: Nur same-origin-Pfade und `karakeep://` sollen erlaubt sein; tatsächlich ist ein Redirect auf eine fremde Origin möglich (klassischer Phishing-/Token-Leak-Vektor).

3. **P3 – `saveAssetFromFile` prüft die freigegebene Größe nicht, obwohl der Kommentar es behauptet. Hoch (Fakt), mittel (Auswirkung).**
Primär: `packages/shared/assetdb.ts:707–734` (Kommentar 724–726), Vergleich: `assetdb.ts:700–702`
Szenario: Der Buffer-Pfad `saveAsset` verifiziert `quotaApproved.approvedSize < asset.byteLength` und wirft. Der Datei-Pfad prüft nur `quotaApproved.userId` und behauptet im Kommentar, die Größe werde „vom Store beim Lesen der Datei“ verifiziert — beide Implementierungen (`LocalFileSystemAssetStore.saveAssetFromFile:181–206`, `S3AssetStore.saveAssetFromFile:409–435`) tun das nicht; sie kopieren/streamen und löschen das Temp-File ohne jede Größenprüfung.
Erwartet vs. tatsächlich: Ein über `checkStorageQuota` freigegebener Token soll an die tatsächlich geschriebene Menge gebunden sein; tatsächlich kann ein Aufrufer mit gültigem Token eine beliebig große Datei ablegen (Storage-Quota-Bypass, heute z. B. relevant, falls ein neuer Aufrufer `approvedSize` und Datei nicht aus derselben Quelle ableitet; aktuelle Aufrufer `api/utils/upload.ts:83/119`, `crawlers/assetStorage.ts`, `backupWorker.ts` stimmen Größe und Datei heute noch überein).

4. **P3 – Kein Index auf `bookmarksInLists.listMembershipId` → Full-Table-Scan bei Cascade-Deletes. Hoch.**
Primär: `packages/db/schema.ts:579–584`; Index-Stand: `packages/db/drizzle/meta/0094_snapshot.json` (Tabelle `bookmarksInLists`: nur `bookmarksInLists_listId_bookmarkId_idx` + PK `(bookmarkId,listId)`), angelegt in `packages/db/drizzle/0065_collaborative_lists.sql`
Szenario: `listMembershipId` referenziert `listCollaborators.id` mit `ON DELETE CASCADE`. Beim Entfernen eines Kollaborators (`packages/trpc/models/lists.ts:745–755`, ebenso „Liste verlassen“ 779–786) oder beim Löschen einer Liste (Cascade auf `listCollaborators`, danach je Zeile erneut Cascade) führt SQLite pro gelöschter Elternzeile ein `DELETE FROM bookmarksInLists WHERE listMembershipId = ?` aus. Weder PK noch der vorhandene Index beginnen mit dieser Spalte.
Erwartet vs. tatsächlich: Ein indexierter Cascade-Delete; tatsächlich ein Full-Table-Scan von `bookmarksInLists` pro Kollaborator. Statisch belegt (Index fehlt); absolute Kosten „needs measurement“ (Skala = Anzahl Listeneinträge bzw. Kollaboratoren). Migration 0087 hat genau diese Lücke für andere FK-Spalten geschlossen, hier fehlt sie.

5. **P3 – `listsToTree` dereferenziert `refIdx[parentId]` ungeprüft → TypeError bei listenfremder `parentId`. Mittel-hoch.**
Primär: `packages/shared/utils/listUtils.ts:31–38` (Zeile 34)
Szenario: `parentId` ist ein freier String (`packages/shared/types/lists.ts:28`), wird ungeprüft in die DB geschrieben (`packages/trpc/models/lists.ts:266`) und für eigene Listen unverändert zurückgegeben (`getAllOwned`, models/lists.ts:323 ff.); nur geteilte Listen bekommen `parentId: null` (models/lists.ts:60–70). Zeigt eine eigene Liste auf eine Liste, die im Ergebnis-Set fehlt (z. B. `parentId` = fremde Liste per API gesetzt; oder der Nutzer verliert später den Zugriff auf die Elternliste, unter der er eine eigene Unterliste angelegt hat), ist `refIdx[parentId]` `undefined` und `.children.push(node)` wirft.
Erwartet vs. tatsächlich: Aufbau eines Baums aus der Liste der sichtbaren Listen (Client: `packages/shared-react/hooks/lists.ts:174`, CLI `apps/cli/src/commands/lists.ts:37`); tatsächlich ein unbehandelter TypeError, der die Listen-/Dashboard-Query des betroffenen Nutzers dauerhaft bricht (die Verwaistheit ist über die API reparierbar, aber es gibt keinen Guard).

6. **P3 – `toAbsoluteDate` Monats-/Jahresüberlauf verfälscht `age:`-Filter. Hoch.**
Primär: `packages/shared/utils/relativeDateUtils.ts:23–40` (Zeile 32–34)
Szenario: `date.setMonth(date.getMonth() - amount)` bzw. `setFullYear(...)` nutzen JS-Überlauf: Am 31.03. ergibt `-1 Monat` den „31.02.“ → 03.03. (bzw. 02.03. im Folgejahr), am 29.02. eines Schaltjahrs ergibt `-1 Jahr` den 01.03. Der Matcher `age:<1m` (`packages/shared/searchQueryParser.ts:287–296`) vergleicht dann mitunter gegen ein Datum **in der Zukunft**.
Erwartet vs. tatsächlich: Schwelle „vor einem Monat“; tatsächlich eine um mehrere Tage bis Wochen zu späte Schwelle, wodurch `age:`-Suchen (und Smart Lists, die darauf basieren) am Monatsende/29.02. fälschlich (fast) leer zurückkommen. Kein Test deckt `relativeDateUtils` ab.

7. **P3 – `getBookmarkIdsFromMatcher` materialisiert unbegrenzt IDs (Speicher + SQLite-Parametergrenze). Hoch (Mechanik), Grenzwert build-abhängig.**
Primär: `packages/trpc/lib/search.ts:93–97` (`getIds`), `422–433` (`and`/`or` = alle Teilqueries parallel + vollständige Ergebnismengen), `441–447`
Szenario: `and`/`or` holen jede Teilmenge komplett nach Node und bilden Schnitt/Vereinigung in JS-Maps; das Ergebnis geht als vollständige ID-Liste weiter, u. a. in `inArray(bookmarks.id, input.ids)` (`packages/trpc/models/bookmarks.ts:473, 511`) und in einen `values([...])`-Masseninsert beim Listen-Merge (`models/lists.ts:1145 ff.`). Statisch belegt: keine Limitierung/Chunking, Laufzeit und Speicher wachsen linear mit der Trefferzahl (bzw. k-fach bei `and`/`or`), und die DB-Query bekommt genau so viele Bind-Parameter wie IDs.
Erwartet vs. tatsächlich: Für breite Matcher (z. B. `is:archived` auf großen Bibliotheken) müsste serverseitig limitiert/gechunkt oder als Subquery gejoint werden; tatsächlich bricht die Query oberhalb der SQLite-Variablengrenze (`SQLITE_MAX_VARIABLE_NUMBER`, im mitgelieferten better-sqlite3-Build 32 766) hart ab und die Parallelität der Teilqueries ist unbegrenzt. Exakter Schwellenwert „needs measurement“ (Build-abhängig), Speicher-/Query-Wachstum statisch belegt.

8. **P3 – Lokale Asset-Ablage ist nicht atomar (asset.bin/metadata.json parallel). Mittel.**
Primär: `packages/shared/assetdb.ts:166–179` und `195–206`; Lesepfad `247–255`, `281–298`
Szenario: `saveAsset`/`saveAssetFromFile` schreiben `asset.bin` und `metadata.json` per `Promise.all` nebeneinander in das Asset-Verzeichnis; es gibt kein Temp-File + Rename und kein Aufräumen bei Teilfehlern/Crash/ENOSPC. Der S3-Backend ist demgegenüber ein einzelnes PUT (atomar). Ein Absturz zwischen den beiden Writes hinterlässt ein Verzeichnis mit `asset.bin`, aber ohne/defekter `metadata.json`.
Erwartet vs. tatsächlich: `readAsset` soll `{asset, metadata}` liefern (bzw. `deleteAsset`/`getAllAssets` sollen funktionieren); tatsächlich wirft `readAssetMetadata`/`readAsset` dann ENOENT bzw. einen Zod-Fehler, und `getAllAssets` (`323–343`) bricht beim iterieren für dieses Asset ab, obwohl das Asset in der DB und in der Quota-Rechnung (`assets.size`) bereits existiert.

9. **P3 – `INFERENCE_FETCH_TIMEOUT_SEC` akzeptiert 0 und negative Werte. Mittel.**
Primär: `packages/shared/config.ts:90` (kein `.positive()`); Verwendung `packages/shared/customFetch.ts:15–16`
Szenario: `z.coerce.number().default(300)` erlaubt 0 und negative Zahlen. `AbortSignal.timeout(0)` liefert ein sofort abgebrochenes Signal → jeder Fetch scheitert unmittelbar mit TimeoutError (dort, wo der Timeout überhaupt greift, s. Finding 1); ein negativer Wert lässt `AbortSignal.timeout()` einen `RangeError` werfen, der erst zur Laufzeit mitten im Request auftaucht und wie ein Provider-Fehler aussieht. Kontrast: `OPENAI_TIMEOUT_SEC` (config.ts:79) und `EMBEDDING_CONTEXT_LENGTH` (103) sind mit `.positive()` validiert, dieselbe Klasse von Timeouts/Workern (`*_NUM_WORKERS`, `MAX_ASSET_SIZE_MB`) nicht.
Erwartet vs. tatsächlich: Fehlkonfiguration soll beim Start sichtbar scheitern (Zod-Issue); tatsächlich startet der Dienst und alle Inferenz-/Embedding-Requests scheitern still oder werfen einen irreführenden Laufzeitfehler.

### Verworfene Hypothesen (Data & Shared Layer)
- **Schema/Migrations-Drift in `packages/db`**: systematischer Abgleich von `schema.ts` gegen `packages/db/drizzle/meta/0094_snapshot.json` (95 Journal-Einträge 0000–0094) ergab keine Abweichung: alle in `schema.ts` deklarierten Index-/Unique-Namen existieren im Snapshot (nur auto-benannte uniques zusätzlich) und umgekehrt. Manuell geprüft und deckungsgleich: `lastSavedAt`-Rename + Feld/Spalten-Mismatch `dbCreatedAt`/`createdAt` (schema.ts:212–221 vs. 0092), Drops aus 0091, `normalizedName`-Generated-Column (0071), `readerView*`+`transcript` (0093/0094), `importSessions`-Zähler (0090), `userReadingProgress` (0080), `listCollaborators.createdAt` statt Feldname `addedAt` (0065 vs. schema.ts:610). Auch keine verwaisten Index-Definitionen.
- **Path-Traversal über `assetId`/`userId` in `LocalFileSystemAssetStore.getAssetDir`** (`assetdb.ts:141–143`): beide Aufrufer validieren die ID vorher gegen die DB (`packages/api/routes/assets.ts:63–69` via `Asset.fromId`, `packages/api/routes/public/assets.ts:35–47` inkl. signiertem Token + DB-Lookup) → nicht ausnutzbar; keine Validierung im Store bleibt Defense-in-Depth, kein Finding.
- **`getAssetSize`/Range-Parität lokal vs. S3** (`assetdb.ts:221–245` vs. `448–459`): inklusives `end` auf beiden Seiten identisch; kein Parity-Bug.
- **`buildCrawlIdempotencyKey` (`shared-server/src/queues.ts:115–117`)**: `JSON.stringify(payload, Object.keys(payload).sort())` ist für die flachen Payloads kanonisch; die bewusste Flag-Unterscheidung ist im Kommentar dokumentiert → kein Bug.
- **`getInMemoryDB` nutzt `__dirname` in einem `"type": "module"`-Paket** (`packages/db/drizzle.ts:35`): Vitest stellt `__dirname` bereit (vgl. `packages/shared/import-export/parsers.test.ts:331`) → kein Bug.
- **`attachments.ts:23` `AssetTypes.UNKNOWN → "bannerImage"`**: verdächtig, aber keine Codestelle gefunden, in der das zu einem falschen Verhalten führt → belegt zu wenig, fallengelassen.
- **`NEXTAUTH_URL`-Default `http://localhost:3000` vs. Doku „Not set“** (`config.ts:57–61`, `docs/docs/03-configuration/01-environment-variables.md:15`): Doku räumt explizit ein, dass die App ohne die Variable läuft (nur falsche Redirect-Adressen) → bewusster Default, kein Finding.
- **`INFERENCE_TEXT_MODEL`-Default `gpt-5.6-luna`**: bewusster Commit `1bc351a7` inkl. Doku-Update (`docs/.../01-environment-variables.md:106`) → kein Finding.
- **`limitConcurrency(0)`-Deadlock** (`packages/shared/concurrency.ts:36–55`): einzige Aufrufer sind Web-Hooks mit konstanten Werten; Server-Pfade nutzen die Runner-Concurrency des Queue-Plugins (Plugin-Scope, außerhalb des Auftrags) → fallengelassen.
- **`serveAsset` (`packages/api/utils/assets.ts:46–61`)** setzt bei fehlendem Range kein `Accept-Ranges`, bei ungültigem Range keine 416-Prüfung — Route-Layer, laut Auftrag abgedeckt → nicht gemeldet.

### Geprüfter Umfang (Data & Shared Layer)
Gelesen (vollständig oder gezielt): `packages/db/schema.ts`, `packages/db/drizzle/*.sql` + `meta/_journal.json` + `meta/0094_snapshot.json`, `packages/db/{drizzle,index,migrate,instrumentation,drizzle.config}.ts`; `packages/shared/{config,customFetch,assetdb,inference,chatInference,search,vectorStore,queueing,ratelimiting,concurrency,plugins,ratelimiting,signedTokens,langs,logger,tryCatch,trpc,summaryMarkers,searchQueryParser}.ts` + `utils/*`; `packages/shared-server/src/{plugins,queues,tracing,eventLogger,services/quotaService,services/aiProviderConfigService}.ts`; `packages/trpc/lib/{search,searchRanking,rateLimit,ruleEngine,actor,impersonate,attachments,linkPreview,turnstile,eventLog,tracing,rateLimitedEvent}.ts`. Zusätzlich als Gegenbelege: `packages/api/routes/assets.ts`, `routes/public/assets.ts`, `utils/{assets,upload}.ts`, `packages/trpc/models/{lists,bookmarks}.ts` (nur Aufrufketten), `docs/docs/03-configuration/01-environment-variables.md`, Tests `packages/trpc/lib/__tests__/search.test.ts`, `packages/e2e_tests/tests/assetdb/interface-compliance.test.ts`, `node_modules/ollama/dist/browser.mjs`.
Nicht ausgeführt: keine Installs/Builds/Tests/Migrationen, keine DB- oder Service-Verbindung.

## Restliche Web-Bereiche (Settings, Admin, Chat, Auth, PWA, i18n)

Read-only, nur read/grep. 12 Befunde (davon 6 P2).

**P2 – Laufzeit-AI-Provider-Override wird an vier Stellen durch die env-basierte `isConfigured`-Flagge ausgeblendet. Hoch.**
- Primär: `packages/shared/config.ts:407–408` und `:696–701`, `apps/web/app/settings/layout.tsx:93–101`
- Zusatz: `components/dashboard/dense/chat/DenseChat.tsx:87–88,151–171`; `components/dashboard/bookmarks/SummarizeBookmarkArea.tsx:138`; `dense/DenseBookmarkDetail.tsx:129,255–264`; Override-Schreibpfad `packages/trpc/routers/admin.ts:1049`; Gegenbeleg `app/api/chat/route.ts:153–163`, `apps/workers/workers/inference/inferenceWorker.ts:111–112`
- Szenario: Admin konfiguriert Inference ausschließlich über Settings → AI (DB-Override), ohne `OPENAI_API_KEY`/`OLLAMA_BASE_URL` in der Umgebung. Backend/Pipeline akzeptieren das, `clientConfig.inference.isConfigured` bleibt aber `false` (prüft nur die zwei env-Variablen).
- Erwartet vs. tatsächlich: erwartet — UI richtet sich nach der *effektiven* Konfiguration (genau das begründet der Kommentar in `app/api/chat/route.ts:153–155`); tatsächlich — (a) der einzige Link auf `/settings/ai` fehlt in der Settings-Sidebar (und im mobilen Nav) → Seite nur per URL erreichbar (**Henne-Ei**: die Seite zum Setzen des Overrides ist ohne env-Inference nicht erreichbar), (b) `/dashboard/chat` zeigt statt Chat die Konfigurationswand, (c) „Summarize with AI“ verschwindet, (d) Re-Summarise wird entfernt/ausgegraut.

**P2 – `bookmarks.summarizeBookmark` ignoriert den DB-Override und scheitert mit „No inference client configured“. Hoch.**
- Primär: `packages/trpc/routers/bookmarks.ts:1551–1557`
- Zusatz: Aufrufer `packages/shared-react/hooks/bookmarks.ts:132–141`; korrekte Pfade `app/api/chat/route.ts:156–157`, `inferenceWorker.ts:111–112`; Auswertung `packages/shared/inference.ts:270–280`
- Erwartet vs. tatsächlich: Die Prozedur ruft `InferenceClientFactory.build()` **ohne** `AIProviderConfigService.get(db)` → BAD_REQUEST bei Override-only. Zweitwirkung: sind env-Provider und Override gleichzeitig gesetzt und wählt der Admin im Override einen anderen Anbieter/Modell, nutzt genau dieser Pfad weiter den env-Anbieter (inkonsistent zu Worker und Chat).

**P2 – Open Redirect über `redirectUrl=/\<host>`. Hoch.** *(bestätigt den Data-Layer-Befund, hier mit zweitem Sink)*
- Primär: `apps/web/app/signup/page.tsx:19–25`, `packages/shared/utils/redirectUrl.ts:16–19`
- Zusatz: `components/signup/SignUpForm.tsx:161–166`
- Szenario: eingeloggtes Opfer öffnet `https://<host>/signup?redirectUrl=/\evil.com` (bzw. `/%5Cevil.com`). `validateRedirectUrl` akzeptiert den Wert, `signup/page.tsx:24` ruft `redirect(redirectUrl)`, Next sendet den String unverändert als `Location`; WHATWG-Parsing behandelt `\` bei special schemes wie `/` → `https://evil.com/`. Zweiter Sink: `router.replace(redirectUrl)` nach Auto-Login (`SignUpForm.tsx:164`); der `window.location.href`-Zweig ist auf `karakeep://` begrenzt.
- Erwartet vs. tatsächlich: nur same-origin-Pfade (auch parser-normalisierte Formen ablehnen). Kein anonymer Angriff: der Sofort-Redirect braucht eine Session (`signup/page.tsx:23`), das Formular liefert denselben Sink aber auch ohne Session ⇒ P2, nicht P1.

**P2 – `/signin` verwirft `redirectUrl`/`callbackUrl`: nach dem Login landet man immer auf `/`. Hoch.**
- Primär: `apps/web/app/signin/page.tsx:6–10`, `components/signin/CredentialsForm.tsx:102`
- Zusatz: `components/signin/SignInProviderButton.tsx:18` (hart `callbackUrl: "/"`), `app/verify-email/page.tsx:95–99` (baut `/signin?redirectUrl=…`, inkl. `karakeep://`-Deeplink), `components/signin/OAuthAutoRedirect.tsx:16` (einziger Leser von `callbackUrl`, nur im Auto-Redirect-Modus); Gegenbeispiel Signup `app/signup/page.tsx:11–33`
- Erwartet vs. tatsächlich: Die Signin-Seite deklariert kein `searchParams`; `CredentialsForm` ersetzt hart durch `/` und ignoriert auch die von `signIn(..., {redirect:false})` zurückgegebene URL → Deep-Link/angeforderte Seite verloren, Mobile-App-Nutzer landen im Browser-Dashboard. Kein Redirect-Sink, reiner Funktionsverlust.

**P2 – Die gesamte Dense-Oberfläche ist nicht i18n-verdrahtet; die Spracheinstellung wirkt dort nicht. Hoch.**
- Primär: `apps/web/components/dashboard/dense/**`, `apps/web/lib/dense/**` (**0 Treffer** für `useTranslation` und `t(` in allen 30 `.tsx` + 23 `.ts`)
- Zusatz: Beispiele `DenseSidebar.tsx:446,524` (`title="Settings"`), `DenseChat.tsx:188,210,246`, `QuickAddDialog.tsx:50`; Einstellung existiert in `components/settings/UserOptions.tsx:33–53`
- Erwartet vs. tatsächlich: Sprache auf Deutsch gestellt → Einstellungsseite ist deutsch, die Hauptoberfläche (Liste, Detail, Mobile-Shell, Chat, Quick-Add, Tags/Dialoge) bleibt komplett englisch. Konsequenz für die Key-Prüfung: die Menge der von der Fork verwendeten Keys ist leer, ein „fehlender Key“ ist damit nicht detektierbar.

**P2 – `/api/chat` umgeht den Demo-Modus und hat kein Rate-Limit. Mittel–hoch.**
- Primär: `apps/web/app/api/chat/route.ts:145–163`
- Zusatz: Demo-Guard nur für tRPC-Mutationen `packages/trpc/index.ts:95–104`; Rate-Limit-Vergleich `routers/bookmarks.ts:1527–1533`; Last pro Anfrage `route.ts:87–120,183` (Phrase + jedes Keyword = bis zu 9 Suchabfragen, dann LLM-Stream)
- Erwartet vs. tatsächlich: In einer Demo-Instanz (`DEMO_MODE=true`, `CHAT_ENABLED=true`) kann jeder angemeldete Besucher beliebig viele LLM-Aufrufe auslösen; `demoMode` wird in der Route nirgends geprüft, ein Rate-Limit fehlt → Kostenmissbrauch.

**P3 – Öffentliche Listen-Seite verschluckt alle Nicht-404-Fehler und gibt `undefined` zurück. Hoch.**
- Primär: `apps/web/app/public/lists/[listId]/page.tsx:79–84` (gleiches Muster `:30–38`)
- Erwartet vs. tatsächlich: Der catch behandelt nur `NOT_FOUND`, schluckt den Rest, die Komponente fällt aus try/catch und gibt `undefined` zurück → React „Nothing was returned from render“ statt klassifiziertem Fehler. Gegenprüfung: die fehlende eigene Auth-Prüfung der Public-Seite ist **kein** Befund (Publicness wird serverseitig in `packages/trpc/models/lists.ts:161–186` erzwungen).

**P3 – `ValidAccountCheck` wiederholt Fehler unbegrenzt und meldet sie nie. Hoch.**
- Primär: `apps/web/components/utils/ValidAccountCheck.tsx:16–30`
- Zusatz: gemountet in `app/dashboard/layout.tsx:123` und `app/settings/layout.tsx:189`
- Erwartet vs. tatsächlich: `retry` liefert für alles außer UNAUTHORIZED `true` → unbegrenzte Retries mit Exponential-Backoff (React-Query-Standardlimit damit aufgehoben), z. B. bei 500/Offline; der Fehler wird nirgends gerendert, die `whoami`-Query läuft dauerhaft weiter (≈ alle 30 s pro Seite).

**P3 – Error Boundary verwirft `error`/`reset`: kein Logging, „Try Again“ lädt die ganze Seite neu. Hoch.**
- Primär: `apps/web/app/dashboard/error.tsx:1–7`, `components/dashboard/ErrorFallback.tsx:28`
- Zusatz: `app/dashboard/layout.tsx:149–153`, `app/settings/layout.tsx:202–206`
- Erwartet vs. tatsächlich: `Error()` ignoriert die von Next übergebenen Props `error`/`reset`; der Fallback bietet nur `window.location.reload()`. In den Layouts wird `fallback` außerdem als Element (nicht als Render-Funktion) übergeben, wodurch `resetErrorBoundary` ebenfalls fehlt → Fehler verschwindet spurlos, nur Full-Reload.

**P3 – Login-Rate-Limit fällt still aus, wenn kein Proxy-IP-Header existiert. Mittel.**
- Primär: `apps/web/server/auth.ts:129–146`
- Zusatz: `node_modules/request-ip/lib/index.js:88–100`
- Szenario: `RATE_LIMITING_ENABLED=true` und App direkt exponiert. NextAuth übergibt `authorize` nur `{query, body, headers, method}`; `requestIp.getClientIp({headers})` hat dann keine Quelle → `ip = null` → `client = null` → der komplette Rate-Limit-Block wird übersprungen; unbegrenzte Passwort-Rateversuche, kein Hinweis. Erwartet: fail-closed oder Ersatzschlüssel (z. B. Zielkonto). Rate-Limiting ist opt-in (`config.ts:283`), daher P3.

**P3 – Locale-Parität: `actions.select` und drei `preview.*`-Keys existieren nur in en/en_US. Hoch.**
- Primär: `apps/web/lib/i18n/locales/en/translation.json:84,984–986` vs. `locales/de/translation.json:935–950`
- Zusatz: Nutzung `components/dashboard/bookmarks/BookmarkOptions.tsx:250`, `preview/LinkContentSection.tsx:217,253`, `preview/SavedPageOverview.tsx:91`; Typisierung nur gegen en (`apps/web/@types/i18next.d.ts:3–12`)
- Erwartet vs. tatsächlich: `actions.select` fehlt in 32 der 34 Locale-Dateien; Fallback `fallbackLng="en"` (`lib/i18n/settings.ts:3`) zeigt englischen Text — kein Rohkey, daher P3. Kein Parity-Test im Repo.

**P3 – PWA-Manifest widerspricht der dark-only Oberfläche. Mittel.**
- Primär: `apps/web/app/manifest.ts:5–14`
- Zusatz: dunkle UI erzwungen in `app/dashboard/layout.tsx:114` und `app/settings/layout.tsx:183`; kein `themeColor` in `app/layout.tsx:53–58`; Branding `DenseSettingsSidebar.tsx:38` („Keepsake“)
- Erwartet vs. tatsächlich: `background_color`/`theme_color` `#ffffff`, `orientation: "portrait"`, `name: "Karakeep"` → weißer Startbildschirm/weiße Statusleiste vor dunkler UI, erzwungenes Hochformat auf Tablets, inkonsistente Benennung.

### Verworfene Hypothesen (Web-Bereiche)
- **`middleware.ts` existiert nicht** (kein `apps/web/middleware.*`). Auth-Gating läuft ausschließlich über Layouts; geprüft: `app/dashboard/layout.tsx:79–82`, `app/settings/layout.tsx:150–153`, `app/admin/layout.tsx:50–53` (Rollenprüfung), `app/reader/layout.tsx:15–18`; `app/public/**` bewusst ohne Guard, Publicness serverseitig erzwungen. **Keine ungeschützte Seite gefunden.**
- **Route-Handler**: nur vier (`api/chat`, `api/bookmarks/export`, `api/auth/[...nextauth]`, `api/[[...route]]`). `api/chat` und `api/bookmarks/export` prüfen `ctx.user` (`route.ts:146–149` bzw. `:24–27`); der Hono-Bridge-Kontext liefert API-Key- oder Session-Auth. Kein ungeschützter Handler. (Der `expired: false`-Clientpfad in `components/invite/InviteAcceptForm.tsx:132` ist toter Code; `/logout` als GET ist Nuisance-CSRF, `app/logout/page.tsx:16–24` — P3, nicht eigenständig gelistet.)
- **Service Worker / Cache-Staleness**: kein Service Worker, kein Workbox/next-pwa — PWA besteht nur aus `app/manifest.ts`; keine Offline-/Cache-Befunde möglich.
- **Daemon/Cron-Route-Handler**: keine vorhanden. `instrumentation*.ts` lädt Plugins/Tracing/Event-Logger per Top-Level-Await (bewusst fail-fast).
- **CSRF/State-Changing GETs**: tRPC-Mutationen durch SameSite-Lax-Cookie + NextAuth-CSRF geschützt; keine state-changing GETs außer `/logout`.
- **Secrets im Client-Bundle/Logs**: `clientConfig` ist eine explizite Whitelist (`packages/shared/config.ts:680–720`); kein `"use client"`-Modul importiert `@karakeep/shared/config` oder `@/server/auth`.
- **Chat-Stream-Abbruch**: serverseitig bereits als „V3“ in dieser Datei dokumentiert; clientseitig fehlt ebenfalls ein `AbortController` (`DenseChat.tsx:90–149`) — gleiche Ursache, nicht doppelt gemeldet.
- **`AdminNotices`/`AdminNoticeBadge`** (`components/admin/AdminNotices.tsx:18–26,49–55`, gemountet in `DenseSidebar.tsx:452,530`): Admin-Query läuft auf jeder Dashboard-Seite, obwohl `useAdminNotices` immer `[]` liefert — toter Code + Extra-Request, zu schwach für die Liste.
- **Theme-FOUC**: `lib/dense/theme.ts:301–342` liest die Präferenz erst im Effekt; CSS-Defaults entsprechen exakt `DEFAULT_PREFERENCE` → nur für Nicht-Default-Themes sichtbar, kosmetisch.
- **`next.config.mjs:47–63`** (`Access-Control-Allow-Origin: *` + `Allow-Credentials: true`): laut CORS-Spec ungültige Kombination, aber kein `credentials: "include"`-Aufruf im Repo → funktional folgenlos.
- Weiter verworfen: doppelter `getUserLocalSettings()`-Read (`app/layout.tsx:66,79`); `<html lang="en_US">` (a11y/SEO-kosmetisch); `useDialogFormReset`-Identitätswechsel (Reset korrekt begrenzt); `MarkdownEditor`-`rawMarkdown`-Sync (nur tote Aufrufer betroffen); Pre-fork-Card-Pfad ohne Wirkung; Einladung ohne Session (`app/invite/[token]/page.tsx:9–12`, geerbtes Upstream-Verhalten).

### Geprüfter Umfang (Web-Bereiche)
`app/settings/**`, `app/admin/**` (+ `components/admin/*` soweit für Gating/Queries relevant), `app/api/chat/route.ts` (vollständig), `lib/chat/retrieval.ts`, `dense/chat/DenseChat.tsx`, `app/api/[[...route]]/route.ts`, `app/api/bookmarks/export/route.tsx`, `app/api/auth/[...nextauth]/route.tsx`, `server/auth.ts`, `server/api/{client,trpc}.ts`, `lib/auth/client.ts`, `app/{signin,signup,logout,invite,verify-email,check-email}/page.tsx` + `components/{signin,signup,invite}/*`, `app/reader/*`, `app/public/**`, `middleware.ts` (nicht vorhanden, per find/log geprüft), `app/manifest.ts`, `app/layout.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/error.tsx`, `components/dashboard/ErrorFallback.tsx`, `components/utils/ValidAccountCheck.tsx`, `lib/providers.tsx`, `lib/clientConfig.tsx`, `lib/dense/theme.ts`, `lib/dense/useDenseScale.ts`, `lib/i18n/**`, `lib/userLocalSettings/**`, `components/ui/markdown/markdown-editor.tsx`, `packages/shared/config.ts`, `packages/shared/inference.ts`, `packages/trpc/{index.ts,routers/bookmarks.ts,routers/invites.ts}` (zitierte Stellen), `packages/db/schema.ts` (invites), `node_modules/request-ip`.

### Nachtrag Settings-Detaildurchgang

Der Agent hat den 12er-Cap ausgeschöpft und diese Befunde als **Tausch gegen
seine Befunde 11 (Locale-Parität) und 12 (PWA-Manifest)** empfohlen. Beide
Listen sind hier erhalten; 11/12 sind entsprechend als nachrangig markiert.

**A) P2 – Jede `/settings/**`-Seite rendert in der falschen Schrift; die Font-Achse wirkt dort nicht. Hoch.**
- Primär: `apps/web/app/settings/layout.tsx:47–52` (und `:181–187`), `apps/web/lib/dense/theme.ts:177,271`, `apps/web/app/dashboard/dense-theme.css:76,80`
- Szenario: Jeder Aufruf von `/settings/**`. `dashboard/layout.tsx:42–70` lädt die vier Dense-Fonts unter `--font-k-sans-plex/-inter/-serif`; `settings/layout.tsx:50` registriert seinen Plex-Sans dagegen als `--font-k-sans`. `useDenseTheme` schreibt aber inline `--font-k-sans: var(--font-k-sans-plex)` (bzw. `-inter`/`-serif`, `theme.ts:172–186,271,324–334`) auf `<html>` **und** `.k-dense-zoom`; diese Referenz ist auf /settings nirgends definiert → `--font-k-sans` ist „guaranteed-invalid“, die Deklaration `font-family: var(--font-k-sans), "IBM Plex Sans", sans-serif` (`dense-theme.css:76,80`) wird at computed-value time verworfen — die Einstellungsseiten erben Inter aus `app/layout.tsx:74`. Nur die Preset-Wahl „System“ (wörtlicher Font-Stack) greift dort.
- Erwartet vs. tatsächlich: dieselbe Schrift/Font-Achse wie im Dashboard (Fork-Designvertrag, `design/README.md`); tatsächlich Inter überall in /settings. Eingeführt durch Fork-Commit `1a3665ce` (Settings-Wrapper) in Kombination mit `6e351720` (Font-Achse, nur Dashboard/theme.ts/CSS angepasst) — belegt per `git blame`.

**B) P2 – „Edit auth token“ + Save ohne Eingabe löscht das Webhook-Secret, die Zeile behauptet danach weiter „Token gesetzt“. Mittel–hoch.**
- Primär: `apps/web/components/settings/WebhookSettings.tsx:310–340` (Reset auf `token: ""`), `:425–435` (Save sendet das Formular), `:461` (`hasToken ? "*******"`)
- Zusatz: `packages/shared/types/webhooks.ts:31–36` (Schema erlaubt `""`), `packages/trpc/models/webhooks.repo.ts:65–73` (schreibt `""` wörtlich), `packages/trpc/routers/webhooks.ts:20` (`hasToken: token !== null`), `apps/workers/workers/webhookWorker.ts:128–145` (Header nur bei truthy Token); echtes Löschen ist der Trash-Button mit `token: null` (`:411–424`)
- Szenario: Webhooks → „Edit auth token“ öffnen → ohne Eingabe Save (oder Enter im leeren Feld). Das Feld ist bewusst leer (Token wird nie angezeigt), der Save-Pfad hat keinen Guard und keine `.min(1)`-Validierung → Payload `{webhookId, token: ""}`. Der Worker sendet danach **keinen** `Authorization`-Header mehr, während Tabelle (`*******`) und Button-Label weiterhin ein Secret behaupten — die Empfänger-Authentifizierung fällt still aus.
- Erwartet vs. tatsächlich: unberührtes leeres Feld ist No-op oder wird abgelehnt (Löschen nur über die dedizierte Aktion mit `token: null`); tatsächlich wird das Secret durch den Leerstring ersetzt und als „vorhanden“ angezeigt.

**P3-Zusätze aus dem Settings-Durchgang (alle selbst verifiziert):**
- **Settings-Mutationen ohne Fehlerpfad:** Webhook/Prompt/Feed-Create-Update-Delete haben nur `onSuccess`-Toasts (`WebhookSettings.tsx:81–91,199–209,341–351,446–455`, `AISettings.tsx:471–480,565–584`, `FeedSettings.tsx:88–98,213–223,352–372`) → Server-Ablehnungen (z. B. Webhook-Limit, `packages/trpc/models/webhooks.service.ts:44–53`) sind unsichtbar; react-query `mutate` verschluckt den Rejection zusätzlich, die Layout-ErrorBoundary fängt nichts.
- **Fehlerzustände fehlen in Settings:** `app/settings/rules/page.tsx:65–67` zeigt bei Query-Fehler dauerhaft den Spinner (`!rules || isLoading`); `/settings/assets` (`app/settings/assets/page.tsx:69–82`), Feeds/Webhooks/Backups rendern ein leeres „keine Einträge“-Bild, `/settings/import/<id>` `null` (`ImportSessionDetail.tsx:276–279`) — kein Fehlerpfad (Gegenbeispiel: `stats/page.tsx:210–218`).
- **Import-Buttons ohne Pending-Zustand:** `components/settings/ImportExport.tsx:134–137,153–347` verwirft `isImporting` (`lib/hooks/useBookmarkImport.ts:151`) und hardcodet `loading={false}` → jeder Button bleibt während eines laufenden Imports klickbar und startet eine **zweite** Staging-Session (doppelter Import desselben Files).
- **Import-Dialoge schließen vor dem Settle:** `ImportSessionCard.tsx:289–297,333–341` (auch `ImportSessionDetail.tsx:315–317,462–465`) rufen `mutateAsync` ohne `await`/`catch` und schließen sofort → fehlgeschlagenes Finalize/Delete ist von Erfolg nicht unterscheidbar, Doppelklick möglich, unhandled rejection.

**Nachrangig (Empfehlung des Agents):** Befund 11 (Locale-Parität `actions.select`/`preview.*`) und Befund 12 (PWA-Manifest-Farben/Orientierung/Name) bleiben dokumentiert, sind aber gegenüber A/B und den vier P3-Zusätzen nachrangig.

## Restliche tRPC-Router und -Modelle

Read-only, keine Datei geändert, keine Service-/DB-Verbindung. 12 Findings.

> **Herkunft (wichtig für die Triage):** `git diff upstream/main -- packages/trpc`
> zeigt, dass **alle** hier geprüften Router/Modelle byte-identisch zu Upstream
> Karakeep sind (Fork-Änderungen nur in `bookmarks.ts`/`admin.ts` + Tests).
> Diese Befunde sind also **Upstream-Bugs, keine Fork-Regressionen**.
> `sharedLists.ts` und `packages/trpc/middleware.ts` existieren nicht; die
> funktionalen Äquivalente (`models/listInvitations.ts`, `routers/lists.ts`,
> `index.ts`, `lib/*`) wurden mitgeprüft.

1. **P2 – Rate-Limit-Schlüssel aus einem client-kontrollierten Header.** `apps/web/server/api/client.ts:13–15,48–50` + `packages/trpc/lib/rateLimit.ts:25–40`: `request-ip` bevorzugt `x-client-ip`, dann das linkeste `x-forwarded-for`; ein Angreifer sendet pro Request eine frische gefälschte IP → unbegrenzte Passwortversuche auf `POST /api/trpc/apiKeys.exchange` (Limit 10/15 min, `routers/apiKeys.ts:134–141`), ebenso `users.create/forgotPassword/resetPassword/verifyEmail` und der NextAuth-Login-Limiter `login:${ip}:${email}` (`apps/web/server/auth.ts:129–137`). Nur bei `RATE_LIMITING_ENABLED=true`. Übliche Proxy-Konfiguration hilft **nicht**, weil das linkeste XFF angreiferkontrolliert bleibt.

2. **P2 – `assets.attachAsset` validiert den client-deklarierten `assetType` und persistiert ihn.** `packages/trpc/models/assets.ts:94–114` (+`routers/assets.ts:44–58`): Ein Aufrufer kann für sein **eigenes** Backup-Asset (`assetId` ist über `backups.list` exponiert, `shared/types/backups.ts`) oder ein Avatar-Asset `assetType:"screenshot"` deklarieren → der Guard `isAllowedToAttachAsset` (Absicht laut `assets.test.ts:112–130`) wird umgangen und der DB-`assetType` überschrieben. Folge: Das Backup-Archiv wird zu einem Bookmark-Anhang und ist über `GET /api/assets/:id` für alle mit Bookmark-Zugriff abrufbar (Collaborators; `models/assets.ts:225–251` + `models/bookmarks.ts:136–145`).

3. **P2 – `models/users.ts:628–646`: `updateAvatar` schützt die alte Avatar-Zeile, löscht aber die Datei unbedingt.** Zeile 632 schützt die vorherige Avatar-Zeile, wenn sie noch an einem Bookmark hängt; `deleteAsset` (643–646) läuft trotzdem → Datei + Metadaten gelöscht, DB-Zeile bleibt (dangling attachment, irreversibler Verlust). Benötigt Finding 2, um das Avatar-Asset anzuhängen.

4. **P3 – `routers/users.ts:118–136`: `changePassword` hat keine serverseitige Passwort-Policy** (eigenes laxes `z.object` statt des existierenden `zChangePasswordSchema`, `shared/types/users.ts:49–56`); Durchsetzung nur in der UI.

5. **P3 – `routers/invites.ts:191–202`: `invites.accept` ignoriert `disablePasswordAuth`/`disableSignups`.** Bei deaktivierter Passwort-Auth wird das Konto angelegt und die Einladung verbraucht, ein Login ist danach unmöglich (`validatePassword` wirft, `auth.ts:187–189`).

6. **P3 – `routers/invites.ts:147–150` + `db/schema.ts:894–906`: Einladungen laufen nie ab.** `expired` ist hart `false` (keine Ablaufspalte, `usedAt` wird nie geschrieben); der UI-Zweig „Invitation Expired“ ist toter Code.

7. **P3 – `apps/workers/workers/webhookWorker.ts:129–133` (vs. `:49–52`, Config-Default 3): Retry-Schleife off-by-one; `WEBHOOK_RETRY_TIMES=0` → 0 HTTP-Versuche.** *(Duplikat des bekannten Befunds #19/#8 — nicht doppelt zählen.)*

8. **P3 (Perf) – `models/users.ts:830–836` + `875–888`: `getStats` lädt ALLE Bookmark-Timestamps** (kein LIMIT, keine Aggregation) und ruft pro Zeile `toLocaleString` auf. (statisch belegt; Laufzeit ungemessen)

9. **P3 – `models/assets.ts:59–82`: OFFSET-Pagination über `ORDER BY size DESC` ohne Tiebreaker** (instabile Seitenreihenfolge) plus `COUNT(*)` pro Seite.

10. **P3 (Perf) – `models/importSessions.service.ts:56–61` mit `importSessions.repo.ts:44–50,52–63`: N+1** (bis zu 50 `GROUP BY`-Queries pro Listenaufruf).

11. **P3 (Perf) – `routers/subscriptions.ts:371–409,512–524`: ungecachte Stripe-API-Aufrufe pro Request**; `syncWithStripe` ist von jedem Nutzer auslösbar.

12. **P3 – `routers/apiKeys.ts:61–88`: `apiKeys.regenerate` hat keine Event-Log-Middleware** (create/revoke haben sie; es gibt keinen `apiKey.regenerate`-Eventtyp) → Credential-Rotation bleibt unauditiert.

### Verworfene Hypothesen (Router/Modelle)
Nach Gegenprüfung verworfen: **alle** Webhook-/Backup-/Invite-/Prompt-/Rule-/ImportSession-/Asset-IDORs (userId-Prüfungen vorhanden); API-Key-Scope-Bypass (`index.ts:177–227` korrekt, kein Router nutzt blankes `authedProcedure`, `ctx.auth` ist für Keys gesetzt); SSRF über Webhook-URLs (`fetchWithProxy` → `validateUrl`, `apps/workers/network.ts:140–224` blockt non-http + private IPs); `replaceAsset`s Alt-Typ-Prüfung (beabsichtigt, testmandatiert); `removeCollaborator`/`leaveList`-Bookmark-Bereinigung (durch `ON DELETE CASCADE` auf `bookmarksInLists.listMembershipId` erzwungen, `db/schema.ts:577–584`); `importSession.rootListId` (Worker nutzt eigentumsgeprüftes `lists.addToList`); `importedFromFeed` mit fremder `feedId` (wird nur gegen eigene Feeds verglichen); `invitationsForList` (owner-guarded Aufrufstelle); `updateSubscriptionTier` (admin-guarded, aber ohne Aufrufer).

## shared-react Hooks und `apps/web/lib/hooks`

Read-only, keine Builds/Tests/Instanzen. 9 Findings.

> **Ergänzung zu „toter Grid-Teilbaum“ (Performance-Abschnitt):** Finding 1
> zeigt, dass der Bulk-/Tastatur-Layer nicht nur ungenutzt, sondern
> **strukturell unerreichbar** ist — `GlobalActions` wird nur von `Header`
> gerendert, `Header` nur von `SidebarLayout`, und `SidebarLayout` nur im
> **Admin-Layout** (`app/admin/layout.tsx:56`).

1. **P2 – Der gesamte Bulk-/Tastatur-Layer der Web-UI ist nicht erreichbar. Hoch.**
   Primär: `apps/web/lib/hooks/useBookmarkBulkActions.ts:23–190` und `useBookmarkKeyboardNavigation.ts:607–733`.
   Belege: `GlobalActions.tsx:9–16` rendert BulkBookmarksAction/ViewOptions/SortOrderToggle nur bei `inBookmarkGrid`; `setInBookmarkGrid(true)` existiert ausschließlich in `BookmarksGrid.tsx:167–213`, und `BookmarksGrid` wird von keinem Modul importiert. `GlobalActions` ← nur `Header.tsx:24`; `Header` ← nur `SidebarLayout.tsx:20`; `SidebarLayout` ← nur `app/admin/layout.tsx:56`. Store-Default `inBookmarkGrid: false` (`lib/store/useInBookmarkGridStore.ts:8–16`).
   Erwartet vs. tatsächlich: erwartet eine erreichbare Bulk-Leiste (oder deren Entfernung); tatsächlich ~900 Zeilen toter Code, und die Bulk-Fähigkeit ist still aus der UI verschwunden. Auch der Menüpunkt „Keyboard shortcuts“ (`header/ProfileOptions.tsx:205–209`) und sein Dialog sind unerreichbar. Die Dense-Ansicht hat keine Auswahl-UI (`DenseFilesView.tsx` enthält kein `select`/`checkbox`).

2. **P2 – Fehlgeschlagene Server-Saves der Reader-Settings sind stumm; ein „defaults cleared“-Toast lügt. Hoch.**
   Primär: `packages/shared-react/hooks/reader-settings.tsx:81–107` (kein `onError` an `updateServerSettings`; `saveServerSettings.onError` löscht nur `pendingServerSave`, `:99–102`).
   Belege: einziger Live-Aufrufer `apps/web/components/settings/ReaderSettings.tsx:74–77` (`clearServerDefaults()` + sofortiger Erfolgstoast); Popover ruft `saveToServer()` ohne Fehlerbehandlung (`ReaderSettingsPopover.tsx:428–437`). Kein globaler MutationCache-Error-Handler (`apps/web/lib/providers.tsx:20–29`).
   Erwartet vs. tatsächlich: bei Netzfehler/500/abgelaufener Session gibt es keinerlei Feedback, und `handleClearDefaults` meldet trotzdem „defaults cleared“, während `serverDefaults` unverändert die alten Werte zeigt — UI und Toast widersprechen sich.

3. **P3 – `useReadingProgress` invalidiert nach jedem Save die eigene Query, deren Ergebnis der Hook bewusst ignoriert. Hoch.** *(statisch belegt, ungemessen)*
   Primär: `packages/shared-react/hooks/reading-progress.ts:91–99` mit `:52–58`.
   Szenario: jeder Speichervorgang — Idle-Timer (5 s nach Scroll-Ende), `visibilitychange`, `beforeunload`, Unmount (`ScrollProgressTracker.tsx:111–195`).
   Erwartet vs. tatsächlich: `onSuccess` → `invalidateQueries(getReadingProgress.pathFilter())` feuert einen zusätzlichen Request, obwohl `initialProgressRef.current` pro `bookmarkId` genau einmal gesetzt wird (`:52`) und spätere Daten nirgends ausgewertet werden (Rückgabe nutzt die eingefrorenen `initial*`-Werte, `:133–145`). Bei `visibilitychange`/`beforeunload` praktisch immer nutzlos.

4. **P3 – `useImportSessionStats` pollt bei Status `paused` unbegrenzt weiter. Mittel-hoch.** *(statisch belegt)*
   Primär: `apps/web/lib/hooks/useImportSessions.ts:46–63` (Stop-Liste `["completed","failed","archived"]`).
   Belege: Statusmenge `packages/shared/types/importSessions.ts:6–15` enthält auch `paused`; pro Session-Karte ein eigener Poller (`ImportSessionCard.tsx:86`, zusätzlich `ImportSessionDetail.tsx:250`).
   Erwartet vs. tatsächlich: bei pausiertem Import (Worker macht keinen Fortschritt) läuft alle 5 s ein `getImportSessionStats` je Session weiter.

5. **P3 – `useRelativeTime` rechnet genau einmal und tickt nie. Hoch (Code), Wirkung kosmetisch.**
   Primär: `apps/web/lib/hooks/relative-time.ts:12–17`.
   Szenario: `components/settings/ApiKeySettings.tsx:55/59` („Last used …“, via `components/ui/relative-time.tsx:8`), ebenso `BookmarkPreview.tsx:78/125`.
   Erwartet vs. tatsächlich: `formatDistanceToNow` wird nur im Effect bei Änderung von `date`/`language` berechnet — kein Timer, „vor 5 Minuten“ bleibt beliebig lange stehen. (`date`-Identität ist stabil, daher kein Loop.)

6. **P3 – `useCreateBookmarkWithPostHook` lässt die `lists.stats`-Invalidierung weg (Asymmetrie zu `useCreateBookmark`). Mittel.**
   Primär: `packages/shared-react/hooks/bookmarks.ts:62–69` gegen `:39–46`.
   Szenario: Bookmark aus ungefilterter Ansicht anlegen (`EditorCard.tsx:71`, `UploadDropzone.tsx:18`, `MobileCaptureSheet.tsx:67`) — der Grid-Kontext liefert kein `listId/tagId/favourited/archived`, `postCreationCB` (`:227–263`) führt also keine Mutation aus; nur `getBookmarks`/`searchBookmarks` werden invalidiert.
   Erwartet vs. tatsächlich: die per-List-Zähler auf `/dashboard/lists` (`CollapsibleBookmarkLists.tsx:112–118` liest `api.lists.stats`) bleiben bis zu 60 s (globaler `staleTime`) bzw. bis zum Remount veraltet.

7. **P3 – Tag-Mutationen invalidieren *alle* `getBookmark`-Details statt der betroffenen Keys → ein Detail-Read pro gemounteter Zeile. Hoch (Code-Effekt).** *(statisch belegt, ungemessen)*
   Primär: `packages/shared-react/hooks/tags.ts:93–94` und `:121–122` (`invalidateQueries(api.bookmarks.getBookmark.pathFilter())`, mit eigenem TODO), identisch `bookmarks.ts:193–211`.
   Belege: jede Dense-Zeile/-Karte hält eine eigene `getBookmark({bookmarkId})`-Query (`lib/dense/useLiveBookmark.ts:16–28`, genutzt in `DenseBookmarkRow.tsx:42`, `DenseBookmarkCard.tsx:28`); `pathFilter()` (Typ `any`, nur Pfad) matcht per Präfix alle diese Keys.
   Erwartet vs. tatsächlich: Tag umbenennen/mergen/löschen oder an einem Bookmark Tag anhängen/entfernen löst den Refetch **jeder** gemounteten Einzel-Bookmark-Query aus (`httpBatchLink` bündelt zu wenigen HTTP-Requests, aber serverseitig N Einzel-Reads).

8. **P3 – `useBookmarkLists`: inline `select` + Closure verhindern Memoisierung/Structural Sharing; `listsToTree` läuft pro Render. Mittel.** *(statisch belegt, ungemessen)*
   Primär: `packages/shared-react/hooks/lists.ts:165–178` mit `packages/shared/utils/listUtils.ts:56–60` (`getPathById` ist eine neue Closure je Aufruf).
   Belege: `@tanstack/query-core@5.90.2`, `queryObserver.js:283–290` — neues `select` → Neuberechnung + `replaceData`; `replaceEqualDeep` kann die Identität nicht erhalten.
   Szenario: beliebiger Re-Render eines Konsumenten (`DenseSidebar.tsx:259–272`, `AllLists.tsx:186ff`, `MobileBrowse.tsx:21`, Dialoge).
   Erwartet vs. tatsächlich: der Baum (`root`, `allPaths`, DFS) samt neuer Closure wird bei jedem Render neu gebaut, das Ergebnisobjekt hat jedes Mal neue Identität → abhängige `useMemo`s rechnen immer neu.

9. **P3 – `useBookmarkImport`: kein Double-Submit-Schutz, `isImporting` ist tote API, Quota-Vorprüfung ist einmalig. Mittel.**
   Primär: `apps/web/lib/hooks/useBookmarkImport.ts:43–107` und `:146–152`.
   Belege: einziger Aufrufer `components/settings/ImportExport.tsx:155,172,189,208,227,246,263,282,301,320,337` — alle elf Karten hart `loading={false}`; `FilePickerButton` nutzt das Flag nie. Serverseitig wird die Bookmark-Quota nur in `bookmarks.create` geprüft (`routers/bookmarks.ts:338`); im Import-Pfad (`models/importSessions.service.ts`) kommt „quota“ nicht vor.
   Szenario: während eines (großen) Imports eine zweite Karte anklicken. Beide `mutationFn`-Läufe lesen `getQuotaUsage` (`:60–78`) mit demselben Stand und bestehen; `setQuotaError(null)` (`:52`) löscht zudem eine bereits angezeigte Quota-Warnung des anderen Laufs.

### Zusätzlich beobachtet (nicht formell gemeldet, aber real)

**P3 – `apps/web/components/dashboard/dense/DenseFilesView.tsx:625`: `selected={i === 0}` markiert immer die erste Zeile als ausgewählt.** Echter UI-Fehler; der Agent hat ihn wegen des Dense-Scopes nicht in seine 9 Findings aufgenommen, hier aber festgehalten.

### Verworfene Hypothesen (Hooks)
- Fehlende `getBookmarks`/`searchBookmarks`-Invalidierung in `useUpdateBookmarkTags` (`bookmarks.ts:197–211`), `useUpdateTag` (`tags.ts:81–95`), `useMergeTag` (`:110–123`), `useDeleteTag` (`:138–147`) → **kein** Staleness-Bug: jede sichtbare Zeile hält über `useLiveBookmark` eine eigene `getBookmark`-Query, und genau die wird über `getBookmark.pathFilter()` invalidiert; die Legacy-Zeilen sind nicht gemountet. Übrig bleibt nur die Request-Amplifikation (Finding 7).
- `gridQueryCtx.favourited ?? gridQueryCtx.archived` — laut Auftrag bereits geprüft, nicht erneut gemeldet.
- Auto-Repeat/Double-Submit der Bulk-Hotkeys (`useBookmarkKeyboardNavigation.ts:382–454`) und der `shift+8`+`a`/`n`-Sequenz-Listener ohne Form-Tag-Prüfung (`:258–279`) → im Code real (`react-hotkeys-hook` 5.2.1 ohne `event.repeat`-Check), aber der Hook wird nirgends gemountet (Finding 1) → kein Live-Impact.
- `sessionOverrides = {}` als Default (`reader-settings.tsx:47`) vs. `settings`-Memo (`:110–132`) → nur der Mobile-Wrapper lässt es weg; Expo-App ausgeklammert.
- Banner unterdrückt Speichern (`if (bannerVisibleRef.current) return;`, `reading-progress.ts:104`) → gewollt.
- `currentImportIds` als `Map<File, string>` (`useBookmarkImport.ts:41,95,116,129,137`) → dieselbe Datei kann nicht zweimal ausgewählt werden, Kollision nicht erreichbar.
- `useUpdateHighlight`/`useDeleteHighlight` mit `res.bookmarkId` → `zHighlightSchema` enthält `bookmarkId`, Key passt.
- `query-invalidation.ts` (Debounce, `maxWait`, Key-Hash) → mehrfach nachgelesen, keine verlorene/doppelte Invalidierung.
- Ref-Mutationen im Render von `useReadingProgress` (`:45–65`) → idempotent, keine Kontamination beim `bookmarkId`-Wechsel.
- `useSearchHistory` mit `useMemo(..., [])` → Adapter sind reine Wrapper, unkritisch. (Nebenbei: `addSearchTermToHistory` ist read-modify-write und könnte bei zwei Adds im selben Tick einen Eintrag verlieren — nicht als Finding geführt.)
- `TRPCSettingsProvider`/`getTRPCClient` mit `useMemo(..., [settings])` → nur Extension/Mobile, Web nutzt den Provider nicht.
- `useAutoRefreshingBookmarkQuery` und `getBookmarkRefreshInterval` → Stop-Bedingung vorhanden (< 6 h), kein Endlos-Polling.
- `useDialogFormReset` → `EditBookmarkDialog` bleibt gemountet und schaltet nur `open`, Reset greift korrekt.

### Geprüfter Umfang (Hooks)
Vollständig gelesen: `packages/shared-react/hooks/{assets,bookmark-grid-context,bookmark-list-context,bookmarks,highlights,lists,query-invalidation,reader-settings,reading-progress,rules,search-history,tags,use-debounce,users}.ts(x)`, `providers/{client-config-provider,trpc-provider}.tsx`, `trpc.ts`, `apps/web/lib/hooks/{bookmark-search,relative-time,useBookmarkBulkActions,useBookmarkImport,useBookmarkKeyboardNavigation,useDialogFormReset,useImportSessions}.ts` (`upload-file.ts` nur quergelesen, da abgedeckt). Als Beleg/Kontext: `lib/{bulkActions,readerSettings,providers,dense/useLiveBookmark,dense/useTagPendingOps}.ts`, `lib/store/*`, diverse Dashboard-Komponenten, `packages/shared-react/components/ScrollProgressTracker.tsx`, `packages/shared/{import-export/importer.ts,utils/listUtils.ts,utils/bookmarkUtils.ts,types/*}`, `packages/trpc/routers/*`, `node_modules/{@trpc/tanstack-react-query,@tanstack/query-core,react-hotkeys-hook}`.

---

# Runde 4 — Crawler, Import/Export, Dense-UI

## Import/Export-Parser (`packages/shared/import-export/**`)

Read-only, keine Builds/Tests/Dienste. 11 neue Befunde, keine Überschneidung
mit der bekannten Liste (Double-Encoding, `includeContent`/RAM, Array-Copy pro
Seite, Tagging-Skip-Hang, RSS, list-id-Ownership wurden nicht erneut gemeldet).

**Wichtigste zwei zuerst** — nur diese haben Datenverlust- bzw.
Gesamtabbruch-Wirkung:

1. **P2 — Leeres Pfadsegment bricht den GESAMTEN Import ab (Instapaper `Folder=""`, Linkwarden `name=""`). Mittel.**
   `importer.ts:159–196` legt einen Ordner mit `name=""` an ⇒ `lists.create` scheitert an `min(1)` ⇒ der komplette Import bricht ab; Root-Liste (`importer.ts:88`) und Session (`:89`) bleiben liegen. Nur der HTML-Parser hat den „Unnamed“-Fallback (`parsers.ts:72`).

2. **P2 — Stiller Datenverlust wird als Erfolg gemeldet. Hoch.**
   `importSessions.service.ts:95–104` filtert Links ohne URL/Text ohne Inhalt stumm heraus; `importer.ts:270/282` zählt sie trotzdem, Fortschritt steht auf 100 % (`ImportExport.tsx:350–358`), Toast „Staged N“ (`useBookmarkImport.ts:123–126`). Erreichbar z. B. über `<A>` ohne `HREF` (Test `parsers.test.ts:267–282`). **Rein statisch bewiesen und trifft jede Quelle, die Einträge ohne URL/Inhalt liefert.**

3. **P2 — TSM `lastAccessed` ist in Millisekunden, alle anderen Parser liefern Sekunden. Mittel.**
   `parsers.ts:263/320/410–412/552` (Sekunden) vs. TSM; `importer.ts:253–255` multipliziert mit 1000 ⇒ `createdAt` im Jahr ~55.800 für alle TSM-Importe.

4. **P2 — Linkwarden `getCollectionPath` ohne Zyklus-Guard. Hoch (Mechanik), Trigger malformiert.**
   `parsers.ts:302–312` ⇒ Endlosschleife/OOM im Browser-Main-Thread bei `parentId`-Zyklus oder Selbstreferenz.

5. **P3 — Export verwirft still: Netscape lässt alle TEXT-Bookmarks weg** (`exporters.ts:111–113`), JSON filtert Assets weg (`exporters.ts:48–65` + `route.tsx:88`); `favourited`/`summary` fehlen im Schema. HTTP 200 ohne Hinweis. **Hoch.**

6. **P3 — TSM-Parser: `[].reduce` ohne Initialwert ⇒ roher TypeError bei leerem Session-Array.** `parsers.ts:349–352`. **Hoch.**

7. **P3 — Tag-Komma wird nicht escaped.** `exporters.ts:126–133` vs. `split(",")` in `parsers.ts:86/129/145` ⇒ Tag `a,b` zerfällt beim Re-Import; Netscape/Pocket/Matter trimmen Tags nicht (Instapaper/mymind/Readwise schon) ⇒ Leerzeichen-Dubletten. **Hoch.**

8. **P3 — CSV-Robustheit: kein `bom: true`.** Pocket: `record.tags.length` ⇒ TypeError; Instapaper: URL `undefined` ⇒ still verworfen (siehe Befund 2); Alles-oder-nichts-Zod über alle Zeilen (Readwise `Seen`-Enum etc.); DOCTYPE-Präfix-Check ab Position 0 (`parsers.ts:54`) verwirft BOM-Dateien. **Mittel.**

9. **P3 — Kein Rollback im Batching.** `importer.ts:260–275`: ein Fehler lässt Rest-Batches ungestaged, die Session bleibt in `staging` (nur `completed` wird archiviert, `repo.ts:100–112`); Root-Liste und Ordner bleiben dauerhaft, Session-Löschen entfernt sie nicht. **Hoch.**

10. **P3 — `NaN` vergiftet „frühestes Datum gewinnt“.** `parsers.ts:635–639` + `:130`: ein späteres Duplikat mit gültigem Datum wird ignoriert (`newDate < NaN` ist `false`). **Mittel.**

11. **P3 — Quadratisches Merge pro Duplikat** (`parsers.ts:621–650`, Spread + Set) — statisch belegt, Auswirkung ungemessen.

### Verworfene Hypothesen (Import/Export)
`createBookmark`-Rate-Limit (interner Caller hat `req.ip=null`, `rateLimit.ts:27–29`); fehlende archivierte Bookmarks im Export (`archived` optional ohne Default, `loadMulti` filtert nur bei `!== undefined`); Pocket `status="deleted"` (Quellenlage unklar); `csv-parse` nicht deklariert (`nodeLinker: hoisted`); `attachBookmarkToLists`-Swallow (bereits in der bekannten Liste); `getStagingBookmarks`-Cursor (kein Off-by-one); `parseImportFile` ohne Default (UI-Enum vollständig); Netscape-DL-Rekursion (für Chrome/Firefox korrekt).

### Geprüfter Umfang (Import/Export)
`packages/shared/import-export/*` (parsers, importer, exporters, Tests, Linkwarden-Fixture), `useBookmarkImport.ts`, `ImportExport.tsx`, `ImportSessionCard.tsx`, `importWorker.ts`, `export/route.tsx`, `importSessions` router/service/repo, lists-Typen/Router, bookmarks-Router (createBookmark/Dedup/Rate-Limit), `models/bookmarks.loadMulti`, `rateLimit.ts`, `impersonate.ts`, `workers/trpc.ts`, htmlUtils/url-Utils.

## Crawler-Subsystem (`apps/workers/workers/crawler/**`)

Read-only, keine Builds/Tests/Dienste. 11 Findings, davon **2× P1**.

**P1 – `archiveWebpage`: `execa` ohne `reject:false` ⇒ beide Fehlerzweige sind toter Code; jeder monolith-Fehler lässt den ganzen Crawl-Job scheitern. Hoch.**
- Primär: `apps/workers/workers/crawler/assetStorage.ts:405–439` (Aufruf `405–423`, `isCanceled` `425–431`, `exitCode` `433–439`), Aufrufer `crawlAndParse.ts:492–533` + `crawlerWorker.ts:572`. `execa` v9 default `reject=true` (`node_modules/execa/index.d.ts:84–89`); Nachbarcode `parseSubprocess.ts:129` nutzt `reject:false`.
- Szenario: `CRAWLER_FULL_PAGE_ARCHIVE=true` / Rule-Engine `archiveFullPage`; monolith läuft in `-t 5` (`config.ts:224`), fehlt (ENOENT) oder wird gecancelt.
- Erwartet vs. tatsächlich: erwartet ein isolierter, fehlertoleranter letzter Schritt, der `null` zurückgibt (Kommentar `assetStorage.ts:389–400`, `crawlerWorker.ts:571`). Tatsächlich propagiert die Exception aus `archivalLogic()` → Job failed, 5 Retries (`queues.ts:89–97`) mit komplettem Neu-Crawl, am Ende `crawlStatus="failure"` (`crawlerWorker.ts:146–163`) **trotz erfolgreich gespeichertem Content**; die Temp-Datei in `os.tmpdir()/<uuid>` wird in beiden Zweigen nie gelöscht (kein `finally`), ebenso nicht bei `saveAssetFromFile`-/`stat`-Fehlern.

**P1 – Timeout-Budgets widersprechen sich: Sub-Schritt-Timeouts > Job-Timeout; Parse-Timeout unerreichbar, ASR-Crawls laufen zwangsweise in den Abbruch. Hoch.**
- Primär: `crawlerWorker.ts:201–206` (`timeoutSecs = CRAWLER_JOB_TIMEOUT_SEC = 60`, `config.ts:127`), dagegen `parseSubprocess.ts:112` / `config.ts:230` = 60 s, `config.ts:219` ASR = 900 s, `config.ts:176` Transcript = 60 s pro Sprache × 5 Default-Sprachen (`config.ts:182–190`), `transcript.ts:249–284` sequenziell, plus 60-s-Dauerprobe `transcript.ts:409`. Runner-Semantik: Abort + Reject nach `timeoutSecs` (`node_modules/liteque/dist/index.js:252–266`).
- Erwartet vs. tatsächlich: erwartet greift der Teil-Timeout (`parseSubprocess.ts:112–148`). Tatsächlich stirbt mit Defaults immer zuerst der Job (60 s), ASR (900 s) ist 15× über Budget → Video ohne Untertitel immer Job-Abbruch + 5 Retries + `crawlStatus=failure` trotz gespeichertem Content. Config-abhängig, Zahlen belegt.

**P2 – Assets werden im Store geschrieben, bevor ihre DB-Zeile committet ist ⇒ dauerhaft verwaiste Dateien, für die Quota unsichtbar. Hoch.**
- Primär: `crawlAndParse.ts:353–369,372–390,401–487` vs. `assetStorage.ts:79–85,210–216,313–319,459–467`; `workerUtils.ts:7–17`; `packages/shared/assetdb.ts:155–205` (Store schreibt nur Dateien); Quota DB-basiert (`quotaService.ts:55–80`); einziger Cleanup manuell: `adminMaintenance/tasks/tidyAssets.ts:25–40`.
- Trigger: Job-Timeout/Abort zwischen `store*` und Phase-2-Transaktion, `saveError` (`assetStorage.ts:543–548`), SQLITE_BUSY, Neustart. Nur `oldAssets.*` (Snapshot `workerUtils.ts:19–58`) wird gelöscht; neue IDs kennt nach Fehlschlag niemand, Retries erzeugen neue IDs. Gilt auch für `handleAsAssetBookmark` (`crawlAndParse.ts:91–136`) und `archiveWebpage` (`assetStorage.ts:459–467`).

**P2 – Cookie-Datei: Playwright verlangt `url` ODER (`domain` UND `path`); dokumentiertes/zod-erlaubtes Format lässt jeden Crawl fehlschlagen. Hoch.**
- Primär: `browser.ts:39–50` (`cookieSchema` lässt `domain`/`path` weg), `:246–267`; `crawlPage.ts:661–667` (`addCookies` ungeschützt im try); Assert `node_modules/playwright-core/lib/server/network.js:108–112`; Doku-Beispiel ohne `path`: `docs/docs/03-configuration/01-environment-variables.md:176`.
- Erwartet vs. tatsächlich: erwartet werden gesetzte Cookies bzw. eine klare Ablehnung. Tatsächlich `Cookie should have a url or a domain/path pair` → jeder Crawl failed + 5 Retries + `crawlStatus=failure`, solange `BROWSER_COOKIE_PATH` gesetzt ist. Nur `url` oder `domain`+`path` funktioniert.

**P2 – Stiller Browserless-Fallback wird als erfolgreicher Crawl verbucht. Mittel–hoch.**
- Primär: `crawlPage.ts:613–615,617–634`; `browser.ts:192–223`; `crawlerWorker.ts:97–113,132–145`.
- Trigger: Chrome-Container-Neustart / Init-Connect-Fehler → `globalBrowser` undefined (5-s-Retry-Fenster `browser.ts:200–207`) → `getBrowser()` undefined → `browserlessCrawlPage` (Plain-GET, 5 s, `crawlPage.ts:89–95`).
- Erwartet vs. tatsächlich: erwartet Fehler/Retry oder Kennzeichnung. Tatsächlich normal persistiert (`crawledAt`, `crawlStatus=success` via `onComplete`), kein Screenshot/PDF (alter Screenshot-Asset bleibt stehen), ungerendertes HTML → schlechtere Readability/Summary. Beleg der Gefahr: die Adhoc-CLI verweigert genau diesen Zustand (`crawlerWorker.ts:97–113` „would silently corrupt A/B results“), der Produktionspfad nicht.

**P2 – Kein Per-Bookmark-Lock: zwei Runner crawlen dasselbe Bookmark gleichzeitig. Mittel.**
- Primär: `index.ts:44–51,108–121` (beide Crawler-Runner im selben Prozess), `crawlerWorker.ts:120–206` (concurrency = `CRAWLER_NUM_WORKERS`, Default 1), `workerUtils.ts:7–17,19–58`, `schema.ts` (assets ohne Unique auf `(bookmarkId, assetType)`; `bookmarkAssets.id` = Bookmark-ID als PK), `crawlAndParse.ts:122–135`.
- Trigger: Admin-Recrawl-all (`routers/admin.ts:293–306`), Rule-Engine `downloadFullPageArchive` (`lib/ruleEngine.ts:303–314`) oder manuelles Recrawl (`bookmarks.ts:839–843`) während der Erst-Crawl in `LinkCrawlerQueue` läuft; der Idempotency-Key wirkt nur je Queue (`Unique (queue,idempotencyKey)`).
- Folge: doppelte `assets`-Zeilen + Dateien, `getBookmarkDetails .find()` → zweite Zeile bleibt dauerhaft Waise; bei PDF/Bild-URLs PK-Kollision auf `bookmarkAssets.id` → Rollback + verwaiste Datei; weil `bookmarkLinks` gelöscht ist, wirft jeder Retry in `getBookmarkDetails` (`workerUtils.ts:28–30`) → 6 Läufe verbrannt; außerdem Last-Writer-Wins auf `bookmarkLinks` (Phase-1-Write ist nicht fill-only, `crawlAndParse.ts:335–349`).

**P3 – `extractTranscript` bricht „Never throws“: `mkdir` außerhalb des `try`. Mittel.**
`transcript.ts:526–551` (`mkdir` in `549` **vor** `try` in `551`); Aufrufer `crawlerWorker.ts:291`. Trigger: `tmpdir/transcripts` nicht anlegbar. Laut Kommentar `528–531` darf kein Fehler den Crawl killen; tatsächlich komplette Job-Rejection + Retry.

**P3 – yt-dlp wird für JEDEN Link auf Video-Hosts im Crawl-Pfad gespawnt, sequenziell 60 s/Sprache. Mittel.** *(statisch belegt, Größe ungemessen)*
`transcript.ts:104–148` (Host-only-Check, u. a. reddit.com, x.com/twitter.com, facebook.com, soundcloud.com, instagram.com), `:249–284`; `crawlerWorker.ts:279–296,566–569`; `config.ts:176,182–190`. Bis zu 5 sequenzielle yt-dlp-Prozesse (je 60 s) synchron **vor** `enqueuePostCrawlJobs` und innerhalb des 60-s-Job-Budgets.

**P3 – Doppelte Request-Interception + DNS-fähige Validierung pro Sub-Request.** *(statisch belegt, Overhead ungemessen)*
`crawlPage.ts:200–206` (`Fetch.enable urlPattern "*"` für Request **und** Response) + `:262–303` (`page.route "**/*"` mit `await validateUrl` je Sub-Request); `network.ts:140–226`. Zwei Interceptionschichten (Playwright-Route + eigene CDP-Session) ⇒ 2 zusätzliche IPC-Roundtrips pro Request; eine Schicht würde für den SSRF-Schutz reichen.

**P3 – Parser-Eingabe im ungedrosselten Parent dupliziert; Data-URI-Bereinigung greift nur bei Audio/Video. Mittel.** *(statisch belegt, Größe ungemessen)*
`parseSubprocess.ts:23–55` (Pattern nur `audio|video`), `:113–131` (`replace`-Kopie + `JSON.stringify`); Heap-Limit nur fürs Kind (`:67–83`, `config.ts:229`). SingleFile-Archive (`bookmarks.ts:381–392`) inlinen vor allem `data:image/...` — genau der Hauptfall bleibt unbereinigt, während alle Worker ohne Heap-Limit in einem Prozess laufen (`index.ts:108–121`).

**P3 – Ungeprüftes `JSON.parse(result.stdout)`. Niedrig–mittel.**
`parseSubprocess.ts:151–179` (`JSON.parse` in `154` und `178` ohne `try/catch`). Nicht-JSON/abgeschnittene Child-Ausgabe ⇒ rohe `SyntaxError` statt diagnostizierbarem Pfad (`139–168`); kein falsches `success`, daher P3.

### Verworfene Hypothesen (Crawler)
- `getSubprocessScriptPath`-dist-Pfad: tsdown-Entrypoints `index.ts` + `scripts/parseHtmlSubprocess.ts`, outDir `dist`, Container startet `node dist/index.js` → Pfad passt; nur bei Chunk-Unterverzeichnis falsch (nicht belegt).
- Temp-Leak in `downloadAndStoreFile`: durch `finally` (`assetStorage.ts:335–339`) + `rm` im Store (`assetdb.ts:191–197`) gedeckt.
- `abortSignal`-Listener-Leak in `setupPage`: Controller ist pro Job-Lauf (`liteque runOnce`) → kein prozessweites Wachstum.
- Reaper/`activeContexts`: Map-Key `${job.id}:${job.runNumber}` eindeutig.
- Post-Crawl-Dispatch ohne Abort-Guard / doppelte Webhooks nach Timeout: als bereits abgedeckt nicht gemeldet (`crawlerWorker.ts:566–572`).
- Leerer Screenshot-Buffer als Asset bei Abort: `throwIfAborted` danach (`crawlPage.ts:396–399,443–446`) verhindert es.
- PDF nutzt `screenshotTimeoutSec`: kein eigener PDF-Timeout vorhanden → bewusst.
- `readerViewReasons` „challenge_page“/„no_extracted_content“: im Enum (`types/bookmarks.ts:58–85`) → keine Zod-Verletzung.
- Unbounded stdout: `execa maxBuffer` begrenzt.
- Malformed-Request als success: `bookmarkId` fehlt dann ohnehin → Update ins Leere.
- Idempotency-Key blockiert Recrawl dauerhaft: Queue-Plugin/tRPC-Model, außerhalb des Auftrags.

### Geprüfter Umfang (Crawler)
Vollständig gelesen: `crawler/{crawlPage,browser,parseSubprocess,transcript,autoconsent,assetStorage,crawlAndParse,probe,utils,ytdlpAuth,faster_whisper_cli.py}`, `scripts/parseHtmlSubprocess.ts`, `workers/utils/{parseHtmlSubprocessIpc,metadataResolver,readerViewAssessment}.ts`, `crawlerWorker.ts`, `workerUtils.ts`, `utils.ts`, `network.ts`, `index.ts`, `adminMaintenance/tasks/tidyAssets.ts`, `shared/queueing.ts`, `shared/assetdb.ts`, `shared-server/src/queues.ts` + `quotaService.ts`, `plugins/queue-liteque`, `db/schema.ts` (assets/bookmarkLinks/bookmarkAssets), `shared/config.ts`, `shared/types/bookmarks.ts`, tRPC bookmarks/admin/ruleEngine (nur Trigger-Nachweis), Dockerfile + s6, `tsdown.config.ts`, Doku env-vars, `node_modules/{execa,liteque,playwright-core}`.

## Dense-UI-Tiefenprüfung (Fork-eigene Komponenten)

Read-only, keine Runs. 12 Befunde. Desktop-Fokus; `mobile/**` nur als Gegenbeleg.

**P2 – Die Inline-Suche der FILES-Ansicht übergibt `searchQuery` nie an die Treffer-Zeilen. Hoch.**
- Primär: `dense/DenseFilesView.tsx:621–627` (Liste) / `631–633` (Grid); `dense/DenseBookmarkRow.tsx:29–41`
- Szenario: ⌘K bzw. „Search“ im Header (Files/Favourites/Archive/Liste/Tag), Begriff tippen → Treffer aus `bookmarks.searchBookmarks` (`DenseFilesView.tsx:173–190`) werden als `<DenseBookmarkRow bookmark={bookmark} selected={i===0} />` gerendert — **ohne** den optionalen Prop `searchQuery` (Default `""`). Genau darauf baut die Zeile auf: `SearchMatchText` (95/124/136) und `noteSnippet` (68–73). Die beiden anderen Trefferflächen übergeben ihn: `app/dashboard/search/page.tsx:165` und `dense/mobile/MobileSearchHome.tsx:291` (Commit `02a3b071` hat nur diese beiden verdrahtet).
- Erwartet vs. tatsächlich: erwartet Markierung im Titel/Summary + Notiz-Snippet für Treffer, die nur über die Notiz matchen. Tatsächlich keine Markierung, kein Snippet — Ergebniszeilen ohne sichtbaren Grund.

**P2 – `demoMode`-Gate fehlt für Archivieren/Favorisieren/Löschen/Re-Summarise in der Dense-UI. Hoch.**
- Primär: `dense/DenseRowOverflowMenu.tsx:51,109–148`; `dense/DenseBookmarkDetail.tsx:129–133,203–272`; `dense/DenseBookmarkRow.tsx:187–207`; `dense/DenseBookmarkCard.tsx:50–69`
- Szenario: Demo-Instanz; Server lehnt jede Mutation ab (`packages/trpc/index.ts:97–102`, FORBIDDEN). Gesperrt sind nur „Add to list“ (`DenseRowOverflowMenu.tsx:128–134`, `DenseBookmarkDetail.tsx:241–249`) und ActionButton-/TagsEditor-Flächen (`ui/action-button.tsx:26–31`, `TagsEditor.tsx:60–61`); Archive/Delete/Re-Summarise/Favourite sind plain `<button>`s/Dropdown-Items ohne Gate.
- Erwartet vs. tatsächlich: erwartet wie Upstream `disabled: demoMode` auf allen Items (`bookmarks/BookmarkOptions.tsx:94,284,301,342,360,373,427,449,459`). Tatsächlich Controls klickbar, Mutation scheitert, nur generisches „Something went wrong“. Der eigene Kommentar `DenseBookmarkDetail.tsx:129–133` („kein zweiter, ungegaterter Pfad zur selben Mutation“) gilt hier genauso.

**P3 – Suche zeigt während des laufenden Requests „0 results“ und „Nothing here yet.“ Hoch (Mechanik), Dauer ungemessen.**
`DenseFilesView.tsx:171–190,298–303,615–618`. Nach dem 200-ms-Debounce (`:166–171`) ist `isSearching` true, `searchResult.data` noch `undefined` → `bookmarks = []` (`:203–206`); Ladezustände der Suchquery werden nirgends ausgewertet. `keepPreviousData` greift erst ab dem zweiten Tastendruck.

**P3 – Detach-dann-Re-Add kann einen dauerhaft „pending“ Chip hinterlassen (× disabled). Mittel.**
`lib/dense/useTagPendingOps.ts:101–117,147–163`; `lib/dense/tagReconcile.ts:131–150`; `TagsEditor.tsx:374–397`. Tag „reading“ ist dran, Nutzer klickt × (Pending-Detach) und attacht sofort erneut — der neue Attach mintet einen Pending-Chip (bewusst so festgeschrieben in `tagReconcile.test.ts:140–156`). Zwei getrennte `bookmarks.updateTags`-Requests; der Router löst Namen→IDs vor der Transaktion auf und macht in der Transaktion erst DELETE, dann INSERT (`routers/bookmarks.ts:1348–1440`). Committet der Attach vor dem Detach, ist der Tag am Ende nicht dran, und der Settle-Effekt räumt den Pending-Attach nur weg, wenn `serverTags` den Namen enthält (`:104–109`) → 60 %-„saving…“-Pill mit permanent `disabled` × bleibt stehen. Nur ein Reload räumt ihn. (Konfidenz mittel, verlangt diese Commit-Reihenfolge.)

**P3 – Ein-Bullet-Summary leakt „- “ in Zeile und Karte. Hoch.**
`lib/dense/summary.ts:50–52,69–79`. Bei `summary = "- Nur ein Punkt"` verwirft `parseSummary` die Liste (`keyPoints.length < 2`) und gibt den Rohtext als `lead` zurück (so festgeschrieben in `summary.test.ts:51`); `summaryPreview` gibt `lead` nach `stripSummaryMarkers` unverändert zurück (Bullet-Zeichen kennt das Stripping nicht). Gerendert in `DenseBookmarkRow.tsx:116–126` bzw. `DenseBookmarkCard.tsx:98–108`. Genau der Ein-Bullet-Fall ist in `summary.test.ts:75–90` nicht getestet.

**P3 – Sidebar-Tags sind statischer Server-Prop und veralten nach Rename/Merge/Delete. Hoch.**
`dense/DenseSidebar.tsx:423–437`; `app/dashboard/layout.tsx:125–128` (+ Datenabruf `90–93`). Das Tags-Segment liest `initialTags` (`:426`), das Layout befüllt es einmal aus `api.tags.list({limit:10})`; keine Query subscribed, und Next rendert das gemeinsame Layout bei Client-Navigation nicht neu. `useUpdateTag`/`useMergeTag`/`useDeleteTag` invalidieren nur `tags.list` → alter Name bzw. gelöschter Tag bleibt sichtbar, der Chip linkt auf `/dashboard/tags/<id>` und landet nach dem Löschen auf 404. Erst Full-Reload korrigiert. (Vergleich: Lists-Segment nutzt eine Live-Query, `DenseSidebar.tsx:259–273`.)

**P3 – ⌘K/Ctrl-K öffnet die Kopf-Suche ohne Editable-Guard (auch beim Tippen). Mittel.**
`DenseFilesView.tsx:212–225`; Kontrast `dense/DenseShortcutsHelp.tsx:16–25,59–75`. Der Listener ist ein rohes `window.addEventListener("keydown")` ohne `isEditableTarget`-Guard (den `DenseShortcutsHelp` für `?` hat) und ruft unbedingt `setSearchOpen(true)` + `requestAnimationFrame(focus)`. Erwartet: kein Feuern in Eingabefeldern. Tatsächlich wird der Ansichts-State umgeschaltet; ob der Fokusklau sichtbar wird, hängt von Radix' Focus-Trap ab.

**P3 – Persistierte Theme-/Scale-/View-Präferenzen greifen erst nach der Hydration (Flash). Hoch (Mechanik), Sichtbarkeit ungemessen.**
`lib/dense/theme.ts:301–330`; `lib/dense/useDenseScale.ts:50–59`; `dense/DenseScaleController.tsx:38–44`; `DenseFilesView.tsx:80–93`. Alle Präferenzen werden ausschließlich in `useEffect` gelesen/angewendet; kein Pre-Hydration-Script — die Keys `k-dense-theme`, `k-dense-scale`, `k-dense-files-view`, `k-dense-sidebar-collapsed` haben außerhalb der Hook-Module keinen Konsumenten. Erster Frame zeigt Default-Akzent/Deep-slate/Zoom 1/List-View, danach der Sprung (inkl. `--font-k-sans`). Nur die Sidebar hat `data-ready`/Transition-Gating (`useSidebarCollapsed.ts:46–61`).

**P3 – „Open original“ fehlt im Zeilen-Menü für Text-/Asset-Bookmarks mit `sourceUrl`. Hoch.**
`dense/DenseRowOverflowMenu.tsx:62–63,101–108`. `url` entsteht nur für LINK-Bookmarks, obwohl das Schema `content.sourceUrl` auch für TEXT/ASSET erlaubt (`shared/types/bookmarks.ts:270–280`). Die Detailansicht nutzt `getSourceUrl` (`DenseBookmarkDetail.tsx:157,293–313`), das für TEXT/ASSET die `sourceUrl` liefert (`shared/utils/bookmarkUtils.ts:85–96`) → Original nur über den Umweg Detailansicht erreichbar.

**P3 – Sidebar listet weder geteilte (Editor-)Listen noch Unterlisten. Mittel.**
`dense/DenseSidebar.tsx:267–273`: Der Filter `!l.parentId && l.userRole === "owner"` entfernt beide. Inkonsistent mit dem Rest des Forks: der „Add to list“-Dialog bietet Editor-Listen an (`DenseManageListsDialog.tsx:119–129` filtert nur `viewer`), die Listenseite erlaubt dort das Hinzufügen (`lists/[listId]/page.tsx:52–62`), und die Vor-Fork-Sidebar zeigte Owner+Editor plus eine eigene „geteilt“-Sektion (`components/dashboard/sidebar/AllLists.tsx:108,249,281`). Unterlisten sind aus der Sidebar gar nicht erreichbar. (Konfidenz mittel — bewusste flache Sidebar nicht ausgeschlossen, aber nirgends kommentiert/getestet.)

**P3 – Quick-Add-Dialog: Escape oder Overlay-Klick verwirft den getippten Text ohne Rückfrage. Mittel.**
`dense/QuickAddDialog.tsx:44–56`; `bookmarks/EditorCard.tsx:71–89`. `DialogContent` ohne `onEscapeKeyDown`/`onPointerDownOutside`/`onInteractOutside`-Guard und ohne Draft; der Form-State lebt nur im Radix-Content, der beim Schließen unmountet; `onSaved` läuft nur bei erfolgreichem Create (`:84`). Die Vor-Fork-Variante (EditorCard inline) hatte diesen Verlustpfad nicht — er entsteht durch die modale Hülle des Forks. (Datenverlustklasse.)

**P3 – `matchSnippet` schneidet an UTF-16-Grenzen und kann Emoji/Astralzeichen zerteilen. Hoch (Mechanik), sehr geringe Wirkung.**
`lib/dense/searchHighlight.ts:76–93`: Die Schnittgrenzen `match.index - contextChars` bzw. `+ contextChars` können zwischen High-/Low-Surrogate fallen; `text.slice(start, end)` arbeitet auf UTF-16-Codeeinheiten → verstümmeltes Zeichen („�“) am Snippet-Rand. Erreichbar auf `/dashboard/search` (`page.tsx:165` → `DenseBookmarkRow.tsx:68–73`) und im mobilen Search-Home; in der Inline-Suche der FILES-Ansicht derzeit nicht (Befund 1).

### Verworfene Hypothesen (Dense-UI)
1. Löschen aus dem Vorschau-Modal hinterlässt Spinner/Zombie-Modal: `usePathname()` ist im abgefangenen Modal `/dashboard/preview/<id>`, `currentPath.includes(bookmark.id)` greift (`DeleteBookmarkConfirmationDialog.tsx:33–37`) → korrekt.
2. Menü-Aktion auf falscher Zeile/stale id: Zeilen per `bookmark.id` gekeyt (`DenseFilesView.tsx:623`), Menü-Content wird beim Öffnen neu gemountet, portierte Events doppelt abgefangen (`currentTarget.contains` in `useRowNavigate.ts:48`; `stopPropagation` `DenseRowOverflowMenu.tsx:87/99`).
3. `useCursorV2: true` (`DenseFilesView.tsx:148`) vs. Prefetch ohne Flag: Feld laut Schema dokumentiert ungenutzt (`shared/types/bookmarks.ts:300–303`), im Router nirgends gelesen.
4. „Merge instead“-Hinweis läuft ins Leere: UNIQUE liegt auf exaktem `name` (`packages/db/schema.ts:505`), BAD_REQUEST (`models/tags.ts:375–382`) also nur bei exakter Gleichheit — die literale `nameContains`-Suche findet den Tag.
5. Quick-Add-Doppel-Submit nach fehlgeschlagener Post-Creation: erreichbare Auslöser sind durch `disableAdd` gesperrt (`lists/[listId]/page.tsx:52–62`), manuelles `addBookmark` wirft kein BAD_REQUEST (`models/lists.ts:998–1003`).
6. `DenseBookmarkDetail` behält Overrides über Bookmark-Wechsel: kein In-App-Navigationspfad von Vorschau zu Vorschau → nicht erreichbar.
7. ⌘E feuert beim Tippen: react-hotkeys-hook v5 überspringt Form-Tags per Default, Textarea ist bei `isPending` disabled.
8. `inert={collapsed}` falsch auf React 18: React ist 19.2.3 (`apps/web/package.json:91`) → boolean `inert` korrekt.
9. Regex-/Offset-Fehler in `searchHighlight`: `escapeRegExp` vollständig, längstes-zuerst, RegExp pro Aufruf neu (kein `lastIndex`-Leak), Offsets UTF-16-konsistent.
10. Header-Zahlen falsch: unabhängige Fallbacks + Klemmen (`headerCounts.ts:38–57`), Server-Count teilt `baseWhere` mit der Seite (`models/bookmarks.ts:520–676`).
11. Seiten-Mischung durch `keepPreviousData` bei der Suche: `placeholderData` wird auf Result-Ebene angewandt, Query-State bleibt leer → `onFetch` startet frische Seitenliste.
12. Chat-Streaming (SSE-Framing/Doppel-Submit/New Chat): Server sendet `data: {...}\n\n` + `[DONE]`, Client trennt korrekt; `isStreaming` sperrt. Nur Kosmetik: abgebrochene Antwort bleibt als leere „Keepsake“-Zeile ohne Fehlertext (`DenseChat.tsx:308–322`); IME-Komposition beim Enter-Senden ungeprüft.

### Geprüfter Umfang (Dense-UI)
Vollständig gelesen: `QuickAddDialog`, `DenseBookmarkDetail`, `DenseSidebar`, `DenseRowOverflowMenu`, `DenseFiles(View)`, `DenseThemeController`, `DenseScaleController`, `DenseShortcutsHelp`, `ForceDenseTheme`, `DenseSettingsSidebar`, `DenseBookmarkRow/Card/HighlightRow`, `SearchMatchText`, `SummaryAspectText`, `tags/**`, `lists/**`, `chat/DenseChat`, `lib/dense/{tagReconcile,useTagPendingOps,useRowNavigate,useSidebarCollapsed,useDenseScale,searchHighlight,summary,format,bookmarkDisplay,headerCounts,useLiveBookmark,theme}.ts`. Call-Chain-Gegenproben in `dashboard/layout.tsx`, Preview-Routen (+`@modal`), `lists/[listId]`, `tags/[tagId]`, `feeds/[feedId]`, `bookmarks/page`, `search/page`, `settings/layout`, `TagsEditor`/`BookmarkTagsEditor`/`EditorCard`/`EditBookmarkDialog`/`DeleteBookmarkConfirmationDialog`/`BookmarkOptions`, `packages/trpc/*`, `packages/shared/*`, `packages/db/schema.ts`, `app/api/chat/route.ts`, query-core-Bundle, Commit-Historie (`5ba2b355`, `02a3b071`) sowie MISTAKES/CHANGELOG/ROADMAP.

---

# Runde 5 — Restliche Worker, Suche, Deployment

## Restliche Worker-Subsysteme (adminMaintenance, Backups, Asset-Preprocessing, Indexierung, Video, Shutdown)

Read-only, keine Laufzeitmessungen. 11 Findings.

**P1 – `tidy_assets` löscht Dateien ohne In-Flight-/Alters-Guard (TOCTOU) und im S3-Modus potenziell fremde Objekte. Hoch.**
- Primär: `adminMaintenance/tasks/tidyAssets.ts:14–40` (Löschung `29–33`), `:69–81`; `packages/shared/assetdb.ts:566–612`
- Szenario (a): Crawl-/Video-/PDF-Jobs schreiben die Asset-**Datei** VOR der `assets`-Zeile (`videoWorker.ts:204–225`, `assetPreprocessingWorker.ts:240–260`, `crawlAndParse.ts:353–487`). Läuft in diesem Fenster `tidy_assets` mit `cleanDanglingAssets:true`, findet `handleAsset` keine DB-Zeile und **löscht die Datei**; danach committed der Job seine DB-Zeile → Vorschau/Download dauerhaft 404, kein Reparaturpfad außer Recrawl.
- Szenario (b): `getAllAssets()` (S3) listet den ganzen Bucket **ohne Prefix** und behandelt jedes Objekt mit genau zwei Pfadsegmenten als `userId/assetId`; in einem geteilt genutzten Bucket löscht derselbe Lauf fremde Objekte, weil deren „assetId“ keine DB-Zeile hat.
- Erwartet vs. tatsächlich: erwartet Löschung nur nachweislich verwaister Objekte (Grace-Period/Alter, Bucket-Prefix), nie von Dateien, auf die ein laufender Job gerade schreibt. Tatsächlich reine Existenzprüfung `assets.id`, kein Alters-/In-Flight-Kriterium, kein Prefix, keine Dry-Run-Option (Default `false` macht den Lauf nur zum No-op, nicht zum Probe-Lauf).

**P2 – `backupWorker` legt die `assets`-Zeile vor der Datei an: verwaiste DB-Zeile belegt dauerhaft Quota. Hoch.**
`backupWorker.ts:253–275,291–305`: `db.insert(assets)` (`:257–265`) läuft **vor** `saveAssetFromFile` (`:266–275`). Schlägt der Datei-Write fehl (ENOSPC, S3-Fehler, `copyFile`) oder stirbt der Prozess/Timeout dazwischen, greift der catch nur für den Backup-Datensatz. Zurück bleibt eine `assets`-Zeile (assetType BACKUP, `size>0`) ohne Datei. `cleanupOldBackups`/`Backup.delete()` erfassen sie nie (`backups.assetId` bleibt `null`), `QuotaService.getCurrentStorageUsage` (`sum(assets.size)`, `quotaService.ts:89–95`) rechnet sie aber mit → Kontingent dauerhaft belegt, kein Selbstheilen.

**P2 – `backupWorker` ignoriert `abortSignal`: nach 600 s Timeout läuft der Lauf weiter, überschreibt `failure` mit `success`, Retry erzeugt zweiten Datensatz. Hoch.**
`backupWorker.ts:163–166,173–319` (kein `abortSignal`), `:210–216`, `:278–283`, `:128–160`. Der Runner bricht nach 600 s ab und ruft `onError` → Status `failure` (`:144–159`). Der eigentliche Lauf arbeitet ohne Abbruch weiter und setzt später `status:"success"`+`assetId` (`:278–283`) → der Fehlerstatus wird nachträglich überschrieben. Gleichzeitig geht der Job auf `pending_retry`; der Retry liest den persistierten Payload, in dem die In-Memory-Mutation `req.data.backupId` (`:215`) fehlt, und ruft erneut `Backup.create` (`:210–212`) → zweiter `backups`-Datensatz + zweites Asset für denselben geplanten Lauf.

**P2 – `assetPreprocessingWorker` ignoriert `abortSignal` (Default-Timeout 60 s): native Konvertierung läuft nach Timeout weiter, Retry parallel, doppelte Screenshot-Assets. Hoch.**
`assetPreprocessingWorker.ts:110–114,386–507,189–278` (`config.ts:134–135`: `jobTimeoutSec` 60, `numWorkers` 1). `pdf2json`/`pdf2pic` (Ghostscript)/Tesseract laufen ohne Timeout und ohne Abbruch. Im Timeout settled der Runner sofort, gibt den Semaphore-Slot frei, Job → `pending_retry`; der weiterlaufende Erstversuch fügt z. B. die ASSET_SCREENSHOT-Zeile ein (`:252–260`) und enqueued Embedding/Summarize/Reindex erneut (`:477–506`), während der Retry denselben Ablauf parallel startet. Kein Unique-Index auf `(bookmarkId, assetType)` (`schema.ts:393–397`) → doppelte Assets/Inferenz-Jobs.

**P2 – Fehlgeschlagene Suchindizierung ist still und dauerhaft (Retry-Budget in Sekunden aufgebraucht, Fehlerzeilen gelöscht, keine Reconciliation). Mittel–hoch.**
`searchWorker.ts:139–179,41–51`; `packages/shared-server/src/queues.ts:183–191`. Bei nicht erreichbarem Meilisearch werfen `add/deleteDocuments`. Zwischen den Versuchen liegen ~1 s (liteque: `finalize pending_retry` mit `availableAt=now`, Poll 1000 ms; restate: `ctx.sleep(1000)`); `numRetries: 5`, `keepFailedJobs: false`. Nach ~6 s sind alle Versuche weg, die Fehlerzeile wird gelöscht → `SearchIndexingQueue.stats().failed` bleibt 0 (`trpc/routers/admin.ts:178`). Es gibt kein Statusfeld für „nicht indiziert“ (anders als `embeddingStatus`/`taggingStatus`) und keine Reconciliation. Folge: Bookmark fehlt dauerhaft im Index bzw. ein gelöschter Bookmark bleibt als Treffer (404 beim Öffnen); Reparatur nur manuell über „Reindex all“.

**P2 – `videoWorker` schluckt Download-Fehler und meldet Erfolg: `numRetries: 5` greift nie. Hoch (Mechanik).**
`videoWorker.ts:157–187,132–139`; `queues.ts:253–261`. Jeder `execa("yt-dlp")`-Fehler (Timeout, HTTP 5xx, fehlende Binary) wird geloggt, die Temp-Datei gelöscht, dann normales `return` (`:168–187`); ebenso bei fehlgeschlagener Redirect-Validierung (`:132–139`). Der Runner wertet das als Erfolg (`onComplete`, Zähler „completed“). Retry-Budget ist toter Code, der Nutzer bekommt still kein Video.

**P3 – Neu gespeicherte Asset-Dateien überleben fehlgeschlagene DB-Schreibvorgänge. Hoch.**
`videoWorker.ts:197–240`; `assetPreprocessingWorker.ts:229–278`. videoWorker: `saveAssetFromFile` (`:204`) ok, Transaktion (`:212–225`) scheitert → catch wirft ohne Kompensation (`:231–240`); `deleteLeftOverAssetFile` (`:249–273`) sucht nur im Temp-Ordner, den `saveAssetFromFile` bereits geleert hat (`assetdb.ts:205`). assetPreprocessing: `saveAsset` (`:240`) ok, `db.insert(assets)` (`:252`) scheitert → catch loggt und gibt `false` zurück (`:266–277`); jeder Retry erzeugt per `newAssetId()` (`:237`) eine weitere Waise. Dateien ohne DB-Zeile → Quota zählt sie nicht, Speicher wächst bis zum manuellen `tidy_assets`.

**P3 – `tidy_assets` macht pro Asset 1–2 sequenzielle DB-Roundtrips.** *(statisch belegt, ungemessen)*
`tidyAssets.ts:14–55,69–81`; `assetdb.ts:323–343` (`BackgroundJobs.tsx:500–509` sendet beide Flags). Für jede Datei sequenziell `findFirst` (+ `update` bei `syncAssetMetadata`), kein Chunking/`inArray`-Abgleich → 1–2·N Roundtrips. PK-Suche ist indiziert (`schema.ts:364`); der Aufwand ist die Roundtrip-Anzahl.

**P3 – PDFs ohne Textebene bekommen nie ein Screenshot-Vorschaubild; Job scheitert endgültig. Mittel.**
`assetPreprocessingWorker.ts:354–374,446–461`. `extractAndSavePDFText` wirft bei leerem Text (`:358–362`); der Aufruf steht im `case "pdf"` **vor** `extractAndSavePDFScreenshot` (`:447–458`) und wird nicht abgefangen → Scan-PDFs erhalten nie ASSET_SCREENSHOT, obwohl die Screenshot-Erzeugung inhaltlich unabhängig ist. „Kein Text“ ist permanent, wird aber 3× versucht (`numRetries 2`), erst dann setzt `onError` die Status zurück.

**P2 – Shutdown beendet laufende Jobs sofort (`process.exit` ohne Drain); jeder Kill verbraucht einen Retry. Hoch.**
`apps/workers/index.ts:144–176` (insb. `170–176`); `apps/workers/exit.ts:5–10`. SIGTERM → `shutdownPromise` resolved → Race-Ende; `worker.stop()` setzt nur ein Flag (liteque `Runner.stop`: `stopping = true`), das vom Runner angebotene `await Promise.allSettled(inFlight)` wartet niemand ab, weil die `worker.run()`-Promises aus dem Race verworfen werden; danach sofort `process.exit` (`:176`). Laufende Jobs werden mitten in Schreibvorgängen gekillt (`saveAsset` schreibt `asset.bin`+`metadata.json` parallel, `assetdb.ts:169–178` → halbe Asset-Verzeichnisse, danach wirft `getAllAssets`/`readAssetMetadata` und reißt den ganzen tidy-Lauf ab). Der liteque-Row bleibt `running`, wird nach `expireAt` erneut deployt und dekrementiert `numRunsLeft` erneut (`liteque dist/index.js:119–140`) → wiederholte SIGTERMs können Jobs endgültig auf failed setzen. **SIGINT wird gar nicht behandelt** (`exit.ts:6`).

**P3 – Tesseract-Worker wird pro OCR-Job neu erzeugt und beendet.** *(statisch belegt, ungemessen)*
`assetPreprocessingWorker.ts:121–137`: Jeder Bild-Job `createWorker(...)` + `terminate()` im `finally` → pro Bild WASM-Core-/Sprachdaten-Init; bei N Parallelläufen N gleichzeitige Worker.

### Verworfene Hypothesen (Worker)
- O(N²)-Fullscan in `migrate_large_link_html`: verworfen — `id` ist PK (`schema.ts:292–296`), `ORDER BY id ASC` + `gt(id,cursor)` bricht über den PK-Index früh ab; Cursor wird immer auf die letzte Batch-ID gesetzt (`migrateLinkHtmlContent.ts:188`), kein Endlos-Loop.
- `tidy_assets` löscht bei DB-Fehler Dateien: verworfen — `handleAsset` ist pro Asset in try/catch (`:74–80`), DB-Fehler ⇒ Log, kein Delete.
- Index/Delete-Reihenfolge divergent: verworfen — `runIndex` bricht bei fehlendem Bookmark ab, ohne neu zu indizieren (`searchWorker.ts:83–88`).
- Temp-Datei-Leak in `videoWorker`: verworfen — `saveAssetFromFile` entfernt die Quelldatei (`assetdb.ts:205/434`).
- `findAssetFile`-Präfixkollision: verworfen — `newAssetId()` sind gleich lange UUIDs.
- `job.error.stack` ohne Optional-Chaining: kein Bug — `DequeuedJobError.error` ist nicht optional (`shared/queueing.ts:52–59`).
- `size: PROBE_MAX_BODY_BYTES` (`probe.ts:105,170–207`): kein Finding — Überschreitung nullt nur die Probe-Metadaten.
- Backup scheitert hart bei Quota-Überschreitung (`backupWorker.ts:248`): Design-Entscheidung.
- **Außerhalb des Auftrags, aber real:** Kontolöschung räumt den Suchindex nicht auf (`trpc/models/users.ts:404–413`; gemeinsamer Meili-Index `bookmarks`, `search-meilisearch/src/index.ts:126`) → Dokumente bleiben dauerhaft; `reindexAllBookmarks` hat zudem ein enges `clearIndex`-Race (`trpc/routers/admin.ts:305–325`).
- Cron-Zeitplan Backup (`backupWorker.ts:41–116`): verpasste Mitternacht wird nicht nachgeholt (`runOnInit:false`, `scheduled:false`), Kommentar „midnight UTC“ ≠ node-cron-Lokalzeit — geringe Auswirkung (On-Demand-Backup existiert).

### Geprüfter Umfang (Worker)
`apps/workers/index.ts`, `exit.ts`, `metrics.ts`, `server.ts`, `workerTracing.ts`, `trpc.ts`, `workerUtils.ts`, `network.ts`, `scripts/backfillTranscripts.ts`; `adminMaintenanceWorker.ts` + `tasks/{tidyAssets,migrateLinkHtmlContent}.ts`, `backupWorker.ts`, `assetPreprocessingWorker.ts`, `searchWorker.ts`, `videoWorker.ts`, `ruleEngineWorker.ts`, `crawlerWorker.ts`, `crawler/{crawlAndParse,probe}.ts`, `utils/fetchBookmarks.ts`, `utils/metadataResolver.ts`; `packages/shared/{queueing,assetdb}.ts`, `shared-server/src/{queues,plugins,services/quotaService}.ts`, `trpc/models/{backups,users}.ts`, `trpc/routers/admin.ts`, `db/schema.ts`, Queue-Provider/Liteque-Semantik, Meilisearch-Indexname.

## Deployment / Container / Ops

Read-only, kein Build/Docker/kubectl. 12 Befunde, nach Schwere sortiert.

**1. P1 – Dev-Compose signiert Sitzungen mit einem öffentlich bekannten Secret. Hoch.**
- Primär: `docker/docker-compose.dev.yml:27` (web), `:85` (mobile), `:149` (workers), `:184` (prep) + `:19–20`; `docker/.env:18`
- Szenario: `docker compose -f docker/docker-compose.dev.yml up -d` bzw. `docker/start-dev.sh up`. In `docker/.env` ist `NEXTAUTH_SECRET` nur **auskommentiert** (Zeile 18), also greift der Fallback `super-secure-nextauth-secret`. Port 3000 wird auf allen Interfaces veröffentlicht (`:19–20`), und `docker/.env:14–15` setzt `NEXTAUTH_URL`/`ALLOWED_DEV_ORIGINS` auf eine LAN-IP (172.20.10.2) — der Stack ist bewusst im LAN erreichbar. NextAuth v4 liest das Secret implizit aus `process.env.NEXTAUTH_SECRET` (`apps/web/server/auth.ts:205` ohne `secret:`; v4-Fallback in `node_modules/next-auth/next/index.js:49`). `apps/web/.env` kann den Container-Wert nicht überschreiben.
- Erwartet vs. tatsächlich: erwartet Abbruch ohne Secret oder ein pro Deployment zufälliges Secret. Tatsächlich JWE-Token mit **bekanntem** Schlüssel; das Token trägt `user.id` und `role` (`auth.ts:281–295`) und wird in der Session rekonstruiert → jeder, der das Repo kennt, kann ein Admin-Token erzeugen, sobald er Port 3000 erreicht.

**2. P2 – Alle Laufzeit-Images laufen als root. Hoch.**
`docker/Dockerfile:221` (`ENTRYPOINT /init`), `:124/:225/:235/:245` (kein `USER`), `docker/root/etc/s6-overlay/s6-rc.d/svc-web/run:1–5` und `svc-workers/run:1–5`; ebenso cli (`:256`) und mcp (`:272`). Die `--chown=node:node`-Kopien (`:205,214`) und `chown node:node ./apps/web/.next` (`:210`) zeigen die Absicht, als `node` zu laufen; tatsächlich gibt es weder `USER`-Direktive noch `user`-Datei in den s6-Servicedirs noch `s6-setuidgid` in den run-Skripten (vollständiger `docker/root/**`-Baum geprüft) → alle Prozesse als UID 0 mit Schreibzugriff auf `/data` (SQLite + Assets). Die chowns sind wirkungslos.

**3. P2 – Kubernetes deployt das Upstream-Image, nicht den Fork. Mittel–hoch.**
`kubernetes/web-deployment.yaml:17–18`; `kubernetes/kustomization.yaml:27–43`; `kubernetes/.env_sample:3`; Gegenstück `docker/docker-compose.yml:7`. Die Kustomization ersetzt nur das Tag aus `KARAKEEP_VERSION` (=`release`), nicht Registry/Name. Belegt über `docs/docs/02-installation/07-minimal-install.md:18`, dass `ghcr.io/karakeep-app/karakeep` die Upstream-App ist. Erwartet dieselbe Anwendung wie im Compose-Pfad; tatsächlich Upstream ohne Fork-Oberfläche/-Defaults, zusätzlich `imagePullPolicy: Always` auf einem beweglichen Tag → jeder Pod-Neustart zieht einen beliebigen neuen Stand.

**4. P2 – RWO-PVC + Default-RollingUpdate: zwei Pods schreiben dieselbe SQLite-Datei. Mittel–hoch.**
`kubernetes/data-pvc.yaml:5–10`; `kubernetes/web-deployment.yaml:1–6,29–41`. `replicas=1`, aber keine `strategy` → RollingUpdate mit `maxSurge 1`. `ReadWriteOnce` ist knoten-, nicht pod-scoped: auf einem Single-Node-Cluster mounten beide Pods dasselbe `/data` und fahren dasselbe AIO-Image, dessen s6-init `init-db-migration` startet (`docker/root/etc/s6-overlay/s6-rc.d/init-db-migration/run:1–6`) plus Worker. Auf Multi-Node bleibt der neue Pod in `ContainerCreating` hängen (Multi-Attach). Erwartet `Recreate` (SQLite-verträglich).

**5. P2 – Dev-Migrationen werden mit `|| true` verschluckt. Hoch.**
`docker/docker-compose.dev.yml:193`, Gate `:62–64`. Eine fehlschlagende Migration (drizzle-kit fehlt, Lock, defekte Migration) lässt den prep-Container dennoch mit 0 enden; `web`/`workers`/`mobile` starten über `condition: service_completed_successfully`. Es gibt keinen weiteren Migrationspfad im Dev-Stack (`packages/db/migrate.ts:5` wird nur von `package.json:11–12` bzw. dem s6-init des Produktionsimages aufgerufen) → stille Schema-Drift, neuer Code schreibt gegen alte Tabellen.

**6. P2 – Meilisearch im Dev ohne Auth bzw. mit veröffentlichtem Standardschlüssel auf 0.0.0.0. Hoch (Exposition), mittel (Auswirkung).**
`start-dev.sh:26–31`; `docker-compose.search.yml:17–20`. `./start-dev.sh` startet `getmeili/meilisearch:v1.41.0` mit `-p 7700:7700` und ohne `MEILI_MASTER_KEY` (Development-Modus = keine Authentifizierung); `pnpm dev:search` (`scripts/dev-search.sh:76`) veröffentlicht 7700 ebenfalls auf allen Interfaces, Standardschlüssel `devkey-change-me` steht im Repo. Erwartet Bindung an 127.0.0.1 wie beim Chrome-Container derselben Datei (`start-dev.sh:37`) oder Pflichtschlüssel; tatsächlich ist der komplette Suchindex (Titel/Texte aller Bookmarks) im LAN les- und schreibbar.

**7. P3 – `start-dev.sh` vernichtet bei jedem Abbruch den Meilisearch-Container samt Index. Mittel–hoch.**
`start-dev.sh:26–31` (kein `-v`), `:74–80` (`docker stop`/`docker rm` im Trap), fehlendes `set -euo pipefail` (`:1–11`). `docker run … --name karakeep-meilisearch` ohne Volume → `/meili_data` liegt im Container-Layer; Ctrl+C löst das cleanup aus, das den Container entfernt. Zusätzlich werden Container auch dann gestoppt/entfernt, wenn der Port beim Start schon belegt war — der Guard in `:26` schützt nur vor dem Start, nicht vor dem Löschen in `:77–78`.

**8. P3 – Produktions-Compose injiziert die komplette `.env` in den Meilisearch-Container. Mittel.**
`docker/docker-compose.yml:42–50`. Wer der Doku folgt und `NEXTAUTH_SECRET`/`OPENAI_API_KEY` in `docker/.env` legt (`docker/.env.sample:5–7` dokumentiert diese Datei), reicht sie per `env_file` auch an Meilisearch durch → alle Instanz-Geheimnisse liegen zusätzlich in einem dritten Container.

**9. P3 – Produktions-Compose: `depends_on` ohne Condition/Healthcheck erfüllt die zugesagte Startreihenfolge nicht. Mittel.**
`docker/docker-compose.yml:26–31` (Kommentar/Zusage), `:29–31,32–41,42–50` (in der ganzen Datei existiert kein `healthcheck`-Key). Die Kurzform `- meilisearch`/`- chrome` entspricht `service_started`: Compose kehrt zurück, sobald der Container erzeugt ist; Chrome lauscht erst Sekunden später auf 9222, Meilisearch ebenso. Der AIO-Container startet sofort seine Worker und zieht wartende Jobs → die behauptete Absicherung existiert nicht.

**10. P3 – K8s: keine Requests/Limits, keine Probes, kein `securityContext`. Mittel.**
`kubernetes/web-deployment.yaml:14–41`; `chrome-deployment.yaml:14–23`; `meilisearch-deployment.yaml:14–32`; `web-service.yaml:12`; `ingress_sample.yaml:1–17`. Chrome ist speicherhungrig (`docker/SELF_HOSTING.md:9,97–102` empfiehlt für Compose ein `mem_limit`) — in k8s fehlen Requests/Limits, also kein QoS und OOM-Kill-Risiko für den Knoten. Ohne liveness/readiness-Probe bleibt ein hängender Next-Prozess im LoadBalancer-Endpoint. `type: LoadBalancer` plus TLS-loses Ingress-Sample bedeutet Klartext-HTTP für Sitzungen/API-Keys.

**11. P3 – Chrome-Image: Workflow kann im Fork nie veröffentlichen, Compose zieht einen beweglichen Upstream-Tag. Mittel.**
`.github/workflows/chrome.yml:72–77,133–139` (Guard `github.repository == 'karakeep-app/karakeep'`), `docker/docker-compose.yml:33` (ebenso `dev.yml:103`, `build.yml:15`) `ghcr.io/karakeep-app/karakeep-chrome:release`, `docker/chrome/Dockerfile:3–6` (Pin `151.0.7922.47`). Änderungen an `docker/chrome/**` im Fork bauen, aber die Publish-Jobs werden per Guard übersprungen; Deployments ziehen weiter den Upstream-`:release`-Tag ohne Digest → der Fork kann keine Chrome-Fixes ausliefern, und der Dockerfile-Pin suggeriert eine Kontrolle, die es nicht gibt.

**12. P3 – Doku widerspricht der Referenz-Deployment bei `CRAWLER_YTDLP_COOKIES_FILE`. Mittel.**
`docs/docs/03-configuration/01-environment-variables.md:160` („Mount it read-only with 0600 permissions“) und `packages/shared/config.ts:158` (identische Aussage) vs. `docker/docker-compose.dev.yml:136–142`. Der Worker ruft yt-dlp mit `--cookies <datei>` auf (`crawler/ytdlpAuth.ts:24–37`), und yt-dlp schreibt den Jar beim Beenden zurück; der Compose-Kommentar (`:137–141`) hält fest, dass ein read-only-Mount deshalb in einen OSError mit Exitcode ≠ 0 läuft — Fetch gelingt, Job wird trotzdem als Fehler verbucht, rotierte Cookies gehen verloren.

### Verworfene Hypothesen (Deployment/Ops)
- **Healthcheck kann nie durchlaufen** (`wget --spider` = HEAD auf `/api/health`): widerlegt — Next.js implementiert HEAD automatisch über den GET-Handler (`AUTOMATIC_ROUTE_METHODS`), `/api/health` ist unauthentifiziert (`packages/api/index.ts:86`, `routes/health.ts:9`). Die `--start-period=5s` ist für Erstmigrationen knapp, aber kein harter Fehler.
- **`pnpm install` ohne `--frozen-lockfile`** (`tooling/github/setup/action.yml:21`): GitHub setzt `CI=true`, pnpm defaultet dann auf frozen-lockfile → moot.
- **Secret-Leak über `docker/.env.bak.20260915051407`**: untracked und nicht von `.gitignore:40` erfasst, enthält aber keinen echten Schlüssel (nur der auskommentierte Platzhalter). `docker/.env` ist durch `.gitignore:40` und `.dockerignore` gedeckt.
- **`MEILI_MASTER_KEY` nur an Meilisearch, nicht an web/workers** (`docker-compose.dev.yml:119` vs. `:21–57/:144–164`): die App liest den Schlüssel aus `apps/web/.env` (Symlink `apps/workers/.env`); Hashvergleich zeigt aktuell identische Werte → derzeit kein Bruch, nur latente Doppelpflege.
- **`parallel:` in `.github/workflows/ci.yml:67`**: gültige Syntax für parallele Steps.
- **`OCR_CACHE_DIR`**: Doku nennt `$TEMP_DIR`, `config.ts:115` hat keinen Default — der Code fällt auf `os.tmpdir()` zurück (`assetPreprocessingWorker.ts:126`) → Doku korrekt.
- **`kubernetes/.secrets_sample:4 NEXT_PUBLIC_SECRET`**: wird nirgends gelesen → irreführend, ohne Laufzeitwirkung.
- **`ci.yml` ohne `permissions:`**: alle Jobs nutzen `persist-credentials: false` → geringe Auswirkung.
- **`pnpm add -g turbo`** (`tooling/github/setup/action.yml:15`): ungepinnt, wird aber vom workspace-lokalen turbo verdeckt → Verschwendung, kein Fehler.
- **Bewegliche App-Tags `:latest`/`:release`**: im Repo dokumentiert und bewusst.
- **`docker/start-dev.sh:98` wirbt mit `http://localhost:7700`**, obwohl `docker-compose.dev.yml` keinen Meilisearch-Port veröffentlicht: zwei unterschiedliche Stacks, Kosmetik.
- **`Dockerfile:155`** (wirkungslose `echo … -O`-Zeile) und **`:231/241 --start-period=5s`**: Kosmetik bzw. Grenzfall.
- **`charts/`**: enthält nur eine README (Verweis), kein Chart → keine Chart-Befunde möglich.

### Geprüfter Umfang (Deployment/Ops)
`docker/` (Dockerfile, Dockerfile.dev, `docker-compose*.yml`, `chrome/Dockerfile`, `root/etc/s6-overlay/**`, setup-selfhost.sh, start-dev.sh, export-ig-cookies.py, SELF_HOSTING.md, `.env.sample`; `.env`/`.env.bak`/`ig-cookies.txt` nur auf Geheimnis-/Ignore-Abdeckung geprüft), `.dockerignore`/`.gitignore`, `karakeep-linux.sh`, `start-dev.sh` (Wurzel), `scripts/dev-search.sh`, `scripts/sync-upstream.sh`, `kubernetes/**` (alle 14 Dateien), `charts/`, `.github/workflows/**` (alle 9) + `tooling/github/setup/action.yml`, `turbo.json`, `package.json`-Scripts, `docs/docs/03-configuration/01-environment-variables.md` (292 Z.; automatisierter Abgleich **aller 138 dokumentierten** Namen/Defaults gegen die **164 Keys** in `packages/shared/config.ts`) und `02-different-ai-providers.md`. Gegenprüfungen im Code: `apps/web/server/auth.ts`, `packages/api/index.ts` + `routes/health.ts`, `apps/web/app/api/[[...route]]/route.ts`, `packages/db/{drizzle,drizzle.config,migrate}.ts`, `crawler/{ytdlpAuth,browser}.ts`, `assetPreprocessingWorker.ts`.

## Suchsprache und Ranking

Read-only, keine Commands/Instanzen. 11 Befunde.

**P1 – `or` zwischen Freitext-Operanden wird stillschweigend zu UND. Hoch.**
- Primär: `packages/shared/searchQueryParser.ts:335–363` + `packages/trpc/routers/bookmarks.ts:999–1005`
- Szenario: `hello or world` → Parser liefert `{text:"hello world", matcher:undefined, result:"full"}`; der Router schickt genau diesen Text als Meili-`query` (`bookmarks.ts:1000`) mit `matchingStrategy:"all"` (`search-meilisearch/src/index.ts:93`). Gemischt: `is:fav or world` → der or-Knoten behält nach `.filter(a=>!!a)` nur `favourited`, `flattenAndsAndOrs` (`:369–392`) kollabiert ihn.
- Erwartet vs. tatsächlich: Die Doku (`docs/docs/04-using-karakeep/search-query-language.md:13,49`) verspricht `or` als booleschen Operator → Vereinigung; tatsächlich Schnittmenge (Freitext wird serverseitig immer UND-verknüpft), also still zu wenige oder keine Treffer.

**P1 – `-age:` / `!age:` wird ignoriert und liefert die Gegenteil-Menge. Hoch.**
- Primär: `searchQueryParser.ts:287–303` (+ `packages/shared/types/search.ts:57–64`)
- Szenario: `-age:>1y` soll „nicht älter als 1 Jahr“ heißen; der `age:`-Zweig verwertet `minus` nie, und der Matcher-Typ `age` hat kein `inverse`-Feld. `search.ts:359–370` kehrt ebenfalls nur nach `direction` um.
- Erwartet vs. tatsächlich: laut Doku (`:14,40`) ist jeder Qualifier negierbar → Komplement (neuer als 1 Jahr); tatsächlich exakt die Menge „älter als 1 Jahr“, ohne Fehlermeldung.

**P2 – `%`/`_` in `url:`/`title:` wirken als SQL-LIKE-Wildcards. Hoch.**
`search.ts:253–279` (262, 275) und `280–323` (292, 296, 308, 319). `title:_` → Muster `%_%`; `-title:_` → `not like '%_%'`; `url:a_b` matcht auch „aXb“. Drizzles `like()` erzeugt nur `column like ?` **ohne ESCAPE** (`node_modules/drizzle-orm/sql/expressions/conditions.js:115`), und der Wert kommt ungefiltert aus der Query. Gleiches Muster in `checkUrl` (`bookmarks.ts:1208`). Erwartet laut Doku (`:29/30`) Substring-Suche → Literal; tatsächlich Wildcard-Über-/Untermatching bis „liefert alles“ bzw. „liefert nichts“.

**P2 – `-is:broken` ist kein Komplement (pending-Links und alle Nicht-Link-Bookmarks fehlen). Hoch.**
`search.ts:383–405` (`:398–402`). Der Negativzweig verlangt `crawlStatus='success' AND 2xx`; Schema-Default ist `crawlStatus='pending'` (`packages/db/schema.ts:333–336`). Zusätzlich wird nur aus `bookmarkLinks` selektiert — Text-/Asset-Bookmarks sind per Konstruktion draußen. Erwartet Negation (Doku `:14`) → alles, was nicht „broken“ ist; tatsächlich nur erfolgreich gecrawlte Links → frisch gespeicherte Links und alle Text/Media-Treffer verschwinden still.

**P2 – `before:<YYYY-MM-DD>` schließt den genannten Tag praktisch aus. Hoch.**
`search.ts:347–358` (+ `searchQueryParser.ts:270–286`). `z.coerce.date().parse("2023-12-31")` = `2023-12-31T00:00:00Z`, verglichen mit `lte(bookmarks.createdAt, …)`; ein Bookmark von `2023-12-31T10:00Z` fällt raus — genau so im Doku-Beispiel „after:2023-01-01 before:2023-12-31“ (`:37,46`) verwendet. Doku sagt „on or before date“ inklusive.

**P2 – „Newest/Oldest first“ liefert keine globale Datumsordnung (Meili `sort` ist nur 5. Ranking-Regel). Mittel.**
`search-meilisearch/src/index.ts:86–94` (`:90`) + `bookmarks.ts:984,1002,1152–1162`. Der Router gibt `sort:[{createdAt, order}]` mit; der Index konfiguriert **keine** `rankingRules` (`configureIndex` `:191–222`), es gelten die Defaults `["words","typo","proximity","attributeRank","sort","wordPosition","exactness"]` — `sort` greift nur als Tie-Breaker innerhalb relevanzgleicher Buckets. Bei Text-Queries (nicht bei reinen Filter-/leeren Queries) bestimmt also Relevanz die Auswahl; der Router sortiert danach nur die jeweilige Seite (`:1156–1161`). UI-Label „Newest first“ = `SortOrderToggle.tsx:63–82`. Erwartet globale Datumsordnung über alle Seiten; tatsächlich relevanzgewähltes Fenster, pro Seite datumsortiert → ältere/neuere Treffer fehlen ganz.

**P3 – Unbekannte/ungültige Qualifier-Werte lecken als Volltext-Query durch (still leer). Mittel.**
`searchQueryParser.ts:182–188,236–252,304–309`. `is:helloworld`, `source:bogus` oder `is:"fav"` (der zweite MATCHER-Zweig kennt kein `is:` → default) werden als Text `is:helloworld`/`is:link` emittiert; mit `matchingStrategy:"all"` müssen dann auch die Präfix-Tokens „is“/„tag“ im Dokument vorkommen → fast immer leeres Ergebnis ohne Hinweis.

**P3 – Führende zitierte Phrase verwirft alle folgenden Qualifier. Mittel.**
`searchQueryParser.ts:313–321,418–425`. `"foo bar" is:fav` — MATCHER hat keine StringLiteral-Alternative (`:314–319`) und `kmid(LParen,…)` passt nicht → Gesamtparse scheitert → Fallback gibt die **Roh-Query** als Text zurück (`:418–425`), `matcher` bleibt undefined; der Router (`bookmarks.ts:954,1000`) sucht damit `"foo bar" is:fav` inklusive der Tokens „is“/„fav“. Zweites Szenario gleicher Ursache: unvollständiges Zitat `title:"foo` ist „full“, der Wert bleibt `"foo` → `like '%"foo%'` → null Treffer, kein Text-Fallback.

**P3 – Keine Operator-Präzedenz, strikt linksassoziativ. Mittel.**
`searchQueryParser.ts:324–367`. `lrec_sc` faltet links: `is:fav or is:archived #work` → `((fav OR archived) AND work)`; Standard wäre `fav OR (archived AND work)`. Nur die Reihenfolge `or … and/juxtaposition` divergiert. Die Doku-Beispiele umgehen das Problem mit Klammern.

**P3 – Versionsprüfung des Vector-Providers lehnt künftige Majors (<Minor 3) ab. Hoch (Mechanik).**
`vectorstore-meilisearch/src/index.ts:194–214`. `versionParts[1] < 3` wird ohne Major-Bezug geprüft: bei „2.0.0“ greift `Number("0") < 3` → Warnung + `return null` → Vektorklient null; semantische Suche 400t, Hybrid degradiert still zu FTS (`bookmarks.ts:1039–1058`). Zusätzlich zeigt die Fehlermeldung `:198` `this.version[0]` (nur das erste Zeichen).

**P3 – Doppelte/mehrfache Parses und O(n²)-Tokenkopien.** *(statisch belegt; Wirkung ungemessen)*
`searchQueryParser.ts:86–110` (`:97`) + `packages/shared/types/lists.ts:38–49,95–106` + `apps/web/components/dashboard/search/SearchInput.tsx:186–188`. Jedes Token erzeugt per `this.input.slice(match.length)` eine Kopie des Reststrings (O(n²) pro Parse), und pro Smart-List-Validierung läuft `parseSearchQuery` zweimal (je `refine` einmal), zusätzlich clientseitig bei jedem Tastendruck. Kein katastrophales Backtracking (siehe unten).

### Verworfene Hypothesen (Suche)
- **Katastrophales Backtracking/Exponentialblowup im Parser:** alle Lexer-Regexe sind `^`-verankert mit genau einem Quantor (`searchQueryParser.ts:40–60`), pro Position existiert nur ein gangbarer MATCHER-Zweig → kein Beleg.
- **Meilisearch-Filterinjection über Nutzerwerte:** Filter bestehen ausschließlich aus `id`/`userId` (`bookmarks.ts:973–979,1075–1079`) aus generierten IDs; `filterToMeiliSearchFilter` (`search-meilisearch:18–29`) interpoliert zwar unescaped mit `"`, erreicht aber nie Nutzereingaben.
- `id IN []` bei leeren Matcher-Treffern: Meili-Verhalten ohne Instanz nicht belegbar.
- `-url:` ist kein Komplement (Assets ohne `sourceUrl`, Text-Bookmarks): per Kommentar (`search.ts:273`) und Test (`search.test.ts:332–341`) ausdrücklich gewollt.
- `list:` findet nur eigene Listen (`bookmarkLists.userId`, `search.ts:148–153`), keine geteilten: möglicherweise vom bekannten public-list/RSS-`userId`-Filter abgedeckt → nicht doppelt gemeldet.
- Wörter wie „android“/„orange“ mitten im Text erzeugen `result:"partial"`: Text wird per `consumeTokenStream` (`:433–445`) korrekt rekonstruiert; für Smart Lists irrelevant, da Freitext dort verboten ist (`lists.ts:45`).
- `after:`/`before:`/`age:` filtern auf `lastSavedAt` statt Erst-Erfassung: Schema-Kommentar `packages/db/schema.ts:210–222` dokumentiert das als Absicht.
- Client/Server-Gate für Semantik inkonsistent: beide prüfen `semanticSearch && enableAutoIndexing` (`config.ts:706–710` vs. `bookmarks.ts:956–959`).
- `matchingStrategy:"all"` als solcher: bewusster Fix (Commit `68e73500`); nur als Verstärker in P1/P3 genannt.
- Meilis `maxTotalHits`-Cap beim Semantik-Pfad: ohne Instanz/Doku-Beleg nicht verifiziert.
- Bereits bekannt und nicht gemeldet: unbounded `inArray`-ID-Listen, `-list:`-Inkonsistenz, public-list/RSS-`userId`, breiter JOIN, Meili-Embedder-/Batching-Caches, Web-UI-Filterverlust, `age:`-Monatsüberlauf.

### Geprüfter Umfang (Suche)
Vollständig gelesen: `searchQueryParser.ts`, `search.ts`, `types/search.ts`, `utils/relativeDateUtils.ts`, `searchQueryParser.test.ts`, `packages/trpc/lib/search.ts`, `lib/searchRanking.ts`, `lib/__tests__/{search,searchRanking}.test.ts`, `routers/bookmarks.ts:900–1230` + Konstanten 80–95 + `bookmarks.search.test.ts`, `plugins/search-meilisearch/**`, `plugins/vectorstore-meilisearch/**`, `plugins/lib/batchingDocumentQueue.ts`, `models/bookmarks.ts:420–899`, `models/lists.ts:941–1021`, `shared/types/lists.ts:1–120`, `db/schema.ts` (bookmarks/bookmarkLinks), `docs/docs/04-using-karakeep/search-query-language.md`, `apps/web/lib/hooks/bookmark-search.ts`, `components/dashboard/SortOrderToggle.tsx`, `app/dashboard/search/page.tsx:1–60`.

---

# Umsetzung

Batch 1 umgesetzt am selben Commit, Arbeitsbaum `claude/build-fork-design-1a-6d1ajl`.
Alle Änderungen sind klein und einzeln begründet; nichts committet (Review offen).

## Batch 1 — umgesetzt

| # | Befund | Datei | Änderung |
|---|--------|-------|----------|
| 1 | Open Redirect `/\host` | `packages/shared/utils/redirectUrl.ts` | Zweites Zeichen `/` **oder** `\` wird abgelehnt (+3 Testfälle) |
| 2 | Upload-Fehlerbehandlung wirft | `apps/web/lib/hooks/upload-file.ts` | Fehlerbody wird defensiv geparst, `onError` läuft jetzt immer |
| 3 | Textinhalt nicht leerbar | `packages/trpc/routers/bookmarks.ts:622` | `input.text !== undefined` + Normalisierung `null`/`""` → `""` |
| 4 | Crawler: `execa` ohne `reject:false` | `apps/workers/workers/crawler/assetStorage.ts:405` | `reject: false` + `catch` → Archivieren ist wieder fehlertolerant, Temp-Datei wird aufgeräumt |
| 5 | Listen-Zyklus hängt Server | `packages/trpc/models/lists.ts:619` | Visited-Set in `getChildren` |
| 6 | `/settings` rendert in Inter | `apps/web/app/settings/layout.tsx:47` | Font als `--font-k-sans-plex` registriert (die Variable, auf die die Theme-Indirektion zeigt) |
| 7 | `selected={i === 0}` + fehlendes `searchQuery` | `apps/web/components/dashboard/dense/DenseFilesView.tsx` | Prop entfernt; geparster Freitext wird an die Zeilen durchgereicht |

## Neu gefunden *bei* der Umsetzung

**P1 — `NO_COLOR=1` verhindert den Start von Web-App und Workern.**
`packages/shared/config.ts:237` validierte `NO_COLOR` mit `stringBool`, das
ausschließlich die Literale `"true"`/`"false"` akzeptiert. Nach
<https://no-color.org> bedeutet die Variable aber „gesetzt und nicht leer“,
unabhängig vom Wert — und `NO_COLOR=1` ist die gängige Schreibweise in CI,
Terminals und Container-Images. Da `serverConfigSchema.parse(process.env)` beim
**Import** läuft, führt das zu einem harten Abbruch mit undurchsichtigem
ZodError, bevor überhaupt etwas startet.

Belegt durch Ausführung: mit exportiertem `NO_COLOR=1` scheiterte
`packages/shared/inference.test.ts` schon beim Sammeln am
`serverConfigSchema.parse`. Fix: eigenes `noColorBool` (Präsenz + nicht leer),
`stringBool` bleibt für die app-eigenen Booleans streng. Nach dem Fix laufen
**132/132** Tests in `packages/shared` mit weiterhin gesetztem `NO_COLOR=1`.

## Verifikationsstand

| Prüfung | Ergebnis |
|---------|----------|
| `tsc --noEmit` — `packages/shared`, `packages/trpc`, `apps/workers` | ✅ 0 Fehler |
| `tsc --noEmit` — `apps/web` (nach `next typegen`) | ✅ 0 Fehler |
| `oxlint` + `oxfmt --check` auf allen 8 geänderten Dateien | ✅ 0 Warnungen, korrekt formatiert |
| `packages/shared` Tests | ✅ 132/132 |
| `apps/web` Tests | ✅ 199/202 — die 3 Fehler liegen in `lib/date-format.test.ts` (`Intl`-Locale-Ausgabe) und sind unabhängig von dieser Änderung |
| `packages/trpc` Tests | ⚠️ **nicht lauffähig in dieser Umgebung** |

**Warum `packages/trpc` hier nicht geprüft werden konnte:** `better-sqlite3` in
`node_modules` ist gegen einen anderen Node-ABI gebaut als die verfügbaren
Interpreter. Mit `node` v26.9.0 (ABI 147) lädt das Modul gar nicht
(`NODE_MODULE_VERSION 137` erwartet), mit `node@24` (ABI 137, laut `.nvmrc`
die richtige Major-Version) lädt es, bricht aber in `Statement::~Statement()`
während der GC nativ ab (`Assertion failed: (env) != nullptr`) und reißt den
Testprozess mit. Das ist ein Toolchain-/Umgebungsproblem vor der Änderung und
betrifft alle DB-gestützten Testsuiten. Die betroffenen Pfade
(`bookmarks.update`-Text-Leerung, `lists.getChildren`) sind daher nur typgeprüft,
nicht testausgeführt.

## Offen für Batch 2 (Entscheidung nötig)

1. **Admin-Session-Widerruf** (`apps/web/server/auth.ts`). Der saubere Fix
   verlangt einen DB-Nachschlag pro Session-Auslesung (Rolle/Löschung
   nachladen) — das ist eine Query pro Request. Alternative: kurzes
   `session.maxAge` plus Nachladen. Berührt das Login-Verhalten spürbar.
2. **Checkbox-Toggle** (`markdown-readonly.tsx`). Der Indexfehler braucht einen
   zeilenbasierten Parser, der Fenced Code überspringt und Blockzitat-Präfixe
   zulässt; dazu Sperren/optimistisches Update gegen den Überschreib-Race.
   Mittelgroßer Eingriff in eine Datei, die auch Upstream kennt.
3. **Engine-Befunde** (Crawler-Timeouts, `tidy_assets`, Suchparser `or`/`-age:`).
   Diese Dateien sind laut `FORK_SYNC.md` bewusst Upstream-nah; jeder Fix
   vergrößert den Abstand und die Merge-Konflikte beim nächsten Sync.

## Batch 2 — umgesetzt

Entschieden: Engine-Dateien werden mitgefixt (minimal, dokumentiert), und die
Session lädt Nutzer/Rolle aus der DB nach.

| # | Befund | Datei | Änderung |
|---|--------|-------|----------|
| 8 | **P1** Entzogene Adminrechte bleiben wirksam | `apps/web/server/auth.ts` | `session`-Callback liest die `users`-Zeile bei jedem Session-Zugriff neu; Rolle kommt aus der DB, ein gelöschtes Konto liefert keine Session mehr. Damit wirken Herabstufung *und* Löschung sofort statt bis zu 30 Tage. |
| 9 | Checkbox-Toggle ändert die falsche Aufgabe | `apps/web/lib/markdown/taskListItems.ts` (neu), `components/ui/markdown/markdown-readonly.tsx` | Zuordnung DOM-Checkbox → Quelloffset läuft nicht mehr über einen Regex-Zähler, sondern über einen zeilenbasierten Scanner, der Fenced Code überspringt und Blockzitat-Präfixe zulässt. |
| 10 | Zwei schnelle Checkbox-Klicks überschreiben sich | `markdown-readonly.tsx`, `BookmarkMarkdownComponent.tsx` | `MarkdownReadonly` nimmt ein `disabled`; der Aufrufer reicht `isPending` durch, solange gespeichert wird. |

### Warum ein neues Modul für den Checkbox-Fix

Die alte Zuordnung „n-te DOM-Checkbox = n-ter Regex-Treffer“ war nicht nur
ungenau, sie war **prinzipiell** falsch: sie konnte Fenced Code und
Blockzitate nicht auseinanderhalten. `findTaskListItems` /
`toggleTaskListItem` sind deshalb als reine, testbare Funktionen
herausgezogen — mit 11 Tests, darunter genau die beiden Regressionsfälle
(Codefence vor echter Aufgabe, Blockzitat-Aufgabe) sowie CRLF, Schachtelung
und „unbekannter Index“.

Bewusste Grenze: Ein **eingerückter Codeblock** (4+ Leerzeichen auf
Top-Level) mit `- [ ]` wird weiterhin mitgezählt, weil die Unterscheidung von
einem echt geschachtelten Listeneintrag echtes Block-Parsing bräuchte. Das ist
im Modul-Header dokumentiert.

## Batch 3 — offen, mit Begründung

- **`or` zwischen Freitext (`searchQueryParser.ts`)** ist **kein kleiner Fix**.
  Der Parser liefert genau einen Text-String plus optional einen Matcher; eine
  echte Vereinigung zweier Freitext-Begriffe müsste der Router als zwei
  Queries mit Mengen-Union fahren. Das ist eine Verhaltens-/Feature-Änderung
  an der Suchsprache — dafür braucht es eine Produktentscheidung, nicht nur
  einen Patch. Vorschlag: entweder Union im Router implementieren oder `or`
  zwischen Freitext ausdrücklich ablehnen, statt still zu UND zu degradieren.
- **`-age:`** ist dagegen gut abgrenzbar: dem Matcher-Typ `age` fehlt ein
  `inverse`-Feld, und der `age:`-Zweig wertet `minus` nicht aus. Kleiner,
  testbarer Fix — als Nächstes.
- **Crawler-Timeout-Budgets** (`ASR 900 s` in einem `60 s`-Job) sauber zu
  lösen heißt, den Job-Timeout aus den Sub-Timeouts abzuleiten oder die
  Sub-Timeouts am Restbudget zu kappen. Das ändert das Laufzeitverhalten
  spürbar (längere Job-Laufzeiten, andere Retry-Dynamik) und sollte bewusst
  gesetzt werden, nicht als Nebenwirkung eines Bugfixes.
- **`tidy_assets`-TOCTOU** braucht ein Kriterium (Grace-Period über
  Dateizeit vs. In-Flight-Registry) plus Bucket-Prefix im S3-Modus.

## Verifikationsstand nach Batch 2

| Prüfung | Ergebnis |
|---------|----------|
| `tsc --noEmit` — alle vier Pakete | ✅ 0 Fehler |
| `oxlint` + `oxfmt --check` | ✅ alle geänderten/neuen Dateien konform |
| `apps/web` Tests | ✅ 210/213 — dieselben 3 `Intl`-Locale-Fehler in `lib/date-format.test.ts` wie vorher, keine Regression; die 11 neuen Tests eingerechnet |
| `packages/shared` Tests | ✅ 132/132 |
| `packages/trpc` Tests | ⚠️ weiterhin nicht lauffähig (`better-sqlite3`-ABI-Crash, s. o.) |
