<script lang="ts">
  import type { Call } from "#lib/site.ts";
  let { call, size = "md", suffix = "" }: { call: Call; size?: "sm" | "md" | "lg"; suffix?: string } = $props();
  const fill = { GO: "bg-go text-[var(--on-go)]", HOLD: "bg-hold text-[var(--on-hold)]", "NO-GO": "bg-nogo text-[var(--on-nogo)]" };
  const sz = { sm: "h-5 px-1.5 text-[10px]", md: "h-7 px-2 text-[13px]", lg: "h-9 px-3 text-[20px]" };
</script>

<span class="display inline-flex items-center whitespace-nowrap {fill[call]} {sz[size]}" style="font-variation-settings: 'wdth' 112; letter-spacing: 0.02em">
  {call}{#if suffix}<span class="ml-1.5 font-mono font-medium tabular" style="font-variation-settings: normal">{suffix}</span>{/if}
</span>
