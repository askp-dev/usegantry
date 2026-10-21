<script lang="ts">
  import './layout.css';
  import { Zap, Download, Shield, FileCheck, ExternalLink, Menu, X } from 'lucide-svelte';
  import type { LayoutProps } from './$types';

  let { children }: LayoutProps = $props();
  let mobileMenuOpen = $state(false);
</script>

<svelte:head>
  <title>Preflight — Compliance, Security &amp; FinOps Engine for AI-Built Software</title>
  <meta name="description" content="Catch missing Supabase RLS, hallucinated packages, AGPL license traps, infinite token loops, and stale legal policies inside Cursor &amp; Claude Code before launch." />
  <meta property="og:title" content="Preflight AI — Tactical Pre-Flight Avionics" />
  <meta property="og:description" content="43 deterministic checks in &lt;1.1s. Zero cloud upload. Autonomous compliance gatekeeper for vibe-coded apps." />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="min-h-screen bg-[#090a0f] text-[#f8fafc] font-sans flex flex-col selection:bg-emerald-500/20 selection:text-emerald-300">
  <!-- Sticky Avionics Navbar (Height: 56px) -->
  <header class="sticky top-0 z-50 h-14 border-b border-[#222634] bg-[#090a0f]/85 backdrop-blur-md">
    <div class="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
      <!-- Left: Logo & Release Badge -->
      <div class="flex items-center gap-3">
        <a href="/" class="flex items-center gap-2 group">
          <span class="p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 group-hover:bg-emerald-500/20 transition-colors">
            <Zap class="w-4 h-4 fill-emerald-400" />
          </span>
          <span class="font-mono font-bold tracking-tight text-white text-base">PREFLIGHT</span>
        </a>

        <div class="hidden sm:flex items-center gap-2 px-2 py-0.5 rounded-full bg-[#181b26] border border-[#222634] text-[11px] font-mono text-slate-300">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>v1.0.0</span>
          <span class="text-slate-600">•</span>
          <span class="text-slate-400">MIT Core</span>
        </div>
      </div>

      <!-- Center: Navigation Links -->
      <nav class="hidden md:flex items-center gap-6 text-xs font-mono text-slate-400">
        <a href="/#how-it-works" class="hover:text-emerald-400 transition-colors">#architecture</a>
        <a href="/#rules-43" class="hover:text-emerald-400 transition-colors">#rules-43</a>
        <a href="/#mcp-setup" class="hover:text-emerald-400 transition-colors">#mcp-setup</a>
        <a href="/#pricing" class="hover:text-emerald-400 transition-colors">#pricing</a>
        <a href="/rules" class="hover:text-emerald-400 transition-colors">/rules</a>
        <a href="/verify" class="flex items-center gap-1 hover:text-emerald-400 transition-colors">
          <FileCheck class="w-3.5 h-3.5 text-emerald-400" />
          <span>/verify</span>
        </a>
      </nav>

      <!-- Right: Action CTAs -->
      <div class="hidden sm:flex items-center gap-3">
        <a
          href="https://github.com/your-org/preflight"
          target="_blank"
          rel="noreferrer"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#222634] bg-[#11131c] hover:bg-[#181b26] text-xs font-mono text-slate-300 transition-colors"
        >
          <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
          <span>Star on GitHub</span>
          <span class="px-1 rounded bg-[#181b26] text-[10px] text-slate-400 border border-[#222634]">★ 2.4k</span>
        </a>

        <a
          href="/#download"
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-mono font-semibold transition-all shadow-lg shadow-emerald-500/20"
        >
          <Download class="w-3.5 h-3.5" />
          <span>Download CLI / Extension</span>
        </a>
      </div>

      <!-- Mobile Hamburger Button -->
      <button
        onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
        class="md:hidden p-1.5 rounded-lg border border-[#222634] text-slate-400 hover:text-white"
        aria-label="Toggle mobile menu"
      >
        {#if mobileMenuOpen}
          <X class="w-5 h-5" />
        {:else}
          <Menu class="w-5 h-5" />
        {/if}
      </button>
    </div>

    <!-- Mobile Dropdown Menu -->
    {#if mobileMenuOpen}
      <div class="md:hidden border-b border-[#222634] bg-[#090a0f] px-4 py-4 space-y-3 font-mono text-xs">
        <a onclick={() => (mobileMenuOpen = false)} href="/#how-it-works" class="block py-1 text-slate-300 hover:text-emerald-400">#architecture</a>
        <a onclick={() => (mobileMenuOpen = false)} href="/#rules-43" class="block py-1 text-slate-300 hover:text-emerald-400">#rules-43</a>
        <a onclick={() => (mobileMenuOpen = false)} href="/#mcp-setup" class="block py-1 text-slate-300 hover:text-emerald-400">#mcp-setup</a>
        <a onclick={() => (mobileMenuOpen = false)} href="/#pricing" class="block py-1 text-slate-300 hover:text-emerald-400">#pricing</a>
        <a onclick={() => (mobileMenuOpen = false)} href="/rules" class="block py-1 text-slate-300 hover:text-emerald-400">/rules (Docs)</a>
        <a onclick={() => (mobileMenuOpen = false)} href="/verify" class="block py-1 text-emerald-400">/verify (Certificates)</a>
        <div class="pt-2 flex flex-col gap-2">
          <a
            href="/#download"
            onclick={() => (mobileMenuOpen = false)}
            class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500 text-black font-semibold"
          >
            <Download class="w-4 h-4" />
            <span>Download Preflight</span>
          </a>
        </div>
      </div>
    {/if}
  </header>

  <!-- Main Content Shell -->
  <main class="flex-1">
    {@render children()}
  </main>

  <!-- Avionics Footer -->
  <footer class="border-t border-[#222634] bg-[#090a0f] py-12 px-4 sm:px-6">
    <div class="max-w-7xl mx-auto space-y-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div class="space-y-3 md:col-span-2">
          <div class="flex items-center gap-2">
            <span class="p-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <Zap class="w-4 h-4 fill-emerald-400" />
            </span>
            <span class="font-mono font-bold tracking-tight text-white text-base">PREFLIGHT AI</span>
          </div>
          <p class="text-xs text-slate-400 max-w-sm leading-relaxed">
            The Pre-Flight Compliance, Security &amp; FinOps Engine for AI-Built Software. 43 deterministic checks running locally in &lt;1.1s. Zero telemetry, zero cloud upload.
          </p>
          <div class="text-[11px] font-mono text-slate-500">
            Open-core licensed under MIT. Avionics Design System by DeepMind &amp; Preflight team.
          </div>
        </div>

        <div class="space-y-2 font-mono text-xs">
          <div class="text-white font-bold uppercase tracking-wider text-[11px]">Engine &amp; Specs</div>
          <ul class="space-y-1.5 text-slate-400">
            <li><a href="/rules" class="hover:text-emerald-400">43-Rule Registry</a></li>
            <li><a href="/#mcp-setup" class="hover:text-emerald-400">Cursor &amp; Claude MCP</a></li>
            <li><a href="/verify" class="hover:text-emerald-400">WebCrypto /verify</a></li>
            <li><a href="/install.sh" class="hover:text-emerald-400">POSIX Shell Installer</a></li>
          </ul>
        </div>

        <div class="space-y-2 font-mono text-xs">
          <div class="text-white font-bold uppercase tracking-wider text-[11px]">Resources</div>
          <ul class="space-y-1.5 text-slate-400">
            <li><a href="https://github.com/your-org/preflight" target="_blank" rel="noreferrer" class="hover:text-emerald-400 flex items-center gap-1"><span>GitHub Repository</span><ExternalLink class="w-3 h-3" /></a></li>
            <li><a href="/#pricing" class="hover:text-emerald-400">Commercial &amp; Agency</a></li>
            <li><a href="/rules" class="hover:text-emerald-400">Active Pentest Probes</a></li>
            <li><a href="/verify#demo" class="hover:text-emerald-400">Launch Certificate Portal</a></li>
          </ul>
        </div>
      </div>

      <div class="pt-6 border-t border-[#222634] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-mono text-slate-500">
        <div>
          &copy; 2026 Preflight Technologies, Inc. All rights reserved.
        </div>
        <div class="flex items-center gap-4">
          <span class="text-emerald-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            GitHub Pages Prerendered
          </span>
          <span class="text-slate-600">•</span>
          <span>SHA-256 Validated</span>
        </div>
      </div>
    </div>
  </footer>
</div>
