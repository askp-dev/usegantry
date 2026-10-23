<script lang="ts">
  import { resolve } from "$app/paths";
  import CodeBlock from "#lib/components/CodeBlock.svelte";
  import { META, REPO_URL } from "#lib/site.ts";

  const toc = [
    ["install", "Install"],
    ["commands", "Commands"],
    ["config", "Configuration"],
    ["ignore", "Suppressing a finding"],
    ["profiles", "Compliance profiles"],
    ["ci", "GitHub Actions"],
    ["agents", "Agents and MCP"],
    ["editors", "Editors"],
    ["certs", "Certificates and badges"],
    ["json", "JSON output"],
    ["privacy", "What leaves your machine"],
  ];
  const commands: Array<[string, string]> = [
    ["gantry check <path|github-url> [--json|--md]", "Plain-English report: score, status, the top 5 fixes with prompts for your agent. Exit 1 on blockers."],
    ["gantry roast <path|github-url> [--json] [--out card.svg]", "Shareable survival card. No paths, routes or secrets on it."],
    ["gantry scan [path] [--json|--sarif|--compact] [--changed-only] [--strict] [--offline] [--profile …]", "Full audit with evidence. --changed-only scans uncommitted files only. Exit 1 on blockers."],
    ["gantry legal [path] [--sync]", "Compiles privacy policy, EULA and terms from your stack, plus SECURITY.md, security.txt, robots.txt and ai.txt. Shows a diff; --sync writes."],
    ["gantry clear [path] [--allow-blocked]", "Launch Clearance Certificate (HTML + PDF) and vendor pack (SBOM, data-flow diagram). Refuses while blocked unless you pass --allow-blocked."],
    ["gantry badge [path] [--cert <url>]", "Writes .gantry/badge.svg and prints a README snippet."],
    ["gantry attack --target <url> [path]", "Six non-destructive live probes against routes the scan found. Loopback only unless --allow-remote."],
    ["gantry ui [path] [--port 4400]", "Mission Control in your browser on 127.0.0.1."],
    ["gantry init [path] [--agent claude,cursor,windsurf,antigravity,codex|all] [--ci] [--pre-commit] [--no-hooks]", "MCP config, agent rules, gantry.config.json, stop hooks and a baseline. Without --agent it wires the agents whose folders already exist (else Claude Code + Cursor). Safe to re-run."],
    ["gantry hook <stop|pre-commit> [path] --agent <name>", "Hook entry point used by init."],
    ["gantry mcp", "Stdio MCP server (also: bunx @usegantry/mcp)."],
  ];
  const config = `{
  "companyName": "Acme, Inc.",
  "productName": "Acme",
  "contactEmail": "privacy@acme.com",
  "securityContact": "security@acme.com",
  "siteUrl": "https://acme.com",
  "jurisdiction": "US-DE",
  "legalDir": "legal",
  "strict": false,
  "profiles": [],
  "ignoreRules": [],
  "ignorePaths": ["scripts/seed/**"],
  "clauses": { "aiOutputDisclaimer": true, "noTrainingApi": true, "pciBillingDelegation": true, "gdprErasure": true }
}`;
  const ci = `jobs:
  gantry:
    permissions: { contents: read, id-token: write, security-events: write }
    uses: askp-dev/usegantry/.github/workflows/scan.yml@v1
    with:
      strict: true        # fail the job on NO-GO
      profile: ""         # e.g. hipaa,eu-ai-act
      path: "."`;
  const action = `steps:
  - uses: actions/checkout@v4
  - uses: askp-dev/usegantry@v1
    with: { strict: false }`;
</script>

<svelte:head>
  <title>Docs · Gantry</title>
  <meta name="description" content="Install Gantry, run it in CI and wire it into Claude Code or Cursor." />
  <meta property="og:title" content="Docs · Gantry" />
  <meta property="og:description" content="Install Gantry, run it in CI and wire it into Claude Code or Cursor." />
</svelte:head>

<div class="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_1fr]">
  <nav class="lg:sticky lg:top-24 lg:self-start" aria-label="On this page">
    <p class="label mb-3 text-[11px] text-ink-3">Contents</p>
    <ol class="flex flex-col border-l border-rule">
      {#each toc as [id, label], i (id)}
        <li><a href="#{id}" class="-ml-px flex gap-2 border-l border-transparent py-1 pl-3 text-[13.5px] text-ink-2 hover:border-ink hover:text-ink"><span class="font-mono text-[11px] text-ink-3 tabular">{String(i + 1).padStart(2, "0")}</span>{label}</a></li>
      {/each}
    </ol>
  </nav>

  <article class="flex max-w-[78ch] flex-col gap-12 [&_p]:text-[15px] [&_p]:text-ink-2">
    <header class="flex flex-col gap-3">
      <p class="label text-[11px] text-ink-2">Docs · v{META.version}</p>
      <h1 class="display text-[38px] sm:text-[48px]">Using Gantry</h1>
      <p>Gantry needs <a class="text-signal-ink underline" href="https://bun.sh">Bun</a> 1.2 or later. It runs entirely on your machine.</p>
    </header>

    <section id="install" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Install</h2>
      <CodeBlock code="bunx @usegantry/cli check ." label="no install" />
      <CodeBlock code="curl -fsSL https://usegantry.app/install.sh | sh" label="standalone binary (macOS, Linux)" />
      <p>The installer verifies the binary's SHA-256 against the release before installing it. The standalone binary skips the Go and Rust rules; <span class="font-mono text-[13px]">bunx</span> includes them. On Windows, use <span class="font-mono text-[13px]">bunx</span> or WSL.</p>
    </section>

    <section id="commands" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Commands</h2>
      <div class="border-y-2 border-ink">
        {#each commands as [c, d] (c)}
          <div class="grid gap-1 border-b border-rule py-3 last:border-0 md:grid-cols-[minmax(0,1.1fr)_1fr] md:gap-6">
            <code class="font-mono text-[12.5px] break-words">{c}</code>
            <p class="!text-[14px]">{d}</p>
          </div>
        {/each}
      </div>
      <p>Exit codes: <span class="font-mono text-[13px]">0</span> ok · <span class="font-mono text-[13px]">1</span> launch blockers found · <span class="font-mono text-[13px]">2</span> usage or runtime error.</p>
    </section>

    <section id="config" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Configuration</h2>
      <p>Put this in <span class="font-mono text-[13px]">gantry.config.json</span> (or a <span class="font-mono text-[13px]">"gantry"</span> key in package.json). Every field is optional. Company and contact details fill the legal templates and security.txt.</p>
      <CodeBlock code={config} label="gantry.config.json" />
    </section>

    <section id="ignore" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Suppressing a finding</h2>
      <p>Add a comment on the line or the line above, with a reason. Suppressions are counted on every certificate, so they're never silent.</p>
      <CodeBlock code={"// gantry-ignore SEC-03: admin-only route, checked by middleware.ts"} label="any comment syntax" />
    </section>

    <section id="profiles" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Compliance profiles</h2>
      <p>{META.profileRuleCount} extra rules run only when you ask: <span class="font-mono text-[13px]">hipaa</span>, <span class="font-mono text-[13px]">fintech-pci</span>, <span class="font-mono text-[13px]">legal-privilege</span>, <span class="font-mono text-[13px]">eu-ai-act</span> and <span class="font-mono text-[13px]">airgap</span>. Profiles also make some existing rules stricter.</p>
      <CodeBlock code="gantry scan . --profile hipaa,eu-ai-act" label="terminal" />
    </section>

    <section id="ci" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">GitHub Actions</h2>
      <p>The reusable workflow is the only way to get a <strong class="text-ink">Verified</strong> certificate. It scans, uploads findings to code scanning, and attaches the report, badge and certificate as a build artifact. It never commits to your repo.</p>
      <CodeBlock code={ci} label=".github/workflows/gantry.yml" />
      <p>The plain action does the same without central signing, so its certificates are self-signed:</p>
      <CodeBlock code={action} label="steps" />
    </section>

    <section id="agents" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Agents and MCP</h2>
      <p><span class="font-mono text-[13px]">gantry init</span> writes the MCP config, agent rules and a stop hook. The MCP server exposes three tools: <span class="font-mono text-[13px]">run_readiness_audit</span>, <span class="font-mono text-[13px]">sync_stack_legal_docs</span> and <span class="font-mono text-[13px]">run_active_pentest</span>.</p>
      <CodeBlock code={'{ "mcpServers": { "gantry": { "command": "bunx", "args": ["@usegantry/mcp"] } } }'} label=".mcp.json" />
      <p>The stop hook blocks your agent from finishing only on blockers it introduced. Existing ones are baselined in <span class="font-mono text-[13px]">.gantry/baseline.json</span>; delete that file to re-baseline.</p>
      <p>Per agent, <span class="font-mono text-[13px]">init --agent</span> writes:</p>
      <ul class="flex list-disc flex-col gap-1 pl-5">
        <li><strong class="text-ink">Claude Code:</strong> CLAUDE.md, .mcp.json, a Stop hook in .claude/settings.json.</li>
        <li><strong class="text-ink">Cursor:</strong> .cursor/rules, .cursor/mcp.json, .cursor/hooks.json.</li>
        <li><strong class="text-ink">Codex:</strong> AGENTS.md, <span class="font-mono text-[13px]">[mcp_servers.gantry]</span> in .codex/config.toml, a Stop hook in .codex/hooks.json. Codex loads project config only after you trust the project.</li>
        <li><strong class="text-ink">Antigravity:</strong> .agents/rules, .agents/mcp_config.json, .agents/hooks.json.</li>
        <li><strong class="text-ink">Windsurf:</strong> .windsurf/rules (.devin/ if you have it) and hooks. Its stop hook can only report, not block. Its MCP config is user-level, so init prints the snippet instead of writing to your home folder.</li>
      </ul>
    </section>

    <section id="editors" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Editors</h2>
      <p>The extension puts findings in Problems and adds a <strong class="text-ink">Fix with AI Agent</strong> CodeLens that copies the fix prompt and opens the editor's agent. Verified so far:</p>
      <ul class="flex list-disc flex-col gap-1 pl-5">
        <li><strong class="text-ink">VS Code:</strong> Extensions → … → Install from VSIX (Marketplace listing pending).</li>
        <li><strong class="text-ink">Cursor:</strong> Install from VSIX the same way. Fix with AI Agent opens Composer.</li>
        <li><strong class="text-ink">Windsurf (Devin Desktop):</strong> Install from VSIX the same way. Fix with AI Agent sends the prompt to Cascade.</li>
        <li><strong class="text-ink">Antigravity IDE:</strong> Install from VSIX the same way (Open VSX listing pending). Fix with AI Agent sends the prompt to the agent panel.</li>
      </ul>
      <p>You need the <span class="font-mono text-[13px]">gantry</span> CLI on your PATH, or set <span class="font-mono text-[13px]">gantry.command</span> in your user settings.</p>
    </section>

    <section id="certs" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">Certificates and badges</h2>
      <p>A certificate link carries the result and an Ed25519 signature. <a class="text-signal-ink underline" href={resolve("/verify")}>The verify page</a> checks it in the browser against Gantry's public key. Only certificates from the official workflow show as Verified; ones made locally are labelled self-signed.</p>
      <p><span class="font-mono text-[13px]">gantry badge</span> writes <span class="font-mono text-[13px]">.gantry/badge.svg</span> and a snippet linking to your certificate. The badge says verified only when that certificate is.</p>
    </section>

    <section id="json" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">JSON output</h2>
      <p><span class="font-mono text-[13px]">check --json</span> and <span class="font-mono text-[13px]">roast --json</span> follow versioned schemas (<span class="font-mono text-[13px]">schemaVersion: 1</span>). See <a class="text-signal-ink underline" href="{REPO_URL}/blob/main/docs/check-json.md">docs/check-json.md</a> and the schemas in <span class="font-mono text-[13px]">packages/core/schema/</span>.</p>
    </section>

    <section id="privacy" class="flex scroll-mt-24 flex-col gap-4">
      <h2 class="display text-[26px]">What leaves your machine</h2>
      <p>Scans are local. <span class="font-mono text-[13px]">check</span> and <span class="font-mono text-[13px]">roast</span> on a URL download a snapshot from GitHub; your token goes only to api.github.com. The legal rule that checks for hallucinated packages queries the npm and PyPI registries unless you pass <span class="font-mono text-[13px]">--offline</span>. The dependency rules (DEP-01, DEP-02) send package names and exact versions, never code, to OSV.dev, the CISA KEV feed, deps.dev and PyPI, and cache the answers for 24 hours in <span class="font-mono text-[13px]">.gantry/advisories/</span>. Local, git and private-registry packages, scoped names Gantry can't confirm as public, anything matching <span class="font-mono text-[13px]">privatePackages</span> and <span class="font-mono text-[13px]">GOPRIVATE</span> modules are never sent. <span class="font-mono text-[13px]">check</span> on a URL stays offline unless you add <span class="font-mono text-[13px]">--online</span>. Only the official workflow sends anything to Gantry: the result summary to sign, never your code.</p>
    </section>
  </article>
</div>
