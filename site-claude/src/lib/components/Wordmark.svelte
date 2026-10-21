<script lang="ts">
  import TowerMark from "./TowerMark.svelte";
</script>

<span class="inline-flex items-center gap-2 text-ink">
  <TowerMark size={22} />
  <span class="relative leading-none">
    <span class="display text-[17px] tracking-[0.04em]" style="font-variation-settings: 'wdth' 125; font-weight: 800">GANTRY</span>
    <span aria-hidden="true" class="absolute left-0 right-0 -bottom-[6px] h-[3px] bg-signal"></span>
  </span>
</span>
