<script lang="ts">
  import { Play, Sparkles, CheckCircle2, AlertTriangle, XCircle, ShieldAlert, FileText, Crosshair, ArrowRight, RotateCcw } from 'lucide-svelte';

  type SimMode = 'scan' | 'legal' | 'attack';
  let activeMode = $state<SimMode>('scan');

  // Scan state
  let isRemediated = $state(false);
  let isRemediating = $state(false);

  // Attack probe animation state
  let attackRunning = $state(false);
  let attackStep = $state(0);

  const attackProbes = [
    { id: 'PT-01', name: 'Supabase PostgREST Anon-Key Dump', target: '/rest/v1/users', latency: '42ms', status: 'BLOCKED - 401', blocked: true },
    { id: 'PT-02', name: 'Unauthenticated Mutation Replay', target: 'POST /api/workspaces', latency: '65ms', status: 'BLOCKED - 401', blocked: true },
    { id: 'PT-03', name: 'Cross-Tenant IDOR Tampering', target: 'GET /api/org/inv_a89', latency: '38ms', status: 'BLOCKED - 404', blocked: true },
    { id: 'PT-04', name: 'Forged Stripe Webhook Spoofing', target: 'POST /api/webhooks/stripe', latency: '89ms', status: 'EXPLOITED - 200 OK', blocked: false },
    { id: 'PT-05', name: 'Prompt Injection Canary Leak', target: 'POST /api/chat', latency: '120ms', status: 'BLOCKED - 429', blocked: true },
    { id: 'PT-06', name: 'Client Bundle Source Map Secret Scrape', target: '/_next/static/chunks', latency: '31ms', status: 'BLOCKED - 404', blocked: true }
  ];

  function runAttackSimulation() {
    attackRunning = true;
    attackStep = 0;
    const interval = setInterval(() => {
      attackStep += 1;
      if (attackStep >= attackProbes.length) {
        clearInterval(interval);
        attackRunning = false;
      }
    }, 700);
  }

  function handleRemediation() {
    isRemediating = true;
    setTimeout(() => {
      isRemediating = false;
      isRemediated = true;
    }, 900);
  }

  function resetScan() {
    isRemediated = false;
    isRemediating = false;
  }
</script>

<div class="relative rounded-2xl border border-[#222634] bg-[#090a0f] shadow-2xl overflow-hidden font-mono">
  <!-- Top Avionics Terminal Header Bar -->
  <div class="flex items-center justify-between border-b border-[#222634] bg-[#11131c] px-4 py-3">
    <!-- Window Controls -->
    <div class="flex items-center gap-2">
      <span class="w-3 h-3 rounded-full bg-[#ef4444]/80"></span>
      <span class="w-3 h-3 rounded-full bg-[#f59e0b]/80"></span>
      <span class="w-3 h-3 rounded-full bg-[#10b981]/80"></span>
      <span class="ml-2 text-[11px] font-semibold text-slate-400 hidden sm:inline">preflight-avionics-terminal</span>
    </div>

    <!-- Mode Selector Tabs -->
    <div class="flex items-center gap-1 bg-[#090a0f] p-1 rounded-lg border border-[#222634]">
      <button
        onclick={() => (activeMode = 'scan')}
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all {activeMode === 'scan' ? 'bg-[#181b26] text-emerald-400 font-bold border border-[#222634]' : 'text-slate-400 hover:text-slate-200'}"
      >
        <ShieldAlert class="w-3 h-3" />
        <span>$ preflight scan</span>
      </button>

      <button
        onclick={() => (activeMode = 'legal')}
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all {activeMode === 'legal' ? 'bg-[#181b26] text-indigo-400 font-bold border border-[#222634]' : 'text-slate-400 hover:text-slate-200'}"
      >
        <FileText class="w-3 h-3" />
        <span>$ legal --sync</span>
      </button>

      <button
        onclick={() => {
          activeMode = 'attack';
          if (attackStep === 0) runAttackSimulation();
        }}
        class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-all {activeMode === 'attack' ? 'bg-[#181b26] text-red-400 font-bold border border-[#222634]' : 'text-slate-400 hover:text-slate-200'}"
      >
        <Crosshair class="w-3 h-3" />
        <span>$ preflight attack</span>
      </button>
    </div>
  </div>

  <!-- Terminal Body Area -->
  <div class="p-4 sm:p-6 text-xs sm:text-[13px] leading-relaxed text-slate-300 min-h-[420px] max-h-[460px] overflow-y-auto">
    {#if activeMode === 'scan'}
      <!-- SCAN MODE -->
      <div class="space-y-4">
        <div class="flex items-center justify-between text-slate-400 border-b border-[#222634]/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-emerald-400 font-bold">$</span>
            <span class="text-white">preflight scan --repo ./acme-saas</span>
          </div>
          <span class="text-[11px] text-slate-500">AST Indexed in 134ms</span>
        </div>

        {#if !isRemediated}
          <!-- Scorecard: 65/100 BLOCKED -->
          <div class="rounded-xl border border-red-500/40 bg-red-950/20 p-4 space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-red-500/20 pb-3">
              <div class="flex items-center gap-3">
                <div class="px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 border border-red-500/40 font-bold text-xs">
                  LAUNCH BLOCKED
                </div>
                <div class="text-2xl font-extrabold text-red-400 tracking-tight">
                  65<span class="text-sm font-normal text-slate-400">/100</span>
                </div>
              </div>
              <span class="text-xs text-red-300/80">3 Critical Blockers • 43 Checks Analyzed</span>
            </div>

            <!-- Blockers List -->
            <div class="space-y-2 text-xs">
              <div class="flex items-start gap-2 bg-[#090a0f]/80 p-2.5 rounded border border-red-500/20">
                <span class="text-red-400 font-bold shrink-0">[CRITICAL]</span>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-200">SEC-01: Missing Row-Level Security</span>
                    <span class="text-red-400 font-mono text-[11px]">-25 pts</span>
                  </div>
                  <p class="text-slate-400 text-[11px] mt-0.5">Table 'public.documents' created in supabase/migrations/04.sql lacks ENABLE ROW LEVEL SECURITY.</p>
                </div>
              </div>

              <div class="flex items-start gap-2 bg-[#090a0f]/80 p-2.5 rounded border border-red-500/20">
                <span class="text-red-400 font-bold shrink-0">[CRITICAL]</span>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-200">LEG-02: Viral Copyleft License Conflict</span>
                    <span class="text-red-400 font-mono text-[11px]">-25 pts</span>
                  </div>
                  <p class="text-slate-400 text-[11px] mt-0.5">Found 'agpl-pdf-generator@2.1.0' in package.json. Incompatible with commercial proprietary distribution.</p>
                </div>
              </div>

              <div class="flex items-start gap-2 bg-[#090a0f]/80 p-2.5 rounded border border-amber-500/20">
                <span class="text-amber-400 font-bold shrink-0">[CRITICAL]</span>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-slate-200">FIN-01: Frontend Infinite Fetch Loop</span>
                    <span class="text-amber-400 font-mono text-[11px]">-25 pts</span>
                  </div>
                  <p class="text-slate-400 text-[11px] mt-0.5">src/routes/dashboard/+page.svelte:28 calls fetch('/api/user') inside $effect with 'user' in dependency tracking.</p>
                </div>
              </div>
            </div>

            <!-- Fix CTA -->
            <div class="pt-2 flex items-center justify-between">
              <span class="text-[11px] text-slate-400">Exit code 1 • CI Gate Failed</span>
              <button
                onclick={handleRemediation}
                disabled={isRemediating}
                class="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 text-xs font-semibold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
              >
                <Sparkles class="w-3.5 h-3.5 {isRemediating ? 'animate-spin' : ''}" />
                <span>{isRemediating ? 'Applying MCP Patches...' : 'Auto-Fix All in Cursor (⌘⇧F)'}</span>
              </button>
            </div>
          </div>
        {:else}
          <!-- Scorecard: 100/100 READY -->
          <div class="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3 transition-all animate-in fade-in">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-500/20 pb-3">
              <div class="flex items-center gap-3">
                <div class="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-xs">
                  ✓ LAUNCH READY
                </div>
                <div class="text-2xl font-extrabold text-emerald-400 tracking-tight">
                  100<span class="text-sm font-normal text-slate-400">/100</span>
                </div>
              </div>
              <span class="text-xs text-emerald-300">0 Blockers • 43/43 Passed • Audit Cryptographically Signed</span>
            </div>

            <div class="space-y-2 text-xs">
              <div class="flex items-center gap-2 bg-[#090a0f]/80 p-2 rounded border border-emerald-500/20 text-emerald-300">
                <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                <span>SEC-01: Injected RLS migration with scoped user_id policies</span>
              </div>
              <div class="flex items-center gap-2 bg-[#090a0f]/80 p-2 rounded border border-emerald-500/20 text-emerald-300">
                <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                <span>LEG-02: Replaced AGPL package with verified MIT pdf-lib equivalent</span>
              </div>
              <div class="flex items-center gap-2 bg-[#090a0f]/80 p-2 rounded border border-emerald-500/20 text-emerald-300">
                <CheckCircle2 class="w-4 h-4 text-emerald-400 shrink-0" />
                <span>FIN-01: Converted runaway effect to clean SvelteKit prerender load</span>
              </div>
            </div>

            <div class="pt-2 flex items-center justify-between">
              <span class="text-[11px] text-emerald-400/90 font-mono">Exported LAUNCH_CERTIFICATE.pdf (SHA256: 7f8a91c...)</span>
              <button
                onclick={resetScan}
                class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                <RotateCcw class="w-3.5 h-3.5" />
                <span>Re-simulate flaw</span>
              </button>
            </div>
          </div>
        {/if}
      </div>

    {:else if activeMode === 'legal'}
      <!-- LEGAL SYNC MODE -->
      <div class="space-y-3">
        <div class="flex items-center justify-between text-slate-400 border-b border-[#222634]/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-indigo-400 font-bold">$</span>
            <span class="text-white">preflight legal --sync</span>
          </div>
          <span class="text-[11px] text-slate-500">Diff: /legal/privacy-policy.md</span>
        </div>

        <div class="bg-[#090a0f] p-3 rounded-lg border border-[#222634] space-y-1 font-mono text-[12px]">
          <div class="text-slate-500">@@ -14,6 +14,14 @@ ## Third-Party Sub-Processors</div>
          <div class="text-slate-400">&nbsp;&nbsp;We utilize third-party sub-processors to deliver core functionality:</div>
          <div class="text-red-400/70 bg-red-950/20 px-1 rounded">- &nbsp;| Vendor &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;| Purpose &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;| Location |</div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ &nbsp;| Vendor &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;| Purpose &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;| Location | Subscribed SDK |</div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ &nbsp;| Stripe, Inc. &nbsp; &nbsp; &nbsp;| Payments &amp; Invoicing | USA &nbsp; &nbsp; &nbsp;| @stripe/stripe-js |</div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ &nbsp;| OpenAI, L.L.C. &nbsp; &nbsp;| Text Inference &nbsp; &nbsp;| USA &nbsp; &nbsp; &nbsp;| openai@4.28.0 |</div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ &nbsp;| Supabase, Inc. &nbsp; &nbsp;| Database &amp; Auth &nbsp; &nbsp;| USA &nbsp; &nbsp; &nbsp;| @supabase/ssr |</div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ &nbsp;| PostHog, Inc. &nbsp; &nbsp; | Product Analytics &nbsp;| EU &nbsp; &nbsp; &nbsp; | posthog-js |</div>
          <div class="text-slate-500">@@ -42,3 +50,7 @@ <!-- PREFLIGHT:AUTO:VERSION_META --></div>
          <div class="text-emerald-400 bg-emerald-950/20 px-1 rounded">+ CURRENT_LEGAL_VERSION = "2026-10-20.v1.0.4" (hash: 9d83ac2)</div>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
          <span class="text-indigo-400 flex items-center gap-1">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
            4 Active SDKs synchronized with Privacy Policy
          </span>
          <span class="text-[11px] text-slate-500">LEG-04 Pass</span>
        </div>
      </div>

    {:else if activeMode === 'attack'}
      <!-- ATTACK PENTEST MODE -->
      <div class="space-y-3">
        <div class="flex items-center justify-between text-slate-400 border-b border-[#222634]/60 pb-2">
          <div class="flex items-center gap-2">
            <span class="text-red-400 font-bold">$</span>
            <span class="text-white">preflight attack --target http://localhost:3000</span>
          </div>
          <button
            onclick={runAttackSimulation}
            disabled={attackRunning}
            class="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 font-medium cursor-pointer"
          >
            <Play class="w-3 h-3 {attackRunning ? 'animate-spin' : ''}" />
            <span>{attackRunning ? 'Probing...' : 'Re-run 6 Probes'}</span>
          </button>
        </div>

        <!-- Probe Stream -->
        <div class="space-y-1.5 font-mono text-[11px]">
          {#each attackProbes as probe, i}
            <div
              class="flex items-center justify-between p-2 rounded border transition-all duration-200 {i < attackStep
                ? probe.blocked
                  ? 'border-emerald-500/20 bg-emerald-950/10 text-slate-200'
                  : 'border-red-500/50 bg-red-950/25 text-red-200'
                : 'border-[#222634]/40 bg-[#11131c]/40 text-slate-600'}"
            >
              <div class="flex items-center gap-2">
                <span class="font-bold {i < attackStep ? (probe.blocked ? 'text-emerald-400' : 'text-red-400') : 'text-slate-600'}">{probe.id}</span>
                <span class="truncate max-w-[210px] sm:max-w-[280px]">{probe.name}</span>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                {#if i < attackStep}
                  <span class="text-slate-500 text-[10px]">{probe.latency}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold {probe.blocked ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/30 text-red-300 border border-red-500/50 animate-pulse'}">
                    {probe.status}
                  </span>
                {:else if i === attackStep && attackRunning}
                  <span class="text-indigo-400 text-[10px] animate-pulse">Firing probe...</span>
                {:else}
                  <span class="text-slate-700 text-[10px]">Pending</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        {#if attackStep >= attackProbes.length}
          <div class="rounded-lg bg-red-950/30 border border-red-500/30 p-2.5 text-xs text-red-300 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <AlertTriangle class="w-4 h-4 text-red-400 shrink-0" />
              <span>PT-04 EXPLOITED: Forged Stripe Webhook passed without HMAC check</span>
            </span>
            <span class="text-[11px] text-red-400 font-bold underline cursor-pointer">View Exploit Proof</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Bottom Terminal Status Bar -->
  <div class="flex items-center justify-between border-t border-[#222634] bg-[#11131c] px-4 py-2 text-[11px] text-slate-400">
    <div class="flex items-center gap-3">
      <span class="flex items-center gap-1.5 text-emerald-400">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
        <span>Local Daemon Ready</span>
      </span>
      <span class="hidden sm:inline text-slate-600">•</span>
      <span class="hidden sm:inline text-slate-500">AST Parser v0.8.2</span>
    </div>
    <div class="font-mono text-slate-500">
      v1.0.0
    </div>
  </div>
</div>
