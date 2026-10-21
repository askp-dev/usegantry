<script lang="ts">
  import type { AuditReport, DataFlowNode } from "../types";

  let { graph, selected = null, onselect }: { graph: AuditReport["graph"]; selected?: string | null; onselect: (id: string | null) => void } = $props();

  const COLUMNS: Array<[DataFlowNode["column"], string]> = [
    ["entrypoint", "Entrypoints"],
    ["api", "API & Server Actions"],
    ["database", "Database Tables"],
    ["vendor", "Sub-Processors"],
  ];
  const COL_W = 220, NODE_W = 180, NODE_H = 52, GAP = 12, TOP = 28;

  const layout = $derived.by(() => {
    const pos = new Map<string, { x: number; y: number; node: DataFlowNode }>();
    COLUMNS.forEach(([col], ci) =>
      graph.nodes.filter((n) => n.column === col).forEach((node, i) => pos.set(node.id, { x: ci * COL_W, y: TOP + i * (NODE_H + GAP), node })),
    );
    return pos;
  });
  const height = $derived(TOP + Math.max(1, ...COLUMNS.map(([c]) => graph.nodes.filter((n) => n.column === c).length)) * (NODE_H + GAP));
  const stroke = (s: string) => `var(--color-${s === "block" ? "block" : s === "warn" ? "warn" : "subtle"})`;
  const flashing = (n: DataFlowNode) => n.badges.some((b) => /RLS OFF|SEC-01/.test(b));
</script>

<div class="card overflow-x-auto">
  <div class="label mb-2">Architecture data flow</div>
  <svg width={COLUMNS.length * COL_W} {height} role="group" aria-label="Data flow graph">
    {#each COLUMNS as [, title], ci}
      <text x={ci * COL_W} y="14" class="label" fill="var(--color-secondary)" style="font-size:11px">{title.toUpperCase()}</text>
    {/each}
    {#each graph.edges as e}
      {@const a = layout.get(e.from)}
      {@const b = layout.get(e.to)}
      {#if a && b}
        <path
          d="M{a.x + NODE_W} {a.y + NODE_H / 2} C{a.x + NODE_W + 20} {a.y + NODE_H / 2} {b.x - 20} {b.y + NODE_H / 2} {b.x} {b.y + NODE_H / 2}"
          fill="none" stroke={stroke(e.status)} stroke-width="1.5" stroke-dasharray={e.dashed ? "4 3" : undefined}
        />
      {/if}
    {/each}
    {#each [...layout.values()] as { x, y, node } (node.id)}
      <g
        role="button" tabindex="0" aria-pressed={selected === node.id} class="cursor-pointer"
        onclick={() => onselect(selected === node.id ? null : node.id)}
        onkeydown={(ev) => (ev.key === "Enter" || ev.key === " ") && onselect(selected === node.id ? null : node.id)}
      >
        <title>{node.label}{node.sublabel ? ` — ${node.sublabel}` : ""}</title>
        <rect {x} {y} width={NODE_W} height={NODE_H} rx="6" fill="var(--color-surface-2)" stroke={selected === node.id ? "var(--color-focus)" : stroke(node.status)} stroke-width={selected === node.id ? 2 : 1} />
        <rect {x} {y} width="3" height={NODE_H} fill={node.status === "ok" ? "var(--color-ready)" : stroke(node.status)} />
        <text x={x + 10} y={y + 20} class="code-ref" fill="var(--color-primary)">{node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}</text>
        <text x={x + 10} y={y + 38} class={flashing(node) ? "flash" : ""} style="font-size:10px" fill={flashing(node) ? "var(--color-block)" : "var(--color-muted)"}>
          {node.badges.slice(0, 3).join(" · ")}
        </text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .flash { animation: flash 1s steps(2) infinite; }
  @keyframes flash { 50% { opacity: 0.35; } }
</style>
