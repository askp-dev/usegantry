<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Check, Copy } from 'lucide-svelte';
	import { copyText } from '#lib/clipboard';

	let {
		text,
		label = 'Copy',
		copiedLabel = 'Copied',
		className = '',
		compact = false,
		ariaLabel = 'Copy to clipboard'
	}: {
		text: string;
		label?: string;
		copiedLabel?: string;
		className?: string;
		compact?: boolean;
		ariaLabel?: string;
	} = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	async function handleCopy() {
		if (await copyText(text)) {
			copied = true;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1800);
		}
	}

	onDestroy(() => {
		if (timer) clearTimeout(timer);
	});
</script>

<button
	type="button"
	onclick={handleCopy}
	aria-label={ariaLabel}
	class="inline-flex items-center gap-1.5 rounded-md border border-[#222634] bg-[#11131c] text-[#94a3b8] transition-colors hover:border-[#2d3242] hover:text-white {compact
		? 'px-1.5 py-1 text-[10px]'
		: 'px-2.5 py-1.5 text-[11px]'} {copied
		? 'border-emerald-500/40 text-emerald-300'
		: ''} {className}"
>
	{#if copied}
		<Check class="h-3 w-3 text-emerald-400" />
		<span class="font-mono">{copiedLabel}</span>
	{:else}
		<Copy class="h-3 w-3" />
		<span class="font-mono">{label}</span>
	{/if}
</button>
