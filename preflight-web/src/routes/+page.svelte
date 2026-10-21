<script lang="ts">
  import OsDownloadBar from '#lib/components/OsDownloadBar.svelte';
  import HeroTerminal from '#lib/components/HeroTerminal.svelte';
  import BentoArchitecture from '#lib/components/BentoArchitecture.svelte';
  import RuleExplorer from '#lib/components/RuleExplorer.svelte';
  import { Zap, Shield, Cpu, Terminal, GitBranch, Check, Copy, ArrowRight, CheckCircle2, X, Sparkles, Lock, Layers } from 'lucide-svelte';

  type McpTab = 'cursor' | 'github' | 'hook';
  let activeMcpTab = $state<McpTab>('cursor');
  let copiedMcp = $state<string | null>(null);

  const cursorSnippet = `{
  "mcpServers": {
    "preflight": {
      "command": "bunx",
      "args": ["preflight", "mcp"]
    }
  }
}`;

  const githubActionsSnippet = `name: Preflight Compliance Gate
on: [pull_request, push]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bunx preflight scan --strict --fail-on-blocker`;

  const gitHookSnippet = `# Install automatic pre-push compliance hook
bunx preflight hook install --pre-push`;

  async function copyMcpSnippet(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedMcp = id;
      setTimeout(() => {
        if (copiedMcp === id) copiedMcp = null;
      }, 2000);
    } catch {
      // fallback
    }
  }
</script>

<div class="space-y-24 sm:space-y-32 pb-24 overflow-x-hidden">
  <!-- SECTION 1: HERO (Split Layout) -->
  <section class="relative pt-8 sm:pt-14 px-4 sm:px-6 max-w-7xl mx-auto">
    <!-- Ambient Avionics Glows -->
    <div class="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[128px] pointer-events-none"></div>
    <div class="absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[128px] pointer-events-none"></div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
      <!-- Left Column: Copy & Command Switcher -->
      <div class="lg:col-span-6 space-y-6">
        <!-- Eyebrow Pill -->
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>43 DETERMINISTIC CHECKS • &lt;1.1s EXECUTION • ZERO CLOUD UPLOAD</span>
        </div>

        <!-- H1 Headline -->
        <h1 class="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight text-white leading-[1.12]">
          Ship Vibe-Coded Apps Without the <span class="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400">Breach or Lawsuit.</span>
        </h1>

        <!-- Subheadline -->
        <p class="text-slate-300 text-sm sm:text-base leading-relaxed max-w-xl">
          The Pre-Flight Compliance, Security &amp; FinOps Engine for AI-Built Software. Catch missing Supabase RLS, hallucinated packages, AGPL license traps, infinite token loops, and stale EULA/Privacy Policies inside Cursor &amp; Claude Code before you launch.
        </p>

        <!-- OS-Aware Download & Command Switcher Bar -->
        <div id="download" class="pt-2">
          <OsDownloadBar />
        </div>

        <!-- Trust Badges -->
        <div class="pt-2 flex flex-wrap items-center gap-6 text-xs font-mono text-slate-400">
          <div class="flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 text-emerald-400" />
            <span>Local Stdio MCP Transport</span>
          </div>
          <div class="flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 text-emerald-400" />
            <span>&lt;150ms AST Indexing</span>
          </div>
          <div class="flex items-center gap-2">
            <CheckCircle2 class="w-4 h-4 text-emerald-400" />
            <span>Ed25519 Signed Certs</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Interactive Terminal Simulator -->
      <div class="lg:col-span-6">
        <HeroTerminal />
      </div>
    </div>
  </section>

  <!-- SECTION 2: METRICS TICKER -->
  <section class="border-y border-[#222634] bg-[#11131c]/50 py-8 px-4 sm:px-6">
    <div class="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
      <div class="space-y-1">
        <div class="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight">&lt;1.1s</div>
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400">Execution Speed</div>
        <div class="text-[11px] text-slate-500">Pure AST + parallel worker threads</div>
      </div>

      <div class="space-y-1">
        <div class="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">43</div>
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400">Deterministic Checks</div>
        <div class="text-[11px] text-slate-500">Security, Privacy, EULA, FinOps, Pentest</div>
      </div>

      <div class="space-y-1">
        <div class="text-3xl sm:text-4xl font-extrabold font-mono text-indigo-400 tracking-tight">0 B</div>
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400">Cloud Telemetry</div>
        <div class="text-[11px] text-slate-500">Your code never leaves your local machine</div>
      </div>

      <div class="space-y-1">
        <div class="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight">1-Click</div>
        <div class="text-xs font-mono uppercase tracking-wider text-slate-400">Agent Remediation</div>
        <div class="text-[11px] text-slate-500">Instant fixes inside Cursor &amp; Claude</div>
      </div>
    </div>
  </section>

  <!-- SECTION 3: BENTO ARCHITECTURE GRID -->
  <section id="how-it-works" class="px-4 sm:px-6 max-w-7xl mx-auto">
    <BentoArchitecture />
  </section>

  <!-- SECTION 4: 43-RULE EXPLORER -->
  <section class="px-4 sm:px-6 max-w-7xl mx-auto">
    <RuleExplorer />
  </section>

  <!-- SECTION 5: 1-CLICK MCP & IDE INTEGRATION GUIDE -->
  <section id="mcp-setup" class="px-4 sm:px-6 max-w-7xl mx-auto space-y-6">
    <div class="text-center max-w-3xl mx-auto space-y-2">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <Cpu class="w-3.5 h-3.5" />
        <span>15-SECOND SETUP</span>
      </div>
      <h2 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        Wire Preflight Into Your Daily Workflow
      </h2>
      <p class="text-slate-400 text-sm">
        Connect Preflight to Cursor, Claude Code, GitHub Actions, or local Git hooks with zero complex configuration.
      </p>
    </div>

    <div class="rounded-2xl border border-[#222634] bg-[#11131c] overflow-hidden shadow-2xl">
      <!-- Tabs Header -->
      <div class="flex items-center border-b border-[#222634] bg-[#090a0f]/80 px-4 pt-3 overflow-x-auto no-scrollbar">
        <button
          onclick={() => (activeMcpTab = 'cursor')}
          class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeMcpTab === 'cursor' ? 'border-indigo-500 text-indigo-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <Cpu class="w-3.5 h-3.5" />
          <span>Tab A: Cursor / Claude Code MCP</span>
        </button>

        <button
          onclick={() => (activeMcpTab = 'github')}
          class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeMcpTab === 'github' ? 'border-emerald-500 text-emerald-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <GitBranch class="w-3.5 h-3.5" />
          <span>Tab B: GitHub Actions CI Gate</span>
        </button>

        <button
          onclick={() => (activeMcpTab = 'hook')}
          class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeMcpTab === 'hook' ? 'border-blue-500 text-blue-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
        >
          <Terminal class="w-3.5 h-3.5" />
          <span>Tab C: Pre-Push Git Hook</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="p-6 space-y-4">
        {#if activeMcpTab === 'cursor'}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-white font-mono">.cursor/mcp.json</h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Exposes <code class="text-slate-300">run_readiness_audit</code>, <code class="text-slate-300">sync_stack_legal_docs</code>, and <code class="text-slate-300">run_active_pentest</code> directly to the agent.
              </p>
            </div>
            <button
              onclick={() => copyMcpSnippet(cursorSnippet, 'cursor')}
              class="flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded bg-[#181b26] hover:bg-[#222634] border border-[#222634] text-xs font-mono text-slate-200 transition-colors"
            >
              {#if copiedMcp === 'cursor'}
                <Check class="w-3.5 h-3.5 text-emerald-400" />
                <span class="text-emerald-400">Copied</span>
              {:else}
                <Copy class="w-3.5 h-3.5" />
                <span>Copy JSON</span>
              {/if}
            </button>
          </div>
          <pre class="p-4 rounded-xl bg-[#090a0f] border border-[#222634] font-mono text-xs text-indigo-300 overflow-x-auto leading-relaxed"><code>{cursorSnippet}</code></pre>

        {:else if activeMcpTab === 'github'}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-white font-mono">.github/workflows/preflight.yml</h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Enforce compliance gates in PRs. Blocks merge if any CRITICAL penalty or unmitigated vulnerability exists.
              </p>
            </div>
            <button
              onclick={() => copyMcpSnippet(githubActionsSnippet, 'github')}
              class="flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded bg-[#181b26] hover:bg-[#222634] border border-[#222634] text-xs font-mono text-slate-200 transition-colors"
            >
              {#if copiedMcp === 'github'}
                <Check class="w-3.5 h-3.5 text-emerald-400" />
                <span class="text-emerald-400">Copied</span>
              {:else}
                <Copy class="w-3.5 h-3.5" />
                <span>Copy YAML</span>
              {/if}
            </button>
          </div>
          <pre class="p-4 rounded-xl bg-[#090a0f] border border-[#222634] font-mono text-xs text-emerald-300 overflow-x-auto leading-relaxed"><code>{githubActionsSnippet}</code></pre>

        {:else if activeMcpTab === 'hook'}
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-bold text-white font-mono">Zero-Config Git Hook Installation</h3>
              <p class="text-xs text-slate-400 mt-0.5">
                Automatically rejects `git push` if an unscoped RLS migration or leaked private API key is detected in the working tree.
              </p>
            </div>
            <button
              onclick={() => copyMcpSnippet(gitHookSnippet, 'hook')}
              class="flex items-center gap-1.5 self-start sm:self-center px-3 py-1.5 rounded bg-[#181b26] hover:bg-[#222634] border border-[#222634] text-xs font-mono text-slate-200 transition-colors"
            >
              {#if copiedMcp === 'hook'}
                <Check class="w-3.5 h-3.5 text-emerald-400" />
                <span class="text-emerald-400">Copied</span>
              {:else}
                <Copy class="w-3.5 h-3.5" />
                <span>Copy Command</span>
              {/if}
            </button>
          </div>
          <pre class="p-4 rounded-xl bg-[#090a0f] border border-[#222634] font-mono text-xs text-blue-300 overflow-x-auto leading-relaxed"><code>{gitHookSnippet}</code></pre>
        {/if}
      </div>
    </div>
  </section>

  <!-- SECTION 6: PRICING & MONETIZATION TIERS -->
  <section id="pricing" class="px-4 sm:px-6 max-w-7xl mx-auto space-y-6">
    <div class="text-center max-w-3xl mx-auto space-y-2">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <Sparkles class="w-3.5 h-3.5" />
        <span>OPEN CORE &amp; COMMERCIAL TIERS</span>
      </div>
      <h2 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        Transparent Pricing for Builders &amp; Agencies
      </h2>
      <p class="text-slate-400 text-sm">
        Start free with our complete 37-rule static engine. Upgrade to Pro for active pentesting and legal sync, or Agency for client signed certificates.
      </p>
    </div>

    <!-- 3 High-Contrast Columns -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
      <!-- Tier 1: Community -->
      <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div class="space-y-4">
          <div class="space-y-1">
            <span class="text-[11px] font-mono uppercase font-bold text-slate-400">Tier 1</span>
            <h3 class="text-xl font-bold text-white">Community / Open Core</h3>
            <p class="text-xs text-slate-400">For indie hackers and developers auditing solo projects.</p>
          </div>

          <div class="font-mono">
            <span class="text-4xl font-extrabold text-white">$0</span>
            <span class="text-slate-500 text-xs"> / forever</span>
          </div>

          <ul class="space-y-2.5 text-xs text-slate-300 font-mono">
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Static 37-rule CLI scan (&lt;1.1s)</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>READINESS_CHECKLIST.md generator</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>.cursor/rules bootstrapper</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Local Stdio MCP server</span>
            </li>
            <li class="flex items-center gap-2 text-slate-600">
              <X class="w-4 h-4 text-slate-600 shrink-0" />
              <span>Active 6-probe pentest runner</span>
            </li>
            <li class="flex items-center gap-2 text-slate-600">
              <X class="w-4 h-4 text-slate-600 shrink-0" />
              <span>Signed Client Launch Certificates</span>
            </li>
          </ul>
        </div>

        <a
          href="#download"
          class="w-full text-center py-2.5 rounded-lg border border-[#222634] bg-[#181b26] hover:bg-[#222634] text-xs font-mono font-semibold text-white transition-colors"
        >
          Install Free CLI
        </a>
      </div>

      <!-- Tier 2: Pro Builder (Featured) -->
      <div class="rounded-2xl border-2 border-emerald-500 bg-[#11131c] p-6 sm:p-8 flex flex-col justify-between space-y-6 relative shadow-2xl shadow-emerald-500/10">
        <div class="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-500 text-black text-[10px] font-mono font-bold tracking-wider uppercase">
          Most Popular
        </div>

        <div class="space-y-4">
          <div class="space-y-1">
            <span class="text-[11px] font-mono uppercase font-bold text-emerald-400">Tier 2</span>
            <h3 class="text-xl font-bold text-white">Pro Builder</h3>
            <p class="text-xs text-slate-400">For startups and professionals shipping production apps.</p>
          </div>

          <div class="font-mono">
            <span class="text-4xl font-extrabold text-white">$39</span>
            <span class="text-slate-400 text-xs"> / month</span>
          </div>

          <ul class="space-y-2.5 text-xs text-slate-300 font-mono">
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Everything in Community, plus:</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>VS Code / Cursor Extension &amp; CodeLens</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>1-click Agent Fix Bridge in Cursor</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Stack-Synced Legal &amp; EULA Compiler</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Active 6-Probe Pentester (preflight attack)</span>
            </li>
            <li class="flex items-center gap-2 text-slate-600">
              <X class="w-4 h-4 text-slate-600 shrink-0" />
              <span>Signed Client Launch Certificates</span>
            </li>
          </ul>
        </div>

        <a
          href="#download"
          class="w-full text-center py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-500/20"
        >
          Start 14-Day Free Trial
        </a>
      </div>

      <!-- Tier 3: Agency & Team -->
      <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div class="space-y-4">
          <div class="space-y-1">
            <span class="text-[11px] font-mono uppercase font-bold text-indigo-400">Tier 3</span>
            <h3 class="text-xl font-bold text-white">Agency &amp; Team</h3>
            <p class="text-xs text-slate-400">For software agencies delivering validated code to clients.</p>
          </div>

          <div class="font-mono">
            <span class="text-4xl font-extrabold text-white">$299</span>
            <span class="text-slate-400 text-xs"> / month</span>
          </div>

          <ul class="space-y-2.5 text-xs text-slate-300 font-mono">
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Everything in Pro Builder, plus:</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Signed Client Launch Certificates (HTML/PDF)</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>B2B Vendor Deal-Closer Pack (SBOM + RoPA)</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Zero-Backend /verify Client Audit URLs</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Multi-repo CI/CD compliance gates</span>
            </li>
            <li class="flex items-center gap-2">
              <Check class="w-4 h-4 text-emerald-400 shrink-0" />
              <span>White-label agency attestation branding</span>
            </li>
          </ul>
        </div>

        <a
          href="/verify"
          class="w-full text-center py-2.5 rounded-lg border border-indigo-500/40 bg-indigo-600/20 hover:bg-indigo-600/30 text-xs font-mono font-semibold text-indigo-200 transition-colors"
        >
          View Client Certificate Demo
        </a>
      </div>
    </div>
  </section>

  <!-- SECTION 7: FINAL CALL TO ACTION -->
  <section class="px-4 sm:px-6 max-w-7xl mx-auto">
    <div class="rounded-3xl border border-[#222634] bg-gradient-to-b from-[#11131c] to-[#090a0f] p-8 sm:p-14 text-center space-y-6 relative overflow-hidden shadow-2xl">
      <div class="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>

      <div class="max-w-2xl mx-auto space-y-3">
        <h2 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Ready for Pre-Flight? Run Your First Audit in 3 Seconds.
        </h2>
        <p class="text-slate-400 text-sm">
          No signups, no credit cards, zero cloud telemetry. Drop preflight into your terminal or IDE and ensure your vibe-coded software is enterprise-ready.
        </p>
      </div>

      <div class="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
        <div class="rounded-lg border border-[#222634] bg-[#090a0f] px-4 py-3 font-mono text-xs sm:text-sm text-slate-200 flex items-center gap-3">
          <span class="text-emerald-400">$</span>
          <span>bunx preflight scan</span>
        </div>

        <a
          href="/rules"
          class="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 text-xs font-mono font-bold transition-all shadow-lg shadow-emerald-500/20"
        >
          <span>Explore All 43 Checks</span>
          <ArrowRight class="w-4 h-4" />
        </a>
      </div>
    </div>
  </section>
</div>
