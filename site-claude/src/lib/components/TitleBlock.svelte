<script lang="ts">
  // Drawing title block (DESIGN.md §5.9).
  let { rows }: { rows: Array<[string, string]> } = $props();
</script>

<table class="border-collapse border border-ink text-left">
  <tbody>
    {#each rows as [k, v] (k)}
      <tr class="border-t border-rule first:border-t-0">
        <th scope="row" class="label border-r border-rule px-2 py-1 text-[9px] font-semibold text-ink-3">{k}</th>
        <td class="px-2 py-1 font-mono text-[12px] tabular text-ink">{v}</td>
      </tr>
    {/each}
  </tbody>
</table>
