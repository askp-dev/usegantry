<script lang="ts">
  import { resolve } from "$app/paths";
  import Board from "#lib/components/Board.svelte";
  import CallBlock from "#lib/components/CallBlock.svelte";
  import CheckReport from "#lib/components/CheckReport.svelte";
  import CodeBlock from "#lib/components/CodeBlock.svelte";
  import FlowSchematic from "#lib/components/FlowSchematic.svelte";
  import InstallSwitcher from "#lib/components/InstallSwitcher.svelte";
  import RoastCard from "#lib/components/RoastCard.svelte";
  import RuleExplorer from "#lib/components/RuleExplorer.svelte";
  import Tag from "#lib/components/Tag.svelte";
  import TitleBlock from "#lib/components/TitleBlock.svelte";
  import rules from "#lib/data/rules.json";
  import sample from "#lib/data/sample.json";
  import { CONTACT, META, PILLARS, plural, STATION, statusCall } from "#lib/site.ts";

  let side = $state<"before" | "after">("before");
  const s = $derived(sample[side]);
  const SHOWN = 8;

  const stations = PILLARS.map((k) => ({
    key: k,
    name: STATION[k],
    count: META.pillarCounts[k] ?? 0,
    asks: {
      SECURITY: "Can a stranger read, change or delete someone else's data, or spend your money?",
      PRIVACY: "Does personal data stay where your policy says it does?",
      LEGAL: "Do your terms, privacy policy and licences match what the code actually does?",
      FINOPS_OPS: "Will this run up a surprise bill or fall over on launch day?",
    }[k],
    examples: rules.filter((r) => r.pillar === k && !r.profiles.length).slice(0, 4).map((r) => r.title),
  }));

  const mcp = `{
  "mcpServers": {
    "gantry": { "command": "bunx", "args": ["@usegantry/mcp"] }
  }
}`;
  const workflow = `# .github/workflows/gantry.yml
name: gantry
on: [push, pull_request]
jobs:
  gantry:
    permissions: { contents: read, id-token: write, security-events: write }
    uses: askp-dev/usegantry/.github/workflows/scan.yml@v1
    with: { strict: true }   # fail the build on NO-GO`;
  const hook = `bunx @usegantry/cli init .
# writes .mcp.json, agent rules, gantry.config.json
# and a stop hook: the agent can't finish while it
# has added a new launch blocker`;
</script>

<svelte:head>
  <title>Gantry · Launch checks for AI-built apps</title>
  <meta name="description" content="Gantry runs {META.ruleCount} checks for the mistakes AI coding tools make: open databases, leaked keys, missing auth, runaway bills and stale legal pages. Free, MIT, runs locally." />
  <meta property="og:title" content="Gantry · Launch checks for AI-built apps" />
  <meta property="og:description" content="{META.ruleCount} checks, plain-English fixes, prompts for your AI agent. Runs locally in about 0.3 s." />
</svelte:head>

<!-- Data flow -->
<section class="mx-auto max-w-[1200px] px-4 pt-8 sm:px-6 lg:pt-10">
  <FlowSchematic />
</section>

<!-- Hero -->
<section class="mx-auto grid max-w-[1200px] gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-16">
  <div class="flex flex-col gap-7">
    <p class="label text-[11px] text-ink-2">Pre-launch checks for AI-built apps</p>
    <h1 class="display text-[44px] sm:text-[60px]">Clear your app for launch.</h1>
    <p class="max-w-[54ch] text-[17px] text-ink-2">
      Gantry runs {META.ruleCount} checks for the mistakes AI coding tools make — open databases, leaked keys, routes without a login check, runaway AI bills,
      privacy policies that don't match the code — and tells you in plain English what to fix first, with a prompt your agent can act on.
    </p>
    <InstallSwitcher />
    <dl class="grid grid-cols-3 border-t border-ink pt-4">
      <div><dt class="label text-[10px] text-ink-3">Checks</dt><dd class="font-mono text-[22px] tabular">{META.ruleCount}</dd></div>
      <div><dt class="label text-[10px] text-ink-3">Cold scan, 500 files</dt><dd class="font-mono text-[22px] tabular">0.3 s</dd></div>
      <div><dt class="label text-[10px] text-ink-3">Code uploaded</dt><dd class="font-mono text-[22px] tabular">0 B</dd></div>
    </dl>
    <p class="-mt-2 text-[12px] text-ink-3">0 B code uploaded · package names only for advisory lookups (<span class="font-mono">--offline</span> to disable)</p>
  </div>

  <div class="flex flex-col gap-4 self-start lg:mt-6">
    <div class="flex items-center justify-between gap-3">
      <span class="label text-[11px] text-ink-2">Go/no-go poll · real scan</span>
      <div class="flex border border-ink" role="group" aria-label="Sample repo">
        <button class="label px-3 py-1.5 text-[10px] {side === 'before' ? 'bg-ink text-paper' : 'text-ink-2'}" aria-pressed={side === "before"} onclick={() => (side = "before")}>Before</button>
        <button class="label border-l border-ink px-3 py-1.5 text-[10px] {side === 'after' ? 'bg-ink text-paper' : 'text-ink-2'}" aria-pressed={side === "after"} onclick={() => (side = "after")}>After fixes</button>
      </div>
    </div>
    <div class="border-2 border-ink bg-paper">
      <div class="flex flex-wrap items-center gap-3 border-b border-ink px-4 py-3">
        <span class="font-mono text-[13px]">acme/{s.check.repo.name}</span>
        <span class="ml-auto"><CallBlock call={statusCall(s.check.status)} suffix={`${s.check.score}/100`} /></span>
      </div>
      <Board pillars={s.pillars} />
      <div class="flex flex-col gap-3 px-4 py-4">
        {#if s.blockers}
          <p class="text-[14px]">{plural(s.blockers, "tag")} still on the vehicle. Pull them before launch:</p>
          <div class="flex flex-wrap gap-1.5">
            {#each s.blockerIds.slice(0, SHOWN) as id (id)}<Tag {id} />{/each}
            {#if s.blockerIds.length > SHOWN}<span class="self-center font-mono text-[11px] text-ink-3">+{s.blockerIds.length - SHOWN} more rules</span>{/if}
          </div>
        {:else}
          <p class="text-[14px]">No tags left. Every station calls GO.</p>
        {/if}
      </div>
      <div class="flex justify-end border-t border-rule p-3">
        <TitleBlock
          rows={[
            ["Project", `acme/${s.check.repo.name}`],
            ["Findings", String(s.findings)],
            ["Files", `${s.stats.files} · ${s.stats.routes} routes · ${s.stats.tables} tables`],
            ["Ruleset", META.rulesetVersion],
          ]}
        />
      </div>
    </div>
    <p class="text-[12px] text-ink-3">
      Both repos are fixtures in the Gantry source: the same SaaS stack, written badly and then fixed. This board is the scanner's real output, generated when this page was built.
    </p>
  </div>
</section>

<!-- Stations -->
<section class="border-y-2 border-ink" aria-labelledby="stations">
  <div class="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
    <div class="mb-8 flex flex-col gap-2">
      <p class="label text-[11px] text-ink-2">The poll</p>
      <h2 id="stations" class="display text-[30px] sm:text-[38px]">Four stations. Each one calls GO, HOLD or NO-GO.</h2>
    </div>
    <div class="grid border-t border-ink md:grid-cols-4">
      {#each stations as st, i (st.key)}
        <div class="flex flex-col gap-3 border-b border-rule py-5 md:border-b-0 md:px-5 {i ? 'md:border-l' : 'md:pl-0'}">
          <div class="flex items-baseline justify-between">
            <span class="label text-[12px]">{st.name}</span>
            <span class="font-mono text-[12px] text-ink-3 tabular">{st.count} rules</span>
          </div>
          <p class="text-[15px]">{st.asks}</p>
          <ul class="flex flex-col gap-1.5 border-t border-rule pt-3">
            {#each st.examples as e (e)}<li class="text-[13px] text-ink-2">{e}</li>{/each}
          </ul>
        </div>
      {/each}
    </div>
    <div class="mt-8 grid gap-4 md:grid-cols-3">
      <div class="flex items-start gap-3"><CallBlock call="NO-GO" size="sm" /><p class="text-[13.5px] text-ink-2">A blocker. It gets a remove-before-flight tag and stops CI in strict mode.</p></div>
      <div class="flex items-start gap-3"><CallBlock call="HOLD" size="sm" /><p class="text-[13.5px] text-ink-2">Worth fixing soon. Nothing here stops you launching.</p></div>
      <div class="flex items-start gap-3"><CallBlock call="GO" size="sm" /><p class="text-[13.5px] text-ink-2">Every check at this station passed on this commit.</p></div>
    </div>
  </div>
</section>

<!-- What you get -->
<section class="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.35fr]" aria-labelledby="report">
  <div class="flex flex-col gap-4">
    <p class="label text-[11px] text-ink-2">The report</p>
    <h2 id="report" class="display text-[30px] sm:text-[38px]">The five fixes that matter, in words you'd use.</h2>
    <p class="text-[15px] text-ink-2">
      <span class="font-mono text-[13px]">gantry check</span> leads with consequences, not rule IDs. Each fix comes with the exact file and line and a prompt written for
      Cursor or Claude Code, so your agent can make the change without you translating a security report.
    </p>
    <p class="text-[15px] text-ink-2">
      Point it at a folder or a GitHub URL. Public repos need nothing; private ones use your existing <span class="font-mono text-[13px]">gh</span> login. Gantry downloads a
      snapshot, never runs your code and never installs your dependencies.
    </p>
  </div>
  <CheckReport check={sample.before.check} />
</section>

<!-- CVE triage -->
<section class="border-t-2 border-ink" aria-labelledby="cve-h">
  <div class="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
    <div class="flex flex-col gap-4">
      <p class="label text-[11px] text-ink-2">Dependencies</p>
      <h2 id="cve-h" class="display text-[30px] sm:text-[38px]">When the next CVE drops.</h2>
      <p class="text-[15px] text-ink-2">
        A list of every CVE in your lockfile tells you nothing about which one to fix tonight. Gantry checks your exact versions against OSV.dev and the CISA list of
        vulnerabilities attackers are already using, then asks one more question: does your code actually import it?
      </p>
      <p class="text-[15px] text-ink-2">
        Only package names and versions leave your machine, never code. Private packages are never sent, and <span class="font-mono text-[13px]">--offline</span> turns the
        lookup off.
      </p>
    </div>
    <ol class="border-t-2 border-ink">
      {#each [
        ["DEP-01", "Exploited and imported first", "Known-exploited and imported is NO-GO. High severity with a fix is HOLD. The rest is one line, not a wall."],
        ["DEP-02", "Too-new releases held back", "A version published in the last 7 days is where hijacked releases live. Gantry flags it and gives you your package manager's minimum-age setting."],
        ["DEP-03", "Lockfile hygiene", "No lockfile, \"latest\" ranges, unpinned git deps and unvetted install scripts, checked offline."],
        ["CI", "A daily re-check", "gantry init --ci adds a scheduled job that keeps one issue up to date. It never commits."],
        ["SBOM", "gantry sbom", "CycloneDX 1.6 with the known advisories attached, for your EU Cyber Resilience Act paperwork."],
        ["Already there", "LEG-01, MCP-02, hooks, SARIF", "Hallucinated and lookalike packages, unpinned MCP servers, the agent stop hook, code-scanning upload and security.txt."],
      ] as [tag, title, body]}
        <li class="grid grid-cols-[96px_1fr] gap-4 border-b border-rule py-4">
          <span class="font-mono text-[12px] text-ink-2">{tag}</span>
          <div><p class="text-[15px] font-semibold">{title}</p><p class="text-[14px] text-ink-2">{body}</p></div>
        </li>
      {/each}
    </ol>
  </div>
</section>

<!-- Rules -->
<section id="rules" class="border-t-2 border-ink" aria-labelledby="rules-h">
  <div class="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
    <div class="mb-8 flex flex-col gap-2">
      <p class="label text-[11px] text-ink-2">Every check</p>
      <h2 id="rules-h" class="display text-[30px] sm:text-[38px]">{META.ruleCount} rules, each with a real finding.</h2>
      <p class="max-w-[70ch] text-[15px] text-ink-2">
        Open any rule to see what it caught in Gantry's own test fixtures and the prompt it hands your agent. {META.profileRuleCount} rules are compliance packs
        (HIPAA, PCI, legal privilege, EU AI Act, air-gapped builds) that run only when you ask for them.
      </p>
    </div>
    <RuleExplorer />
  </div>
</section>

<!-- Setup -->
<section id="setup" class="border-t-2 border-ink bg-paper-2" aria-labelledby="setup-h">
  <div class="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
    <div class="mb-8 flex flex-col gap-2">
      <p class="label text-[11px] text-ink-2">Wire it in</p>
      <h2 id="setup-h" class="display text-[30px] sm:text-[38px]">Checks where the code gets written.</h2>
    </div>
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="flex min-w-0 flex-col gap-3">
        <h3 class="label text-[12px]">1 · Your agent</h3>
        <p class="text-[14px] text-ink-2">Claude Code, Cursor and other MCP clients can run the audit, sync legal docs and fire probes themselves.</p>
        <CodeBlock code={mcp} label=".mcp.json" />
      </div>
      <div class="flex min-w-0 flex-col gap-3">
        <h3 class="label text-[12px]">2 · The stop hook</h3>
        <p class="text-[14px] text-ink-2">One command sets everything up. Existing issues are baselined, so the hook only blocks what the agent just introduced.</p>
        <CodeBlock code={hook} label="terminal" />
      </div>
      <div class="flex min-w-0 flex-col gap-3">
        <h3 class="label text-[12px]">3 · Every push</h3>
        <p class="text-[14px] text-ink-2">Findings land in GitHub code scanning; the badge and a signed certificate are a build artifact. Nothing is committed back.</p>
        <CodeBlock code={workflow} label="GitHub Actions" />
      </div>
    </div>
    <div class="flex flex-col gap-2 border-t-2 border-ink pt-4 sm:flex-row sm:items-baseline sm:gap-6">
      <h3 class="label shrink-0 text-[12px]">Editors</h3>
      <p class="text-[14px] text-ink-2">
        Findings inline, with a Fix with AI Agent lens, in <strong class="text-ink">VS Code</strong> and <strong class="text-ink">Antigravity</strong>.
        <a class="text-signal-ink underline" href={resolve("/docs") + "#editors"}>Install steps</a>
      </p>
    </div>
  </div>
</section>

<!-- Clearance -->
<section class="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2" aria-labelledby="clearance">
  <div class="flex flex-col gap-4">
    <p class="label text-[11px] text-ink-2">Launch clearance</p>
    <h2 id="clearance" class="display text-[30px] sm:text-[38px]">A certificate anyone can check.</h2>
    <p class="text-[15px] text-ink-2">
      When the official GitHub workflow scans a commit, Gantry's signer checks GitHub's own identity token for that run and signs the result. The certificate link carries the
      result and the signature, and <a class="text-signal-ink underline" href={resolve("/verify")}>the verify page</a> checks it in your browser. No account, no database.
    </p>
    <p class="text-[15px] text-ink-2">
      What it proves: the official scan ran on commit X of repo Y and got this result. What it doesn't prove: that the code is safe. Certificates made on a laptop are
      labelled self-signed and never show as Verified.
    </p>
  </div>
  <div class="drawing-grid flex flex-col gap-4 border-2 border-ink p-5">
    <div class="flex items-center justify-between">
      <span class="display text-[22px]" style="font-variation-settings:'wdth' 125">LAUNCH CLEARANCE</span>
      <CallBlock call="GO" suffix="CLEARED" />
    </div>
    <Board pillars={sample.after.pillars} compact />
    <div class="flex flex-wrap items-end justify-between gap-4">
      <p class="label text-[11px] text-go">✓ Verified · Gantry CI</p>
      <TitleBlock rows={[["Project", "acme/clean-saas"], ["Commit", "a8f3c21"], ["Ruleset", META.rulesetVersion], ["Signed", "Gantry CI · run 4242"]]} />
    </div>
  </div>
</section>

<!-- Roast -->
<section class="border-t-2 border-ink" aria-labelledby="roast-h">
  <div class="mx-auto grid max-w-[1200px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
    <div class="flex flex-col gap-4">
      <p class="label text-[11px] text-ink-2">Roast</p>
      <h2 id="roast-h" class="display text-[30px] sm:text-[38px]">Or just find out if it survives.</h2>
      <p class="text-[15px] text-ink-2">
        <span class="font-mono text-[13px]">gantry roast</span> makes a shareable card. It's built only from canned lines, so it never shows file names, routes or secrets: safe to
        post, even for someone else's public repo.
      </p>
      <a href={resolve("/roast")} class="label self-start bg-signal px-4 py-3 text-[11px] text-[var(--on-signal)] hover:bg-ink hover:text-paper">Roast a repo</a>
    </div>
    <RoastCard roast={sample.before.roast} />
  </div>
</section>

<!-- Licence -->
<section class="border-t-2 border-ink bg-paper-2" aria-labelledby="free">
  <div class="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-14 sm:px-6 md:flex-row md:items-end md:justify-between">
    <div class="flex max-w-[62ch] flex-col gap-3">
      <p class="label text-[11px] text-ink-2">Price</p>
      <h2 id="free" class="display text-[30px] sm:text-[38px]">Free. MIT. Runs on your machine.</h2>
      <p class="text-[15px] text-ink-2">
        The scanner, the agent integration, the legal compiler, the live probes and certificates are all open source. Hosted extras may come later; the scanner stays MIT.
      </p>
    </div>
    <a href="https://github.com/askp-dev/usegantry" class="label self-start border-2 border-ink px-4 py-3 text-[11px] hover:bg-ink hover:text-paper md:self-auto">Read the source</a>
  </div>
</section>

<!-- Contact -->
<section id="contact" class="border-t-2 border-ink" aria-labelledby="contact-h">
  <div class="mx-auto grid max-w-[1200px] gap-8 px-4 py-14 sm:px-6 md:grid-cols-[1fr_1fr] md:items-end">
    <div class="flex max-w-[56ch] flex-col gap-3">
      <p class="label text-[11px] text-ink-2">Contact</p>
      <h2 id="contact-h" class="display text-[30px] sm:text-[38px]">Talk to the person who built it.</h2>
      <p class="text-[15px] text-ink-2">A false positive, a rule you want, a stack Gantry doesn't read yet, or a launch it helped with. Email goes straight to me.</p>
    </div>
    <dl class="border-y-2 border-ink">
      <div class="flex items-baseline justify-between gap-4 border-b border-rule py-3">
        <dt class="label text-[11px] text-ink-3">Email</dt>
        <dd><a class="font-mono text-[14px] text-signal-ink underline" href="mailto:{CONTACT.email}">{CONTACT.email}</a></dd>
      </div>
      <div class="flex items-baseline justify-between gap-4 py-3">
        <dt class="label text-[11px] text-ink-3">Web</dt>
        <dd><a class="font-mono text-[14px] text-signal-ink underline" href={CONTACT.web}>{CONTACT.web.replace("https://", "")}</a></dd>
      </div>
    </dl>
  </div>
</section>
