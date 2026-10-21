<script lang="ts">
  import rulesCatalog from '#lib/data/rules-catalog.json';
  import { Search, ChevronDown, ChevronRight, Copy, Check, ShieldAlert, Sparkles, Filter, Code, Terminal, CheckCircle2 } from 'lucide-svelte';

  type CategoryFilter = 'All' | 'Security' | 'Data Privacy' | 'EULA & Legal' | 'FinOps & Payments' | 'Active Pentest';

  let selectedCategory = $state<CategoryFilter>('All');
  let searchQuery = $state('');
  let selectedSeverity = $state<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');
  let expandedRuleId = $state<string | null>('SEC-01');
  let copiedId = $state<string | null>(null);

  const categories: { label: string; value: CategoryFilter; count: number }[] = [
    { label: 'All', value: 'All', count: rulesCatalog.length },
    { label: 'Security', value: 'Security', count: rulesCatalog.filter(r => r.category === 'Security').length },
    { label: 'Data Privacy', value: 'Data Privacy', count: rulesCatalog.filter(r => r.category === 'Data Privacy').length },
    { label: 'EULA & Legal', value: 'EULA & Legal', count: rulesCatalog.filter(r => r.category === 'EULA & Legal').length },
    { label: 'FinOps & Payments', value: 'FinOps & Payments', count: rulesCatalog.filter(r => r.category === 'FinOps & Payments').length },
    { label: 'Active Pentest', value: 'Active Pentest', count: rulesCatalog.filter(r => r.category === 'Active Pentest').length }
  ];

  const filteredRules = $derived(
    rulesCatalog.filter(rule => {
      const matchesCategory = selectedCategory === 'All' || rule.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'ALL' || rule.severity === selectedSeverity;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery = !q ||
        rule.id.toLowerCase().includes(q) ||
        rule.title.toLowerCase().includes(q) ||
        rule.detectionLogic.toLowerCase().includes(q) ||
        rule.remediation.toLowerCase().includes(q) ||
        rule.targetFiles.toLowerCase().includes(q);
      return matchesCategory && matchesSeverity && matchesQuery;
    })
  );

  function toggleRule(id: string) {
    expandedRuleId = expandedRuleId === id ? null : id;
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 2000);
    } catch {
      // fallback
    }
  }
</script>

<div class="space-y-6" id="rules-43">
  <!-- Section Title -->
  <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
    <div>
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
        <ShieldAlert class="w-3.5 h-3.5" />
        <span>CANONICAL COMPLIANCE REGISTRY</span>
      </div>
      <h2 class="text-3xl font-extrabold tracking-tight text-white">
        Interactive 43-Rule & Probe Catalog
      </h2>
      <p class="text-slate-400 text-sm mt-1 max-w-2xl">
        Every rule is deterministic, runs in under 1.1s with zero cloud telemetry, and maps directly to an automated 1-click Cursor/Claude Code remediation patch.
      </p>
    </div>

    <!-- Severity Legend Pills -->
    <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
      <button
        onclick={() => (selectedSeverity = 'ALL')}
        class="px-2.5 py-1 rounded border transition-colors {selectedSeverity === 'ALL' ? 'bg-[#181b26] text-white border-slate-600' : 'bg-[#11131c] text-slate-400 border-[#222634] hover:text-slate-200'}"
      >
        All Severities
      </button>
      <button
        onclick={() => (selectedSeverity = 'CRITICAL')}
        class="px-2.5 py-1 rounded border transition-colors {selectedSeverity === 'CRITICAL' ? 'bg-red-500/20 text-red-300 border-red-500/50' : 'bg-[#11131c] text-red-400/80 border-[#222634] hover:border-red-500/30'}"
      >
        CRITICAL (-25 pts)
      </button>
      <button
        onclick={() => (selectedSeverity = 'HIGH')}
        class="px-2.5 py-1 rounded border transition-colors {selectedSeverity === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-[#11131c] text-amber-400/80 border-[#222634] hover:border-amber-500/30'}"
      >
        HIGH (-10 pts)
      </button>
      <button
        onclick={() => (selectedSeverity = 'MEDIUM')}
        class="px-2.5 py-1 rounded border transition-colors {selectedSeverity === 'MEDIUM' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' : 'bg-[#11131c] text-blue-400/80 border-[#222634] hover:border-blue-500/30'}"
      >
        MEDIUM (-4 pts)
      </button>
    </div>
  </div>

  <!-- Search & Category Filters Bar -->
  <div class="rounded-xl border border-[#222634] bg-[#11131c] p-3 sm:p-4 space-y-3">
    <!-- Search Bar -->
    <div class="relative">
      <Search class="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Filter by keyword (e.g., Supabase, Stripe, GDPR, AGPL, useEffect, IDOR, SSRF)..."
        class="w-full rounded-lg border border-[#222634] bg-[#090a0f] pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
      />
      {#if searchQuery}
        <button
          onclick={() => (searchQuery = '')}
          class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
        >
          Clear
        </button>
      {/if}
    </div>

    <!-- Category Filter Pills -->
    <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
      {#each categories as cat}
        <button
          onclick={() => (selectedCategory = cat.value)}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all whitespace-nowrap {selectedCategory === cat.value
            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
            : 'bg-[#181b26] text-slate-400 border border-[#222634] hover:text-slate-200 hover:bg-[#1f2331]'}"
        >
          <span>{cat.label}</span>
          <span class="px-1.5 py-0.2 rounded text-[10px] {selectedCategory === cat.value ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#090a0f] text-slate-500'}">
            {cat.count}
          </span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Rules Table / Expandable Rows -->
  <div class="rounded-xl border border-[#222634] bg-[#090a0f] overflow-hidden shadow-2xl divide-y divide-[#222634]">
    <!-- Table Header (desktop) -->
    <div class="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-[#11131c] text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400 border-b border-[#222634]">
      <div class="col-span-2">Rule ID &amp; Pillar</div>
      <div class="col-span-6">Title &amp; Target Vector</div>
      <div class="col-span-2">Severity &amp; Gate</div>
      <div class="col-span-2 text-right">Penalty</div>
    </div>

    <!-- Table Rows -->
    {#if filteredRules.length === 0}
      <div class="p-8 text-center text-slate-500 font-mono text-xs">
        No checks found matching "{searchQuery}" in category "{selectedCategory}".
      </div>
    {:else}
      {#each filteredRules as rule}
        {@const isExpanded = expandedRuleId === rule.id}
        <div class="transition-colors hover:bg-[#11131c]/50">
          <!-- Row Summary Header Button -->
          <button
            onclick={() => toggleRule(rule.id)}
            class="w-full text-left p-4 flex flex-col md:grid md:grid-cols-12 gap-2 md:gap-4 items-start md:items-center cursor-pointer select-none"
            aria-expanded={isExpanded}
          >
            <!-- Col 1: ID & Expand Icon -->
            <div class="md:col-span-2 flex items-center gap-2">
              <span class="text-slate-500">
                {#if isExpanded}
                  <ChevronDown class="w-4 h-4 text-emerald-400" />
                {:else}
                  <ChevronRight class="w-4 h-4 text-slate-500" />
                {/if}
              </span>
              <span class="font-mono font-bold text-xs px-2 py-0.5 rounded bg-[#181b26] border border-[#222634] text-slate-200">
                {rule.id}
              </span>
              <span class="text-[10px] text-slate-500 font-mono hidden lg:inline">
                {rule.category.split(' ')[0]}
              </span>
            </div>

            <!-- Col 2: Title & Target files -->
            <div class="md:col-span-6 space-y-0.5">
              <div class="text-xs sm:text-sm font-semibold text-white">
                {rule.title}
              </div>
              <div class="text-[11px] font-mono text-slate-500 truncate max-w-xl">
                {rule.targetFiles}
              </div>
            </div>

            <!-- Col 3: Severity Badge -->
            <div class="md:col-span-2 flex items-center gap-2">
              {#if rule.severity === 'CRITICAL'}
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                  CRITICAL
                </span>
                {#if rule.blocking}
                  <span class="text-[10px] font-mono text-red-400/80">Blocks CI</span>
                {/if}
              {:else if rule.severity === 'HIGH'}
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  HIGH
                </span>
              {:else}
                <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  MEDIUM
                </span>
              {/if}
            </div>

            <!-- Col 4: Penalty -->
            <div class="md:col-span-2 md:text-right font-mono text-xs text-slate-400">
              <span class={rule.severity === 'CRITICAL' ? 'text-red-400 font-bold' : rule.severity === 'HIGH' ? 'text-amber-400' : 'text-blue-400'}>
                {rule.penalty}
              </span>
            </div>
          </button>

          <!-- Expanded Detail Pane -->
          {#if isExpanded}
            <div class="px-4 pb-6 pt-2 bg-[#0d0f17] border-t border-[#222634]/60 space-y-4">
              <!-- Detection & Remediation Explanations -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-3.5 rounded-lg border border-[#222634] bg-[#11131c] space-y-1.5">
                  <span class="text-[11px] font-mono uppercase font-bold text-slate-400 flex items-center gap-1.5">
                    <Terminal class="w-3.5 h-3.5 text-slate-400" />
                    Exact AST Detection Logic
                  </span>
                  <p class="text-xs text-slate-300 leading-relaxed">
                    {rule.detectionLogic}
                  </p>
                </div>

                <div class="p-3.5 rounded-lg border border-[#222634] bg-[#11131c] space-y-1.5">
                  <span class="text-[11px] font-mono uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
                    Agent Remediation Specification
                  </span>
                  <p class="text-xs text-slate-300 leading-relaxed">
                    {rule.remediation}
                  </p>
                </div>
              </div>

              <!-- Side-by-Side Code Diffs: Vulnerable vs Remediated -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Vulnerable Code -->
                <div class="rounded-xl border border-red-500/30 bg-[#090a0f] overflow-hidden">
                  <div class="flex items-center justify-between bg-red-950/30 px-3 py-2 border-b border-red-500/20 text-xs font-mono">
                    <span class="text-red-400 font-bold flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-red-500"></span>
                      Vulnerable AI-Generated Code
                    </span>
                    <button
                      onclick={() => copyToClipboard(rule.vulnerableCode, `vuln-${rule.id}`)}
                      class="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                      aria-label="Copy vulnerable code"
                    >
                      {#if copiedId === `vuln-${rule.id}`}
                        <Check class="w-3 h-3 text-emerald-400" />
                        <span class="text-emerald-400">Copied</span>
                      {:else}
                        <Copy class="w-3 h-3" />
                        <span>Copy</span>
                      {/if}
                    </button>
                  </div>
                  <pre class="p-3 font-mono text-[11px] text-red-200/90 overflow-x-auto leading-relaxed"><code>{rule.vulnerableCode}</code></pre>
                </div>

                <!-- Fixed Code -->
                <div class="rounded-xl border border-emerald-500/30 bg-[#090a0f] overflow-hidden">
                  <div class="flex items-center justify-between bg-emerald-950/30 px-3 py-2 border-b border-emerald-500/20 text-xs font-mono">
                    <span class="text-emerald-400 font-bold flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Preflight Auto-Remediated Patch
                    </span>
                    <button
                      onclick={() => copyToClipboard(rule.fixedCode, `fix-${rule.id}`)}
                      class="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
                      aria-label="Copy fixed code"
                    >
                      {#if copiedId === `fix-${rule.id}`}
                        <Check class="w-3 h-3 text-emerald-400" />
                        <span class="text-emerald-400">Copied</span>
                      {:else}
                        <Copy class="w-3 h-3" />
                        <span>Copy</span>
                      {/if}
                    </button>
                  </div>
                  <pre class="p-3 font-mono text-[11px] text-emerald-200/90 overflow-x-auto leading-relaxed"><code>{rule.fixedCode}</code></pre>
                </div>
              </div>

              <!-- MCP Cursor/Claude Code Prompt Box -->
              <div class="rounded-xl border border-indigo-500/30 bg-[#11131c] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div class="flex items-start gap-2.5">
                  <Sparkles class="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <span class="text-[10px] font-mono uppercase font-bold text-indigo-400 block">MCP Auto-Fix Prompt Sent to Cursor / Claude Code</span>
                    <p class="text-xs font-mono text-slate-300 mt-0.5">"{rule.mcpPrompt}"</p>
                  </div>
                </div>

                <button
                  onclick={() => copyToClipboard(rule.mcpPrompt, `mcp-${rule.id}`)}
                  class="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 px-3 py-1.5 text-xs font-mono font-medium text-indigo-200 transition-colors"
                >
                  {#if copiedId === `mcp-${rule.id}`}
                    <Check class="w-3.5 h-3.5 text-emerald-400" />
                    <span class="text-emerald-400">Copied Prompt</span>
                  {:else}
                    <Copy class="w-3.5 h-3.5" />
                    <span>Copy Prompt</span>
                  {/if}
                </button>
              </div>

            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="text-center pt-2">
    <a
      href="/rules"
      class="inline-flex items-center gap-2 text-xs font-mono font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-4"
    >
      <span>Open Full 43-Rule Reference Registry Page</span>
      <ChevronRight class="w-3.5 h-3.5" />
    </a>
  </div>
</div>
