<script lang="ts">
  // The survival card in the DESIGN.md §7.2 layout. Rendered from roast JSON fields (Svelte escapes every string);
  // a pasted `cardSvg` is never injected.
  type Roast = { repo: { owner: string; name: string }; score: number; verdict: string; pillars: Array<{ pillar: string; score: number; line: string }>; counts: { critical: number; high: number; medium: number } };
  let { roast }: { roast: Roast } = $props();
  const call = (s: number) => (s >= 90 ? "GO" : s >= 60 ? "HOLD" : "NO-GO");
  const fill = (c: string) => (c === "GO" ? "var(--go)" : c === "HOLD" ? "var(--hold)" : "var(--nogo)");
  const onFill = (c: string) => (c === "HOLD" ? "var(--on-hold)" : "var(--on-go)");
  const repo = $derived(`${roast.repo.owner ? `${roast.repo.owner}/` : ""}${roast.repo.name}`.slice(0, 40));
  const vc = $derived(roast.verdict === "Survives launch" ? "GO" : roast.verdict === "Shaky" ? "HOLD" : "NO-GO");
</script>

<svg viewBox="0 0 1200 630" class="block h-auto w-full border-2 border-ink" role="img" aria-label="Survival card: {roast.verdict}, {roast.score} of 100">
  <rect width="1200" height="630" fill="var(--paper)" />
  <text x="56" y="84" font-family="Archivo Variable" font-weight="700" font-size="22" letter-spacing="2.6" style="font-variation-settings:'wdth' 125" fill="var(--ink-2)">VIBE-CODE SURVIVAL CARD</text>
  <text x="56" y="300" font-family="Martian Mono" font-size="168" fill="var(--ink)">{roast.score}</text>
  <rect x="60" y="340" width={Math.max(220, roast.verdict.length * 23)} height="52" fill={fill(vc)} />
  <text x="76" y="377" font-family="Archivo Variable" font-weight="700" font-size="30" style="font-variation-settings:'wdth' 112" fill={onFill(vc)}>{roast.verdict}</text>
  <text x="60" y="436" font-family="Martian Mono" font-size="20" fill="var(--ink-2)">{roast.counts.critical} critical · {roast.counts.high} high · {roast.counts.medium} medium</text>
  <line x1="560" y1="56" x2="560" y2="500" stroke="var(--ink)" stroke-width="2" />
  {#each roast.pillars as p, i (p.pillar)}
    {@const y = 64 + i * 110}
    {@const c = call(p.score)}
    <text x="596" y={y + 22} font-family="Archivo Variable" font-weight="600" font-size="16" letter-spacing="2" style="font-variation-settings:'wdth' 125" fill="var(--ink-2)">{p.pillar.toUpperCase()}</text>
    <rect x="596" y={y + 36} width={c === "NO-GO" ? 92 : c === "HOLD" ? 74 : 50} height="28" fill={fill(c)} />
    <text x="606" y={y + 57} font-family="Archivo Variable" font-weight="700" font-size="17" fill={onFill(c)}>{c}</text>
    <text x="1144" y={y + 60} text-anchor="end" font-family="Martian Mono" font-size="30" fill="var(--ink)">{p.score}</text>
    <text x="596" y={y + 92} font-family="Public Sans" font-size="18" fill="var(--ink)">{p.line}</text>
    {#if i < 3}<line x1="596" y1={y + 108} x2="1144" y2={y + 108} stroke="var(--rule)" />{/if}
  {/each}
  <line x1="40" y1="520" x2="1160" y2="520" stroke="var(--ink)" stroke-width="2" />
  <text x="56" y="566" font-family="Martian Mono" font-size="18" fill="var(--ink-2)">{repo}</text>
  <text x="56" y="594" font-family="Public Sans" font-size="16" fill="var(--ink-3)">Static scan, not a pentest. Run `gantry check` for the fixes.</text>
  <rect x="1000" y="546" width="144" height="4" fill="var(--signal)" />
  <text x="1144" y="590" text-anchor="end" font-family="Archivo Variable" font-weight="800" font-size="22" letter-spacing="1.2" style="font-variation-settings:'wdth' 125" fill="var(--ink)">USEGANTRY.APP</text>
</svg>
