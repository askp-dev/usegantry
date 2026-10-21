<script lang="ts">
  import CertVerifier from '#lib/components/CertVerifier.svelte';
  import { Shield, Lock, FileCheck, CheckCircle2, ArrowLeft } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Client-Side Launch Certificate Verifier | Preflight AI</title>
  <meta name="description" content="Verify cryptographically signed Preflight Launch Certificates directly in the browser with WebCrypto. Zero backend database required." />
</svelte:head>

<div class="py-10 px-4 sm:px-6 max-w-7xl mx-auto space-y-8">
  <!-- Back navigation breadcrumb -->
  <div class="flex items-center justify-between">
    <a href="/" class="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-emerald-400 transition-colors">
      <ArrowLeft class="w-3.5 h-3.5" />
      <span>Back to Preflight Hub</span>
    </a>

    <div class="flex items-center gap-2 text-[11px] font-mono text-slate-500">
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span>100% Static WebCrypto Runtime</span>
    </div>
  </div>

  <!-- Interactive Verifier Component -->
  <CertVerifier />

  <!-- Educational Explainer Section for Agencies & Clients -->
  <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-8 max-w-4xl mx-auto space-y-4">
    <h3 class="text-base font-bold text-white font-mono flex items-center gap-2">
      <Lock class="w-4 h-4 text-emerald-400" />
      <span>How Zero-Backend WebCrypto Attestation Works</span>
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs text-slate-400 leading-relaxed font-sans">
      <div class="p-3.5 rounded-xl bg-[#090a0f] border border-[#222634] space-y-2">
        <span class="font-mono text-emerald-400 font-bold block">1. CLI Signing</span>
        <p>When an agency or CI pipeline runs <code class="text-slate-300">preflight cert</code>, the audit results, commit SHA, and sub-processor manifest are signed with the project's private Ed25519 key.</p>
      </div>

      <div class="p-3.5 rounded-xl bg-[#090a0f] border border-[#222634] space-y-2">
        <span class="font-mono text-emerald-400 font-bold block">2. Fragment URL</span>
        <p>The compact payload is Base64URL-encoded into the URL fragment hash (<code class="text-slate-300">/verify#payload...</code>). Fragment hashes are never sent to a server, ensuring 100% privacy.</p>
      </div>

      <div class="p-3.5 rounded-xl bg-[#090a0f] border border-[#222634] space-y-2">
        <span class="font-mono text-emerald-400 font-bold block">3. In-Browser Proof</span>
        <p>This static page executes <code class="text-slate-300">window.crypto.subtle</code> against the authorized public key. Any tampering with score or code immediately produces a signature error.</p>
      </div>
    </div>
  </div>
</div>
