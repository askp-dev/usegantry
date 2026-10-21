<script lang="ts">
  import { toneOf } from "../types";

  let { score, status, size = 96 }: { score: number; status: string; size?: number } = $props();
  const r = 40;
  const c = 2 * Math.PI * r;
  const tone = $derived(toneOf(status === "LAUNCH_READY" ? "ok" : score >= 60 && status !== "LAUNCH_BLOCKED" ? "warn" : "block"));
</script>

<svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Readiness score {score} of 100">
  <circle cx="50" cy="50" {r} fill="none" stroke="var(--color-subtle)" stroke-width="8" />
  <circle
    cx="50" cy="50" {r} fill="none" stroke="var(--color-{tone})" stroke-width="8" stroke-linecap="round"
    stroke-dasharray={c} stroke-dashoffset={c * (1 - score / 100)} transform="rotate(-90 50 50)"
  />
  <text x="50" y="57" text-anchor="middle" class="score" style="font-size:22px" fill="var(--color-primary)">{score}</text>
</svg>
