<script lang="ts">
  // Data-flow schematic for the top of the site. It plays the scan once as a state change (DESIGN.md §3.6), then holds on the final frame.
  // Reduced motion: the CSS base state is the final frame, and packets are hidden.
  import sample from "#lib/data/sample.json";
  import { callOf, META, PILLARS, STATION, statusCall, type Call } from "#lib/site.ts";
  import CallBlock from "./CallBlock.svelte";

  const s = sample.before;
  let run = $state(0);

  const inputs = [
    { y: 82, label: "Local folder", cmd: "gantry scan ." },
    { y: 170, label: "GitHub repo", cmd: "gantry check <url>" },
    { y: 258, label: "AI agent", cmd: "MCP · stop hook" },
  ];
  const facts = [
    `${s.stats.files} files`,
    `${s.stats.routes} routes`,
    `${s.stats.tables} tables`,
    `${s.stats.dependencies} deps`,
  ];
  const ARM_Y = [76, 136, 196, 256];
  const stations = PILLARS.map((k, i) => {
    const p = s.pillars.find((x) => x.pillar === k) ?? { critical: 0, high: 0 };
    return { y: ARM_Y[i], name: STATION[k], rules: META.pillarCounts[k] ?? 0, call: callOf(p) as Call };
  });
  const outputs = [
    { y: 76, label: "Report", cmd: "plain-English fixes" },
    { y: 136, label: "Agent prompts", cmd: "MCP · Cursor · Claude" },
    { y: 196, label: "Code scanning", cmd: "SARIF · GitHub CI" },
    { y: 256, label: "Clearance", cmd: "signed certificate" },
  ];
  const fill: Record<Call, [string, string]> = {
    GO: ["var(--go)", "var(--on-go)"],
    HOLD: ["var(--hold)", "var(--on-hold)"],
    "NO-GO": ["var(--nogo)", "var(--on-nogo)"],
  };
  const balloons = [
    { x: 114, n: 1, t: "Ingest" },
    { x: 348, n: 2, t: "Context" },
    { x: 524, n: 3, t: "Tower" },
    { x: 740, n: 4, t: "Stations" },
    { x: 1048, n: 5, t: "Output" },
  ];
  // K-bracing between the tower's two members, 312 → 40.
  const brace = Array.from({ length: 9 }, (_, i) => `${i % 2 ? "L500" : "L548"} ${312 - (i + 1) * 30}`).join(" ");
  const d = (t: number) => `--d:${t}s`;
  const overall = statusCall(s.check.status);

  // When the sheet is wider than its frame (phones, narrow windows), pan the frame to follow the packets: [seconds, sheet x].
  const PAN = [[0, 114], [0.9, 160], [1.6, 348], [2.4, 524], [3.4, 740], [4.6, 900], [5.6, 1080]];
  let frame: HTMLDivElement;
  $effect(() => {
    run;
    if (frame.scrollWidth <= frame.clientWidth || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const stop = () => cancelAnimationFrame(raf);
    const ease = (u: number) => 1 - (1 - u) ** 3;
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const next = PAN.findIndex(([at]) => at > t);
      const i = next < 0 ? PAN.length - 1 : Math.max(0, next - 1);
      const [a, xa] = PAN[i];
      const [b, xb] = PAN[i + 1] ?? PAN[i];
      const x = b > a ? xa + (xb - xa) * ease(Math.min(1, (t - a) / (b - a))) : xa;
      frame.scrollLeft = x * (frame.scrollWidth / 1200) - frame.clientWidth / 2;
      if (t < PAN[PAN.length - 1][0]) raf = requestAnimationFrame(tick);
    };
    frame.scrollLeft = 0;
    raf = requestAnimationFrame(tick);
    for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) frame.addEventListener(e, stop, { once: true, passive: true });
    return () => {
      stop();
      for (const e of ["pointerdown", "wheel", "touchstart", "keydown"]) frame.removeEventListener(e, stop);
    };
  });
</script>

<figure class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <span class="label text-[11px] text-ink-2">Data flow · sheet 0 · acme/{s.check.repo.name}</span>
    <div class="flex items-center gap-3">
      {#key run}<span class="fade" style={d(5.8)}><CallBlock call={overall} suffix={`${s.blockers} tags`} size="sm" /></span>{/key}
      <button class="label border border-ink px-3 py-1.5 text-[10px] hover:bg-ink hover:text-paper" onclick={() => run++}>Replay</button>
    </div>
  </div>

  <div bind:this={frame} class="drawing-grid overflow-x-auto border-2 border-ink">
    {#key run}
      <svg viewBox="0 0 1200 340" class="block w-full min-w-[820px]" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">How a Gantry scan flows</title>
        <desc id="flow-desc">
          A local folder, a GitHub repo or an AI agent feeds one repo context ({facts.join(", ")}). The context rises through the tower to four stations:
          {stations.map((st) => `${st.name} ${st.call}`).join(", ")}. The calls become a report, agent fix prompts, SARIF for code scanning and a clearance
          certificate. Everything runs on your machine.
        </desc>

        <!-- Machine boundary: nothing leaves it. -->
        <rect x="8" y="8" width="1184" height="324" class="boundary" />
        <text x="20" y="324" class="lbl muted">Your machine · 0 B code uploaded</text>

        <!-- Callout balloons -->
        {#each balloons as b, i (b.n)}
          <g class="fade" style={d(i * 0.9)}>
            <circle cx={b.x - 34} cy="26" r="9" class="balloon" />
            <text x={b.x - 34} y="29.5" class="mono tiny" text-anchor="middle">{b.n}</text>
            <text x={b.x - 20} y="30" class="lbl">{b.t}</text>
          </g>
        {/each}

        <!-- 1 · Ingest -->
        {#each inputs as inp, i (inp.label)}
          <g class="fade" style={d(i * 0.1)}>
            <rect x="24" y={inp.y - 24} width="180" height="48" class="box" />
            <text x="36" y={inp.y - 5} class="lbl">{inp.label}</text>
            <text x="36" y={inp.y + 13} class="mono small">{inp.cmd}</text>
          </g>
          <path pathLength="1" class="pipe draw" style={d(0.4 + i * 0.1)} d={inp.y === 170 ? "M204 170H268" : `M204 ${inp.y}H236V170H268`} />
        {/each}

        <!-- 2 · Context -->
        <g class="fade" style={d(1.3)}>
          <rect x="268" y="110" width="160" height="120" class="box heavy" />
          <text x="280" y="130" class="lbl">Repo context</text>
          <line x1="268" y1="138" x2="428" y2="138" class="rule" />
        </g>
        {#each facts as f, i (f)}
          <text x="280" y={158 + i * 18} class="mono small fade" style={d(1.5 + i * 0.12)}>{f}</text>
        {/each}
        <path pathLength="1" class="pipe draw" style={d(1.9)} d="M428 170H460V312H524" />

        <!-- 3 · The tower -->
        <g class="fade" style={d(1.9)}>
          <path d="M500 40V312M548 40V312M484 312H564M496 40H552" class="member" />
          <path d="M500 312 {brace}" class="bracing" />
          <path d="M524 312V52" class="hidden-line" />
        </g>
        {#each stations as st, i (st.name)}
          <g class="fade" style={d(2.3 + i * 0.08)}>
            <path d="M548 {st.y - 5}H640M548 {st.y + 5}H640 {[548, 571, 594, 617].map((x) => `M${x} ${st.y + 5}L${x + 23} ${st.y - 5}`).join('')}" class="arm" />
          </g>
        {/each}

        <!-- 4 · Stations -->
        {#each stations as st, i (st.name)}
          <g class="fade" style={d(2.4 + i * 0.08)}>
            <rect x="640" y={st.y - 22} width="200" height="44" class="box" />
            <text x="652" y={st.y - 3} class="lbl">{st.name}</text>
            <text x="652" y={st.y + 13} class="mono tiny muted">{st.rules} rules</text>
          </g>
          <g class="stamp" style={d(3.6 + i * 0.18)}>
            <rect x="752" y={st.y - 11} width="78" height="22" fill={fill[st.call][0]} />
            <text x="791" y={st.y + 4} class="lbl" text-anchor="middle" style="fill:{fill[st.call][1]}">{st.call}</text>
          </g>
          <path pathLength="1" class="pipe draw" style={d(4.3)} d="M840 {st.y}H880" />
        {/each}

        <!-- 5 · Outputs -->
        <path pathLength="1" class="pipe draw" style={d(4.5)} d="M880 76V256" />
        {#each outputs as o, i (o.label)}
          <path pathLength="1" class="pipe draw" style={d(4.7)} d="M880 {o.y}H920" />
          <g class="fade" style={d(5.3 + i * 0.12)}>
            <rect x="920" y={o.y - 22} width="256" height="44" class="box" />
            <text x="932" y={o.y - 3} class="lbl">{o.label}</text>
            <text x="932" y={o.y + 13} class="mono tiny muted">{o.cmd}</text>
          </g>
        {/each}

        <!-- Packets: the only motion that isn't a reveal. Hidden under reduced motion. -->
        {#each inputs as inp, i (inp.label)}
          {@render packet(inp.y === 170 ? "M204 170H268" : `M204 ${inp.y}H236V170H268`, 0.8 + i * 0.1, 0.6)}
        {/each}
        {@render packet("M428 170H460V312H524", 2.1, 0.6)}
        {#each stations as st, i (st.name)}
          {@render packet(`M524 312V${st.y}H640`, 2.7 + i * 0.12, 0.9 + (3 - i) * 0.06)}
        {/each}
        {#each outputs as o, i (o.label)}
          {@render packet(`M880 166V${o.y}H920`, 4.8 + i * 0.06, 0.5)}
        {/each}
      </svg>
    {/key}
  </div>
  <figcaption class="text-[12px] text-ink-3">
    The same scan as the board below: three ways in, one repo context, four stations, four outputs. Nothing leaves your machine.
  </figcaption>
</figure>

{#snippet packet(path: string, begin: number, dur: number)}
  <rect class="packet" x="-4" y="-4" width="8" height="8" opacity="0">
    <animateMotion {path} begin="{begin}s" dur="{dur}s" fill="freeze" calcMode="spline" keySplines="0.2 0 0 1" keyTimes="0;1" />
    <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" begin="{begin}s" dur="{dur}s" fill="freeze" />
  </rect>
{/snippet}

<style>
  svg {
    font-family: var(--font-sans);
  }
  .boundary {
    fill: none;
    stroke: var(--rule);
    stroke-dasharray: 4 4;
  }
  .box {
    fill: var(--paper);
    stroke: var(--ink);
    stroke-width: 1;
  }
  .heavy {
    stroke-width: 2;
  }
  .rule {
    stroke: var(--rule);
  }
  .balloon {
    fill: var(--paper);
    stroke: var(--ink);
  }
  .member {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2;
    stroke-linecap: square;
  }
  .bracing,
  .arm {
    fill: none;
    stroke: var(--ink-2);
    stroke-width: 1;
  }
  .hidden-line {
    stroke: var(--signal);
    stroke-width: 1;
    stroke-dasharray: 6 4;
  }
  .pipe {
    fill: none;
    stroke: var(--ink-3);
    stroke-width: 1.5;
  }
  .packet {
    fill: var(--signal);
  }
  .lbl {
    font-family: var(--font-display);
    font-variation-settings: "wdth" 125;
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: var(--ink);
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    fill: var(--ink);
  }
  .small {
    font-size: 12px;
  }
  .tiny {
    font-size: 10.5px;
  }
  .muted {
    fill: var(--ink-3);
  }

  /* Base state is the final frame; animations only run from the start state toward it. */
  .draw {
    stroke-dasharray: 1;
    animation: draw 600ms cubic-bezier(0.2, 0, 0, 1) var(--d) both;
  }
  .fade {
    animation: fade 200ms cubic-bezier(0.2, 0, 0, 1) var(--d) both;
  }
  .stamp {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 200ms cubic-bezier(0.2, 0, 0, 1) var(--d) both;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.25);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .packet {
      display: none;
    }
  }
</style>
