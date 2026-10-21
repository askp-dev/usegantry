<script lang="ts">
	import { Braces, GitBranch, Webhook, ArrowUpRight, Clock, Check, Terminal, Sparkles } from 'lucide-svelte';
	import { site, install } from '#lib/config';
	import CodeBlock from './CodeBlock.svelte';
	import CopyButton from './CopyButton.svelte';

	type TabId = 'mcp' | 'ci' | 'hook';

	let active = $state<TabId>('mcp');

	const cursorMcp = `{
  "mcpServers": {
    "preflight": {
      "command": "bunx",
      "args": ["preflight", "mcp"],
      "env": {
        "PREFLIGHT_TARGET": "\${workspaceFolder}"
      }
    }
  }
}`;

	const claudeMcp = 'claude mcp add preflight -- bunx preflight mcp';

	const ciYaml = `name: Preflight Launch Gate

on:
  pull_request:
  push:
    branches: [main]

jobs:
  preflight:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Run 43-check readiness gate
        run: bunx preflight scan --ci --fail-on critical

      - name: Upload audit evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: preflight-evidence
          path: |
            READINESS_CHECKLIST.md
            launch-certificate.html`;

	const hookInstall = install.hook;

	const hookScript = `#!/bin/sh
# .git/hooks/pre-push — installed by preflight
echo "⚡ Preflight: checking staged launch blockers…"
bunx preflight scan --staged --fail-on critical || {
  echo "✗ Push blocked. Fix the findings or run: preflight scan --report"
  exit 1
}
echo "✓ Preflight cleared."`;

	const tabs = [
		{
			id: 'mcp' as TabId,
			label: 'Cursor / Claude',
			sublabel: '.cursor/mcp.json',
			icon: Braces
		},
		{
			id: 'ci' as TabId,
			label: 'GitHub Actions',
			sublabel: 'preflight.yml',
			icon: GitBranch
		},
		{
			id: 'hook' as TabId,
			label: 'Pre-push hook',
			sublabel: '.git/hooks',
			icon: Webhook
		}
	];

	const benefits: Record<TabId, string[]> = {
		mcp: [
			'Agent can run a full readiness audit on demand',
			'Fix prompts land in the same context window',
			'Legal sync + pentest tools exposed over stdio'
		],
		ci: [
			'Blocks merges on CRITICAL findings',
			'Uploads checklist + certificate evidence',
			'Works on every PR with zero configuration'
		],
		hook: [
			'Catches blockers before they reach CI',
			'Runs in under 1.1s on staged files',
			'No network access or telemetry required'
		]
	};

	function onTabKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const next =
			event.key === 'ArrowRight'
				? (index + 1) % tabs.length
				: (index - 1 + tabs.length) % tabs.length;
		active = tabs[next].id;
		document.getElementById(`mcp-tab-${tabs[next].id}`)?.focus();
	}
</script>

<section id="mcp-setup" class="border-t border-[#222634]/60 py-16 sm:py-20">
	<div class="wrap">
		<div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
			<div class="max-w-2xl">
				<div class="mb-3 flex items-center gap-2">
					<span class="h-px w-6 bg-emerald-500/60"></span>
					<span class="mono-label text-emerald-400">Agent integration</span>
				</div>
				<h2
					class="text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.035em] text-white sm:text-[38px]"
				>
					Wire it in once. Gate every launch.
				</h2>
				<p class="mt-3 max-w-xl text-pretty text-[13px] leading-relaxed text-[#94a3b8] sm:text-sm">
					Preflight runs as a local MCP server, a CI gate or a git hook. Same 43 checks, same
					signed evidence — wherever your agent ships code.
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<span class="pill"><Clock class="h-2.5 w-2.5" />15 second setup</span>
				<span class="pill pill-agent"><Sparkles class="h-2.5 w-2.5" />MCP native</span>
			</div>
		</div>

		<div class="mt-8 overflow-hidden rounded-xl border border-[#222634] bg-[#11131c] lg:grid lg:grid-cols-[250px_1fr]">
			<!-- Rail -->
			<div
				class="grid grid-cols-3 border-b border-[#222634] bg-[#0d0f16] lg:grid-cols-1 lg:border-b-0 lg:border-r"
				role="tablist"
				aria-label="Integration method"
				aria-orientation="vertical"
			>
				{#each tabs as tab, index (tab.id)}
					{@const Icon = tab.icon}
					<button
						type="button"
						id={`mcp-tab-${tab.id}`}
						role="tab"
						aria-selected={active === tab.id}
						aria-controls={`mcp-panel-${tab.id}`}
						tabindex={active === tab.id ? 0 : -1}
						onclick={() => (active = tab.id)}
						onkeydown={(event) => onTabKeydown(event, index)}
						class="relative flex flex-col items-center gap-1.5 border-b border-r border-[#222634] px-2 py-3 text-center transition-colors last:border-r-0 lg:flex-row lg:items-start lg:gap-2.5 lg:border-b-0 lg:border-r-0 lg:px-4 lg:py-3.5 lg:text-left {active ===
						tab.id
							? 'bg-[#141722]'
							: 'hover:bg-[#11131c]'}"
					>
						{#if active === tab.id}
							<span class="absolute inset-y-0 left-0 hidden w-[2px] bg-emerald-400 lg:block"></span>
							<span class="absolute inset-x-0 top-0 h-[2px] bg-emerald-400 lg:hidden"></span>
						{/if}
						<Icon
							class="h-4 w-4 shrink-0 {active === tab.id
								? 'text-emerald-400'
								: 'text-[#64748b]'}"
						/>
						<span class="min-w-0">
							<span
								class="block font-mono text-[10.5px] font-semibold {active === tab.id
									? 'text-white'
									: 'text-[#cbd5e1]'}">{tab.label}</span
							>
							<span class="mt-0.5 hidden font-mono text-[9px] text-[#64748b] sm:block"
								>{tab.sublabel}</span
							>
						</span>
					</button>
				{/each}
				<div class="hidden p-4 lg:block lg:border-t lg:border-[#222634]">
					<div class="mono-label mb-2 text-[9px] text-[#64748b]">Runs locally</div>
					<div class="flex items-center gap-1.5 font-mono text-[9px] text-[#94a3b8]">
						<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
						No API key · no cloud
					</div>
					<a
						href={`${site.github}#readme`}
						target="_blank"
						rel="noreferrer"
						class="mt-3 inline-flex items-center gap-1 font-mono text-[9.5px] text-emerald-400 hover:text-emerald-300"
					>
						Read the docs <ArrowUpRight class="h-2.5 w-2.5" />
					</a>
				</div>
			</div>

			<!-- Content -->
			<div class="min-w-0 p-4 sm:p-6">
				{#if active === 'mcp'}
					<div id="mcp-panel-mcp" role="tabpanel" aria-labelledby="mcp-tab-mcp">
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h3 class="text-[15px] font-semibold text-white">
									Give Cursor and Claude Code the audit tools
								</h3>
								<p class="mt-1 text-[11.5px] leading-relaxed text-[#94a3b8]">
									One command bootstraps the MCP server, a project rule and a
									<code class="text-[#cbd5e1]">CLAUDE.md</code> section.
								</p>
							</div>
							<CopyButton text={install.mcp} label="Copy init" />
						</div>

						<div class="mt-4 grid gap-3">
							<CodeBlock code={cursorMcp} filename=".cursor/mcp.json" language="json" />
							<div class="grid gap-3 sm:grid-cols-2">
								<CodeBlock code={claudeMcp} filename="Claude Code CLI" language="bash" showLineNumbers={false} />
								<div class="rounded-lg border border-indigo-500/20 bg-indigo-500/[0.05] p-3">
									<div class="mono-label mb-1.5 text-[9px] text-indigo-300">Bootstrap command</div>
									<code class="block break-all font-mono text-[10.5px] text-[#c7d2fe]">{install.mcp}</code>
									<p class="mt-2 text-[10px] leading-relaxed text-[#94a3b8]">
										Creates <code class="text-[#cbd5e1]">.cursor/rules/preflight.mdc</code> so
										your agent knows the remediation contract.
									</p>
								</div>
							</div>
						</div>
					</div>
				{:else if active === 'ci'}
					<div id="mcp-panel-ci" role="tabpanel" aria-labelledby="mcp-tab-ci">
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h3 class="text-[15px] font-semibold text-white">
									Make launch blockers fail the pull request
								</h3>
								<p class="mt-1 text-[11.5px] leading-relaxed text-[#94a3b8]">
									Drop this workflow into <code class="text-[#cbd5e1]">.github/workflows/preflight.yml</code>.
								</p>
							</div>
							<span class="pill pill-ready shrink-0"><Check class="h-2.5 w-2.5" />CI gate</span>
						</div>
						<div class="mt-4">
							<CodeBlock code={ciYaml} filename=".github/workflows/preflight.yml" language="yaml" maxHeight="420px" />
						</div>
					</div>
				{:else}
					<div id="mcp-panel-hook" role="tabpanel" aria-labelledby="mcp-tab-hook">
						<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h3 class="text-[15px] font-semibold text-white">
									Block the push, not the production incident
								</h3>
								<p class="mt-1 text-[11.5px] leading-relaxed text-[#94a3b8]">
									Installs a pre-push hook that scans staged files. Bypass with
									<code class="text-[#cbd5e1]">--no-verify</code> when you must.
								</p>
							</div>
							<CopyButton text={hookInstall} label="Copy install" />
						</div>
						<div class="mt-4 grid gap-3">
							<CodeBlock code={hookInstall} filename="Install the hook" language="bash" showLineNumbers={false} />
							<CodeBlock code={hookScript} filename=".git/hooks/pre-push" language="sh" maxHeight="280px" />
						</div>
					</div>
				{/if}

				<div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#222634] pt-3">
					{#each benefits[active] as benefit (benefit)}
						<span class="flex items-center gap-1.5 font-mono text-[9.5px] text-[#94a3b8]">
							<Check class="h-3 w-3 text-emerald-500" />{benefit}
						</span>
					{/each}
				</div>
			</div>
		</div>
	</div>
</section>
