# Agent Roles & Token Management

Diese Datei definiert die vier Agenten-Rollen und die Token-Regeln nach Matt Pocock.
Wird bei jedem neuen Chat gelesen.

---

## Die vier Rollen

### 1. Architect (Codex)
Plant, zerlegt Aufgaben, schreibt Executor-Briefings.
- Keine Implementation selbst
- Liefert: Dateiliste, Änderungen pro Datei, Tests, Commit-Strategie, Out-of-Scope

### 2. Executor (Claude)
Implementiert exakt nach Briefing.
- Keine Exploration, keine eigenen Entscheidungen
- Bei Überraschung: sofort stoppen, berichten
- Keine Commits ohne explizite Freigabe

### 3. Reviewer (Codex, frische Session)
Prüft uncommitted Diffs gegen das Briefing.
- Urteil: APPROVED / APPROVED-MIT-AUFLAGEN / REJECTED
- Bei REJECTED: konkrete Fix-Anweisungen für Executor

### 4. QA-Persona (Claude-Subagent, Haiku)
Führt definierte UI-Tests durch.
- Berichtet PASS/FAIL mit Evidence
- Keine Fixes, nur Beobachtung

---

## Token-Regeln nach Matt Pocock

### Smart Zone
- Kontextfenster >100k Tokens = Qualität sinkt
- Kurze, fokussierte Sessions mit sauberem Reset

### Clear schlägt Compact
- `/compact` erzeugt inkonsistentes "Sediment"
- Besser: State als Dokument speichern, dann `/clear`

### Neue Phase = neuer Kontext
- Planung → Implementation → Review: immer frische Sessions
- Reviewer sieht nur Diff + Kriterien, nie den Planungsthread

### Subagents sind Kontext-Isolation
- Nur Ergebnis fließt zurück
- Rohe Exploration wird mit Subagent verworfen

---

## Token-Status: Schnellreferenz

### Claude (Pro/Max)
| Anzeige | Tokens | Aktion |
|---------|--------|--------|
| 0-35% | 0-100k | 🟢 Smart Zone — weiterarbeiten |
| 36-70% | 100k-200k | 🟡 Vorsicht — Qualität sinkt |
| 71-100% | 200k+ | 🔴 Clear sofort |

**Berechnung:** Prozent × 2.85k = Tokens (bei 285k Limit mit 50% Boost)

### Codex (Plus)
| Anzeige | Tokens (Sol) | Aktion |
|---------|-------------|--------|
| 0-22% | 0-100k | 🟢 Smart Zone — weiterarbeiten |
| 23-45% | 100k-200k | 🟡 Vorsicht |
| 46-100% | 200k+ | 🔴 Clear sofort |

**Berechnung:** Prozent × 4.4k = Tokens (bei ~440k Limit für Sol)

### Codex Subagents (Luna)
| Anzeige | Tokens | Aktion |
|---------|--------|--------|
| 0-100% | 0-16M | 🟢 Limits unkritisch (25× höher) |

---

## Wann clearen?

| Situation | Aktion |
|-----------|--------|
| Executor fertig | `/clear` — Kontext erschöpft |
| Review startet | Neue Session, nur Diff + Kriterien |
| Neues unabhängiges Thema | `/clear`, auch wenn Limit nicht erreicht |
| Session >35% (Claude) oder >22% (Codex) | Smart Zone erreicht — Clear empfohlen |
| Session >70% (Claude) oder >45% (Codex) | 🔴 Clear sofort |

---

## MISTAKES.md

Nach jedem abgeschlossenen Zyklus (oder bei Blockern):
- Eintrag mit Datum, Kontext, Fehler, Lösung
- Bei Docker-Blockern: trotzdem statische Gates (typecheck/lint/format) separat ausführen
- Keine Duplikateinträge — bestehende ergänzen

---

## Für Raycast (dieser Assistent)

Lies diese Datei bei jedem neuen Chat. Erinnere proaktiv an:
- `/clear` wenn nötig (siehe Schwellenwerte oben)
- Frische Session für Reviews
- MISTAKES.md-Einträge nach Blockern

Bei GO: Screen prüfen, Prozente in Tokens umrechnen, Empfehlung geben.
