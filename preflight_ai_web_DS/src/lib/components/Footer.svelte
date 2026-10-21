<script lang="ts">
	import { ArrowUpRight, Terminal, ShieldCheck, Check } from 'lucide-svelte';
	import { site, install } from '#lib/config';
	import CopyButton from './CopyButton.svelte';

	const year = new Date().getFullYear();

	const product = [
		{ label: 'Download CLI', href: '/#download' },
		{ label: '43-rule registry', href: '/rules/' },
		{ label: 'MCP & IDE setup', href: '/#mcp-setup' },
		{ label: 'Pricing', href: '/#pricing' },
		{ label: 'Verify a certificate', href: '/verify/' }
	];

	const resources = [
		{ label: 'GitHub repository', href: site.github },
		{ label: 'Releases & checksums', href: `${site.github}/releases` },
		{ label: 'Changelog', href: `${site.github}/releases` },
		{ label: 'Report a bug', href: `${site.github}/issues` },
		{ label: 'Discussions', href: site.discussions }
	];

	const legal = [
		{ label: 'Privacy', href: `${site.github}/blob/main/PRIVACY.md` },
		{ label: 'Terms', href: `${site.github}/blob/main/TERMS.md` },
		{ label: 'EULA', href: `${site.github}/blob/main/EULA.md` },
		{ label: 'Security policy', href: `${site.github}/blob/main/SECURITY.md` },
		{ label: 'MIT license', href: `${site.github}/blob/main/LICENSE` }
	];
</script>

<footer class="border-t border-[#222634] bg-[#080910]">
	<div class="wrap grid gap-10 py-12 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-8">
		<div class="max-w-sm">
			<a href="/" class="flex items-center gap-2" aria-label="Preflight home">
				<span
					class="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10"
				>
					<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" aria-hidden="true">
						<path
							d="M12 2.6 20 6v6.1c0 4.5-3.1 7.9-8 9.3-4.9-1.4-8-4.8-8-9.3V6l8-3.4Z"
							stroke="#10b981"
							stroke-width="1.4"
							stroke-linejoin="round"
						/>
						<path d="m12.9 7-4.2 6.1h3.1l-.7 4 4.2-6.1h-3.1l.7-4Z" fill="#10b981" />
					</svg>
				</span>
				<span class="font-mono text-sm font-extrabold tracking-tight text-white">PREFLIGHT</span>
			</a>
			<p class="mt-4 text-xs leading-relaxed text-[#94a3b8]">
				The pre-flight compliance, security and FinOps engine for AI-built software. 43
				deterministic checks. Under 1.1 seconds. Nothing leaves your machine.
			</p>

			<div
				class="mt-5 flex items-center gap-2 rounded-lg border border-[#222634] bg-[#0b0d14] px-2.5 py-2"
			>
				<Terminal class="h-3.5 w-3.5 shrink-0 text-emerald-500" />
				<code class="min-w-0 flex-1 truncate font-mono text-[10.5px] text-[#cbd5e1]"
					>{install.quick}</code
				>
				<CopyButton text={install.quick} compact label="" ariaLabel="Copy install command" />
			</div>

			<div class="mt-4 flex items-center gap-2 font-mono text-[10px] text-[#64748b]">
				<span class="inline-flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
					All systems operational
				</span>
				<span class="text-[#2d3242]">/</span>
				<span class="inline-flex items-center gap-1">
					<ShieldCheck class="h-3 w-3 text-emerald-500" /> Local-only
				</span>
			</div>
		</div>

		<div>
			<h3 class="mono-label mb-4 text-[#cbd5e1]">Product</h3>
			<ul class="space-y-2.5">
				{#each product as link (link.label)}
					<li>
						<a
							href={link.href}
							class="text-xs text-[#94a3b8] transition-colors hover:text-emerald-300"
							>{link.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>

		<div>
			<h3 class="mono-label mb-4 text-[#cbd5e1]">Resources</h3>
			<ul class="space-y-2.5">
				{#each resources as link (link.label)}
					<li>
						<a
							href={link.href}
							target={link.href.startsWith('http') ? '_blank' : undefined}
							rel={link.href.startsWith('http') ? 'noreferrer' : undefined}
							class="inline-flex items-center gap-1 text-xs text-[#94a3b8] transition-colors hover:text-emerald-300"
							>{link.label}
							{#if link.href.startsWith('http')}
								<ArrowUpRight class="h-2.5 w-2.5 text-[#475569]" />
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</div>

		<div>
			<h3 class="mono-label mb-4 text-[#cbd5e1]">Trust</h3>
			<ul class="space-y-2.5">
				{#each legal as link (link.label)}
					<li>
						<a
							href={link.href}
							target="_blank"
							rel="noreferrer"
							class="text-xs text-[#94a3b8] transition-colors hover:text-emerald-300"
							>{link.label}</a
						>
					</li>
				{/each}
			</ul>
			<a
				href={site.github}
				target="_blank"
				rel="noreferrer"
				class="mt-4 inline-flex items-center gap-1.5 rounded-md border border-[#222634] bg-[#11131c] px-2 py-1.5 font-mono text-[10px] text-[#cbd5e1] transition-colors hover:bg-[#181b26]"
			>
				<svg viewBox="0 0 24 24" class="h-3 w-3 fill-current" aria-hidden="true">
					<path
						d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.95a9.3 9.3 0 0 1 2.5.35c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.26 10.26 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"
					/>
				</svg>
				{site.repo}
			</a>
		</div>
	</div>

	<div class="border-t border-[#222634]">
		<div
			class="wrap flex flex-col items-start justify-between gap-3 py-5 sm:flex-row sm:items-center"
		>
			<p class="font-mono text-[10px] text-[#64748b]">
				© {year} Preflight AI, Inc. · MIT Core · Built for the post-code era.
			</p>
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] text-[#64748b]">
				<span class="inline-flex items-center gap-1"
					><Check class="h-2.5 w-2.5 text-emerald-500" /> Zero telemetry</span
				>
				<span class="inline-flex items-center gap-1"
					><Check class="h-2.5 w-2.5 text-emerald-500" /> Zero cloud upload</span
				>
				<span class="text-[#3f485c]">SOC2 track · v1</span>
			</div>
		</div>
	</div>
</footer>
