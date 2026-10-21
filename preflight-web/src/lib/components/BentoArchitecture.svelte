<script lang="ts">
  import { Shield, Scale, DollarSign, Crosshair, Award, Code2, Database, Zap, Lock, ArrowUpRight, CheckCircle2 } from 'lucide-svelte';

  let activeTabPillar = $state<'ast' | 'rls'>('ast');
  let activeLegalTab = $state<'deps' | 'policy'>('deps');
</script>

<div class="space-y-6">
  <!-- Eyebrow & Title -->
  <div class="text-center max-w-3xl mx-auto space-y-3">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      <Zap class="w-3.5 h-3.5" />
      <span>MISSION-CRITICAL ARCHITECTURE</span>
    </div>
    <h2 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
      Tactical Avionics for AI-Generated Codebases
    </h2>
    <p class="text-slate-400 text-sm sm:text-base">
      Cursor and Claude Code generate hundreds of lines of code in seconds. Preflight ensures none of it bankrupts your company, leaks your database, or triggers a copyright lawsuit.
    </p>
  </div>

  <!-- Bento Grid Container (gap: 1px with background: #222634 hairline grid) -->
  <div class="rounded-2xl border border-[#222634] bg-[#222634] p-[1px] grid grid-cols-1 md:grid-cols-12 gap-[1px] overflow-hidden shadow-2xl">
    
    <!-- CARD 1 (Col Span 7 on desktop): AI-FOOTGUN SECURITY SCANNER -->
    <div class="md:col-span-7 bg-[#11131c] p-6 sm:p-7 flex flex-col justify-between group hover:bg-[#131622] transition-colors">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Shield class="w-5 h-5" />
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-400">Pillar 1 • 12 Deterministic Rules</span>
              <h3 class="text-lg font-bold text-white tracking-tight">AI-Footgun Security Scanner</h3>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[11px] font-mono bg-[#181b26] text-slate-300 border border-[#222634]">SEC-01 → SEC-12</span>
        </div>

        <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Deep AST tree analysis identifies missing Supabase Row-Level Security, unscoped ORM mutations (IDOR), leaked production secrets, and unauthenticated server actions before deployment.
        </p>

        <!-- Interactive Visual AST Inspector -->
        <div class="rounded-xl border border-[#222634] bg-[#090a0f] p-3 font-mono text-xs space-y-2">
          <div class="flex items-center justify-between border-b border-[#222634] pb-2 text-[11px]">
            <div class="flex items-center gap-1.5 text-slate-400">
              <Code2 class="w-3.5 h-3.5 text-emerald-400" />
              <span>AST Pattern Match: <code class="text-white">$CLIENT.$MODEL.update()</code></span>
            </div>
            <div class="flex gap-1">
              <button
                onclick={() => (activeTabPillar = 'ast')}
                class="px-2 py-0.5 rounded text-[10px] font-mono {activeTabPillar === 'ast' ? 'bg-[#181b26] text-emerald-400 border border-emerald-500/30' : 'text-slate-500'}"
              >
                AST Match
              </button>
              <button
                onclick={() => (activeTabPillar = 'rls')}
                class="px-2 py-0.5 rounded text-[10px] font-mono {activeTabPillar === 'rls' ? 'bg-[#181b26] text-emerald-400 border border-emerald-500/30' : 'text-slate-500'}"
              >
                Auto-Patch
              </button>
            </div>
          </div>

          {#if activeTabPillar === 'ast'}
            <div class="text-[11px] leading-relaxed space-y-1">
              <div class="text-slate-500">// Unscoped IDOR flaw detected in Prisma call:</div>
              <div class="text-red-400 bg-red-950/20 px-2 py-1 rounded border-l-2 border-red-500">
                - prisma.project.update(&#123; where: &#123; id: input.id &#125;, data: ... &#125;)
              </div>
              <div class="text-slate-400 text-[10px] pt-1 flex items-center gap-1">
                <Lock class="w-3 h-3 text-red-400" />
                <span class="text-red-300">Missing session compound scope check (userId / orgId)</span>
              </div>
            </div>
          {:else}
            <div class="text-[11px] leading-relaxed space-y-1">
              <div class="text-slate-500">// Auto-remediated with authenticated tenant compound:</div>
              <div class="text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded border-l-2 border-emerald-500">
                + prisma.project.update(&#123; where: &#123; id: input.id, userId: session.user.id &#125;, ... &#125;)
              </div>
              <div class="text-emerald-400 text-[10px] pt-1 flex items-center gap-1">
                <CheckCircle2 class="w-3 h-3 text-emerald-400" />
                <span>Zero IDOR vector • Tenant isolation guaranteed</span>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <div class="pt-4 flex items-center justify-between border-t border-[#222634]/60 text-xs text-slate-400">
        <span class="font-mono text-[11px] text-emerald-400/90">&lt;150ms AST index latency</span>
        <a href="#rules-43" class="text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors">
          <span>Explore 12 security rules</span>
          <ArrowUpRight class="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>
    </div>

    <!-- CARD 2 (Col Span 5 on desktop): CODE-BOUND LEGAL & EULA ENGINE -->
    <div class="md:col-span-5 bg-[#11131c] p-6 sm:p-7 flex flex-col justify-between group hover:bg-[#131622] transition-colors">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Scale class="w-5 h-5" />
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase tracking-wider font-bold text-indigo-400">Pillar 2 • Legal Sync</span>
              <h3 class="text-lg font-bold text-white tracking-tight">Code-Bound Legal Engine</h3>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[11px] font-mono bg-[#181b26] text-slate-300 border border-[#222634]">LEG-01 → LEG-06</span>
        </div>

        <p class="text-xs sm:text-sm text-slate-400 leading-relaxed">
          Inspects every package import, SDK, and payment gateway. Compiles live Markdown legal policies with detected Sub-Processors, GDPR erasure hooks, and clickwrap consent schemas.
        </p>

        <!-- Visual Live Sync Card -->
        <div class="rounded-xl border border-[#222634] bg-[#090a0f] p-3 font-mono text-[11px] space-y-2">
          <div class="flex items-center justify-between text-slate-400 border-b border-[#222634] pb-1.5">
            <span class="text-slate-300">package.json ➔ /legal/privacy-policy.md</span>
            <span class="text-indigo-400">100% In Sync</span>
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between text-[11px] bg-[#181b26] px-2 py-1 rounded">
              <span class="text-slate-300">OpenAI API SDK</span>
              <span class="text-emerald-400">Injected PII Disclosure</span>
            </div>
            <div class="flex items-center justify-between text-[11px] bg-[#181b26] px-2 py-1 rounded">
              <span class="text-slate-300">Stripe Invoicing</span>
              <span class="text-emerald-400">PCI Delegation Clause</span>
            </div>
            <div class="flex items-center justify-between text-[11px] bg-[#181b26] px-2 py-1 rounded">
              <span class="text-slate-300">AGPL Packages</span>
              <span class="text-red-400">0 Copyleft Violations</span>
            </div>
          </div>
        </div>
      </div>

      <div class="pt-4 flex items-center justify-between border-t border-[#222634]/60 text-xs text-slate-400">
        <span class="font-mono text-[11px] text-indigo-400">`preflight legal --sync`</span>
        <a href="#rules-43" class="text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors">
          <span>View legal rules</span>
          <ArrowUpRight class="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>
    </div>

    <!-- CARD 3 (Col Span 4): ANTI-BANKRUPTCY FINOPS -->
    <div class="md:col-span-4 bg-[#11131c] p-6 flex flex-col justify-between group hover:bg-[#131622] transition-colors">
      <div class="space-y-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <DollarSign class="w-5 h-5" />
          </div>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-wider font-bold text-amber-400">Pillar 3 • FinOps & Burn</span>
            <h3 class="text-base font-bold text-white tracking-tight">Anti-Bankruptcy FinOps</h3>
          </div>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          Catches recursive <code class="text-slate-300">useEffect</code> fetch loops, unbounded LLM agent iterations (<code class="text-slate-300">maxSteps</code> missing), and double-crediting payment race conditions.
        </p>

        <div class="rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-[11px] space-y-2">
          <div class="flex items-center justify-between text-slate-400">
            <span>Runaway Loop Guard</span>
            <span class="text-emerald-400 font-bold">ARMED</span>
          </div>
          <div class="w-full bg-[#181b26] rounded-full h-2 overflow-hidden border border-[#222634]">
            <div class="bg-gradient-to-r from-emerald-500 to-amber-500 h-2 rounded-full w-2/3"></div>
          </div>
          <div class="flex justify-between text-[10px] text-slate-500">
            <span>Timeout: 30s Cap</span>
            <span>Max Steps: 5</span>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-[#222634]/60 text-xs text-slate-400 flex items-center justify-between">
        <span class="font-mono text-[11px] text-amber-400">FIN-01 to FIN-03</span>
        <span class="text-slate-300">Prevents $14k cloud spikes</span>
      </div>
    </div>

    <!-- CARD 4 (Col Span 4): AST-GUIDED PENTESTER -->
    <div class="md:col-span-4 bg-[#11131c] p-6 flex flex-col justify-between group hover:bg-[#131622] transition-colors">
      <div class="space-y-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
            <Crosshair class="w-5 h-5" />
          </div>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-wider font-bold text-red-400">Pillar 4 • Active Attack</span>
            <h3 class="text-base font-bold text-white tracking-tight">AST-Guided Pentester</h3>
          </div>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          Fires 6 non-destructive exploit probes against <code class="text-slate-300">localhost:3000</code> using your indexed AST route and database context to uncover live vulnerabilities.
        </p>

        <div class="rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-[11px] space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-slate-400">PT-01 Anon DB Dump</span>
            <span class="text-emerald-400 font-bold">401 BLOCKED</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400">PT-03 IDOR Mutation</span>
            <span class="text-emerald-400 font-bold">404 BLOCKED</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-400">PT-04 Webhook Spoof</span>
            <span class="text-red-400 font-bold">EXPLOITED</span>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-[#222634]/60 text-xs text-slate-400 flex items-center justify-between">
        <span class="font-mono text-[11px] text-red-400">PT-01 to PT-06</span>
        <span class="text-slate-300">`preflight attack`</span>
      </div>
    </div>

    <!-- CARD 5 (Col Span 4): B2B VENDOR PACK & CERTIFICATES -->
    <div class="md:col-span-4 bg-[#11131c] p-6 flex flex-col justify-between group hover:bg-[#131622] transition-colors">
      <div class="space-y-3">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Award class="w-5 h-5" />
          </div>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-wider font-bold text-emerald-400">Agency & Enterprise</span>
            <h3 class="text-base font-bold text-white tracking-tight">B2B Vendor Deal-Closer</h3>
          </div>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          Exports cryptographically signed Launch Certificates, CycloneDX SBOM (<code class="text-slate-300">sbom.json</code>), and RoPA Mermaid data-flow diagrams for enterprise security questionnaires.
        </p>

        <div class="rounded-lg border border-[#222634] bg-[#090a0f] p-3 font-mono text-[11px] space-y-1.5">
          <div class="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Cryptographic Launch Certificate</span>
          </div>
          <div class="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>CycloneDX 1.5 JSON SBOM</span>
          </div>
          <div class="flex items-center gap-1.5 text-slate-300">
            <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Mermaid Architecture Swimlane</span>
          </div>
        </div>
      </div>

      <div class="pt-4 border-t border-[#222634]/60 text-xs text-slate-400 flex items-center justify-between">
        <span class="font-mono text-[11px] text-emerald-400">Zero-Backend /verify</span>
        <a href="/verify" class="text-slate-300 hover:text-white flex items-center gap-1 font-medium transition-colors">
          <span>Try Verifier</span>
          <ArrowUpRight class="w-3.5 h-3.5 text-slate-400" />
        </a>
      </div>
    </div>

  </div>
</div>
