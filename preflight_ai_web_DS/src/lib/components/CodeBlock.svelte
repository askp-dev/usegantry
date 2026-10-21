<script lang="ts">
	import CopyButton from './CopyButton.svelte';

	let {
		code,
		filename = '',
		language = '',
		showLineNumbers = true,
		maxHeight = 'none',
		className = '',
		wrap = false
	}: {
		code: string;
		filename?: string;
		language?: string;
		showLineNumbers?: boolean;
		maxHeight?: string;
		className?: string;
		wrap?: boolean;
	} = $props();

	const lines = $derived(code.replace(/\n$/, '').split('\n'));
</script>

<div class="overflow-hidden rounded-lg border border-[#222634] bg-[#0b0d14] {className}">
	<div
		class="flex items-center justify-between gap-3 border-b border-[#222634] bg-[#11131c] px-3 py-1.5"
	>
		<div class="flex min-w-0 items-center gap-2">
			{#if filename}
				<span class="truncate font-mono text-[10px] font-medium text-[#cbd5e1]">{filename}</span>
			{/if}
			{#if language}
				<span class="font-mono text-[9px] uppercase tracking-[0.14em] text-[#64748b]"
					>{language}</span
				>
			{/if}
		</div>
		<CopyButton text={code} compact label="Copy" ariaLabel={`Copy ${filename || 'code'}`} />
	</div>

	<div class="overflow-auto" style:max-height={maxHeight === 'none' ? undefined : maxHeight}>
		<pre
			class="m-0 p-3 font-mono text-[11px] leading-[1.75] text-[#cbd5e1] sm:p-4 sm:text-[11.5px] {wrap
				? 'whitespace-pre-wrap break-words'
				: 'whitespace-pre'}"><code
			>{#if showLineNumbers}{#each lines as line, i}<span class="code-line"
						><span class="code-ln" aria-hidden="true">{i + 1}</span><span class="code-lc"
							>{line || ' '}</span
						></span
					>{/each}{:else}{code}{/if}</code
		></pre>
	</div>
</div>

<style>
	.code-line {
		display: flex;
		gap: 0.875rem;
		min-width: max-content;
	}

	.code-ln {
		user-select: none;
		flex: none;
		width: 2.4ch;
		text-align: right;
		color: #3b4354;
	}

	.code-lc {
		flex: 1;
	}

	.code-line:hover .code-ln {
		color: #64748b;
	}
</style>
