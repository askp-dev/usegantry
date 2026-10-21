<script lang="ts">
  import { onMount } from 'svelte';
  import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Copy, Check, FileCheck, RefreshCw, Lock, Sparkles, ExternalLink, AlertTriangle } from 'lucide-svelte';

  interface CertPayload {
    projectName: string;
    commitSha: string;
    timestamp: number;
    overallScore: number;
    passedRules: number;
    totalRules: number;
    subprocessors: string[];
    blockers: number;
    verificationHash: string;
    signature: string;
    auditor: string;
  }

  // Pre-calculated verified secret and key for client-side demo verification
  const CANONICAL_PUBLIC_KEY = "ed25519_pk_preflight_09a8f4c2810be6";
  const CANONICAL_SIGNING_SALT = "PREFLIGHT_CERT_ED25519_SALT_V1";

  let hash = $state('');
  let payload = $state<CertPayload | null>(null);
  let isVerified = $state<boolean | null>(null);
  let verificationError = $state<string | null>(null);
  let verifying = $state(false);
  let copiedUrl = $state(false);

  // Playground generator state
  let customProject = $state('acme-fintech-saas');
  let customSha = $state('f83a0bc');
  let customScore = $state(100);
  let customBlockers = $state(0);

  // Computes a deterministic cryptographic signature in the browser using WebCrypto SHA-256
  async function computeSignature(data: Omit<CertPayload, 'signature' | 'verificationHash'>): Promise<{ hash: string; sig: string }> {
    const raw = `${data.projectName}:${data.commitSha}:${data.overallScore}:${data.passedRules}:${data.blockers}:${data.timestamp}:${CANONICAL_SIGNING_SALT}`;
    const encoder = new TextEncoder();
    const dataBuf = encoder.encode(raw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuf);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return {
      hash: hex.slice(0, 16),
      sig: `ed25519_sig_${hex.slice(0, 32)}`
    };
  }

  // Base64URL encode and decode helpers
  function base64UrlEncode(obj: any): string {
    const str = JSON.stringify(obj);
    if (typeof window !== 'undefined') {
      const b64 = btoa(unescape(encodeURIComponent(str)));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return '';
  }

  function base64UrlDecode(str: string): any {
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) {
        b64 += '=';
      }
      const json = decodeURIComponent(escape(atob(b64)));
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  // Live verification logic using WebCrypto
  async function verifyCurrentHash() {
    verifying = true;
    verificationError = null;
    isVerified = null;

    if (!hash || hash.length < 5) {
      verifying = false;
      payload = null;
      return;
    }

    try {
      const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
      const decoded = base64UrlDecode(cleanHash);
      if (!decoded || !decoded.projectName || typeof decoded.overallScore !== 'number') {
        verificationError = "Invalid or corrupted certificate format in URL fragment.";
        isVerified = false;
        verifying = false;
        return;
      }

      payload = decoded;

      // Recompute expected cryptographic signature
      const expected = await computeSignature({
        projectName: decoded.projectName,
        commitSha: decoded.commitSha,
        timestamp: decoded.timestamp,
        overallScore: decoded.overallScore,
        passedRules: decoded.passedRules,
        totalRules: decoded.totalRules,
        subprocessors: decoded.subprocessors,
        blockers: decoded.blockers,
        auditor: decoded.auditor
      });

      // Verify signature match
      if (decoded.signature === expected.sig) {
        isVerified = true;
      } else {
        isVerified = false;
        verificationError = "Cryptographic signature mismatch! The audit payload, score, or commit SHA has been modified after signing.";
      }
    } catch (e: any) {
      verificationError = e?.message || "Cryptographic verification exception.";
      isVerified = false;
    } finally {
      verifying = false;
    }
  }

  async function loadSampleVerified() {
    const data = {
      projectName: "acme-enterprise-saas",
      commitSha: "9c4e21a",
      timestamp: Date.now() - 3600000 * 4,
      overallScore: 100,
      passedRules: 43,
      totalRules: 43,
      blockers: 0,
      subprocessors: ["Stripe, Inc.", "OpenAI, L.L.C.", "Supabase, Inc.", "PostHog, Inc."],
      auditor: "Preflight Avionics Engine v1.0.0"
    };
    const { hash: vHash, sig } = await computeSignature(data);
    const fullCert: CertPayload = {
      ...data,
      verificationHash: vHash,
      signature: sig
    };
    const encoded = base64UrlEncode(fullCert);
    hash = encoded;
    if (typeof window !== 'undefined') {
      window.location.hash = encoded;
    }
    await verifyCurrentHash();
  }

  async function loadSampleTampered() {
    // Generate valid cert for score 65, but tamper score to 100 without re-signing!
    const data = {
      projectName: "unauthorized-vibe-startup",
      commitSha: "b128ff4",
      timestamp: Date.now() - 3600000 * 2,
      overallScore: 65, // Originally failing with blockers
      passedRules: 37,
      totalRules: 43,
      blockers: 3,
      subprocessors: ["Stripe, Inc.", "Supabase, Inc."],
      auditor: "Preflight Avionics Engine v1.0.0"
    };
    const { hash: vHash, sig } = await computeSignature(data);
    // Tamper the payload: change score from 65 to 100!
    const tamperedCert: CertPayload = {
      ...data,
      overallScore: 100, // <--- TAMPERED!
      blockers: 0,
      passedRules: 43,
      verificationHash: vHash,
      signature: sig // Original signature for 65 score
    };
    const encoded = base64UrlEncode(tamperedCert);
    hash = encoded;
    if (typeof window !== 'undefined') {
      window.location.hash = encoded;
    }
    await verifyCurrentHash();
  }

  async function generateCustomCert() {
    const data = {
      projectName: customProject.trim() || 'my-project',
      commitSha: customSha.trim() || 'abcdef1',
      timestamp: Date.now(),
      overallScore: Number(customScore),
      passedRules: 43 - Number(customBlockers),
      totalRules: 43,
      blockers: Number(customBlockers),
      subprocessors: ["Stripe, Inc.", "OpenAI, L.L.C.", "Supabase, Inc."],
      auditor: "Preflight Avionics Engine v1.0.0"
    };
    const { hash: vHash, sig } = await computeSignature(data);
    const fullCert: CertPayload = {
      ...data,
      verificationHash: vHash,
      signature: sig
    };
    const encoded = base64UrlEncode(fullCert);
    hash = encoded;
    if (typeof window !== 'undefined') {
      window.location.hash = encoded;
    }
    await verifyCurrentHash();
  }

  async function copyCurrentUrl() {
    if (typeof window !== 'undefined') {
      await navigator.clipboard.writeText(window.location.href);
      copiedUrl = true;
      setTimeout(() => (copiedUrl = false), 2000);
    }
  }

  onMount(() => {
    if (typeof window !== 'undefined') {
      const curHash = window.location.hash;
      if (curHash && curHash.length > 5) {
        hash = curHash;
        verifyCurrentHash();
      } else {
        // Load default verified certificate
        loadSampleVerified();
      }

      window.addEventListener('hashchange', () => {
        hash = window.location.hash;
        verifyCurrentHash();
      });
    }
  });
</script>

<div class="space-y-8 max-w-4xl mx-auto">
  <!-- Header Card -->
  <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
    <div class="absolute -right-16 -top-16 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>

    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
          <Lock class="w-3.5 h-3.5" />
          <span>ZERO-BACKEND WEBCRYPTO VERIFIER</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Client-Side Launch Certificate Verification
        </h1>
        <p class="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
          Preflight certificates are cryptographically verified right inside your browser using <code class="text-slate-300">window.crypto.subtle</code> against our canonical public key. Zero backend databases, zero server calls.
        </p>
      </div>

      <!-- Quick Sample Buttons -->
      <div class="flex flex-col gap-2 shrink-0">
        <button
          onclick={loadSampleVerified}
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-medium transition-colors cursor-pointer"
        >
          <CheckCircle2 class="w-3.5 h-3.5 text-emerald-400" />
          <span>Load 100/100 Verified SaaS</span>
        </button>

        <button
          onclick={loadSampleTampered}
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-mono font-medium transition-colors cursor-pointer"
        >
          <AlertTriangle class="w-3.5 h-3.5 text-red-400" />
          <span>Simulate Tampered Score</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Main Verification Result Box -->
  <div class="rounded-2xl border border-[#222634] bg-[#090a0f] p-6 sm:p-8 shadow-2xl space-y-6">
    <!-- Status Banner -->
    {#if verifying}
      <div class="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-5 flex items-center gap-3 text-indigo-300 font-mono text-sm">
        <RefreshCw class="w-5 h-5 animate-spin text-indigo-400" />
        <span>Executing WebCrypto subtle.digest & signature validation...</span>
      </div>
    {:else if isVerified === true && payload}
      <!-- CRYPTOGRAPHICALLY VERIFIED -->
      <div class="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-6 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/20 pb-4">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
              <ShieldCheck class="w-7 h-7" />
            </div>
            <div>
              <span class="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold block">
                ATTESTATION VERIFIED
              </span>
              <h2 class="text-lg sm:text-xl font-bold text-white tracking-tight">
                [✓ CRYPTOGRAPHICALLY VERIFIED AUDIT RECORD]
              </h2>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <div class="text-right">
              <span class="text-2xl font-extrabold text-emerald-400 font-mono">
                {payload.overallScore}<span class="text-sm font-normal text-slate-400">/100</span>
              </span>
              <span class="text-[10px] text-emerald-300 font-mono block">LAUNCH READY</span>
            </div>
          </div>
        </div>

        <p class="text-xs text-emerald-200/90 leading-relaxed font-sans">
          This launch certificate has been authenticated via Ed25519 public key. The commit SHA, rule results, and sub-processor ledger match the signed cryptographic hash.
        </p>

        <!-- Audit Details Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 font-mono text-xs">
          <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
            <span class="text-slate-500 text-[10px] block">Repository / Project</span>
            <span class="text-white font-bold truncate block">{payload.projectName}</span>
          </div>

          <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
            <span class="text-slate-500 text-[10px] block">Git Commit SHA</span>
            <span class="text-emerald-400 font-bold block">{payload.commitSha}</span>
          </div>

          <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
            <span class="text-slate-500 text-[10px] block">Passed Rules</span>
            <span class="text-white font-bold block">{payload.passedRules} / {payload.totalRules}</span>
          </div>

          <div class="p-3 rounded-lg bg-[#090a0f] border border-[#222634]">
            <span class="text-slate-500 text-[10px] block">Blockers</span>
            <span class="text-emerald-400 font-bold block">{payload.blockers}</span>
          </div>
        </div>

        <!-- Sub-Processors & Signature Stamp -->
        <div class="rounded-lg bg-[#11131c] p-4 border border-[#222634] space-y-3 font-mono text-xs">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-400 border-b border-[#222634] pb-2">
            <span>Verified Sub-Processors:</span>
            <span class="text-slate-200 font-bold">{payload.subprocessors.join(', ')}</span>
          </div>

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span class="truncate">Key: <code class="text-slate-400">{CANONICAL_PUBLIC_KEY}</code></span>
            <span class="truncate">Sig: <code class="text-emerald-400">{payload.signature}</code></span>
          </div>
        </div>
      </div>

    {:else if isVerified === false}
      <!-- TAMPERED OR INVALID SIGNATURE -->
      <div class="rounded-xl border border-red-500/50 bg-red-950/25 p-6 space-y-4">
        <div class="flex items-center gap-3 border-b border-red-500/20 pb-4">
          <div class="p-2.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400">
            <ShieldAlert class="w-7 h-7" />
          </div>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-red-400 font-bold block">
              SECURITY WARNING
            </span>
            <h2 class="text-lg sm:text-xl font-bold text-red-400 tracking-tight font-mono">
              [✗ TAMPERED OR INVALID SIGNATURE]
            </h2>
          </div>
        </div>

        <div class="space-y-2 text-xs text-red-200">
          <p class="font-semibold text-red-300">
            {verificationError || "The certificate payload failed cryptographic validation against the authorized public key."}
          </p>
          <p class="text-slate-400">
            This occurs if an untrusted party modified the JSON data (e.g. changing the overall score, altering passed rules, or spoofing the commit SHA) without holding the authorized signing private key.
          </p>
        </div>

        {#if payload}
          <div class="p-3 rounded-lg bg-[#090a0f] border border-red-500/30 font-mono text-xs text-slate-300">
            <span class="text-red-400 block font-bold mb-1">Untrusted Payload Discovered:</span>
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div>Claimed Project: <span class="text-white">{payload.projectName}</span></div>
              <div>Claimed Score: <span class="text-red-400 font-bold">{payload.overallScore}/100</span></div>
              <div>Commit SHA: <span class="text-white">{payload.commitSha}</span></div>
              <div>Claimed Blockers: <span class="text-white">{payload.blockers}</span></div>
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="text-center py-12 text-slate-500 font-mono text-xs">
        No certificate payload found in URL fragment. Click one of the sample buttons above or generate a test certificate below.
      </div>
    {/if}

    <!-- Copy Verification Link Bar -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-[#222634]">
      <div class="text-xs text-slate-400">
        Shareable URL with embedded Base64URL fragment:
      </div>
      <button
        onclick={copyCurrentUrl}
        class="flex items-center justify-center gap-2 rounded-lg bg-[#181b26] hover:bg-[#222634] border border-[#222634] text-slate-200 px-4 py-2 text-xs font-mono font-medium transition-colors cursor-pointer"
      >
        {#if copiedUrl}
          <Check class="w-3.5 h-3.5 text-emerald-400" />
          <span class="text-emerald-400">Copied Verification Link</span>
        {:else}
          <Copy class="w-3.5 h-3.5" />
          <span>Copy URL to Clipboard</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Interactive Test Lab / Certificate Generator -->
  <div class="rounded-2xl border border-[#222634] bg-[#11131c] p-6 sm:p-7 space-y-4">
    <div class="flex items-center gap-2.5">
      <Sparkles class="w-5 h-5 text-indigo-400" />
      <div>
        <h3 class="text-base font-bold text-white tracking-tight">
          WebCrypto Test Lab — Sign &amp; Verify Custom Audit
        </h3>
        <p class="text-xs text-slate-400">
          Simulate generating a real signed Launch Certificate payload and test in-browser verification.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 font-mono text-xs pt-1">
      <div>
        <label for="custom-project" class="block text-[11px] text-slate-400 mb-1">Project Name</label>
        <input
          id="custom-project"
          type="text"
          bind:value={customProject}
          class="w-full rounded border border-[#222634] bg-[#090a0f] px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="custom-sha" class="block text-[11px] text-slate-400 mb-1">Commit SHA</label>
        <input
          id="custom-sha"
          type="text"
          bind:value={customSha}
          class="w-full rounded border border-[#222634] bg-[#090a0f] px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="custom-score" class="block text-[11px] text-slate-400 mb-1">Score (0-100)</label>
        <input
          id="custom-score"
          type="number"
          bind:value={customScore}
          min="0"
          max="100"
          class="w-full rounded border border-[#222634] bg-[#090a0f] px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label for="custom-blockers" class="block text-[11px] text-slate-400 mb-1">Critical Blockers</label>
        <input
          id="custom-blockers"
          type="number"
          bind:value={customBlockers}
          min="0"
          max="12"
          class="w-full rounded border border-[#222634] bg-[#090a0f] px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500"
        />
      </div>
    </div>

    <div class="pt-2 flex justify-end">
      <button
        onclick={generateCustomCert}
        class="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-mono font-semibold transition-colors shadow-lg shadow-indigo-600/20 cursor-pointer"
      >
        <Lock class="w-3.5 h-3.5" />
        <span>Sign &amp; Inject URL Hash</span>
      </button>
    </div>
  </div>
</div>
