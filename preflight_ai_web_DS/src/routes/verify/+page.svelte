<script lang="ts">
	import { Fingerprint, ShieldCheck, Lock, ArrowUpRight, ScanLine, Terminal } from 'lucide-svelte';
	import CertVerifier from '#lib/components/CertVerifier.svelte';
	import { site, install } from '#lib/config';
	import CopyButton from '#lib/components/CopyButton.svelte';
</script>

<svelte:head>
	<title>Verify a Launch Certificate — Preflight</title>
	<meta
		name="description"
		content="Verify a Preflight Launch Certificate entirely in your browser with Ed25519 WebCrypto. Zero backend, zero upload, zero trust required."
	/>
	<link rel="canonical" href={`${site.domain}/verify/`} />
</svelte:head>

<section class="hero-glow relative overflow-hidden border-b border-[#222634]/60">
	<div class="grid-bg mask-fade-b pointer-events-none absolute inset-0 opacity-45" aria-hidden="true"></div>
	<div class="wrap relative py-10 sm:py-14">
		<nav class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide text-[#64748b]" aria-label="Breadcrumb">
			<a href="/" class="hover:text-emerald-300">Home</a>
			<span class="text-[#2d3242]">/</span>
			<span class="text-[#cbd5e1]">Verify</span>
		</nav>

		<div class="mt-5 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
			<div class="max-w-2xl">
				<div class="flex flex-wrap items-center gap-2">
					<span class="pill pill-ready"><Lock class="h-2.5 w-2.5" />zero-backend</span>
					<span class="pill"><Fingerprint class="h-2.5 w-2.5" />Ed25519 WebCrypto</span>
					<span class="pill">no upload</span>
				</div>
				<h1 class="mt-4 text-balance text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] text-white sm:text-[44px]">
					Verify a Launch Certificate.
				</h1>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					The audit payload lives in the URL fragment. Your browser verifies the Ed25519
					signature locally against Preflight’s public key — no database, no API call, no trust
					me.
				</p>
			</div>

			<div class="hidden shrink-0 items-center gap-2 font-mono text-[9px] text-[#64748b] lg:flex">
				<span class="flex items-center gap-1"><ShieldCheck class="h-3 w-3 text-emerald-500" />43-check attestation</span>
				<span class="text-[#2d3242]">/</span>
				<span class="flex items-center gap-1"><ScanLine class="h-3 w-3 text-emerald-500" />client-side only</span>
			</div>
		</div>
	</div>
</section>

<section class="py-6 sm:py-8">
	<div class="wrap">
		<CertVerifier />
	</div>
</section>

<section class="border-t border-[#222634]/60 py-10">
	<div class="wrap grid gap-3 sm:grid-cols-3">
		<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-4">
			<div class="mono-label text-[9px] text-[#cbd5e1]">For clients</div>
			<p class="mt-1.5 text-[10.5px] leading-relaxed text-[#94a3b8]">
				Click the verification link in your PDF or HTML certificate. A green stamp means the
				record is authentic and the repository cleared all 43 checks.
			</p>
		</div>
		<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-4">
			<div class="mono-label text-[9px] text-[#cbd5e1]">For agencies</div>
			<p class="mt-1.5 text-[10.5px] leading-relaxed text-[#94a3b8]">
				Export the certificate from the CLI or extension. The signed fragment travels with the
				document and verifies forever — even if Preflight is offline.
			</p>
		</div>
		<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-4">
			<div class="mono-label mb-1.5 text-[9px] text-[#cbd5e1]">Generate your own</div>
			<div class="flex items-center gap-2 rounded border border-[#222634] bg-[#08090d] px-2 py-1.5">
				<Terminal class="h-3 w-3 shrink-0 text-emerald-400" />
				<code class="min-w-0 flex-1 truncate font-mono text-[9.5px] text-[#cbd5e1]">{install.quick.replace('scan', 'cert')}</code>
				<CopyButton text={install.quick.replace('scan', 'cert')} compact label="" ariaLabel="Copy certificate command" />
			</div>
		</div>
	</div>

	<div class="wrap mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#222634] pt-4 font-mono text-[9px] text-[#64748b]">
		<span>Static hosting by GitHub Pages · no server logic · no cookies</span>
		<a href="/rules/" class="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
			See what gets attested <ArrowUpRight class="h-2.5 w-2.5" />
		</a>
	</div>
</section>
