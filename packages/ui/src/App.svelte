<script lang="ts">
  import { copyText, exportCert } from "./lib/api";
  import ArchitectureDataFlowGraph from "./lib/components/ArchitectureDataFlowGraph.svelte";
  import BurnSimulator from "./lib/components/BurnSimulator.svelte";
  import FindingList from "./lib/components/FindingList.svelte";
  import Gauge from "./lib/components/Gauge.svelte";
  import LegalDiffStudio from "./lib/components/LegalDiffStudio.svelte";
  import LivePentestConsole from "./lib/components/LivePentestConsole.svelte";
  import PillarCard from "./lib/components/PillarCard.svelte";
  import ReadinessHeaderBar, { type Tab } from "./lib/components/ReadinessHeaderBar.svelte";
  import { audit, findingsFor, fixAllPrompt, inVsCode, refresh } from "./lib/stores/audit.svelte";

  let tab = $state<Tab>("matrix");
  let toast = $state("");
  const node = $derived(audit.report?.graph.nodes.find((n) => n.id === audit.nodeFilter) ?? null);
  const findings = $derived(audit.report ? findingsFor(audit.nodeFilter) : []);

  function fixAll() {
    if (!audit.report) return;
    copyText(fixAllPrompt(audit.report));
    toast = "Copied every fix prompt — paste it into your agent.";
  }
  async function exportCertificate() {
    try {
      const r = await exportCert().catch((e: Error & { status?: number }) => {
        if (e.status !== 409 || !confirm(`${e.message}\n\nIssue a certificate stamped BLOCKED?`)) throw e;
        return exportCert(true);
      });
      toast = `Wrote ${r.files.join(", ")}`;
    } catch (e) {
      toast = e instanceof Error ? e.message : String(e);
    }
  }
  refresh();
</script>

<ReadinessHeaderBar report={audit.report} bind:tab onfixall={fixAll} onexport={exportCertificate} />
<main class="p-4">
  {#if toast}<button class="card mb-4 w-full text-left text-secondary" onclick={() => (toast = "")}>{toast} ✕</button>{/if}
  {#if audit.error}<p class="card mb-4 text-block">{audit.error}</p>{/if}
  {#if !audit.report}
    <p class="text-muted">{audit.loading || inVsCode ? "Scanning…" : ""}</p>
  {:else if tab === "matrix"}
    <div class="mb-4 flex flex-wrap gap-3 [&>*]:min-w-36 [&>*]:flex-1">
      <div class="card flex items-center"><Gauge score={audit.report.score} status={audit.report.status} /></div>
      {#each audit.report.pillars as p (p.pillar)}<PillarCard pillar={p} />{/each}
    </div>
    <div class="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <ArchitectureDataFlowGraph graph={audit.report.graph} selected={audit.nodeFilter} onselect={(id) => (audit.nodeFilter = id)} />
      <FindingList {findings} filterLabel={node?.label ?? null} onclear={() => (audit.nodeFilter = null)} />
    </div>
  {:else if inVsCode && (tab === "pentest" || tab === "legal")}
    <p class="card text-secondary">Run <code class="code-ref">preflight ui</code> in a terminal for the live pentest console and legal studio.</p>
  {:else if tab === "pentest"}
    <LivePentestConsole />
  {:else if tab === "legal"}
    <LegalDiffStudio />
  {:else}
    <BurnSimulator report={audit.report} />
  {/if}
</main>
