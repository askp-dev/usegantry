<script lang="ts">
  import { onMount } from 'svelte';
  import { Terminal, Cpu, Download, PackageCheck, Copy, Check, ExternalLink } from 'lucide-svelte';

  type TabId = 'quick' | 'mcp' | 'binary' | 'vsix';

  let activeTab: TabId = $state('quick');
  let detectedOs = $state('macOS Apple Silicon');
  let osDownloadUrl = $state('https://github.com/your-org/preflight/releases/latest/download/preflight-darwin-arm64');
  let installCommand = $state('curl -fsSL https://preflight.dev/install.sh | sh');
  let copiedCommand = $state<string | null>(null);

  onMount(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) {
        detectedOs = 'Windows x64';
        installCommand = 'irm https://preflight.dev/install.ps1 | iex';
        osDownloadUrl = 'https://github.com/your-org/preflight/releases/latest/download/preflight-windows-x64.exe';
      } else if (ua.includes('linux')) {
        detectedOs = 'Linux x64';
        installCommand = 'curl -fsSL https://preflight.dev/install.sh | sh';
        osDownloadUrl = 'https://github.com/your-org/preflight/releases/latest/download/preflight-linux-x64';
      } else if (ua.includes('mac')) {
        // Default to Apple Silicon arm64, or detect
        detectedOs = 'macOS Apple Silicon (arm64)';
        installCommand = 'curl -fsSL https://preflight.dev/install.sh | sh';
        osDownloadUrl = 'https://github.com/your-org/preflight/releases/latest/download/preflight-darwin-arm64';
      }
    }
  });

  async function copyText(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedCommand = id;
      setTimeout(() => {
        if (copiedCommand === id) copiedCommand = null;
      }, 2000);
    } catch {
      // fallback
    }
  }
</script>

<div class="w-full rounded-xl border border-[#222634] bg-[#11131c]/95 backdrop-blur-md overflow-hidden shadow-2xl">
  <!-- Tabs Header -->
  <div class="flex items-center border-b border-[#222634] bg-[#090a0f]/60 px-2 pt-2 overflow-x-auto no-scrollbar">
    <button
      onclick={() => (activeTab = 'quick')}
      class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeTab === 'quick' ? 'border-emerald-500 text-emerald-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
    >
      <Terminal class="w-3.5 h-3.5" />
      <span>1. Quick Scan</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">&lt;1.1s</span>
    </button>

    <button
      onclick={() => (activeTab = 'mcp')}
      class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeTab === 'mcp' ? 'border-indigo-500 text-indigo-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
    >
      <Cpu class="w-3.5 h-3.5" />
      <span>2. Cursor & Claude MCP</span>
    </button>

    <button
      onclick={() => (activeTab = 'binary')}
      class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeTab === 'binary' ? 'border-blue-500 text-blue-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
    >
      <Download class="w-3.5 h-3.5" />
      <span>3. Standalone Binary</span>
      <span class="text-[10px] text-slate-500 hidden sm:inline">({detectedOs.split(' ')[0]})</span>
    </button>

    <button
      onclick={() => (activeTab = 'vsix')}
      class="flex items-center gap-2 px-4 py-2.5 text-xs font-mono font-semibold transition-colors border-b-2 -mb-[1px] whitespace-nowrap {activeTab === 'vsix' ? 'border-emerald-500 text-emerald-400 bg-[#181b26]/70 rounded-t' : 'border-transparent text-slate-400 hover:text-slate-200'}"
    >
      <PackageCheck class="w-3.5 h-3.5" />
      <span>4. Cursor Extension</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">v1.0.0</span>
    </button>
  </div>

  <!-- Tab Content -->
  <div class="p-4 sm:p-5">
    {#if activeTab === 'quick'}
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p class="text-xs text-slate-400">
            Run instant static audit against your codebase. Zero installation, zero cloud upload.
          </p>
          <span class="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 self-start">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Deterministic • Local Only
          </span>
        </div>

        <div class="flex items-center justify-between rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-xs sm:text-sm">
          <div class="flex items-center gap-2 text-slate-200 overflow-x-auto">
            <span class="text-emerald-500 select-none">$</span>
            <span class="text-slate-300">bunx preflight scan</span>
            <span class="text-slate-600 select-none"># or npx preflight scan</span>
          </div>
          <button
            onclick={() => copyText('bunx preflight scan', 'quick')}
            class="ml-3 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#181b26] hover:bg-[#222634] border border-[#222634] transition-all"
            aria-label="Copy quick scan command"
          >
            {#if copiedCommand === 'quick'}
              <Check class="w-3.5 h-3.5 text-emerald-400" />
              <span class="text-emerald-400">Copied</span>
            {:else}
              <Copy class="w-3.5 h-3.5" />
              <span>Copy</span>
            {/if}
          </button>
        </div>
      </div>
    {:else if activeTab === 'mcp'}
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p class="text-xs text-slate-400">
            Wire preflight directly into Cursor & Claude Code as an autonomous compliance gatekeeper.
          </p>
          <span class="text-[11px] font-mono text-indigo-400">Stdio Protocol • 4 Tools</span>
        </div>

        <div class="flex items-center justify-between rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-xs sm:text-sm">
          <div class="flex items-center gap-2 text-slate-200 overflow-x-auto">
            <span class="text-indigo-400 select-none">$</span>
            <span class="text-slate-300">bunx preflight init --mcp</span>
          </div>
          <button
            onclick={() => copyText('bunx preflight init --mcp', 'mcp')}
            class="ml-3 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#181b26] hover:bg-[#222634] border border-[#222634] transition-all"
            aria-label="Copy MCP init command"
          >
            {#if copiedCommand === 'mcp'}
              <Check class="w-3.5 h-3.5 text-emerald-400" />
              <span class="text-emerald-400">Copied</span>
            {:else}
              <Copy class="w-3.5 h-3.5" />
              <span>Copy</span>
            {/if}
          </button>
        </div>
        <p class="text-[11px] text-slate-500">
          Auto-injects <code class="text-slate-300">.cursor/mcp.json</code> and <code class="text-slate-300">CLAUDE.md</code> with audit tools and active pentest actions.
        </p>
      </div>
    {:else if activeTab === 'binary'}
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p class="text-xs text-slate-400">
            Detected OS: <span class="text-white font-medium">{detectedOs}</span>. Self-contained static binary with embedded SQLite.
          </p>
          <a
            href={osDownloadUrl}
            class="text-[11px] font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1 underline underline-offset-2"
            download
          >
            Direct download binary
          </a>
        </div>

        <div class="flex items-center justify-between rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-xs sm:text-sm">
          <div class="flex items-center gap-2 text-slate-200 overflow-x-auto">
            <span class="text-blue-400 select-none">$</span>
            <span class="text-slate-300 break-all">{installCommand}</span>
          </div>
          <button
            onclick={() => copyText(installCommand, 'binary')}
            class="ml-3 flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-[#181b26] hover:bg-[#222634] border border-[#222634] transition-all"
            aria-label="Copy install command"
          >
            {#if copiedCommand === 'binary'}
              <Check class="w-3.5 h-3.5 text-emerald-400" />
              <span class="text-emerald-400">Copied</span>
            {:else}
              <Copy class="w-3.5 h-3.5" />
              <span>Copy</span>
            {/if}
          </button>
        </div>
      </div>
    {:else if activeTab === 'vsix'}
      <div class="space-y-3">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p class="text-xs text-slate-400">
            Adds real-time AST CodeLens annotations, 1-click Agent fix buttons, and Mission Control sidebar to Cursor / VS Code.
          </p>
          <span class="text-[11px] font-mono text-emerald-400">Cursor Native</span>
        </div>

        <div class="flex flex-wrap items-center gap-3 pt-1">
          <a
            href="/downloads/preflight-latest.vsix"
            download
            class="flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black px-4 py-2 text-xs font-semibold font-mono transition-colors shadow-lg shadow-emerald-500/20"
          >
            <Download class="w-3.5 h-3.5" />
            <span>Download .VSIX (v1.0.0)</span>
          </a>

          <a
            href="https://marketplace.visualstudio.com"
            target="_blank"
            rel="noreferrer"
            class="flex items-center gap-1.5 rounded-lg border border-[#222634] bg-[#181b26] hover:bg-[#222634] text-slate-200 px-3.5 py-2 text-xs font-medium transition-colors"
          >
            <span>Open in Cursor Marketplace</span>
            <ExternalLink class="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>
    {/if}
  </div>
</div>
