<script lang="ts">
  // A real `gantry check --json` rendered as the owner sees it (DESIGN.md §5.4 discrepancy log).
  import { statusCall } from "#lib/site.ts";
  import CallBlock from "./CallBlock.svelte";
  import CopyButton from "./CopyButton.svelte";
  import Tag from "./Tag.svelte";
  type Fix = { ruleId: string; severity: string; category: string; title: string; plainWhy: string; file: string; line: number; agentPrompt: string };
  type Check = {
    repo: { owner: string; name: string; sha: string | null };
    score: number;
    status: string;
    headline: string;
    topFixes: Fix[];
    categories: Array<{ id: string; label: string; count: number }>;
    notices: string[];
  };
  let { check }: { check: Check } = $props();
  let openIdx = $state<number | null>(0);
  const LABEL: Record<string, string> = { "before-launch": "Fix before launch", soon: "Fix soon", "nice-to-have": "Nice to have" };
</script>

<div class="border-2 border-ink bg-paper">
  <div class="flex flex-wrap items-center gap-3 border-b border-ink px-4 py-3">
    <span class="font-mono text-[13px] text-ink-3"><span class="select-none">$&nbsp;</span>gantry check {check.repo.owner}/{check.repo.name}</span>
  </div>
  <div class="flex flex-wrap items-center gap-4 border-b border-rule px-4 py-4">
    <span class="font-mono text-[38px] leading-none tabular">{check.score}</span>
    <CallBlock call={statusCall(check.status)} />
    <p class="min-w-[16ch] flex-1 text-[15px]">{check.headline}</p>
  </div>
  <ol class="divide-y divide-rule">
    {#each check.topFixes as f, i (f.ruleId)}
      <li>
        <button
          class="grid w-full grid-cols-[28px_1fr] items-start gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-paper-2 sm:grid-cols-[28px_1fr_auto]"
          aria-expanded={openIdx === i}
          onclick={() => (openIdx = openIdx === i ? null : i)}
        >
          <span class="font-mono text-[12px] text-ink-3 tabular">{String(i + 1).padStart(2, "0")}</span>
          <span class="text-[14.5px]">{f.plainWhy}</span>
          <span class="col-start-2 flex items-center gap-2 sm:col-start-3 sm:row-start-1">
            {#if f.category === "before-launch"}<Tag id={f.ruleId} />{:else}<span class="font-mono text-[11px] text-ink-2">{f.ruleId}</span>{/if}
          </span>
          <span class="col-start-2 font-mono text-[11.5px] text-ink-3">{LABEL[f.category]} · {f.file}:{f.line}</span>
        </button>
        {#if openIdx === i}
          <div class="mx-4 mb-4 ml-[52px] border-l-2 border-signal bg-paper-2 px-3 py-3">
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="label text-[10px] text-ink-3">Paste into your AI agent</span>
              <CopyButton text={f.agentPrompt} />
            </div>
            <p class="font-mono text-[12px] leading-relaxed">{f.agentPrompt}</p>
          </div>
        {/if}
      </li>
    {/each}
  </ol>
  <div class="flex flex-wrap gap-x-5 gap-y-1 border-t border-ink px-4 py-3 text-[12.5px]">
    {#each check.categories as c (c.id)}
      <span><span class="text-ink-2">{c.label}:</span> <span class="font-mono tabular">{c.count}</span></span>
    {/each}
  </div>
  <p class="border-t border-rule px-4 py-2 text-[12px] text-ink-3">{check.notices[0]}</p>
</div>
