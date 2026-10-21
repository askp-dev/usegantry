<script lang="ts">
  import "../app.css";
  import Footer from "#lib/components/Footer.svelte";
  import Header from "#lib/components/Header.svelte";
  let { children } = $props();
</script>

<a href="#main" class="label sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-signal focus:px-3 focus:py-2 focus:text-[var(--on-signal)]">Skip to content</a>
<Header />
<main id="main">
  {@render children()}
</main>
<Footer />
