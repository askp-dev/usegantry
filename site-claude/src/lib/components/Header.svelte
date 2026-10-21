<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { META, REPO_URL } from "#lib/site.ts";
  import TrussRule from "./TrussRule.svelte";
  import Wordmark from "./Wordmark.svelte";
  const links = [
    { href: resolve("/") + "#rules", label: "Rules", match: "" },
    { href: resolve("/") + "#setup", label: "Setup", match: "" },
    { href: resolve("/docs"), label: "Docs", match: "/docs" },
    { href: resolve("/roast"), label: "Roast", match: "/roast" },
    { href: resolve("/verify"), label: "Verify", match: "/verify" },
  ];
  let open = $state(false);
</script>

<header class="sticky top-0 z-20 bg-paper">
  <div class="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6">
    <a href={resolve("/")} class="flex items-center gap-3" aria-label="Gantry home"><Wordmark /></a>
    <span class="hidden font-mono text-[11px] text-ink-3 md:inline">v{META.version} · MIT</span>
    <nav class="ml-auto hidden items-center gap-5 md:flex" aria-label="Main">
      {#each links as l (l.label)}
        <a
          href={l.href}
          class="label text-[11px] text-ink-2 hover:text-ink {l.match && page.url.pathname.startsWith(l.match) ? '!text-signal-ink' : ''}"
          aria-current={l.match && page.url.pathname.startsWith(l.match) ? "page" : undefined}>{l.label}</a
        >
      {/each}
      <a href={REPO_URL} class="label border border-ink px-3 py-1.5 text-[11px] hover:bg-ink hover:text-paper">GitHub</a>
    </nav>
    <button class="label ml-auto border border-ink px-3 py-1.5 text-[11px] md:hidden" aria-expanded={open} aria-controls="mobile-nav" onclick={() => (open = !open)}>
      Menu
    </button>
  </div>
  {#if open}
    <nav id="mobile-nav" class="border-t border-rule px-4 py-2 md:hidden" aria-label="Main">
      {#each links as l (l.label)}
        <a href={l.href} onclick={() => (open = false)} class="label block border-b border-rule py-3 text-[12px] last:border-0">{l.label}</a>
      {/each}
      <a href={REPO_URL} class="label block py-3 text-[12px]">GitHub</a>
    </nav>
  {/if}
  <TrussRule />
</header>
