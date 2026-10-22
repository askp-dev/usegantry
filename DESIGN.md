# Gantry design system

Gantry is the service tower beside a rocket on the pad: the structure where the last checks happen before anything is allowed to fly. The product does the same job for a codebase. The design takes its cues from the **working documents of launch operations** — flight checklists, go/no-go polls, engineering drawings, remove-before-flight tags — not from space-themed decoration. It should feel like a tool a launch director would trust, not a poster of one.

This file is the source of truth for every Gantry surface: Mission Control (`packages/ui`), the lite UI, the VS Code webview, the Launch Clearance Certificate, the roast card, the README badge, CLI output, and the site in `site/`.

## 1. Principles

1. **Paperwork, not spectacle.** The reference is the printed flight plan on a clipboard, not the rocket. Information is laid out like a form: labelled fields, ruled lines, sheet numbers.
2. **One call per station.** Every pillar answers one question: GO, HOLD or NO-GO. Numbers support the call; they never replace it.
3. **A blocker is a physical thing.** Blocking findings are drawn as remove-before-flight tags. You can count them, and fixing one "pulls the tag".
4. **One accent, used rarely.** International orange marks the brand and the single primary action on a screen. Everything else is ink on paper.
5. **Machined, not inflated.** Square corners, hairline rules, flat fills. No glow, blur, gradient or float.
6. **Plain words.** Terse mission-control vocabulary for status; plain English for explanations. No "AI-powered", no "magic".

## 2. What to avoid (the AI-generated look)

These are banned on every surface. Reviewers should reject a PR that adds one.

| Don't | Do instead |
|---|---|
| Near-black `#0a0a0a` background with neon emerald / indigo accents | Warm paper (light) or graphite (dark) with ink, plus one orange |
| Purple→blue gradients, gradient text, mesh/blob backgrounds | Flat fills; structure comes from rules and grids |
| Glassmorphism, `backdrop-filter: blur`, glowing borders, drop shadows | 1px rules; elevation is a heavier rule, never a shadow |
| Starfields, nebulae, planets, orbit rings, rocket renders, 🚀 ✨ 🎯 emoji | Drawing-sheet motifs: title blocks, callout balloons, truss lines |
| Sparkle icon for "AI" actions | A plain verb: "Send to agent", with the hand-off glyph (§6) |
| Bento grids of `rounded-2xl` cards | A ruled table or a strip layout on the 8px grid |
| Circular score gauges, radial progress rings | The go/no-go board (§5.2): call + number + tag count |
| Inter / Space Grotesk / JetBrains Mono as defaults | The type stack in §3.4 |
| Flashing or pulsing "danger" states | A static red tag with a label; motion only on state change |
| Decorative countdowns ("T-minus 3… 2… 1…") | T-notation only for real durations (cert expiry, probe latency) |
| Copy like "Supercharge your launch", "Built for the future" | Say what it does: "Checks 71 launch blockers in 0.3 s" |
| Real agency marks (NASA worm/meatball, SpaceX), mission patches | Our own wordmark and tower mark only |

## 3. Tokens

All colours are CSS variables, defined once in `packages/ui/src/app.css` under Tailwind v4 `@theme` and mirrored in `packages/core/src/design/tokens.ts` (to be created) for the certificate, card, badge and lite UI. Never hard-code a hex value in a component.

### 3.1 Colour: Paper (default)

Paper is the default for documents, the certificate, the roast card and the site. A light card is also more noticeable in dark social feeds.

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F1EEE6` | Page background (warm drafting paper) |
| `--paper-2` | `#E6E1D5` | Recessed areas: table headers, inputs, the selected row |
| `--rule` | `#C9C3B4` | Hairline rules and borders (1px) |
| `--grid` | `#DDD7C9` | Drawing-grid lines (documents only, 8px / 40px) |
| `--ink` | `#17181B` | Primary text, heavy rules (2px), icons |
| `--ink-2` | `#4A4C52` | Secondary text |
| `--ink-3` | `#6B6C70` | Tertiary text, captions (AA at 4.5:1, so it's still readable) |
| `--signal` | `#FF4F00` | International orange: wordmark, primary action **fill**, focus ring, selected tab bar |
| `--signal-ink` | `#B33A00` | Orange used **as text** (links, the active tab label) |
| `--go` | `#1D6B45` | GO call |
| `--hold` | `#B87C00` | HOLD call (fill only) |
| `--nogo` | `#B8231E` | NO-GO call, remove-before-flight tags |

### 3.2 Colour: Console (dark)

Console is for the VS Code webview and for Mission Control when the OS is dark. It uses warm graphite, not black, and never introduces new hues.

| Token | Hex |
|---|---|
| `--paper` | `#1B1B18` |
| `--paper-2` | `#24241F` |
| `--rule` | `#3A3A33` |
| `--grid` | `#2C2C27` |
| `--ink` | `#ECE7DA` |
| `--ink-2` | `#B5B0A4` |
| `--ink-3` | `#8E8A80` |
| `--signal` / `--signal-ink` | `#FF6A1F` (one value; it passes as text on graphite) |
| `--go` | `#4FB37E` |
| `--hold` | `#E3A92B` |
| `--nogo` | `#F0645B` |

In the VS Code webview, inherit `--vscode-editor-background` for `--paper` only when the user's theme is not dark grey (high-contrast themes); otherwise keep Console.

### 3.3 Measured contrast (WCAG 2.2)

| Pair | Paper | Console | Rule |
|---|---|---|---|
| `--ink` on `--paper` | 15.3 | 14.0 | body text |
| `--ink-2` on `--paper` | 7.4 | 8.0 | secondary text |
| `--ink-3` on `--paper` | 4.5 | 5.0 | smallest allowed text colour |
| `--signal-ink` on `--paper` | 5.1 | 6.0 | orange text |
| `--signal` on `--paper` | **2.8** | 6.0 | Paper: **never as text**, fills and rules only |
| `--ink` on `--signal` | 5.4 | — | text on an orange button is **ink, not white** |
| `--paper` on `--go` / `--nogo` | 5.6 / 5.5 | 6.6 / 5.5 | text on a GO or NO-GO fill |
| `--ink` on `--hold` | 5.0 | — | text on a HOLD fill is ink |
| `--hold` on `--paper` | **3.1** | 8.2 | Paper: never as text |

Status is never shown by colour alone: every call carries its word (GO / HOLD / NO-GO), and every tag carries its rule ID.

### 3.4 Typography

| Role | Family | Settings |
|---|---|---|
| Display + labels | **Archivo** (variable, `wdth` 62–125) | Labels: 600, `wdth` 125 (expanded), caps, `+0.08em` tracking. Dense tables: 500, `wdth` 75 (condensed). |
| Body | **Public Sans** | 400 / 600. The US government's typeface: neutral and official, not trendy. |
| Data | **Martian Mono** | 400 / 500. Rule IDs, file:line, hashes, timings, scores. Always `font-variant-numeric: tabular-nums`. |

All three are OFL and on Google Fonts. Self-host them through `@fontsource-variable/*` in `packages/ui` (no runtime CDN). Fallbacks: `"Archivo", "Arial Narrow", sans-serif`, `"Public Sans", system-ui, sans-serif`, `"Martian Mono", ui-monospace, monospace`. The PDF certificate uses the built-in Helvetica / Courier (`pdf.ts`), which is the right fallback.

Scale (1.25 ratio, 15px base): 11 / 12 / 15 / 19 / 24 / 30 / 38 / 60. Station labels are 11px expanded caps. The score on the go/no-go board is 38px Martian Mono. Nothing is larger than 60px except the roast card score.

### 3.5 Space, shape and lines

- **8px grid.** Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64.
- **Radius:** 0 everywhere, 2px on inputs and buttons. The only round shapes are the tag grommet and callout balloons.
- **Rules:** 1px `--rule` for borders, 2px `--ink` for section breaks and table headers, and a dashed 1px `--rule` for "not yet known".
- **Elevation:** none. A dialog sits on a 2px `--ink` frame with a 48px `--paper` margin, not a shadow.
- **Focus:** 2px `--signal` outline with a 2px `--paper` offset on every interactive element.

### 3.6 Motion

Motion is for state changes only: 120 ms (hover, press) and 200 ms (panel, tag pull), `cubic-bezier(0.2, 0, 0, 1)`. There are no idle animations, no parallax and no looping loaders; progress is a determinate bar or a count. Honour `prefers-reduced-motion`, which removes all transforms.

One sanctioned sequence: the data-flow schematic at the top of the site (`site/src/lib/components/FlowSchematic.svelte`). It plays a real scan once (inputs → context → tower → stations → outputs), then stops on its final frame, with a Replay button. It never loops. Its CSS base state is the final frame, so with reduced motion it renders static and the packets are hidden.

## 4. Brand

- **Wordmark:** `GANTRY` in Archivo 800, `wdth` 125, `+0.04em` tracking, in `--ink`. The only orange element is a 4px-tall bar under the wordmark, the same width as the letters, standing in for the pad.
- **Mark:** the tower. Two vertical members, K-bracing between them, and one service arm reaching right at about two-thirds height. Drawn with 2px strokes on a 24px grid, square caps, monochrome `--ink`. No rocket in the mark: the tower is the product.
- **Truss rule:** a 12px-tall repeating K-truss line (1px `--rule`). It is used in two places only: the bottom edge of the app header and the frame of the certificate.
- **Name in copy:** "Gantry", never "GANTRY" in sentences or "Gantry AI".

## 5. Components (`packages/ui/src/lib/components/`)

### 5.1 `<ReadinessHeaderBar/>`

- 56px tall, `--paper`, with the truss rule as its bottom edge.
- **Left:** tower mark + wordmark, then the repo name (Martian Mono 500), the stack as plain text separated by `·` (`Next.js 15 · Supabase`), and the commit (`a8f3c21`, Martian Mono, `--ink-3`).
- **Centre:** four tabs as a ruled strip, not pills: `Readiness`, `Range`, `Legal`, `Budget`. The active tab gets a 3px `--signal` bar on top and `--signal-ink` text.
- **Right:** the overall call (`NO-GO · 65`) as a filled status block, the tag count (`3 tags`) as a small tag (§5.3), then the actions: **Send all to agent** (the one orange button, ink text, `⌘⇧F`) and **Export clearance** (ink outline). No emoji on any button.

### 5.2 Go/no-go board (replaces `PillarCard` + `Gauge`)

The board sits at the top of the Readiness tab: four equal stations in one row, each separated by a 1px rule.

```
┌ SECURITY ───────┬ PRIVACY ────────┬ LEGAL ──────────┬ COST ───────────┐
│ NO-GO           │ HOLD            │ GO              │ GO              │
│ 40   ▮▮▮ 3 tags │ 72   2 high     │ 100             │ 96   1 medium   │
└─────────────────┴─────────────────┴─────────────────┴─────────────────┘
```

- The label is 11px expanded caps in `--ink-2`; the call is Archivo 700 at 24px on a status fill (GO/NO-GO with paper text, HOLD with ink text); the score is Martian Mono at 38px.
- The rule: NO-GO if the station has any blocker, HOLD if it has a HIGH finding, otherwise GO.
- Clicking a station filters the finding list. The board reflows to 2×2 under 720px and to one column under 420px.

### 5.3 Remove-before-flight tag

This is the signature element for every blocking finding.

- A rectangle in `--nogo` with a round grommet (6px ring in `--paper`) at the left end. The text is `REMOVE BEFORE FLIGHT` in 9px expanded caps above the rule ID in Martian Mono 500 (`SEC-01`), both in `--paper`.
- Sizes: full (finding detail, certificate: 168×40), compact (finding row, header count: 72×20, rule ID only).
- **Pulling the tag:** when a rescan clears a blocker, its tag slides 24px right and fades out over 200 ms, and the header count updates. Under reduced motion it simply disappears.
- Never use the tag for anything that isn't blocking launch.

### 5.4 `<FindingList/>` + `<FindingRow/>`: the discrepancy log

A ruled table, not cards. Columns: station (expanded caps), call or tag, rule ID, one-line plain-English impact, `file:line` (Martian Mono, links to the editor), and an action ("Send to agent").

- Rows are 40px; the selected row is `--paper-2` with a 2px `--ink` left rule.
- Expanding a row shows evidence (Martian Mono on `--paper-2`, secrets already redacted), the full impact and the agent prompt with a copy button.
- Group headings use the plain-language categories: **Fix before launch**, **Fix soon**, **Nice to have**.

### 5.5 `<ArchitectureDataFlowGraph/>`: the stack schematic

The same four columns (Entrypoints → API & actions → Tables → Vendors), drawn like an engineering schematic.

- Nodes are rectangles with a 1px `--ink` frame and a Martian Mono label (`POST /api/chat`, `invoices`). Connections are orthogonal 1px lines with no curves.
- Findings attach to nodes as **numbered callout balloons** (16px circles, ink outline) joined to the node by a leader line. The number matches the row in the finding list. A blocking issue adds a compact tag on the node.
- `RLS OFF` is a compact NO-GO tag on the table node: static, never flashing. A vendor missing from the privacy policy gets a dashed connection and a HOLD balloon.
- Column headings are 11px expanded caps over a 2px ink rule, and the background carries the `--grid` drawing grid.
- Clicking a node filters the finding list, as before.

### 5.6 `<LivePentestConsole/>`: the Range

The tab is called **Range**: live probes are tests fired on a test range, and they only run against a target you name.

- **Control strip:** target URL input, the auto-detected Supabase indicator, and one orange button: **Fire 6 probes**. Beneath it, in `--ink-3`: "Non-destructive. Loopback only unless you pass --allow-remote."
- **Left: range log.** One telemetry row per probe: `T+00.038` (time since the run started, Martian Mono), probe ID, name, and the result as a status block: `EXPLOITED 200` (NO-GO) or `HELD 401` (GO). Rows append; nothing animates in.
- **Right: inspector.** The exact `curl`, request and response headers, and the body, each in a ruled Martian Mono block, with one action: **Copy proof + fix prompt**.

### 5.7 `<LegalDiffStudio/>`: the drafting table

- **Left rail (260px):** detected sub-processors as a checklist with square checkboxes, clause toggles, and the jurisdiction selector.
- **Main:** the document is drawn on `--paper` with the `--grid` drawing grid and a title block (§5.9). The diff uses drafting **redline** conventions: deletions in `--nogo` with strikethrough, insertions underlined in `--ink` on a `--paper-2` highlight. Generated regions inside `<!-- GANTRY:AUTO -->` markers get a thin `--signal` bar in the margin.
- **Action:** **Commit legal sync** (orange). Beneath it, always: "Templates, not legal advice."

### 5.8 `<BurnSimulator/>`: the budget

- A single ink line chart of projected monthly cost against traffic, on the drawing grid. The user's budget is a dashed `--signal` threshold line labelled in `--signal-ink`.
- The cost drivers sit in a ruled table beneath (vendor, unit price, projected cost). No area fills, no gradients.

### 5.9 Title block (shared)

A ruled block in the lower right of every document (certificate, legal docs view, vendor pack, roast card footer), borrowed from engineering drawings:

```
┌──────────────┬──────────────────────┐
│ PROJECT      │ acme/app             │
│ COMMIT       │ a8f3c21              │
│ RULESET      │ 2026.10.0  REV C     │
│ ISSUED       │ 2026-10-21 14:02 UTC │
│ SIGNED       │ Gantry CI · run 4242 │
└──────────────┴──────────────────────┘
```

The labels are 9px expanded caps in `--ink-3`; the values are Martian Mono in `--ink`.

## 6. Iconography

- 1.5px strokes on a 16px grid (2px on 24px), square caps, mitred joins, monochrome `currentColor`.
- The set needed: tower, tag, check, cross, hold (a bar), hand-off (an arrow entering a bracket: "send to agent"), copy, external link, document, probe (crosshair without a circle), filter, sort.
- Use Lucide only as a geometry reference. Redraw the icons in our stroke style rather than importing a mixed set. No filled, duotone or emoji icons.

## 7. Surfaces outside the app

### 7.1 Launch Clearance Certificate (HTML + PDF)

- A form on `--paper` inside a truss-rule frame. The title is "LAUNCH CLEARANCE" (Archivo 800, expanded) with the project name beneath.
- The body is the go/no-go board at print size, then the full rule list as a two-column ruled table (rule ID, call), then the sub-processors.
- The verification box: **CLEARED** (a GO fill) or **NOT CLEARED** (a NO-GO fill, plus one compact tag per blocker). Beside it, **Verified · Gantry CI** or **Self-signed · not verified** in plain text, never in a colour that could pass for a verified state.
- The title block sits bottom right, with the verify URL and key fingerprint in Martian Mono beneath. The footer always reads "Automated static scan. Not a security audit or legal advice."

### 7.2 Roast card (1200×630, `check/card.ts`)

- Paper theme. The score in Martian Mono at 160px top left; the verdict beneath it in Archivo 700 at 38px.
- On the right, the four stations as board strips, each with up to two canned lines in Public Sans 18px.
- A compact title-block footer with the repo name, `usegantry.app` and "Run `gantry check` for the fixes."
- The card's safety rule doesn't change: canned lines only, never paths, routes or secrets.

### 7.3 README badge (`compilers/badge.ts`)

- Flat and square, 20px tall. Left half `--ink` with `GANTRY` in paper (expanded caps); right half the status fill with `GO 92`, `HOLD 74` or `NO-GO 40`, plus `✓` when verified.
- Text colours follow §3.3: paper on GO and NO-GO, ink on HOLD.

### 7.4 CLI output (`reporters/pretty.ts`, `check/report.ts`)

- Calls in caps (`NO-GO`, `HOLD`, `GO`) coloured red / yellow / green, with the word always present for no-colour terminals.
- Blockers are prefixed `[TAG]` instead of `⛔`. No emoji; `✔` and `→` are the only glyphs.
- Section headings are short and ruled with `─`.

### 7.5 Site (`site/`)

Use the same tokens, type and components. The hero is a real go/no-go board for a sample repo and a real `gantry check` transcript, not an illustration. The roast box renders `roast --json` (see `docs/check-json.md`). The verify page shows the certificate form from §7.1.

## 8. Voice

- **Status words:** GO, HOLD, NO-GO, CLEARED, NOT CLEARED, HELD, EXPLOITED. They are used exactly and never softened.
- **Explanations:** plain English that names the consequence, e.g. "Anyone can read every user's invoices." Don't use jargon in headlines; rule IDs go in a separate column.
- **Actions:** verbs, e.g. "Send to agent", "Fire 6 probes", "Export clearance".
- **Roast copy** (`roast-lines.ts`) may joke, but at the code, never the person.

## 9. Implementation plan

1. Create `packages/core/src/design/tokens.ts` (both themes, as plain objects) and generate the `@theme` block in `packages/ui/src/app.css` from it, so core surfaces and the Svelte app can't drift.
2. Swap the fonts (`@fontsource-variable/archivo`, `@fontsource/public-sans`, `@fontsource/martian-mono` in `packages/ui`) and delete the Inter / JetBrains Mono references.
3. Build the tag, the go/no-go board and the title block first: every other surface reuses them.
4. Restyle the components in §5 in order (header, board, finding list, schematic, Range, drafting table, budget).
5. Then the core surfaces: certificate HTML + PDF, roast card, badge, lite UI, CLI colours. Update the snapshot and safety tests that assert colours or copy.
6. QA: screenshots of every tab in Paper and Console at 1440, 1024 and 390px; contrast spot-checks against §3.3; a keyboard-only pass for focus rings.
