<script lang="ts">
  // Install options (WEBSITE_SPEC §2 hero). The binary tab reads the latest GitHub release at runtime,
  // cached per tab in sessionStorage; the page works without it.
  import { onMount } from "svelte";
  import { REPO, SITE } from "#lib/site.ts";
  import CopyButton from "./CopyButton.svelte";

  type Tab = { id: string; label: string; cmd: string; note: string };
  let release = $state<{ tag: string; assets: Array<{ name: string; url: string }> } | null>(null);
  let platform = $state("");
  const tabs: Tab[] = [
    { id: "bunx", label: "Run once", cmd: "bunx @usegantry/cli check .", note: "Needs Bun 1.2+. Nothing to install; nothing leaves your machine." },
    { id: "curl", label: "Binary", cmd: `curl -fsSL ${SITE}/install.sh | sh`, note: "Checks the SHA-256 against the release before installing. No Go/Rust rules in the binary." },
    { id: "mcp", label: "Claude / Cursor", cmd: "bunx @usegantry/cli init .", note: "Adds the MCP server, agent rules and a stop hook that blocks new launch blockers." },
    { id: "ci", label: "GitHub", cmd: "uses: askp-dev/usegantry/.github/workflows/scan.yml@v1", note: "Signed certificate + badge as a build artifact. See Setup below." },
  ];
  let active = $state("bunx");
  const tab = $derived(tabs.find((t) => t.id === active)!);

  onMount(async () => {
    const ua = navigator.userAgent;
    platform = /Mac/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : /Windows/.test(ua) ? "Windows (use WSL or bunx)" : "";
    const KEY = "gantry-release";
    try {
      const cached = sessionStorage.getItem(KEY);
      if (cached) {
        release = JSON.parse(cached);
        return;
      }
    } catch {}
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) return;
      const j = await r.json();
      release = { tag: j.tag_name, assets: (j.assets ?? []).map((a: { name: string; browser_download_url: string }) => ({ name: a.name, url: a.browser_download_url })) };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(release));
      } catch {}
    } catch {}
  });

  function onKey(e: KeyboardEvent) {
    const i = tabs.findIndex((t) => t.id === active);
    if (e.key === "ArrowRight") active = tabs[(i + 1) % tabs.length].id;
    else if (e.key === "ArrowLeft") active = tabs[(i + tabs.length - 1) % tabs.length].id;
    else return;
    e.preventDefault();
    document.getElementById(`tab-${active}`)?.focus();
  }
</script>

<div class="border-2 border-ink">
  <div class="flex overflow-x-auto border-b border-ink" role="tablist" aria-label="Install" tabindex="-1" onkeydown={onKey}>
    {#each tabs as t (t.id)}
      <button
        id="tab-{t.id}"
        role="tab"
        aria-selected={active === t.id}
        aria-controls="panel-install"
        tabindex={active === t.id ? 0 : -1}
        onclick={() => (active = t.id)}
        class="label relative shrink-0 border-r border-rule px-3 py-2.5 text-[10.5px] last:border-r-0 {active === t.id ? 'bg-paper text-signal-ink' : 'bg-paper-2 text-ink-2 hover:text-ink'}"
      >
        {#if active === t.id}<span aria-hidden="true" class="absolute inset-x-0 top-0 h-[3px] bg-signal"></span>{/if}
        {t.label}
      </button>
    {/each}
  </div>
  <div id="panel-install" role="tabpanel" aria-labelledby="tab-{active}" class="flex flex-col gap-2 bg-paper p-3">
    <div class="flex items-center gap-3">
      <code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[13px]"><span class="select-none text-ink-3">$&nbsp;</span>{tab.cmd}</code>
      <CopyButton text={tab.cmd} />
    </div>
    <p class="text-[12px] text-ink-3">
      {tab.note}
      {#if active === "curl"}
        {#if platform}Detected: {platform}.{/if}
        {#if release}Latest: <span class="font-mono">{release.tag}</span>{#if release.assets.length} · <a class="text-signal-ink underline" href="https://github.com/{REPO}/releases/latest">{release.assets.length} downloads</a>{/if}.{/if}
      {/if}
    </p>
  </div>
</div>
