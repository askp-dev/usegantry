<script lang="ts">
  import CopyButton from "./CopyButton.svelte";
  let { code, label = "", copy = true }: { code: string; label?: string; copy?: boolean } = $props();
</script>

<div class="border border-ink bg-paper-2">
  {#if label || copy}
    <div class="flex items-center justify-between gap-3 border-b border-rule px-3 py-1.5">
      <span class="label text-[10px] text-ink-3">{label}</span>
      {#if copy}<CopyButton text={code} />{/if}
    </div>
  {/if}
  <pre class="overflow-x-auto px-3 py-3 font-mono text-[12.5px] leading-relaxed text-ink"><code>{code}</code></pre>
</div>
