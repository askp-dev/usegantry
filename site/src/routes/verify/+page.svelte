<script lang="ts">
  import { onMount } from "svelte";
  import CallBlock from "#lib/components/CallBlock.svelte";
  import Tag from "#lib/components/Tag.svelte";
  import TitleBlock from "#lib/components/TitleBlock.svelte";
  import TrussRule from "#lib/components/TrussRule.svelte";
  import { META, statusCall } from "#lib/site.ts";
  import { type Result, verifyFragment } from "#lib/verify.ts";

  let result = $state<Result | null>(null);
  let input = $state("");
  const check = async () => (result = await verifyFragment(location.hash, META.centralPublicKey));
  onMount(() => {
    check();
    addEventListener("hashchange", check);
    return () => removeEventListener("hashchange", check);
  });
  function submit(e: SubmitEvent) {
    e.preventDefault();
    const hash = input.trim().replace(/^.*#/, "");
    if (hash) location.hash = hash;
  }
  const cert = $derived(result && "cert" in result ? result.cert : undefined);
  const when = (iso?: string) => (iso ? iso.replace("T", " ").replace(/\.\d+Z$/, " UTC") : "—");
</script>

<svelte:head>
  <title>Verify a certificate · Gantry</title>
  <meta name="description" content="Check a Gantry Launch Clearance certificate in your browser. Nothing is sent to a server." />
  <meta property="og:title" content="Verify a certificate · Gantry" />
  <meta property="og:description" content="Check a Gantry Launch Clearance certificate in your browser. Nothing is sent to a server." />
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="mx-auto flex max-w-[900px] flex-col gap-8 px-4 py-12 sm:px-6">
  <div class="flex flex-col gap-3">
    <p class="label text-[11px] text-ink-2">Verify</p>
    <h1 class="display text-[38px] sm:text-[48px]">Check a launch clearance.</h1>
    <p class="max-w-[62ch] text-[15px] text-ink-2">
      The certificate lives in the link itself. This page checks its signature against Gantry's public key, in your browser. Nothing is uploaded.
    </p>
  </div>

  {#if result === null}
    <p class="font-mono text-[13px] text-ink-3" aria-live="polite">Checking…</p>
  {:else if result.state === "empty" || result.state === "malformed"}
    <form class="flex flex-col gap-3 border-2 border-ink p-4" onsubmit={submit}>
      {#if result.state === "malformed"}<p class="border-l-2 border-nogo pl-3 text-[14px]" role="alert">{result.reason}</p>{/if}
      <label for="cert" class="label text-[11px]">Certificate link</label>
      <input id="cert" bind:value={input} class="h-11 border border-ink bg-paper-2 px-3 font-mono text-[13px] outline-none" placeholder="https://usegantry.app/verify#eyJ…" autocomplete="off" spellcheck="false" />
      <p class="text-[12px] text-ink-3">It's in the certificate's footer and in <span class="font-mono">.gantry/cert.url</span> after <span class="font-mono">gantry clear</span>.</p>
      <button class="label self-start bg-signal px-4 py-2.5 text-[11px] text-[var(--on-signal)] hover:bg-ink hover:text-paper">Check</button>
    </form>
  {:else if result.state === "unsupported"}
    <p class="border-l-2 border-hold pl-3 text-[14px]" role="alert">This browser can't check Ed25519 signatures. Try a current Chrome, Firefox or Safari.</p>
  {:else}
    <div role="status" class="flex flex-wrap items-center gap-3 border-2 p-4 {result.state === 'verified' ? 'border-go' : 'border-nogo'}">
      {#if result.state === "verified"}
        <CallBlock call="GO" suffix="VERIFIED" />
        <p class="text-[14.5px]">Signed by Gantry CI. The result below is exactly what the official workflow produced for this commit.</p>
      {:else if result.state === "self-signed"}
        <CallBlock call="HOLD" suffix="SELF-SIGNED" />
        <p class="text-[14.5px]">Made on someone's own machine with a local key. It may be genuine, but Gantry can't vouch for it. Ask for a certificate from the GitHub workflow.</p>
      {:else}
        <CallBlock call="NO-GO" suffix="INVALID" />
        <p class="text-[14.5px]">The signature doesn't match. The certificate was edited, cut off, or wasn't issued by Gantry. Don't rely on anything below.</p>
      {/if}
    </div>

    {#if cert}
      <article class="border-2 border-ink bg-paper {result.state === 'invalid' ? 'opacity-60' : ''}" aria-label="Certificate">
        <TrussRule />
        <div class="flex flex-col gap-6 p-5 sm:p-7">
          <header class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="display text-[24px]" style="font-variation-settings:'wdth' 125">
                {result.state === "invalid" ? "UNVERIFIED CLAIMS" : result.state === "self-signed" ? "LAUNCH CLEARANCE · SELF-SIGNED" : "LAUNCH CLEARANCE"}
              </p>
              <p class="font-mono text-[14px] text-ink-2">{cert.repository ?? cert.projectName}</p>
            </div>
            {#if result.state === "invalid"}
              <!-- Never show a CLEARED stamp on a certificate whose signature failed: a screenshot of it would mislead. -->
              <CallBlock call="NO-GO" size="lg" suffix="INVALID" />
            {:else}
              <CallBlock call={cert.blockers ? "NO-GO" : statusCall(cert.status)} size="lg" suffix={cert.blockers ? "NOT CLEARED" : "CLEARED"} />
            {/if}
          </header>
          <dl class="grid grid-cols-2 border-y-2 border-ink sm:grid-cols-4">
            <div class="p-3"><dt class="label text-[10px] text-ink-3">Score</dt><dd class="font-mono text-[30px] tabular">{cert.overallScore}</dd></div>
            <div class="border-l border-rule p-3"><dt class="label text-[10px] text-ink-3">Blockers</dt><dd class="font-mono text-[30px] tabular">{cert.blockers}</dd></div>
            <div class="border-rule p-3 sm:border-l"><dt class="label text-[10px] text-ink-3">Rules passed</dt><dd class="font-mono text-[30px] tabular">{cert.passedRules.length}<span class="text-[14px] text-ink-3">/{cert.passedRules.length + cert.failedRules.length}</span></dd></div>
            <div class="border-l border-rule p-3"><dt class="label text-[10px] text-ink-3">Suppressed</dt><dd class="font-mono text-[30px] tabular">{cert.suppressed ?? "—"}</dd></div>
          </dl>
          {#if cert.suppressed}<p class="text-[13px] text-ink-2">{cert.suppressed} finding(s) were hidden by the repo's own gantry-ignore comments or config. Ask what they were.</p>{/if}
          {#if cert.failedRules.length}
            <div class="flex flex-col gap-2">
              <span class="label text-[10px] text-ink-3">Failed checks</span>
              <div class="flex flex-wrap gap-1.5">
                {#each cert.failedRules as id (id)}<Tag {id} />{/each}
              </div>
            </div>
          {/if}
          <details class="border-t border-rule pt-3">
            <summary class="label cursor-pointer text-[10.5px] text-ink-2">Passed checks ({cert.passedRules.length})</summary>
            <p class="mt-2 font-mono text-[12px] leading-relaxed text-ink-2">{cert.passedRules.join(" · ")}</p>
          </details>
          {#if cert.subprocessors.length}
            <p class="text-[13px]"><span class="label text-[10px] text-ink-3">Sub-processors</span><br />{cert.subprocessors.join(", ")}</p>
          {/if}
          <div class="flex flex-wrap items-end justify-between gap-4 border-t border-rule pt-4">
            <p class="max-w-[42ch] text-[12px] text-ink-3">Automated static scan of one commit. Not a security audit or legal advice.</p>
            <TitleBlock
              rows={[
                ["Project", cert.repository ?? cert.projectName],
                ["Commit", (cert.commitSha || "—").slice(0, 12)],
                ["Ruleset", cert.rulesetVersion],
                ["Advisories", cert.advisoriesAsOf ? `as of ${when(cert.advisoriesAsOf)}` : "not checked"],
                ["Issued", when(cert.signedAt ?? cert.timestamp)],
                ["Signed", cert.issuer === "gantry-ci" ? `Gantry CI · run ${cert.runId ?? "?"}` : "Local key"],
              ]}
            />
          </div>
        </div>
      </article>
    {/if}
    <button class="label self-start border border-ink px-3 py-2 text-[10.5px] hover:bg-ink hover:text-paper" onclick={() => { location.hash = ""; result = { state: "empty" }; }}>Check another</button>
  {/if}

  <p class="border-t border-rule pt-4 font-mono text-[11px] text-ink-3">Gantry public key (Ed25519): {META.centralPublicKey}</p>
</section>
