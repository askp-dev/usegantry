<script lang="ts">
  // No hosted endpoint: roasting runs on your machine. This page builds the command, then renders the JSON it prints.
  import CodeBlock from "#lib/components/CodeBlock.svelte";
  import RoastCard from "#lib/components/RoastCard.svelte";
  import sample from "#lib/data/sample.json";

  type Roast = typeof sample.before.roast;
  let url = $state("");
  let pasted = $state("");
  let error = $state("");
  let roast = $state<Roast>(sample.before.roast);
  let mine = $state(false);

  // Mirrors the CLI allowlist (packages/core/src/check/fetch.ts): https://github.com/<owner>/<repo>[/tree/<ref>].
  const GH = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}(?:\/tree\/[A-Za-z0-9._/-]{1,200})?\/?$/;
  const valid = $derived(GH.test(url.trim()) && !/(^|\/)\.\.(\/|$)/.test(url));
  const cmd = $derived(valid ? `bunx @usegantry/cli roast ${url.trim().replace(/\/$/, "")} --json > roast.json` : "bunx @usegantry/cli roast https://github.com/<owner>/<repo> --json > roast.json");

  function load(text: string) {
    error = "";
    try {
      const j = JSON.parse(text);
      const okPillars = Array.isArray(j.pillars) && j.pillars.length === 4 && j.pillars.every((p: { pillar: unknown; score: unknown; line: unknown }) => typeof p.pillar === "string" && typeof p.score === "number" && typeof p.line === "string");
      if (j.mode !== "roast" || typeof j.score !== "number" || typeof j.verdict !== "string" || !okPillars || !j.counts || !j.repo) throw new Error();
      roast = { ...j, pillars: j.pillars.map((p: { pillar: string; score: number; line: string }) => ({ pillar: p.pillar.slice(0, 12), score: Math.max(0, Math.min(100, p.score)), line: p.line.slice(0, 70) })) };
      mine = true;
    } catch {
      error = "That isn't the output of `gantry roast --json`.";
    }
  }
  async function onFile(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f && f.size < 512_000) load(await f.text());
    else if (f) error = "That file is too large to be a roast.";
  }
</script>

<svelte:head>
  <title>Roast a repo · Gantry</title>
  <meta name="description" content="Will your vibe-coded app survive launch? Make a shareable survival card that never reveals file names, routes or secrets." />
  <meta property="og:title" content="Roast a repo · Gantry" />
  <meta property="og:description" content="Will your vibe-coded app survive launch? Make a shareable survival card that never reveals file names, routes or secrets." />
</svelte:head>

<section class="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.35fr]">
  <div class="flex flex-col gap-6">
    <div class="flex flex-col gap-3">
      <p class="label text-[11px] text-ink-2">Roast</p>
      <h1 class="display text-[38px] sm:text-[48px]">Will it survive launch?</h1>
      <p class="text-[15px] text-ink-2">
        The roast runs on your machine: it downloads a snapshot of the repo, scans it, and makes a card from canned lines. The card never includes file names, routes, line
        numbers or secrets, so it's safe to post.
      </p>
    </div>

    <ol class="flex flex-col gap-5">
      <li class="flex flex-col gap-2">
        <label for="repo" class="label text-[11px]">1 · Repo</label>
        <input id="repo" bind:value={url} class="h-11 border border-ink bg-paper-2 px-3 font-mono text-[13px] outline-none" placeholder="https://github.com/owner/repo" autocomplete="off" spellcheck="false" aria-invalid={url !== "" && !valid} aria-describedby="repo-help" />
        <p id="repo-help" class="text-[12px] {url && !valid ? 'text-nogo' : 'text-ink-3'}">{url && !valid ? "Only https://github.com/<owner>/<repo> links." : "Public repos work as is. For private ones, log in with `gh auth login` first."}</p>
      </li>
      <li class="flex flex-col gap-2">
        <span class="label text-[11px]">2 · Run</span>
        <CodeBlock code={cmd} label="terminal" />
      </li>
      <li class="flex flex-col gap-2">
        <span class="label text-[11px]">3 · Load the result</span>
        <input type="file" accept="application/json,.json" onchange={onFile} class="text-[13px] file:label file:mr-3 file:border file:border-ink file:bg-paper file:px-3 file:py-2 file:text-[10.5px]" />
        <details>
          <summary class="label cursor-pointer text-[10.5px] text-ink-2">Or paste JSON</summary>
          <textarea bind:value={pasted} rows="5" class="mt-2 w-full border border-ink bg-paper-2 p-2 font-mono text-[12px] outline-none"></textarea>
          <button class="label mt-2 border border-ink px-3 py-2 text-[10.5px] hover:bg-ink hover:text-paper" onclick={() => load(pasted)}>Render</button>
        </details>
        {#if error}<p class="text-[13px] text-nogo" role="alert">{error}</p>{/if}
      </li>
    </ol>
  </div>

  <div class="flex flex-col gap-3 lg:pt-14">
    <span class="label text-[11px] text-ink-2">{mine ? "Your card" : "Example · acme/vulnerable-saas"}</span>
    <RoastCard {roast} />
    <p class="text-[12px] text-ink-3">The CLI also writes the card as <span class="font-mono">gantry-roast.svg</span> for posting. For the actual fixes, run <span class="font-mono">gantry check</span>.</p>
  </div>
</section>
