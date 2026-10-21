<script lang="ts">
	import {
		Check,
		Minus,
		ArrowRight,
		Sparkles,
		ShieldCheck,
		Users,
		Building2,
		Mail
	} from 'lucide-svelte';
	import { site } from '#lib/config';

	const tiers = [
		{
			name: 'Community',
			tag: 'Open core',
			price: '$0',
			cadence: 'forever',
			description: 'The full deterministic scan, free for every repository.',
			cta: 'Start scanning',
			href: '/#download',
			highlight: false,
			features: [
				'37-rule static CLI scan (<1.1s)',
				'READINESS_CHECKLIST.md generator',
				'.cursor/rules + CLAUDE.md bootstrapper',
				'Local MCP server over stdio',
				'Community rule updates'
			]
		},
		{
			name: 'Pro Builder',
			tag: 'Most popular',
			price: '$39',
			cadence: '/ month',
			description: 'For solo builders shipping paid products with AI agents.',
			cta: 'Start 14-day trial',
			href: `mailto:${site.salesEmail}?subject=Preflight%20Pro%20trial`,
			highlight: true,
			features: [
				'Everything in Community',
				'VS Code / Cursor extension',
				'1-click Agent Fix Bridge',
				'Stack-synced Legal & EULA compiler',
				'Active 6-probe pentester (preflight attack)',
				'HTML launch certificate export'
			]
		},
		{
			name: 'Agency & Team',
			tag: 'Client-ready',
			price: '$299',
			cadence: '/ month',
			description: 'For studios that must prove compliance to enterprise buyers.',
			cta: 'Talk to sales',
			href: `mailto:${site.salesEmail}?subject=Preflight%20Agency`,
			highlight: false,
			features: [
				'Everything in Pro',
				'Cryptographically signed certificates (HTML + PDF)',
				'B2B vendor pack: SBOM.json + DATA_FLOW.mermaid + questionnaire',
				'Multi-repo CI gates',
				'5 seats + onboarding call',
				'Priority support & custom rules'
			]
		}
	];

	const matrix: Array<{
		feature: string;
		community: string | boolean;
		pro: string | boolean;
		agency: string | boolean;
	}> = [
		{ feature: 'Deterministic checks', community: '37 static', pro: '43 (37 + 6 probes)', agency: '43 (37 + 6 probes)' },
		{ feature: 'CLI + local MCP server', community: true, pro: true, agency: true },
		{ feature: 'Cursor / VS Code extension', community: false, pro: true, agency: true },
		{ feature: 'Agent Fix Bridge', community: false, pro: true, agency: true },
		{ feature: 'Legal & EULA compiler', community: 'Checklist only', pro: 'Auto-sync', agency: 'Auto-sync + review' },
		{ feature: 'Active pentest probes', community: false, pro: '6 probes', agency: '6 probes + scheduling' },
		{ feature: 'Launch certificate', community: false, pro: 'HTML', agency: 'Signed HTML + PDF' },
		{ feature: 'B2B vendor pack', community: false, pro: false, agency: true },
		{ feature: 'Repositories gated in CI', community: 'Unlimited (local)', pro: '1', agency: 'Unlimited' },
		{ feature: 'Seats', community: 'Unlimited (local)', pro: '1', agency: '5' },
		{ feature: 'Support', community: 'Community', pro: 'Priority email', agency: 'Dedicated channel' }
	];
</script>

<section id="pricing" class="border-t border-[#222634]/60 py-16 sm:py-20">
	<div class="wrap">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-2xl">
				<div class="mb-3 flex items-center gap-2">
					<span class="h-px w-6 bg-emerald-500/60"></span>
					<span class="mono-label text-emerald-400">Pricing</span>
				</div>
				<h2
					class="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-white sm:text-[38px]"
				>
					Open core. Paid ammunition.
				</h2>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					The scanner is and always will be MIT. Pay only for the proof, the agent bridge and
					the client-ready artifacts.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2 font-mono text-[10px] text-[#64748b]">
				<ShieldCheck class="h-3.5 w-3.5 text-emerald-500" />
				No per-scan fees · cancel anytime
			</div>
		</div>

		<div class="mt-8 grid gap-4 lg:grid-cols-3">
			{#each tiers as tier (tier.name)}
				<div
					class="relative flex flex-col rounded-xl border p-5 sm:p-6 {tier.highlight
						? 'border-emerald-500/40 bg-[#101720] shadow-[0_0_70px_-30px_rgba(16,185,129,0.45)]'
						: 'border-[#222634] bg-[#0f111a]'}"
				>
					{#if tier.highlight}
						<div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent"></div>
					{/if}

					<div class="flex items-start justify-between gap-3">
						<div>
							<h3 class="text-[17px] font-bold tracking-[-0.02em] text-white">{tier.name}</h3>
							<p class="mt-1 text-[11px] leading-relaxed text-[#94a3b8]">{tier.description}</p>
						</div>
						<span class="pill {tier.highlight ? 'pill-ready' : 'pill'}">{tier.tag}</span>
					</div>

					<div class="mt-5 flex items-end gap-1.5 border-b border-[#222634] pb-5">
						<span class="font-mono text-[40px] font-extrabold leading-none tracking-[-0.04em] text-white">
							{tier.price}
						</span>
						<span class="pb-1 font-mono text-[10px] text-[#64748b]">{tier.cadence}</span>
						{#if tier.highlight}
							<span class="mb-1 ml-auto rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-emerald-300">
								Full stack
							</span>
						{/if}
					</div>

					<ul class="mt-5 flex-1 space-y-2.5">
						{#each tier.features as feature (feature)}
							<li class="flex items-start gap-2">
								<span
									class="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full {tier.highlight
										? 'bg-emerald-500/15 text-emerald-400'
										: 'bg-[#181b26] text-[#94a3b8]'}"
								>
									<Check class="h-2.5 w-2.5" />
								</span>
								<span class="text-[11.5px] leading-relaxed text-[#cbd5e1]">{feature}</span>
							</li>
						{/each}
					</ul>

					<a
						href={tier.href}
						class="btn mt-6 w-full {tier.highlight ? 'btn-primary' : 'btn-secondary'}"
					>
						{#if tier.highlight}
							<Sparkles class="h-3.5 w-3.5" />
						{:else if tier.name === 'Agency & Team'}
							<Building2 class="h-3.5 w-3.5" />
						{:else}
							<Users class="h-3.5 w-3.5" />
						{/if}
						{tier.cta}
						<ArrowRight class="h-3 w-3" />
					</a>
					<p class="mt-2 text-center font-mono text-[8.5px] text-[#64748b]">
						{tier.highlight ? 'No card required for 14 days' : tier.price === '$0' ? 'MIT licensed · no account' : 'Annual billing available'}
					</p>
				</div>
			{/each}
		</div>

		<!-- Comparison matrix -->
		<div class="mt-10 overflow-hidden rounded-xl border border-[#222634] bg-[#0f111a]">
			<div class="flex flex-col gap-2 border-b border-[#222634] bg-[#0d0f16] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div class="mono-label text-[9.5px] text-[#cbd5e1]">Open-core comparison</div>
					<p class="mt-1 text-[10.5px] text-[#64748b]">
						Every tier runs entirely on your machine. Paid tiers add proof and workflow.
					</p>
				</div>
				<a
					href={`mailto:${site.salesEmail}?subject=Preflight%20for%20teams`}
					class="inline-flex items-center gap-1 font-mono text-[9.5px] text-emerald-400 hover:text-emerald-300"
				>
					<Mail class="h-3 w-3" /> Need a custom plan?
				</a>
			</div>

			<div class="overflow-x-auto">
				<table class="matrix min-w-[640px]">
					<thead>
						<tr>
							<th scope="col">Capability</th>
							<th scope="col">Community</th>
							<th scope="col" class="!text-emerald-300">Pro Builder</th>
							<th scope="col">Agency</th>
						</tr>
					</thead>
					<tbody>
						{#each matrix as row (row.feature)}
							<tr>
								<th scope="row" class="!text-left !font-medium !text-[#cbd5e1]">{row.feature}</th>
								{#each [row.community, row.pro, row.agency] as value, i (i)}
									<td>
										{#if value === true}
											<Check class="mx-auto h-3.5 w-3.5 text-emerald-400" />
										{:else if value === false}
											<Minus class="mx-auto h-3.5 w-3.5 text-[#3f485c]" />
										{:else}
											<span class="font-mono text-[10px] text-[#94a3b8]">{value}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	</div>
</section>
