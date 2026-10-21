<script lang="ts">
  // Remove-before-flight tag (DESIGN.md §5.3): only for findings that block launch.
  let { id, size = "compact" }: { id: string; size?: "compact" | "full" } = $props();
</script>

{#if size === "full"}
  <span class="inline-flex h-10 w-[168px] items-center gap-2 bg-nogo pl-2 pr-3 text-[var(--on-nogo)]" style="border-radius: 0 2px 2px 0">
    <span aria-hidden="true" class="size-[10px] shrink-0 rounded-full border-2 border-current"></span>
    <span class="flex flex-col leading-tight">
      <span class="label text-[8.5px]">Remove before flight</span>
      <span class="font-mono text-[13px] font-medium">{id}</span>
    </span>
  </span>
{:else}
  <span class="inline-flex h-5 items-center gap-1.5 bg-nogo pl-1.5 pr-2 font-mono text-[11px] font-medium text-[var(--on-nogo)]" title="Remove before flight: blocks launch">
    <span aria-hidden="true" class="size-[6px] shrink-0 rounded-full border-[1.5px] border-current"></span>{id}
  </span>
{/if}
