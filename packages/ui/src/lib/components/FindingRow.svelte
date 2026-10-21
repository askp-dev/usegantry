<script lang="ts">
  import { copyText } from "../api";
  import { PILL, toneOf, type Finding } from "../types";

  let { finding }: { finding: Finding } = $props();
  let copied = $state(false);
  const tone = $derived(toneOf(finding.severity));
</script>

<details class="border-t border-subtle py-2.5">
  <summary class="flex cursor-pointer items-baseline gap-2">
    <span class="code-ref rounded-full px-2 py-0.5 font-bold {PILL[tone]}">{finding.severity}</span>
    <span class="code-ref">{finding.ruleId}</span>
    <span class="min-w-0 flex-1">{finding.title}</span>
  </summary>
  <div class="mt-2 space-y-2">
    <div class="code-ref text-secondary">{finding.file}:{finding.line}</div>
    <p>{finding.impact}</p>
    <pre class="code-ref overflow-auto whitespace-pre-wrap rounded-md border border-subtle bg-surface-2 p-2.5">{finding.evidence}</pre>
    <button class="btn-agent" onclick={() => { copyText(finding.agentRemediationPrompt); copied = true; }}>
      {copied ? "Copied ✓" : "✨ Fix with AI Agent"}
    </button>
  </div>
</details>
