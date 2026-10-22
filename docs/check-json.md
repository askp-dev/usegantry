# `gantry check --json` and `gantry roast --json`

Gantry owns these contracts. The site (`site/`, usegantry.app) renders them. The schemas are in
[`packages/core/schema/check.schema.json`](../packages/core/schema/check.schema.json) and
[`packages/core/schema/roast.schema.json`](../packages/core/schema/roast.schema.json), and a test validates
real output against both. `schemaVersion` is `1`. Additive changes keep `1`; anything else bumps it.

Both commands accept `https://github.com/<owner>/<repo>[/tree/<ref>]` or a local path. They run the static rules
offline: nothing is executed, installed or probed. `--online` additionally allows the name-only lookups
(DEP-01/DEP-02 advisories via OSV.dev, CISA KEV, deps.dev and PyPI; LEG-01 registry checks). Only package names and
versions are sent, never code, and private-looking names are withheld.

## `check`: for the repo owner

```jsonc
{
  "schemaVersion": 1,
  "mode": "check",
  "repo": { "owner": "acme", "name": "app", "ref": "main", "sha": "3f2c…" }, // owner "" and ref null for local paths
  "score": 42,                                  // 0–100
  "status": "LAUNCH_BLOCKED",                   // LAUNCH_READY | NEEDS_REVIEW | LAUNCH_BLOCKED
  "headline": "Not ready to launch yet: fix 3 issues marked \"Fix before launch\" first.",
  "summary": { "critical": 3, "high": 5, "medium": 2 },
  "topFixes": [                                 // ≤ 5, one per rule, "before-launch" first
    {
      "ruleId": "SEC-01",
      "severity": "CRITICAL",
      "category": "before-launch",              // before-launch | soon | nice-to-have
      "title": "Missing or Permissive Row-Level Security (RLS)",
      "plainWhy": "Anyone with your public anon key can read every row…",
      "file": "supabase/migrations/0001_init.sql",
      "line": 12,
      "agentPrompt": "In supabase/migrations/0001_init.sql:12, enable RLS…"   // paste into Cursor / Claude Code
    }
  ],
  "categories": [
    { "id": "before-launch", "label": "Fix before launch", "count": 3 },
    { "id": "soon", "label": "Fix soon", "count": 5 },
    { "id": "nice-to-have", "label": "Nice to have", "count": 2 }
  ],
  "notices": ["Static analysis only: no code was run and nothing was probed. A clean result isn't a security guarantee."],
  "advisoriesAsOf": "2026-10-22T06:17:03.000Z", // optional: when DEP-01's advisory data was fetched
  "generatedAt": "2026-10-21T12:00:00.000Z"
}
```

- No evidence snippets. `title`, `plainWhy` and `agentPrompt` pass through a secret scrubber, so nothing shaped like a live key survives.
- Group by `category` and show the `label` text exactly. Lead with the `headline`; don't put rule IDs in headlines.
- `--md` renders the same data as a PR-comment table.
- `advisoriesAsOf` is present only when DEP-01 actually ran: with `--online`, or on a local path that has a
  `.gantry/advisories/` cache. Without it, `notices` carries "Dependency advisories not checked: …". Show
  "advisories as of <date>" next to the score, and never present a missing date as "no known vulnerabilities".
  Certificates carry the same field (signed), and the verify page shows "Advisories: as of <date>" or "not checked".

## Daily re-check: `scan --only DEP-01,DEP-02`

`gantry init --ci` also writes `.github/workflows/gantry-advisories.yml`: a daily cron job (plus manual dispatch)
that runs `gantry scan . --only DEP-01,DEP-02 --json`, caches `.gantry/advisories/` between runs, and opens or
updates **one** issue labelled `gantry-advisories` (closing it once clean, unless the check was skipped). It needs
only `contents: read` + `issues: write` and never commits. The report JSON it reads is the regular `scan --json`
`AuditReport`; the fields it relies on are `findings[]`, `notices[]` (`kind: "info"` = a count, otherwise a skip)
and `advisoriesAsOf`.

## `roast`: public and shareable

```jsonc
{
  "schemaVersion": 1,
  "mode": "roast",
  "repo": { "owner": "acme", "name": "app" },
  "score": 42,
  "verdict": "Won't survive launch",            // Survives launch | Shaky | Won't survive launch
  "pillars": [
    { "pillar": "Security", "score": 0, "line": "Your database has an open-door policy." },
    { "pillar": "Privacy", "score": 71, "line": "Personal data is wandering further than it should." },
    { "pillar": "Legal", "score": 80, "line": "The legal paperwork hasn't caught up with the code." },
    { "pillar": "Cost", "score": 100, "line": "No runaway bills spotted." }
  ],
  "counts": { "critical": 3, "high": 5, "medium": 2 },
  "lines": ["…up to 3 canned lines per pillar…"],
  "cardSvg": "<svg …1200×630…>",
  "generatedAt": "2026-10-21T12:00:00.000Z"
}
```

**Safety rule (don't break it on the site either):** a roast never contains file paths, route URLs, line numbers,
table names, secrets, vendor keys or exploit steps. Every string is canned copy from
`packages/core/src/check/roast-lines.ts`, a number, or the repo's `owner/name`. The card is built from rule IDs only,
and a test fails if any finding's file, evidence or route reaches the SVG or the JSON. If the site adds copy, keep
it non-specific: punch at the code, never the person, and make no "hacked"/"breach" claims.

## Certificates and the badge

**Central public key** (raw Ed25519, base64url; the JWK `x`). The verify page trusts only this key:

```
cVt0WDM18pzsMSIqKTACaJrceJ_cX6DSVB5xZHbG7uY
```

```js
const key = await crypto.subtle.importKey(
  "jwk", { kty: "OKP", crv: "Ed25519", x: "cVt0WDM18pzsMSIqKTACaJrceJ_cX6DSVB5xZHbG7uY" },
  { name: "Ed25519" }, false, ["verify"]);
// fragment = "<base64url body>.<base64url signature>" from https://usegantry.app/verify#…
const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sigBytes, bodyBytes);
const verified = ok && JSON.parse(bodyText).issuer === "gantry-ci";
```


- `gantry clear` writes `LAUNCH_CERTIFICATE.{html,pdf}` and `.gantry/cert.url`
  (`https://usegantry.app/verify#<base64url canonical JSON>.<base64url Ed25519 signature>`).
- The payload's `issuer` is `"self-signed"` (a local key) or `"gantry-ci"` (central signer). For `gantry-ci`,
  `repository`, `commitSha`, `runId`, `workflowRef` and `signedAt` come from the verified GitHub OIDC token.
  `suppressed` counts findings hidden by `gantry-ignore` or `ignoreRules`; show it.
- The verify page should show **Verified** only when the signature checks against the central public key **and**
  `issuer === "gantry-ci"`. Label everything else "Self-signed".
