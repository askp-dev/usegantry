<script lang="ts">
  import { resolve } from "$app/paths";
  import { META, REPO_URL } from "#lib/site.ts";
  import TitleBlock from "./TitleBlock.svelte";
  import Wordmark from "./Wordmark.svelte";
</script>

<footer class="mt-24 border-t-2 border-ink">
  <div class="mx-auto grid max-w-[1200px] gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
    <div class="flex flex-col gap-5">
      <Wordmark />
      <p class="max-w-[52ch] text-[13px] text-ink-2">
        Static analysis, not a security audit or legal advice. A GO means Gantry's checks passed on that commit. It doesn't mean the code is safe.
      </p>
      <nav class="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
        <a class="label text-[11px] text-ink-2 hover:text-ink" href={resolve("/docs")}>Docs</a>
        <a class="label text-[11px] text-ink-2 hover:text-ink" href={resolve("/verify")}>Verify a certificate</a>
        <a class="label text-[11px] text-ink-2 hover:text-ink" href={resolve("/roast")}>Roast</a>
        <a class="label text-[11px] text-ink-2 hover:text-ink" href={REPO_URL}>Source</a>
        <a class="label text-[11px] text-ink-2 hover:text-ink" href="{REPO_URL}/blob/main/LICENSE">MIT licence</a>
        <a class="label text-[11px] text-ink-2 hover:text-ink" href="{resolve('/')}#contact">Contact</a>
      </nav>
    </div>
    <TitleBlock
      rows={[
        ["Project", "usegantry.app"],
        ["Release", `v${META.version}`],
        ["Ruleset", META.rulesetVersion],
        ["Checks", `${META.ruleCount} static · ${META.probes} live`],
        ["Sheet", "1 of 1"],
      ]}
    />
  </div>
</footer>
