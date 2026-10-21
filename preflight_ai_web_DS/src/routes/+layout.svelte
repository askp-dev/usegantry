<script lang="ts">
	import '../app.css';
	import Navbar from '#lib/components/Navbar.svelte';
	import Footer from '#lib/components/Footer.svelte';
	import { site } from '#lib/config';

	let { children } = $props();
</script>

<svelte:head>
	<title>Preflight — Compliance, Security &amp; FinOps for AI-built software</title>
	<meta
		name="description"
		content="Catch missing Supabase RLS, hallucinated packages, AGPL traps, infinite token loops and stale legal policies inside Cursor and Claude Code — before you launch."
	/>
	<meta name="author" content="Preflight AI" />
	<meta property="og:site_name" content="Preflight" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Preflight — clear the runway before you ship" />
	<meta
		property="og:description"
		content="43 deterministic security, legal and FinOps checks for AI-built software. Under 1.1 seconds. Zero cloud upload."
	/>
	<meta property="og:image" content={`${site.domain}/og.svg`} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content="Preflight — clear the runway before you ship" />
	<meta
		name="twitter:description"
		content="43 deterministic checks. One launch gate. Built into Cursor and Claude Code."
	/>
	<meta name="twitter:image" content={`${site.domain}/og.svg`} />
	<link rel="canonical" href={site.domain} />
</svelte:head>

<a
	href="#main"
	class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-emerald-500 focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:text-black"
>
	Skip to content
</a>

<div class="relative flex min-h-screen flex-col">
	<div
		class="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.06),transparent_75%)]"
		aria-hidden="true"
	></div>
	<Navbar />
	<main id="main" class="flex-1">
		{@render children()}
	</main>
	<Footer />
</div>
