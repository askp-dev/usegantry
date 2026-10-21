<script lang="ts">
  import RuleExplorer from '#lib/components/RuleExplorer.svelte';
  import { Shield, BookOpen, Terminal, ArrowLeft, ArrowUpRight } from 'lucide-svelte';
</script>

<svelte:head>
  <title>43-Rule &amp; Probe Registry | Preflight AI Documentation</title>
  <meta name="description" content="Complete documentation of all 43 deterministic static checks and active AST exploit probes in Preflight AI." />
</svelte:head>

<div class="py-10 px-4 sm:px-6 max-w-7xl mx-auto space-y-10">
  <!-- Breadcrumb -->
  <div class="flex items-center justify-between">
    <a href="/" class="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-emerald-400 transition-colors">
      <ArrowLeft class="w-3.5 h-3.5" />
      <span>Back to Preflight Hub</span>
    </a>

    <div class="flex items-center gap-2 text-[11px] font-mono text-slate-400">
      <span>Specification: <code class="text-slate-300">RULES_SPEC.md</code></span>
    </div>
  </div>

  <!-- Header Banner -->
  <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-10 shadow-2xl relative overflow-hidden">
    <div class="max-w-3xl space-y-3">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <BookOpen class="w-3.5 h-3.5" />
        <span>CANONICAL COMPLIANCE REGISTRY</span>
      </div>
      <h1 class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
        Master Detection &amp; Remediation Registry
      </h1>
      <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
        Preflight enforces 43 deterministic static AST checks and 6 active exploit probes. Each rule has a strict scoring penalty, target file boundaries, and a turnkey Cursor / Claude Code MCP remediation recipe.
      </p>
    </div>

    <!-- Rule Distribution Summary -->
    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-6 border-t border-[#222634] mt-6 font-mono text-xs">
      <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
        <span class="text-slate-500 text-[10px] block">Security &amp; Isolation</span>
        <span class="text-emerald-400 font-bold text-base block mt-0.5">12 Rules</span>
        <span class="text-[10px] text-slate-400">SEC-01 to SEC-12</span>
      </div>

      <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
        <span class="text-slate-500 text-[10px] block">Data Privacy</span>
        <span class="text-indigo-400 font-bold text-base block mt-0.5">7 Rules</span>
        <span class="text-[10px] text-slate-400">PRIV-01 to PRIV-07</span>
      </div>

      <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
        <span class="text-slate-500 text-[10px] block">EULA &amp; Legal</span>
        <span class="text-amber-400 font-bold text-base block mt-0.5">6 Rules</span>
        <span class="text-[10px] text-slate-400">LEG-01 to LEG-06</span>
      </div>

      <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
        <span class="text-slate-500 text-[10px] block">FinOps &amp; Ops</span>
        <span class="text-blue-400 font-bold text-base block mt-0.5">12 Rules</span>
        <span class="text-[10px] text-slate-400">FIN, PAY, OPS, A11Y</span>
      </div>

      <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634] col-span-2 sm:col-span-1">
        <span class="text-slate-500 text-[10px] block">Active Pentest</span>
        <span class="text-red-400 font-bold text-base block mt-0.5">6 Probes</span>
        <span class="text-[10px] text-slate-400">PT-01 to PT-06</span>
      </div>
    </div>
  </div>

  <!-- Embedded Rule Explorer -->
  <RuleExplorer />
</div>
