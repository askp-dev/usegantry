<script lang="ts">
	import {
		Search,
		ShieldAlert,
		ShieldCheck,
		ShieldX,
		ArrowRight,
		ArrowUpRight,
		Gauge,
		Check,
		Zap,
		Terminal,
		Fingerprint
	} from 'lucide-svelte';
	import catalog from '#lib/data/rules-catalog.json';
	import { STATIC_RULES, ACTIVE_PROBES, TOTAL_RULES, SEVERITY_META, type Rule, type Severity } from '#lib/data/rules';
	import RuleExplorer from '#lib/components/RuleExplorer.svelte';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import { install, site } from '#lib/config';

	const rules = catalog as Rule[];
	const critical = rules.filter((rule) => rule.severity === 'CRITICAL').length;
	const high = rules.filter((rule) => rule.severity === 'HIGH').length;
	const medium = rules.filter((rule) => rule.severity === 'MEDIUM').length;

	const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM'];

	const verdicts = [
		{
			label: 'LAUNCH READY',
			score: '90–100',
			condition: 'Zero CRITICAL blockers and no failed attestation rows.',
			color: 'emerald',
			icon: ShieldCheck
		},
		{
			label: 'REVIEW',
			score: '60–89',
			condition: 'HIGH or MEDIUM findings remain. Launch is possible with documented risk.',
			color: 'amber',
			icon: ShieldAlert
		},
		{
			label: 'BLOCKED',
			score: '0–59',
			condition: 'Any CRITICAL finding, or a score below the clearance floor.',
			color: 'red',
			icon: ShieldX
		}
	];
</script>

<svelte:head>
	<title>43-rule registry — Preflight</title>
	<meta
		name="description"
		content="Browse all 43 deterministic Preflight checks: security, data privacy, EULA and legal, FinOps, payments, ops and active pentest probes. Search by package, risk or rule ID."
	/>
	<link rel="canonical" href={`${site.domain}/rules/`} />
</svelte:head>

<section class="hero-glow relative overflow-hidden border-b border-[#222634]/60">
	<div class="grid-bg mask-fade-b pointer-events-none absolute inset-0 opacity-50" aria-hidden="true"></div>
	<div class="wrap relative py-10 sm:py-14">
		<nav class="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wide text-[#64748b]" aria-label="Breadcrumb">
			<a href="/" class="hover:text-emerald-300">Home</a>
			<span class="text-[#2d3242]">/</span>
			<span class="text-[#cbd5e1]">Rule registry</span>
		</nav>

		<div class="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
			<div class="max-w-2xl">
				<div class="flex flex-wrap items-center gap-2">
					<span class="pill pill-ready"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>43 checks · one gate</span>
					<span class="pill"><Search class="h-2.5 w-2.5" />searchable registry</span>
				</div>
				<h1 class="mt-4 text-balance text-[32px] font-extrabold leading-[1.05] tracking-[-0.04em] text-white sm:text-[44px]">
					The 43-check launch registry.
				</h1>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					Every static rule and live probe, with the vulnerable AI output, the exact patch and
					the MCP prompt that ships it. Filter by pillar or search the whole registry.
				</p>
			</div>

			<div class="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-xl border border-[#222634] bg-[#222634] sm:grid-cols-5">
				{#each [
					{ value: TOTAL_RULES, label: 'total' },
					{ value: STATIC_RULES, label: 'static' },
					{ value: ACTIVE_PROBES, label: 'probes' },
					{ value: critical, label: 'critical' },
					{ value: high, label: 'high' }
				] as stat (stat.label)}
					<div class="bg-[#0f111a] px-3 py-2.5 text-center">
						<div class="font-mono text-[17px] font-bold text-white">{stat.value}</div>
						<div class="mt-0.5 font-mono text-[7.5px] uppercase tracking-[0.12em] text-[#64748b]">{stat.label}</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

<section class="py-8 sm:py-10">
	<div class="wrap">
		<RuleExplorer />
	</div>
</section>

<!-- Scoring methodology -->
<section id="scoring" class="scroll-mt-24 border-t border-[#222634]/60 py-14 sm:py-16">
	<div class="wrap">
		<div class="max-w-2xl">
			<div class="mb-3 flex items-center gap-2">
				<span class="h-px w-6 bg-emerald-500/60"></span>
				<span class="mono-label text-emerald-400">Scoring &amp; blocking</span>
			</div>
			<h2 class="text-balance text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-white sm:text-[34px]">
				Deterministic verdicts, not vibes.
			</h2>
			<p class="mt-3 text-[13px] leading-relaxed text-[#94a3b8]">
				No model judges your repository. Each finding deducts a fixed penalty, and CRITICAL
				findings block the launch certificate by default.
			</p>
		</div>

		<div class="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
			<div class="overflow-hidden rounded-xl border border-[#222634] bg-[#0f111a]">
				<div class="overflow-x-auto">
					<table class="matrix min-w-[540px]">
						<thead>
							<tr>
								<th scope="col">Severity</th>
								<th scope="col">Penalty</th>
								<th scope="col">Blocks cert</th>
								<th scope="col">Typical trigger</th>
							</tr>
						</thead>
						<tbody>
							{#each severities as severity (severity)}
								{@const meta = SEVERITY_META[severity]}
								<tr>
									<td class="!text-left">
										<span class="sev {meta.className}">{severity}</span>
									</td>
									<td class="!text-left font-mono text-[11px] text-[#e2e8f0]">{meta.penalty}</td>
									<td class="!text-left font-mono text-[10px]">
										{severity === 'CRITICAL' ? 'always' : severity === 'HIGH' ? 'with --strict' : 'never'}
									</td>
									<td class="!text-left text-[10.5px] text-[#94a3b8]">
										{severity === 'CRITICAL'
											? 'Exploitable breach, leaked key, copyleft conflict, runaway loop'
											: severity === 'HIGH'
												? 'Secondary vulnerability, consent drift, billing race'
												: 'Hardening gap, missing headers, launch metadata'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#222634] px-4 py-2.5 font-mono text-[8.5px] text-[#64748b]">
					<span>{critical} CRITICAL</span>
					<span class="text-[#2d3242]">·</span>
					<span>{high} HIGH</span>
					<span class="text-[#2d3242]">·</span>
					<span>{medium} MEDIUM</span>
					<span class="ml-auto">starting score 100</span>
				</div>
			</div>

			<div class="grid gap-2.5">
				{#each verdicts as verdict (verdict.label)}
					{@const Icon = verdict.icon}
					<div class="flex items-start gap-3 rounded-lg border p-3 {verdict.color === 'emerald' ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : verdict.color === 'amber' ? 'border-amber-500/25 bg-amber-500/[0.04]' : 'border-red-500/25 bg-red-500/[0.04]'}">
						<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border {verdict.color === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : verdict.color === 'amber' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}">
							<Icon class="h-3.5 w-3.5" />
						</span>
						<div>
							<div class="flex items-center gap-2">
								<span class="font-mono text-[10px] font-bold tracking-wide {verdict.color === 'emerald' ? 'text-emerald-300' : verdict.color === 'amber' ? 'text-amber-300' : 'text-red-300'}">{verdict.label}</span>
								<span class="font-mono text-[9px] text-[#64748b]">{verdict.score}</span>
							</div>
							<p class="mt-1 text-[10.5px] leading-relaxed text-[#94a3b8]">{verdict.condition}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<div class="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-[#222634] bg-[#0b0d14] px-4 py-3 sm:flex-row sm:items-center">
			<div class="flex min-w-0 items-center gap-2">
				<Terminal class="h-3.5 w-3.5 shrink-0 text-emerald-400" />
				<code class="truncate font-mono text-[11px] text-[#e2e8f0]">{install.quick} --ci --fail-on critical</code>
				<CopyButton text={`${install.quick} --ci --fail-on critical`} compact label="" ariaLabel="Copy CI scan command" />
			</div>
			<div class="flex items-center gap-2 font-mono text-[9px]">
				<a href="/#mcp-setup" class="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
					Wire into CI <ArrowRight class="h-2.5 w-2.5" />
				</a>
				<span class="text-[#2d3242]">/</span>
				<a href="/verify/" class="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300">
					Verify a certificate <ArrowUpRight class="h-2.5 w-2.5" />
				</a>
			</div>
		</div>
	</div>
</section>

<!-- CTA -->
<section class="border-t border-[#222634]/60 py-12 sm:py-14">
	<div class="wrap">
		<div class="flex flex-col items-start justify-between gap-5 rounded-xl border border-emerald-500/20 bg-[linear-gradient(120deg,#0c1517,#0b0d14_70%)] p-5 sm:flex-row sm:items-center sm:p-6">
			<div class="flex items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10">
					<Gauge class="h-5 w-5 text-emerald-400" />
				</span>
				<div>
					<h2 class="text-[16px] font-semibold text-white">Run the registry against your repo.</h2>
					<p class="mt-1 text-[11px] text-[#94a3b8]">37 static rules in under 1.1 seconds. Zero cloud upload.</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<a href="/#download" class="btn btn-primary">
					<Zap class="h-3.5 w-3.5" /> Install Preflight
				</a>
				<a href="/verify/" class="btn btn-secondary">
					<Fingerprint class="h-3.5 w-3.5" /> Verify certificate
				</a>
			</div>
		</div>
	</div>
</section>
