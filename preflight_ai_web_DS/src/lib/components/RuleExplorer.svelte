<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		Search,
		X,
		ChevronDown,
		Filter,
		ShieldAlert,
		ShieldCheck,
		Sparkles,
		Copy,
		Terminal,
		ArrowUpRight
	} from 'lucide-svelte';
	import catalog from '#lib/data/rules-catalog.json';
	import {
		CATEGORIES,
		SEVERITY_META,
		searchableText,
		severityClass,
		type Rule
	} from '#lib/data/rules';
	import CodeBlock from './CodeBlock.svelte';
	import CopyButton from './CopyButton.svelte';

	let {
		compact = false,
		headingLevel = 3
	}: {
		compact?: boolean;
		headingLevel?: 2 | 3;
	} = $props();

	const rules = catalog as Rule[];
	const allCount = rules.length;

	let category = $state('all');
	let query = $state('');
	let expanded = $state<string | null>(null);
	let showAll = $state(false);
	let searchEl = $state<HTMLInputElement | null>(null);

	const counts = $derived(
		Object.fromEntries(
			CATEGORIES.map((cat) => [
				cat.key,
				cat.key === 'all' ? allCount : rules.filter((rule) => rule.category === cat.key).length
			])
		) as Record<string, number>
	);

	const filtered = $derived.by(() => {
		const tokens = query
			.toLowerCase()
			.split(/\s+/)
			.filter(Boolean);

		return rules.filter((rule) => {
			if (category !== 'all' && rule.category !== category) return false;
			if (!tokens.length) return true;
			const haystack = searchableText(rule);
			return tokens.every((token) => haystack.includes(token));
		});
	});

	const hasActiveFilters = $derived(category !== 'all' || query.trim().length > 0);
	const visible = $derived(
		compact && !showAll && !hasActiveFilters ? filtered.slice(0, 8) : filtered
	);

	function setCategory(next: string) {
		category = next;
		expanded = null;
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			if (next === 'all') url.searchParams.delete('category');
			else url.searchParams.set('category', next);
			history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
		}
	}

	function clearFilters() {
		category = 'all';
		query = '';
		expanded = null;
	}

	function toggle(id: string) {
		expanded = expanded === id ? null : id;
	}

	function focusRule(id: string) {
		showAll = true;
		const lookup = id.replace(/^rule-/i, '').toLowerCase();
		const match = rules.find((rule) => rule.id.toLowerCase() === lookup);
		if (match) {
			category = match.category;
			expanded = match.id;
			tick().then(() => {
				document.getElementById(`rule-${match.id}`)?.scrollIntoView({
					behavior: 'smooth',
					block: 'center'
				});
			});
		}
	}

	function applyFromUrl() {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		const cat = url.searchParams.get('category');
		if (cat) {
			const match = CATEGORIES.find(
				(categoryDef) => categoryDef.key.toLowerCase() === cat.toLowerCase()
			);
			if (match) {
				category = match.key;
				showAll = true;
			}
		}
		const hash = url.hash.replace('#', '');
		if (hash) focusRule(hash);
	}

	function onGlobalKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const typing =
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA' ||
			target?.tagName === 'SELECT' ||
			target?.isContentEditable;
		if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey) {
			event.preventDefault();
			searchEl?.focus();
		}
	}

	onMount(() => {
		applyFromUrl();
		const onHash = () => applyFromUrl();
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	});
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="overflow-hidden rounded-xl border border-[#222634] bg-[#11131c]">
	<!-- Toolbar -->
	<div class="border-b border-[#222634] bg-[#0d0f16] p-3 sm:p-4">
		<div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
			<div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter rules by category">
				{#each CATEGORIES as cat (cat.key)}
					<button
						type="button"
						onclick={() => setCategory(cat.key)}
						aria-pressed={category === cat.key}
						class="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 font-mono text-[10px] transition-colors {category ===
						cat.key
							? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
							: 'border-[#222634] bg-[#11131c] text-[#94a3b8] hover:border-[#2d3242] hover:text-white'}"
					>
						<span>{cat.label}</span>
						<span
							class="rounded px-1 text-[9px] {category === cat.key
								? 'bg-emerald-500/15 text-emerald-300'
								: 'bg-[#181b26] text-[#64748b]'}">{counts[cat.key]}</span
						>
					</button>
				{/each}
			</div>

			<div class="relative w-full xl:w-[360px]">
				<Search class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748b]" />
				<input
					bind:this={searchEl}
					bind:value={query}
					type="search"
					placeholder="Filter by keyword (Supabase, Stripe, GDPR, AGPL, useEffect)…"
					aria-label="Search 43 rules"
					class="h-9 w-full rounded-md border border-[#222634] bg-[#090a0f] pl-8 pr-14 font-mono text-[10.5px] text-white placeholder:text-[#475569] focus:border-emerald-500/50 focus:outline-none"
				/>
				{#if query}
					<button
						type="button"
						onclick={() => (query = '')}
						class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-[#64748b] hover:bg-[#181b26] hover:text-white"
						aria-label="Clear search"
					>
						<X class="h-3 w-3" />
					</button>
				{:else}
					<kbd
						class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[#2d3242] bg-[#181b26] px-1.5 py-0.5 font-mono text-[9px] text-[#64748b]"
						>/</kbd
					>
				{/if}
			</div>
		</div>

		<div class="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9.5px] text-[#64748b]">
			<span class="inline-flex items-center gap-1">
				<Filter class="h-2.5 w-2.5" />
				{filtered.length} of {allCount} checks
			</span>
			{#if hasActiveFilters}
				<span class="text-[#2d3242]">/</span>
				<span class="text-[#94a3b8]">
					{category === 'all' ? 'all pillars' : category}{query ? ` · “${query}”` : ''}
				</span>
				<button
					type="button"
					onclick={clearFilters}
					class="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300"
				>
					<X class="h-2.5 w-2.5" /> clear
				</button>
			{/if}
			<span class="ml-auto hidden items-center gap-1 sm:inline-flex">
				<ShieldAlert class="h-2.5 w-2.5 text-red-400" /> CRITICAL blocks launch
			</span>
		</div>
	</div>

	<!-- Rows -->
	<div class="divide-y divide-[#222634]">
		{#each visible as rule, index (rule.id)}
			{@const meta = SEVERITY_META[rule.severity]}
			{@const isOpen = expanded === rule.id}
			<div id={`rule-${rule.id}`} class="scroll-mt-24">
				<button
					type="button"
					onclick={() => toggle(rule.id)}
					aria-expanded={isOpen}
					aria-controls={`rule-panel-${rule.id}`}
					class="group flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-[#141722] sm:px-4 {isOpen
						? 'bg-[#141722]'
						: ''}"
				>
					<div class="w-[52px] shrink-0 pt-0.5">
						<span class="rule-id font-semibold text-[#e2e8f0]">{rule.id}</span>
						<div class="mt-1 flex items-center gap-1">
							<span class="h-1 w-1 rounded-full" style:background-color={meta.dot}></span>
							<span class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]"
								>{meta.label}</span
							>
						</div>
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[12px] font-medium leading-snug text-[#e2e8f0] group-hover:text-white sm:text-[12.5px]">
								{rule.title}
							</span>
							{#if rule.blocking}
								<span class="rounded border border-red-500/25 bg-red-500/[0.08] px-1 py-px font-mono text-[7.5px] font-bold uppercase tracking-wide text-red-300">
									blocks launch
								</span>
							{/if}
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[9px] text-[#64748b]">
							<span class="text-[#576277]">{rule.category}</span>
							<span class="text-[#2d3242]">·</span>
							<span class="truncate">{rule.targetFiles}</span>
						</div>
					</div>

					<div class="hidden shrink-0 pt-0.5 sm:block">
						<span class="sev {severityClass(rule.severity)}">{rule.severity}</span>
					</div>

					<ChevronDown
						class="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#475569] transition-transform {isOpen
							? 'rotate-180 text-emerald-400'
							: 'group-hover:text-[#94a3b8]'}"
					/>
				</button>

				{#if isOpen}
					<div
						id={`rule-panel-${rule.id}`}
						class="border-t border-[#222634] bg-[#0b0d14] px-3 py-4 sm:px-4 sm:py-5"
					>
						<div class="grid gap-3 lg:grid-cols-2">
							<div>
								<div class="mb-2 flex items-center gap-1.5">
									<span class="flex h-5 w-5 items-center justify-center rounded border border-red-500/25 bg-red-500/10">
										<ShieldAlert class="h-2.5 w-2.5 text-red-400" />
									</span>
									<span class="mono-label text-[9.5px] text-red-300">
										{rule.category === 'Active Pentest' ? 'Exploit payload' : 'Vulnerable AI output'}
									</span>
								</div>
								<CodeBlock
									code={rule.vulnerableCode}
									filename={rule.id === 'SEC-01' ? 'supabase/migrations/001_init.sql' : 'generated.ts'}
									language="before"
									maxHeight="260px"
									wrap
								/>
							</div>

							<div>
								<div class="mb-2 flex items-center gap-1.5">
									<span class="flex h-5 w-5 items-center justify-center rounded border border-emerald-500/25 bg-emerald-500/10">
										<ShieldCheck class="h-2.5 w-2.5 text-emerald-400" />
									</span>
									<span class="mono-label text-[9.5px] text-emerald-300">
										{rule.category === 'Active Pentest' ? 'Guardrail' : 'Preflight auto-patch'}
									</span>
								</div>
								<CodeBlock
									code={rule.fixedCode}
									filename="after"
									language="remediated"
									maxHeight="260px"
									wrap
								/>
							</div>
						</div>

						<div class="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
							<div class="rounded-lg border border-[#222634] bg-[#11131c] p-3">
								<div class="mono-label mb-1.5 text-[9px] text-[#94a3b8]">Detection logic</div>
								<p class="text-[11px] leading-relaxed text-[#94a3b8]">{rule.detectionLogic}</p>
								<div class="mt-2.5 border-t border-[#222634] pt-2">
									<div class="mono-label mb-1 text-[9px] text-[#94a3b8]">Auto-remediation</div>
									<p class="text-[11px] leading-relaxed text-[#94a3b8]">{rule.remediation}</p>
								</div>
							</div>

							<div class="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.04] p-3">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-center gap-1.5">
										<Sparkles class="h-3 w-3 text-indigo-300" />
										<span class="mono-label text-[9px] text-indigo-300">MCP fix prompt</span>
									</div>
									<CopyButton
										text={rule.mcpPrompt}
										compact
										label=""
										ariaLabel={`Copy MCP prompt for ${rule.id}`}
									/>
								</div>
								<p class="mt-2 font-mono text-[10.5px] leading-relaxed text-[#c7d2fe]">
									{rule.mcpPrompt}
								</p>
								<div class="mt-2.5 flex items-center gap-1 border-t border-indigo-500/15 pt-2 font-mono text-[8.5px] text-indigo-300/70">
									<Terminal class="h-2.5 w-2.5" /> Send to Cursor / Claude Code
								</div>
							</div>
						</div>

						<div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[9px] text-[#64748b]">
							<span class="flex items-center gap-1">
								<span class="text-[#475569]">target</span>
								<span class="text-[#94a3b8]">{rule.targetFiles}</span>
							</span>
							<span class="flex items-center gap-1">
								<span class="text-[#475569]">penalty</span>
								<span class="text-[#94a3b8]">{rule.penalty}</span>
							</span>
							<span class="flex items-center gap-1">
								<span class="text-[#475569]">ci gate</span>
								<span class={rule.blocking ? 'text-red-300' : 'text-[#94a3b8]'}>
									{rule.blocking ? 'fail build' : 'warn only'}
								</span>
							</span>
							<a
								href="/verify/"
								class="ml-auto inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
							>
								Attestation registry <ArrowUpRight class="h-2.5 w-2.5" />
							</a>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if visible.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
			<Search class="h-6 w-6 text-[#475569]" />
			<div>
				<p class="font-mono text-xs text-[#e2e8f0]">No checks match “{query}”</p>
				<p class="mt-1 text-[11px] text-[#64748b]">
					Try a package, framework, rule ID or risk keyword.
				</p>
			</div>
			<button type="button" onclick={clearFilters} class="btn btn-secondary btn-sm">
				<X class="h-3 w-3" /> Reset filters
			</button>
		</div>
	{/if}

	{#if compact}
		<div class="flex flex-col items-center justify-between gap-3 border-t border-[#222634] bg-[#0d0f16] px-4 py-3 sm:flex-row">
			<p class="font-mono text-[9.5px] text-[#64748b]">
				Showing {visible.length} of {filtered.length} matching checks · {allCount} total
			</p>
			<div class="flex items-center gap-2">
				<a href="/rules/" class="btn btn-secondary btn-sm">
					Open full registry <ArrowUpRight class="h-3 w-3" />
				</a>
				{#if !hasActiveFilters}
					<button
						type="button"
						onclick={() => (showAll = !showAll)}
						class="btn btn-primary btn-sm"
					>
						<Copy class="h-3 w-3" />
						{showAll ? 'Collapse list' : `Show all ${allCount} checks`}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
