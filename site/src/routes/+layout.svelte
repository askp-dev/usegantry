<script lang="ts">
  import "../app.css";
  import Footer from "#lib/components/Footer.svelte";
  import Header from "#lib/components/Header.svelte";
  import { SITE } from "#lib/site.ts";
  import { page } from "$app/state";
  let { children } = $props();
</script>

<!-- Shared social preview; pages set og:title and og:description. static/og.png comes from `bun run og`. -->
<svelte:head>
  <link rel="canonical" href="{SITE}{page.url.pathname}" />
  <meta property="og:site_name" content="Gantry" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="{SITE}{page.url.pathname}" />
  <meta property="og:image" content="{SITE}/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Gantry go/no-go board: a sample repo goes from NO-GO to GO on security, privacy, legal and cost." />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<a href="#main" class="label sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:text-[var(--on-signal)]">Skip to content</a>
<Header />
<main id="main">
  {@render children()}
</main>
<Footer />
