<script lang="ts">
	import {
		ArrowRight,
		ArrowUpRight,
		Check,
		ChevronRight,
		Cpu,
		Database,
		Fingerprint,
		Gauge,
		GitBranch,
		ShieldCheck,
		Sparkles,
		Terminal,
		Zap
	} from 'lucide-svelte';
	import HeroTerminal from '#lib/components/HeroTerminal.svelte';
	import OsDownloadBar from '#lib/components/OsDownloadBar.svelte';
	import BentoArchitecture from '#lib/components/BentoArchitecture.svelte';
	import RuleExplorer from '#lib/components/RuleExplorer.svelte';
	import McpSetup from '#lib/components/McpSetup.svelte';
	import Pricing from '#lib/components/Pricing.svelte';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import { install, site } from '#lib/config';

	const stacks = [
		'Next.js 15',
		'SvelteKit',
		'Supabase',
		'Prisma',
		'Drizzle',
		'Stripe',
		'OpenAI',
		'Claude',
		'Clerk',
		'PostHog',
		'Vercel',
		'Firebase'
	];

	const steps = [
		{
			n: '01',
			icon: Cpu,
			title: 'Index the repo',
			body: 'Parse the AST, SQL migrations, lockfiles, env vars and route map into a RepoContext — in roughly 150ms.',
			code: '$ preflight context',
			meta: 'no build step'
		},
		{
			n: '02',
			icon: Gauge,
			title: 'Score the blast radius',
			body: '43 deterministic checks across security, privacy, legal and FinOps. CRITICAL findings block the launch certificate.',
			code: '$ preflight scan',
			meta: '37 static + 6 probes'
		},
		{
			n: '03',
			icon: Sparkles,
			title: 'Hand the fix to your agent',
			body: 'Every finding ships with an exact MCP prompt and a patched diff. Cursor or Claude applies it in one commit.',
			code: '$ preflight fix --all',
			meta: 'agent-ready'
		}
	];
</script>

<svelte:head>
	<title>Preflight — the compliance, security &amp; FinOps engine for AI-built software</title>
	<meta
		name="description"
		content="43 deterministic checks in under 1.1 seconds. Catch missing Supabase RLS, slopsquatted packages, AGPL traps, infinite token loops and stale legal docs before launch."
	/>
	<meta property="og:title" content="Preflight — clear the runway before you ship" />
	<meta
		property="og:description"
		content="43 deterministic security, legal and FinOps checks for AI-built software. Under 1.1 seconds. Zero cloud upload."
	/>
	<link rel="canonical" href={site.domain} />
</svelte:head>

<!-- ============================================================ -->
<!-- HERO                                                         -->
<!-- ============================================================ -->
<section id="download" class="hero-glow relative overflow-hidden">
	<div class="grid-bg mask-fade-b pointer-events-none absolute inset-0 opacity-60" aria-hidden="true"></div>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
		aria-hidden="true"
	></div>

	<div class="wrap relative grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:py-16 xl:gap-14">
		<!-- Copy + install -->
		<div class="min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<span class="pill pill-ready">
					<span class="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
					43 deterministic checks
				</span>
				<span class="pill">
					<span class="text-emerald-400">&lt;1.1s</span> execution
				</span>
				<span class="pill">
					<span class="text-emerald-400">0</span> cloud upload
				</span>
			</div>

			<h1
				class="mt-5 text-balance text-[36px] font-extrabold leading-[1.02] tracking-[-0.045em] text-white sm:text-[46px] lg:text-[50px] xl:text-[54px]"
			>
				The pre-flight compliance, security &amp; FinOps engine for
				<span class="text-emerald-400">AI-built software.</span>
			</h1>

			<p class="mt-4 max-w-xl text-pretty text-[13.5px] leading-relaxed text-[#94a3b8] sm:text-[14.5px]">
				Catch missing Supabase RLS, hallucinated packages, AGPL license traps, infinite token
				loops and stale EULA/Privacy Policies inside Cursor &amp; Claude Code — before you launch.
			</p>

			<div class="mt-6">
				<OsDownloadBar />
			</div>

			<div
				class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[9.5px] text-[#64748b]"
			>
				<span class="flex items-center gap-1"><Check class="h-3 w-3 text-emerald-500" />MIT core</span>
				<span class="flex items-center gap-1"><Check class="h-3 w-3 text-emerald-500" />Read-only by default</span>
				<span class="flex items-center gap-1"><Check class="h-3 w-3 text-emerald-500" />No telemetry</span>
				<span class="flex items-center gap-1"><Check class="h-3 w-3 text-emerald-500" />Node 20+ / Bun</span>
			</div>
		</div>

		<!-- Terminal -->
		<div class="relative min-w-0">
			<span class="pointer-events-none absolute -left-2 -top-2 hidden h-4 w-4 border-l border-t border-emerald-500/35 sm:block"></span>
			<span class="pointer-events-none absolute -right-2 -top-2 hidden h-4 w-4 border-r border-t border-emerald-500/35 sm:block"></span>
			<span class="pointer-events-none absolute -bottom-2 -left-2 hidden h-4 w-4 border-b border-l border-emerald-500/35 sm:block"></span>
			<span class="pointer-events-none absolute -bottom-2 -right-2 hidden h-4 w-4 border-b border-r border-emerald-500/35 sm:block"></span>
			<HeroTerminal />
		</div>
	</div>

	<!-- Stack strip -->
	<div class="relative border-y border-[#222634]/80 bg-[#0a0b11]/70">
		<div class="wrap flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
			<div class="mono-label shrink-0 text-[9px] text-[#64748b]">
				Scans the stacks agents generate
			</div>
			<div class="flex flex-wrap items-center gap-1.5">
				{#each stacks as stack (stack)}
					<span
						class="rounded border border-[#222634] bg-[#11131c] px-1.5 py-0.5 font-mono text-[9px] text-[#94a3b8]"
						>{stack}</span
					>
				{/each}
			</div>
			<a
				href="/rules/"
				class="ml-auto hidden shrink-0 items-center gap-1 font-mono text-[9.5px] text-[#64748b] transition-colors hover:text-emerald-300 sm:inline-flex"
			>
				View registry <ChevronRight class="h-3 w-3" />
			</a>
		</div>
	</div>
</section>

<!-- ============================================================ -->
<!-- HOW IT WORKS                                                 -->
<!-- ============================================================ -->
<section id="how-it-works" class="border-t border-[#222634]/40 py-16 sm:py-20">
	<div class="wrap">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-2xl">
				<div class="mb-3 flex items-center gap-2">
					<span class="h-px w-6 bg-emerald-500/60"></span>
					<span class="mono-label text-emerald-400">Mission sequence</span>
				</div>
				<h2
					class="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-white sm:text-[38px]"
				>
					Three moves from shipped to cleared.
				</h2>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					No LLM judgment in the pass/fail path. Every verdict is reproducible, diffable and
					explainable to a client.
				</p>
			</div>
			<div class="flex items-center gap-2">
				<span class="pill pill-ready"><Zap class="h-2.5 w-2.5" />Deterministic</span>
				<span class="pill">Offline</span>
			</div>
		</div>

		<div class="relative mt-8 grid gap-3 lg:grid-cols-3">
			<div
				class="pointer-events-none absolute left-[16%] right-[16%] top-[52px] hidden h-px bg-gradient-to-r from-emerald-500/0 via-emerald-500/25 to-emerald-500/0 lg:block"
				aria-hidden="true"
			></div>

			{#each steps as step (step.n)}
				{@const Icon = step.icon}
				<div
					class="group relative rounded-xl border border-[#222634] bg-[#0f111a] p-5 transition-colors hover:border-[#2d3242] hover:bg-[#11141d]"
				>
					<div class="flex items-center justify-between">
						<span class="font-mono text-[10px] font-bold tracking-[0.16em] text-emerald-400"
							>{step.n}</span
						>
						<span
							class="flex h-8 w-8 items-center justify-center rounded-md border border-[#222634] bg-[#11131c] text-[#94a3b8] transition-colors group-hover:border-emerald-500/25 group-hover:text-emerald-400"
						>
							<Icon class="h-4 w-4" />
						</span>
					</div>
					<h3 class="mt-4 text-[15px] font-semibold tracking-[-0.02em] text-white">
						{step.title}
					</h3>
					<p class="mt-1.5 text-[11.5px] leading-relaxed text-[#94a3b8]">{step.body}</p>
					<div
						class="mt-4 flex items-center justify-between rounded-md border border-[#222634] bg-[#0a0c12] px-2.5 py-1.5"
					>
						<code class="truncate font-mono text-[9.5px] text-[#cbd5e1]">{step.code}</code>
						<span class="shrink-0 font-mono text-[8px] uppercase tracking-wide text-[#64748b]"
							>{step.meta}</span
						>
					</div>
				</div>
			{/each}
		</div>

		<div class="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-[#222634] bg-[#0b0d14] px-4 py-3 sm:flex-row sm:items-center">
			<div class="flex min-w-0 items-center gap-2">
				<Terminal class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
				<code class="truncate font-mono text-[11px] text-[#e2e8f0]">{install.quick}</code>
				<CopyButton text={install.quick} compact label="" ariaLabel="Copy scan command" />
			</div>
			<div class="flex items-center gap-3 font-mono text-[9px] text-[#64748b]">
				<span class="flex items-center gap-1"><Database class="h-3 w-3 text-[#475569]" />Supabase-aware</span>
				<span class="flex items-center gap-1"><GitBranch class="h-3 w-3 text-[#475569]" />CI-ready</span>
				<a href="/rules/" class="flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
					What gets checked <ArrowRight class="h-2.5 w-2.5" />
				</a>
			</div>
		</div>
	</div>
</section>

<!-- ============================================================ -->
<!-- BENTO                                                        -->
<!-- ============================================================ -->
<BentoArchitecture />

<!-- ============================================================ -->
<!-- RULE EXPLORER                                                -->
<!-- ============================================================ -->
<section id="rules-43" class="border-t border-[#222634]/60 py-16 sm:py-20">
	<div class="wrap">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-2xl">
				<div class="mb-3 flex items-center gap-2">
					<span class="h-px w-6 bg-emerald-500/60"></span>
					<span class="mono-label text-emerald-400">The registry</span>
				</div>
				<h2
					class="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-white sm:text-[38px]"
				>
					Every check. Searchable. Right here.
				</h2>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					37 static rules and 6 active probes. Click any finding to see the vulnerable
					AI-generated code, the exact patch and the MCP prompt that ships it.
				</p>
			</div>
			<a href="/rules/" class="btn btn-secondary btn-sm shrink-0">
				Open full registry <ArrowUpRight class="h-3 w-3" />
			</a>
		</div>

		<div class="mt-6">
			<RuleExplorer compact />
		</div>

		<div
			class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[#222634] bg-[#0b0d14] px-3 py-2 font-mono text-[9px] text-[#64748b]"
		>
			<span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>CRITICAL −25 · blocks launch</span>
			<span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>HIGH −10</span>
			<span class="flex items-center gap-1"><span class="h-1.5 w-1.5 rounded-full bg-blue-500"></span>MEDIUM −4</span>
			<span class="ml-auto hidden sm:inline">Certificate requires 90+ and zero blockers</span>
		</div>
	</div>
</section>

<!-- ============================================================ -->
<!-- MCP SETUP                                                    -->
<!-- ============================================================ -->
<McpSetup />

<!-- ============================================================ -->
<!-- PRICING                                                      -->
<!-- ============================================================ -->
<Pricing />

<!-- ============================================================ -->
<!-- FINAL CTA                                                    -->
<!-- ============================================================ -->
<section class="border-t border-[#222634]/60 py-16 sm:py-20">
	<div class="wrap">
		<div
			class="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-[linear-gradient(135deg,#0c1517_0%,#0b0d14_55%,#0e1119_100%)] p-6 sm:p-9"
		>
			<div class="pointer-events-none absolute inset-0 dot-bg opacity-30" aria-hidden="true"></div>
			<div
				class="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
				aria-hidden="true"
			></div>

			<div class="relative grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
				<div>
					<div class="flex items-center gap-2">
						<ShieldCheck class="h-4 w-4 text-emerald-400" />
						<span class="mono-label text-emerald-400">Launch clearance</span>
					</div>
					<h2
						class="mt-3 text-balance text-[28px] font-bold leading-[1.08] tracking-[-0.04em] text-white sm:text-[36px]"
					>
						Clear the runway before your launch tweet.
					</h2>
					<p class="mt-3 max-w-lg text-[13px] leading-relaxed text-[#94a3b8]">
						One command finds the breach, the lawsuit and the $14k cloud bill. Your agent
						applies the fixes. You ship with evidence.
					</p>

					<div
						class="mt-5 flex max-w-md items-center gap-2 rounded-lg border border-[#222634] bg-[#08090d] px-3 py-2.5"
					>
						<span class="font-mono text-xs text-emerald-400">$</span>
						<code class="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">{install.quick}</code>
						<CopyButton text={install.quick} compact label="" ariaLabel="Copy scan command" />
					</div>

					<div class="mt-4 flex flex-wrap items-center gap-2">
						<a href="/#download" class="btn btn-primary">
							<Zap class="h-3.5 w-3.5" /> Install Preflight
						</a>
						<a href="/verify/" class="btn btn-secondary">
							<Fingerprint class="h-3.5 w-3.5" /> Verify a certificate
						</a>
					</div>
				</div>

				<!-- Certificate preview -->
				<div class="relative mx-auto w-full max-w-[330px]">
					<div class="absolute -inset-3 rounded-2xl border border-emerald-500/10" aria-hidden="true"></div>
					<div class="relative rounded-xl border border-emerald-500/30 bg-[#0a0c12] p-4 shadow-[0_20px_70px_-30px_rgba(16,185,129,0.35)]">
						<div class="flex items-center justify-between border-b border-[#222634] pb-2.5">
							<div class="flex items-center gap-1.5">
								<Fingerprint class="h-3.5 w-3.5 text-emerald-400" />
								<span class="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#cbd5e1]">Launch certificate</span>
							</div>
							<span class="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[7.5px] font-bold text-emerald-300">VERIFIED</span>
						</div>

						<div class="mt-3 flex items-center gap-3">
							<div class="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.06]">
								<div class="text-center">
									<div class="font-mono text-[21px] font-extrabold leading-none text-emerald-400">100</div>
									<div class="font-mono text-[7px] text-[#64748b]">/100</div>
								</div>
							</div>
							<div class="min-w-0">
								<div class="font-mono text-[11px] font-bold text-white">acme-saas</div>
								<div class="font-mono text-[8px] text-[#64748b]">commit 9c4e21a · 2026-10-20</div>
								<div class="mt-1.5 flex items-center gap-1 font-mono text-[8px] text-emerald-400">
									<Check class="h-2.5 w-2.5" />43/43 checks · 0 blockers
								</div>
							</div>
						</div>

						<div class="mt-3 space-y-1.5 border-t border-[#222634] pt-2.5">
							{#each ['Supabase RLS enforced', 'AGPL conflict resolved', 'Legal stack in sync'] as item (item)}
								<div class="flex items-center gap-1.5 font-mono text-[8.5px] text-[#94a3b8]">
									<Check class="h-2.5 w-2.5 text-emerald-500" />{item}
								</div>
							{/each}
						</div>

						<div class="mt-3 flex items-center justify-between border-t border-[#222634] pt-2 font-mono text-[7.5px] text-[#475569]">
							<span>Ed25519 · zero-backend</span>
							<span class="text-emerald-400/80">/verify#…</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</section>
