<script lang="ts">
  // All rules, with one real finding each from the repo's vulnerable fixtures (generated at build time).
  import rules from "#lib/data/rules.json";
  import { PILLARS, STATION, type PillarKey } from "#lib/site.ts";
  import CopyButton from "./CopyButton.svelte";

  type Rule = (typeof rules)[number];
  let station = $state<PillarKey | "ALL">("ALL");
  let q = $state("");
  let open = $state<string | null>(null);
  const SEV: Record<string, string> = { CRITICAL: "text-nogo", HIGH: "text-ink", MEDIUM: "text-ink-2" };
  const filtered = $derived(
    (rules as Rule[]).filter((r) => {
      if (station !== "ALL" && r.pillar !== station) return false;
      if (!q.trim()) return true;
      const s = q.trim().toLowerCase();
      return `${r.id} ${r.title} ${r.profiles.join(" ")} ${r.example?.impact ?? ""}`.toLowerCase().includes(s);
    }),
  );
  const count = (k: PillarKey) => rules.filter((r) => r.pillar === k).length;
  // Show a short list until the visitor asks for more; any filter or search shows every match.
  const PREVIEW = 12;
  let all = $state(false);
  const narrowed = $derived(station !== "ALL" || q.trim() !== "");
  const shown = $derived(all || narrowed ? filtered : filtered.slice(0, PREVIEW));
</script>

<div class="flex flex-col gap-4">
  <div class="flex flex-wrap items-center gap-3">
    <div class="flex flex-wrap border border-ink" role="group" aria-label="Filter by station">
      {#each [["ALL", `All ${rules.length}`], ...PILLARS.map((k) => [k, `${STATION[k]} ${count(k)}`])] as [k, label] (k)}
        <button
          class="label border-r border-rule px-3 py-2 text-[10.5px] last:border-r-0 {station === k ? 'bg-ink text-paper' : 'text-ink-2 hover:text-ink'}"
          aria-pressed={station === k}
          onclick={() => (station = k as PillarKey | "ALL")}>{label}</button
        >
      {/each}
    </div>
    <label class="flex min-w-[220px] flex-1 items-center gap-2 border border-ink bg-paper-2 px-3">
      <span class="label text-[10px] text-ink-3">Find</span>
      <input bind:value={q} class="h-9 w-full bg-transparent font-mono text-[13px] outline-none placeholder:text-ink-3" placeholder="supabase, stripe, gdpr, useEffect…" />
    </label>
  </div>

  <div class="border-y-2 border-ink">
    <div class="hidden grid-cols-[92px_88px_1fr_120px] gap-3 border-b border-ink px-3 py-2 sm:grid">
      <span class="label text-[10px] text-ink-3">Rule</span><span class="label text-[10px] text-ink-3">Station</span><span class="label text-[10px] text-ink-3">Check</span><span class="label text-right text-[10px] text-ink-3">Severity</span>
    </div>
    {#each shown as r (r.id)}
      <div class="border-b border-rule last:border-b-0">
        <button
          class="grid w-full grid-cols-[92px_1fr] items-baseline gap-x-3 gap-y-0.5 px-3 py-2.5 text-left hover:bg-paper-2 sm:grid-cols-[92px_88px_1fr_120px] {open === r.id ? 'bg-paper-2' : ''}"
          aria-expanded={open === r.id}
          onclick={() => (open = open === r.id ? null : r.id)}
        >
          <span class="font-mono text-[12.5px] font-medium">{r.id}</span>
          <span class="label hidden text-[10px] text-ink-2 sm:inline">{STATION[r.pillar as PillarKey]}</span>
          <span class="text-[14px]">{r.title}{#if r.profiles.length}<span class="ml-2 font-mono text-[11px] text-ink-3">--profile {r.profiles.join(",")}</span>{/if}</span>
          <span class="label col-start-2 text-[10px] sm:col-start-auto sm:text-right {SEV[r.severity]}">{r.severity}</span>
        </button>
        {#if open === r.id && r.example}
          <div class="grid gap-4 border-t border-rule bg-paper px-3 py-4 lg:grid-cols-2">
            <div class="flex flex-col gap-2">
              <span class="label text-[10px] text-ink-3">Found in fixtures/{r.example.fixture}/{r.example.file}:{r.example.line}</span>
              <pre class="overflow-x-auto border-l-2 border-nogo bg-paper-2 px-3 py-2 font-mono text-[12px] leading-relaxed">{r.example.evidence}</pre>
              <p class="text-[14px]">{r.example.impact}</p>
            </div>
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between gap-3">
                <span class="label text-[10px] text-ink-3">Prompt Gantry hands your agent</span>
                <CopyButton text={r.example.prompt} />
              </div>
              <p class="border-l-2 border-signal bg-paper-2 px-3 py-2 font-mono text-[12px] leading-relaxed">{r.example.prompt}</p>
              {#if r.example.patch}
                <span class="label text-[10px] text-ink-3">Deterministic fix</span>
                <pre class="overflow-x-auto border-l-2 border-go bg-paper-2 px-3 py-2 font-mono text-[12px]">{r.example.patch}</pre>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <p class="px-3 py-6 text-ink-3">No rule matches “{q}”.</p>
    {/each}
  </div>
  {#if !narrowed && filtered.length > PREVIEW}
    <button class="label self-start border border-ink px-4 py-2.5 text-[10.5px] hover:bg-ink hover:text-paper" aria-expanded={all} onclick={() => (all = !all)}>
      {all ? "Show fewer" : `Show all ${filtered.length} rules`}
    </button>
  {/if}
</div>
