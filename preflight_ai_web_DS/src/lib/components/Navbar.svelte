<script lang="ts">
	import { onMount } from 'svelte';
	import { Menu, X, Download, Star, ShieldCheck, ArrowUpRight } from 'lucide-svelte';
	import { site } from '#lib/config';
	import { getLatestRelease } from '#lib/releases';

	let open = $state(false);
	let scrolled = $state(false);
	let version = $state<string>(site.fallbackVersionLabel);

	const links = [
		{ href: '/#how-it-works', label: 'How it works' },
		{ href: '/#rules-43', label: '43 rules' },
		{ href: '/#mcp-setup', label: 'MCP setup' },
		{ href: '/#pricing', label: 'Pricing' }
	];

	onMount(() => {
		getLatestRelease().then((release) => (version = release.tag));
	});
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 12)} />

<header
	class="sticky top-0 z-50 h-14 border-b transition-colors duration-200 {scrolled
		? 'border-[#222634] bg-[#090a0f]/92 backdrop-blur-xl'
		: 'border-[#222634]/70 bg-[#090a0f]/80 backdrop-blur-md'}"
>
	<div class="wrap flex h-full items-center justify-between gap-4">
		<!-- Brand cluster -->
		<div class="flex min-w-0 items-center gap-3">
			<a href="/" class="group flex items-center gap-2" aria-label="Preflight home">
				<span
					class="relative flex h-7 w-7 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 transition-colors group-hover:border-emerald-400/60 group-hover:bg-emerald-500/15"
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
				<span class="font-mono text-[15px] font-extrabold tracking-[-0.02em] text-white"
					>PREFLIGHT</span
				>
			</a>

			<span
				class="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-[#222634] bg-[#11131c] px-2 py-0.5 font-mono text-[10px] text-[#94a3b8] sm:inline-flex"
				title="Latest release"
			>
				<span class="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
				<span class="text-[#e2e8f0]">{version}</span>
				<span class="text-[#3f485c]">•</span>
				<span>{site.license}</span>
			</span>
		</div>

		<!-- Center cluster -->
		<nav class="hidden items-center gap-1 whitespace-nowrap lg:flex" aria-label="Primary navigation">
			{#each links as link (link.href)}
				<a
					href={link.href}
					class="rounded-md px-2.5 py-1.5 font-mono text-[11px] text-[#94a3b8] transition-colors hover:bg-[#181b26] hover:text-white"
					>{link.label}</a
				>
			{/each}
			<a
				href="/verify/"
				class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] text-[#94a3b8] transition-colors hover:bg-[#181b26] hover:text-emerald-300"
			>
				<ShieldCheck class="h-3.5 w-3.5 text-emerald-500" />
				Verify
			</a>
		</nav>

		<!-- Right cluster -->
		<div class="flex items-center gap-2">
			<a
				href={site.github}
				target="_blank"
				rel="noreferrer"
				class="hidden items-center gap-1.5 rounded-md border border-[#222634] bg-[#11131c] px-2.5 py-1.5 font-mono text-[11px] text-[#cbd5e1] transition-colors hover:border-[#2d3242] hover:bg-[#181b26] sm:inline-flex"
			>
				<Star class="h-3.5 w-3.5 text-[#94a3b8]" />
				<span>Star</span>
				<ArrowUpRight class="h-3 w-3 text-[#64748b]" />
			</a>

			<a href="/#download" class="btn btn-primary btn-sm hidden sm:inline-flex">
				<Download class="h-3.5 w-3.5" />
				Download
			</a>

			<button
				type="button"
				class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#222634] bg-[#11131c] text-[#cbd5e1] transition-colors hover:bg-[#181b26] lg:hidden"
				onclick={() => (open = !open)}
				aria-expanded={open}
				aria-controls="mobile-nav"
				aria-label={open ? 'Close menu' : 'Open menu'}
			>
				{#if open}
					<X class="h-4 w-4" />
				{:else}
					<Menu class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	{#if open}
		<div
			id="mobile-nav"
			class="absolute inset-x-0 top-14 border-b border-[#222634] bg-[#090a0f]/98 backdrop-blur-xl lg:hidden"
		>
			<nav class="wrap grid gap-1 py-4" aria-label="Mobile navigation">
				{#each links as link (link.href)}
					<a
						href={link.href}
						onclick={() => (open = false)}
						class="rounded-md px-3 py-2.5 font-mono text-xs text-[#cbd5e1] transition-colors hover:bg-[#181b26] hover:text-white"
						>{link.label}</a
					>
				{/each}
				<a
					href="/rules/"
					onclick={() => (open = false)}
					class="rounded-md px-3 py-2.5 font-mono text-xs text-[#cbd5e1] transition-colors hover:bg-[#181b26] hover:text-white"
					>Rule registry</a
				>
				<a
					href="/verify/"
					onclick={() => (open = false)}
					class="rounded-md px-3 py-2.5 font-mono text-xs text-[#cbd5e1] transition-colors hover:bg-[#181b26] hover:text-white"
					>Verify certificate</a
				>
				<div class="mt-2 grid grid-cols-2 gap-2 border-t border-[#222634] pt-3">
					<a
						href={site.github}
						target="_blank"
						rel="noreferrer"
						class="btn btn-secondary"
						onclick={() => (open = false)}
					>
						<Star class="h-3.5 w-3.5" /> Star
					</a>
					<a href="/#download" class="btn btn-primary" onclick={() => (open = false)}>
						<Download class="h-3.5 w-3.5" /> Download
					</a>
				</div>
			</nav>
		</div>
	{/if}
</header>
