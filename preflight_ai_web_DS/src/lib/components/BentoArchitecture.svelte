<script lang="ts">
	import {
		Shield,
		Scale,
		Flame,
		Crosshair,
		FileBadge,
		Cpu,
		ArrowUpRight,
		Check,
		AlertTriangle,
		Database,
		Fingerprint,
		CloudOff
	} from 'lucide-svelte';

	const probes = [
		{ id: 'PT-01', label: 'REST dump', state: 'BLOCKED' },
		{ id: 'PT-02', label: 'Mutation replay', state: 'BLOCKED' },
		{ id: 'PT-03', label: 'IDOR tamper', state: 'BLOCKED' },
		{ id: 'PT-04', label: 'Forged webhook', state: 'EXPLOITED' },
		{ id: 'PT-05', label: 'Prompt burst', state: 'BLOCKED' },
		{ id: 'PT-06', label: 'Source-map scrape', state: 'BLOCKED' }
	];
</script>

<section id="architecture" class="relative border-t border-[#222634]/60 py-16 sm:py-20">
	<div class="wrap">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-2xl">
				<div class="mb-3 flex items-center gap-2">
					<span class="h-px w-6 bg-emerald-500/60"></span>
					<span class="mono-label text-emerald-400">Mission systems</span>
				</div>
				<h2
					class="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-white sm:text-[38px]"
				>
					Six subsystems. One launch gate.
				</h2>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					A deterministic instrument panel for the exact failure modes AI code generators
					produce — not a generic linter with a compliance sticker.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2 font-mono text-[10px] text-[#64748b]">
				<span class="pill pill-ready"><Check class="h-2.5 w-2.5" />No LLM in the pass path</span>
			</div>
		</div>

		<div
			class="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-[#222634] bg-[#222634] lg:grid-cols-12"
		>
			<!-- 1. Security -->
			<a
				href="/rules/?category=Security#rule-SEC-01"
				class="card-hover group relative flex flex-col bg-[#0f111a] p-5 sm:p-6 lg:col-span-7"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-400"
						>
							<Shield class="h-4 w-4" />
						</span>
						<div>
							<div class="mono-label text-[#cbd5e1]">AI-footgun security scanner</div>
							<div class="mt-1 font-mono text-[9px] text-[#64748b]">SEC-01 → SEC-12</div>
						</div>
					</div>
					<span class="pill pill-block">12 checks</span>
				</div>

				<h3 class="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white sm:text-[17px]">
					Catches the tenant leak your agent just shipped.
				</h3>
				<p class="mt-1.5 max-w-xl text-[11.5px] leading-relaxed text-[#94a3b8]">
					AST matching for unscoped Prisma writes, permissive RLS policies, public env secrets,
					unverified webhooks and wallet-drain routes.
				</p>

				<div class="mt-4 overflow-hidden rounded-lg border border-[#2a2f3e] bg-[#0a0c12]">
					<div class="flex items-center justify-between border-b border-[#222634] px-2.5 py-1.5">
						<span class="font-mono text-[9px] text-[#94a3b8]">src/actions/documents.ts:42</span>
						<span class="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold text-red-300">SEC-03</span>
					</div>
					<div class="overflow-x-auto p-2.5 font-mono text-[9.5px] leading-[1.8]">
						<div class="flex gap-3 text-[#64748b]"><span class="w-3 text-right">41</span><span>await prisma.documents.update(&#123;</span></div>
						<div class="flex gap-3 bg-red-500/[0.08] text-[#fecaca]"><span class="w-3 text-right text-[#7f1d1d]">42</span><span>  where: &#123; id: input.id &#125;, <span class="ml-2 text-[8px] uppercase text-red-400">← no tenant scope</span></span></div>
						<div class="flex gap-3 text-[#64748b]"><span class="w-3 text-right">43</span><span>  data: &#123; title: input.title &#125;</span></div>
						<div class="flex gap-3 text-[#64748b]"><span class="w-3 text-right">44</span><span>&#125;);</span></div>
						<div class="mt-1 h-px bg-[#222634]"></div>
						<div class="mt-1 flex gap-3 bg-emerald-500/[0.07] text-[#a7f3d0]"><span class="w-3 text-right text-emerald-700">42</span><span>  where: &#123; id: input.id, <span class="text-emerald-300">userId: session.user.id</span> &#125;,</span></div>
					</div>
					<div class="flex flex-wrap items-center gap-1.5 border-t border-[#222634] px-2.5 py-1.5">
						<span class="rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] text-emerald-300">IDOR blocked</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[8px] text-[#94a3b8]">migration generated</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[8px] text-[#94a3b8]">agent patch ready</span>
					</div>
				</div>

				<div class="mt-auto flex items-center gap-1.5 pt-3 font-mono text-[9.5px] text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
					Inspect the rule <ArrowUpRight class="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</div>
			</a>

			<!-- 2. Legal -->
			<a
				href="/rules/?category=EULA%20%26%20Legal#rule-LEG-04"
				class="card-hover group relative flex flex-col bg-[#0f111a] p-5 sm:p-6 lg:col-span-5"
			>
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-indigo-500/25 bg-indigo-500/10 text-indigo-300"
						>
							<Scale class="h-4 w-4" />
						</span>
						<div>
							<div class="mono-label text-[#cbd5e1]">Legal &amp; EULA engine</div>
							<div class="mt-1 font-mono text-[9px] text-[#64748b]">LEG-01 → LEG-06</div>
						</div>
					</div>
					<span class="pill pill-agent">6 checks</span>
				</div>

				<h3 class="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white sm:text-[17px]">
					Code-bound legal docs that can’t drift.
				</h3>
				<p class="mt-1.5 text-[11.5px] leading-relaxed text-[#94a3b8]">
					<span class="font-mono text-[10.5px] text-[#cbd5e1]">package.json</span> compiles
					directly into the sub-processor table, clickwrap trail and EULA schedule.
				</p>

				<div class="mt-4 space-y-2 rounded-lg border border-[#2a2f3e] bg-[#0a0c12] p-2.5">
					<div class="flex items-center gap-1.5 font-mono text-[8.5px]">
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 text-[#cbd5e1]">stripe</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 text-[#cbd5e1]">openai</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 text-[#cbd5e1]">supabase</span>
						<span class="text-[#475569]">→</span>
						<span class="rounded border border-indigo-500/25 bg-indigo-500/10 px-1.5 py-0.5 text-indigo-300">legal/*.md</span>
					</div>

					<div class="overflow-hidden rounded border border-[#222634] bg-[#0c0e15]">
						<div class="flex items-center justify-between border-b border-[#222634] px-2 py-1">
							<span class="font-mono text-[8.5px] text-[#94a3b8]">privacy-policy.md</span>
							<span class="font-mono text-[8px] text-emerald-400">+4 −0</span>
						</div>
						<div class="space-y-0.5 p-2 font-mono text-[8.5px] leading-[1.7]">
							<div class="text-[#64748b]">&lt;!-- PREFLIGHT:AUTO:SUBPROCESSORS --&gt;</div>
							<div class="rounded-sm bg-emerald-500/[0.08] px-1 text-emerald-300">+ | Stripe, Inc. | Payments | PCI DSS L1 |</div>
							<div class="rounded-sm bg-emerald-500/[0.08] px-1 text-emerald-300">+ | OpenAI, L.L.C. | AI inference | DPA |</div>
							<div class="rounded-sm bg-emerald-500/[0.08] px-1 text-emerald-300">+ | Supabase, Inc. | Auth + DB | SOC 2 |</div>
						</div>
						<div class="flex items-center justify-between border-t border-[#222634] px-2 py-1 font-mono text-[8px]">
							<span class="text-[#64748b]">CURRENT_LEGAL_VERSION</span>
							<span class="text-emerald-300">1.5.0</span>
						</div>
					</div>
				</div>

				<div class="mt-auto flex items-center gap-1.5 pt-3 font-mono text-[9.5px] text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
					See sub-processor drift <ArrowUpRight class="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</div>
			</a>

			<!-- 3. FinOps -->
			<a
				href="/rules/?category=FinOps%20%26%20Payments#rule-FIN-01"
				class="card-hover group relative flex flex-col bg-[#0f111a] p-5 sm:p-6 lg:col-span-4"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-amber-500/25 bg-amber-500/10 text-amber-400"
						>
							<Flame class="h-4 w-4" />
						</span>
						<div>
							<div class="mono-label text-[#cbd5e1]">Anti-bankruptcy FinOps</div>
							<div class="mt-1 font-mono text-[9px] text-[#64748b]">FIN / PAY / OPS</div>
						</div>
					</div>
					<span class="pill pill-warn">12 checks</span>
				</div>

				<h3 class="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white">
					Stops the $14k overnight bill.
				</h3>

				<div class="mt-4 rounded-lg border border-[#2a2f3e] bg-[#0a0c12] p-2.5">
					<div class="flex items-center justify-between font-mono text-[8px] uppercase tracking-wide text-[#64748b]">
						<span>LLM spend · 02:00 → 04:12</span>
						<span class="text-red-400">runaway</span>
					</div>
					<svg viewBox="0 0 220 68" class="mt-1.5 h-[68px] w-full" preserveAspectRatio="none" aria-hidden="true">
						<defs>
							<linearGradient id="burnFill" x1="0" x2="0" y1="0" y2="1">
								<stop offset="0%" stop-color="#ef4444" stop-opacity="0.35" />
								<stop offset="100%" stop-color="#ef4444" stop-opacity="0" />
							</linearGradient>
						</defs>
						<path d="M0 64 L30 62 L55 61 L78 60 L96 57 L112 50 L128 40 L145 28 L160 18 L178 10 L198 5 L220 2 L220 68 L0 68 Z" fill="url(#burnFill)" />
						<path d="M0 64 L30 62 L55 61 L78 60 L96 57 L112 50 L128 40 L145 28 L160 18 L178 10 L198 5 L220 2" fill="none" stroke="#ef4444" stroke-width="1.5" />
						<circle cx="220" cy="2" r="2.5" fill="#ef4444" />
					</svg>
					<div class="mt-1 flex items-end justify-between">
						<div>
							<div class="font-mono text-[18px] font-extrabold leading-none text-white">$14,203</div>
							<div class="mt-0.5 font-mono text-[8px] text-[#64748b]">projected by 04:12 UTC</div>
						</div>
						<div class="text-right">
							<div class="font-mono text-[9px] font-bold text-amber-300">1,240×</div>
							<div class="font-mono text-[8px] text-[#64748b]">effect fires</div>
						</div>
					</div>
					<div class="mt-2 flex items-center gap-1 border-t border-[#222634] pt-1.5 font-mono text-[8px]">
						<span class="rounded bg-red-500/10 px-1.5 py-0.5 text-red-300">FIN-01</span>
						<span class="text-[#64748b]">useEffect → fetch → setState → deps</span>
					</div>
				</div>

				<div class="mt-auto flex items-center gap-1.5 pt-3 font-mono text-[9.5px] text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
					View burn guard <ArrowUpRight class="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</div>
			</a>

			<!-- 4. Pentest -->
			<a
				href="/rules/?category=Active%20Pentest#rule-PT-04"
				class="card-hover group relative flex flex-col bg-[#0f111a] p-5 sm:p-6 lg:col-span-4"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 text-red-400"
						>
							<Crosshair class="h-4 w-4" />
						</span>
						<div>
							<div class="mono-label text-[#cbd5e1]">AST-guided pentester</div>
							<div class="mt-1 font-mono text-[9px] text-[#64748b]">PT-01 → PT-06</div>
						</div>
					</div>
					<span class="pill pill-block">6 probes</span>
				</div>

				<h3 class="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white">
					Proves the exploit, not just the smell.
				</h3>

				<div class="mt-4 space-y-1 rounded-lg border border-[#2a2f3e] bg-[#0a0c12] p-2">
					{#each probes as probe (probe.id)}
						<div class="flex items-center gap-2 rounded px-1 py-1 font-mono text-[8.5px] {probe.state === 'EXPLOITED' ? 'bg-red-500/[0.09]' : ''}">
							<span class="w-9 text-[8px] text-[#64748b]">{probe.id}</span>
							<span class="min-w-0 flex-1 truncate text-[#94a3b8]">{probe.label}</span>
							{#if probe.state === 'EXPLOITED'}
								<span class="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[7.5px] font-bold text-red-300">
									<span class="h-1 w-1 rounded-full bg-red-400"></span>EXPLOITED
								</span>
							{:else}
								<span class="flex items-center gap-1 text-[7.5px] text-emerald-400"><Check class="h-2 w-2" />BLOCKED</span>
							{/if}
						</div>
					{/each}
				</div>

				<div class="mt-auto flex items-center gap-1.5 pt-3 font-mono text-[9.5px] text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
					Fire live probes <ArrowUpRight class="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</div>
			</a>

			<!-- 5. Vendor pack -->
			<a
				href="/verify/"
				class="card-hover group relative flex flex-col bg-[#0f111a] p-5 sm:p-6 lg:col-span-4"
			>
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-2.5">
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
						>
							<FileBadge class="h-4 w-4" />
						</span>
						<div>
							<div class="mono-label text-[#cbd5e1]">B2B vendor pack</div>
							<div class="mt-1 font-mono text-[9px] text-[#64748b]">cert + SBOM + RoPA</div>
						</div>
					</div>
					<span class="pill pill-ready">signed</span>
				</div>

				<h3 class="mt-4 text-[16px] font-semibold tracking-[-0.02em] text-white">
					Close the enterprise deal in one PDF.
				</h3>

				<div class="relative mt-4 overflow-hidden rounded-lg border border-emerald-500/20 bg-[#0a0c12] p-2.5">
					<div class="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
						<Fingerprint class="h-4 w-4 text-emerald-400" />
					</div>
					<div class="mono-label text-[8px] text-[#64748b]">Launch certificate</div>
					<div class="mt-1 font-mono text-[11px] font-bold text-white">acme-saas</div>
					<div class="mt-0.5 font-mono text-[8px] text-[#64748b]">commit 9c4e21a · 2026-10-20</div>

					<div class="mt-2 flex items-end gap-2 border-t border-[#222634] pt-2">
						<span class="font-mono text-[24px] font-extrabold leading-none text-emerald-400">100</span>
						<span class="pb-0.5 font-mono text-[8px] text-[#64748b]">/100 · 43/43 passed</span>
					</div>

					<div class="mt-2 flex flex-wrap gap-1">
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[7.5px] text-[#94a3b8]">SBOM.json</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[7.5px] text-[#94a3b8]">DATA_FLOW.mermaid</span>
						<span class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[7.5px] text-[#94a3b8]">RoPA</span>
					</div>
					<div class="mt-2 flex items-center gap-1 font-mono text-[7.5px] text-emerald-400/80">
						<Fingerprint class="h-2.5 w-2.5" /> Ed25519 · offline verifiable
					</div>
				</div>

				<div class="mt-auto flex items-center gap-1.5 pt-3 font-mono text-[9.5px] text-emerald-400 opacity-80 transition-opacity group-hover:opacity-100">
					Verify a certificate <ArrowUpRight class="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
				</div>
			</a>

			<!-- 6. Local-first rail -->
			<div class="flex flex-col gap-4 bg-[#0b0d14] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:col-span-12">
				<div class="flex items-center gap-3">
					<span class="flex h-9 w-9 items-center justify-center rounded-md border border-[#222634] bg-[#11131c]">
						<Cpu class="h-4 w-4 text-emerald-400" />
					</span>
					<div>
						<div class="mono-label text-[#cbd5e1]">Local-first execution</div>
						<div class="mt-1 text-[10.5px] text-[#64748b]">
							Your source never touches a Preflight server. Ever.
						</div>
					</div>
					<span class="pill pill-ready ml-1 hidden sm:inline-flex">
						<CloudOff class="h-2.5 w-2.5" />0 bytes uploaded
					</span>
				</div>

				<div class="grid grid-cols-2 gap-x-6 gap-y-2 font-mono sm:grid-cols-4 sm:gap-x-8">
					<div>
						<div class="text-[15px] font-bold text-white">43</div>
						<div class="text-[8px] uppercase tracking-wide text-[#64748b]">deterministic checks</div>
					</div>
					<div>
						<div class="text-[15px] font-bold text-white">&lt;1.1s</div>
						<div class="text-[8px] uppercase tracking-wide text-[#64748b]">cold execution</div>
					</div>
					<div>
						<div class="text-[15px] font-bold text-white">250+</div>
						<div class="text-[8px] uppercase tracking-wide text-[#64748b]">SDKs mapped</div>
					</div>
					<div>
						<div class="flex items-center gap-1 text-[15px] font-bold text-emerald-400">
							<Database class="h-3.5 w-3.5" />37
						</div>
						<div class="text-[8px] uppercase tracking-wide text-[#64748b]">static rules</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
