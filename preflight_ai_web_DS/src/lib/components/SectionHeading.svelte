<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		eyebrow,
		title,
		description = '',
		align = 'left',
		children,
		action
	}: {
		eyebrow: string;
		title: string;
		description?: string;
		align?: 'left' | 'center';
		children?: Snippet;
		action?: Snippet;
	} = $props();
</script>

<div
	class="flex flex-col gap-5 {align === 'center'
		? 'items-center text-center'
		: 'items-start'} sm:flex-row sm:items-end sm:justify-between"
>
	<div class={align === 'center' ? 'max-w-3xl' : 'max-w-2xl'}>
		<div
			class="mb-3 flex items-center gap-2 {align === 'center' ? 'justify-center' : ''}"
		>
			<span class="h-px w-6 bg-emerald-500/60"></span>
			<span class="mono-label text-emerald-400">{eyebrow}</span>
		</div>
		<h2
			class="text-balance text-[26px] font-bold leading-[1.12] tracking-[-0.03em] text-[#f8fafc] sm:text-[34px]"
		>
			{title}
		</h2>
		{#if description}
			<p class="mt-3 text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
				{description}
			</p>
		{/if}
		{#if children}
			<div class="mt-4">{@render children()}</div>
		{/if}
	</div>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
</div>
