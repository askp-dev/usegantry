<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Terminal,
		Braces,
		Download,
		Boxes,
		ArrowUpRight,
		Check,
		ChevronRight,
		Apple,
		MonitorSmartphone
	} from 'lucide-svelte';
	import { install, site } from '#lib/config';
	import {
		getLatestRelease,
		assetUrl,
		formatBytes,
		type ReleaseInfo
	} from '#lib/releases';
	import CopyButton from './CopyButton.svelte';

	type Tab = 'scan' | 'mcp' | 'binary' | 'extension';
	type Platform = {
		os: 'macos' | 'linux' | 'windows';
		arch: 'arm64' | 'x64';
		label: string;
		asset: string;
		command: string;
	};

	let active = $state<Tab>('scan');
	let platform = $state<Platform | null>(null);
	let release = $state<ReleaseInfo | null>(null);
	let autoDetected = $state(false);

	const tabs: Array<{ id: Tab; label: string; meta: string; icon: typeof Terminal }> = [
		{ id: 'scan', label: 'Quick scan', meta: 'bunx', icon: Terminal },
		{ id: 'mcp', label: 'Cursor MCP', meta: '15 sec', icon: Braces },
		{ id: 'binary', label: 'Binary', meta: 'auto-OS', icon: Download },
		{ id: 'extension', label: 'Extension', meta: 'VSIX', icon: Boxes }
	];

	function platformFrom(os: Platform['os'], arch: Platform['arch']): Platform {
		const isMac = os === 'macos';
		const label =
			os === 'windows'
				? `Windows · ${arch === 'arm64' ? 'ARM64' : 'x64'}`
				: os === 'linux'
					? `Linux · ${arch === 'arm64' ? 'ARM64' : 'x64'}`
					: `macOS · ${arch === 'arm64' ? 'Apple Silicon' : 'Intel'}`;
		const asset =
			os === 'windows'
				? 'preflight-windows-x64.exe'
				: `preflight-${isMac ? 'darwin' : 'linux'}-${arch}`;
		const command = os === 'windows' ? install.windows : install.unix;
		return { os, arch, label, asset, command };
	}

	async function detectPlatform(): Promise<Platform> {
		const ua = navigator.userAgent;
		const uaData = (
			navigator as Navigator & {
				userAgentData?: {
					platform?: string;
					getHighEntropyValues?: (hints: string[]) => Promise<{
						architecture?: string;
						bitness?: string;
						platform?: string;
					}>;
				};
			}
		).userAgentData;

		const rawPlatform = `${uaData?.platform ?? navigator.platform ?? ''} ${ua}`.toLowerCase();
		let os: Platform['os'] = 'linux';
		if (/win|windows/.test(rawPlatform)) os = 'windows';
		else if (/mac|darwin|iphone|ipad/.test(rawPlatform)) os = 'macos';

		let arch: Platform['arch'] = /arm64|aarch64/.test(ua) ? 'arm64' : 'x64';

		// Apple Silicon reports "Intel Mac OS X" in the UA, so prefer architecture hints
		// and default macOS to arm64 when no hint is available.
		if (os === 'macos' && !/intel/.test(ua)) arch = 'arm64';

		try {
			const high = await uaData?.getHighEntropyValues?.(['architecture', 'bitness']);
			if (high?.architecture === 'arm') arch = 'arm64';
			else if (high?.architecture === 'x86') arch = 'x64';
			if (os === 'windows' && high?.bitness === '32') arch = 'x64';
		} catch {
			/* hints are optional */
		}

		autoDetected = true;
		return platformFrom(os, arch);
	}

	onMount(() => {
		detectPlatform().then((detected) => (platform = detected));
		getLatestRelease().then((value) => (release = value));
	});

	const activePlatform = $derived(platform ?? platformFrom('macos', 'arm64'));
	const binaryName = $derived(activePlatform.asset);
	const binaryUrl = $derived(
		release ? assetUrl(release, binaryName) : `${site.github}/releases/latest/download/${binaryName}`
	);
	const binarySize = $derived(
		release ? formatBytes(release.assets.find((a) => a.name === binaryName)?.size ?? null) : null
	);
	const vsixUrl = $derived(
		release
			? assetUrl(release, 'preflight-latest.vsix')
			: `${site.github}/releases/latest/download/preflight-latest.vsix`
	);
	const releaseTag = $derived(release?.tag ?? site.fallbackVersionLabel);

	function onTabKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const next =
			event.key === 'ArrowRight'
				? (index + 1) % tabs.length
				: (index - 1 + tabs.length) % tabs.length;
		active = tabs[next].id;
		const el = document.getElementById(`dl-tab-${tabs[next].id}`);
		el?.focus();
	}
</script>

<div class="overflow-hidden rounded-xl border border-[#222634] bg-[#11131c]/90 panel-glow">
	<div
		class="grid grid-cols-2 border-b border-[#222634] bg-[#0d0f16] sm:grid-cols-4"
		role="tablist"
		aria-label="Install methods"
	>
		{#each tabs as item, index (item.id)}
			{@const Icon = item.icon}
			<button
				type="button"
				id={`dl-tab-${item.id}`}
				role="tab"
				aria-selected={active === item.id}
				aria-controls={`dl-panel-${item.id}`}
				tabindex={active === item.id ? 0 : -1}
				onclick={() => (active = item.id)}
				onkeydown={(event) => onTabKeydown(event, index)}
				class="group relative flex items-center justify-center gap-2 border-b border-r border-[#222634] px-2 py-2.5 font-mono text-[10.5px] transition-colors last:border-r-0 sm:border-b-0 {active ===
				item.id
					? 'bg-[#181b26] text-white'
					: 'text-[#7c8798] hover:bg-[#141722] hover:text-[#cbd5e1]'}"
			>
				{#if active === item.id}
					<span
						class="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500/0 via-emerald-400 to-emerald-500/0"
					></span>
				{/if}
				<Icon
					class="h-3.5 w-3.5 {active === item.id
						? 'text-emerald-400'
						: 'text-[#64748b] group-hover:text-[#94a3b8]'}"
				/>
				<span class="font-semibold">{item.label}</span>
				<span class="hidden text-[9px] uppercase tracking-wide text-[#576277] sm:inline"
					>{item.meta}</span
				>
			</button>
		{/each}
	</div>

	<div class="p-4 sm:p-5">
		{#if active === 'scan'}
			<div id="dl-panel-scan" role="tabpanel" aria-labelledby="dl-tab-scan">
				<div class="mono-label mb-2 text-[#64748b]">Run a read-only audit</div>
				<div
					class="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-[#08090d] px-3 py-2.5"
				>
					<span class="font-mono text-xs text-emerald-400">$</span>
					<code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-white"
						>{install.quick}</code
					>
					<CopyButton text={install.quick} compact label="" ariaLabel="Copy bunx scan command" />
				</div>

				<div class="mt-3 grid gap-2 sm:grid-cols-2">
					<button
						type="button"
						class="flex items-center justify-between gap-2 rounded-md border border-[#222634] bg-[#0b0d14] px-2.5 py-2 text-left transition-colors hover:border-[#2d3242]"
						onclick={() => navigator.clipboard?.writeText(install.npx)}
					>
						<span class="font-mono text-[10.5px] text-[#cbd5e1]">{install.npx}</span>
						<span class="font-mono text-[9px] uppercase tracking-wide text-[#64748b]"
							>Node ≥ 20</span
						>
					</button>
					<a
						href="/#rules-43"
						class="flex items-center justify-between gap-2 rounded-md border border-[#222634] bg-[#0b0d14] px-2.5 py-2 transition-colors hover:border-[#2d3242]"
					>
						<span class="font-mono text-[10.5px] text-[#cbd5e1]">See all 43 checks</span>
						<ChevronRight class="h-3 w-3 text-emerald-500" />
					</a>
				</div>

				<p class="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#64748b]">
					<Check class="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
					<span
						>Read-only by default. Writes <code class="text-[#94a3b8]">READINESS_CHECKLIST.md</code
						> only with <code class="text-[#94a3b8]">--write</code>. No source code or telemetry
						leaves your machine.</span
					>
				</p>
			</div>
		{:else if active === 'mcp'}
			<div id="dl-panel-mcp" role="tabpanel" aria-labelledby="dl-tab-mcp">
				<div class="mono-label mb-2 text-[#64748b]">Wire the audit into your agent</div>
				<div
					class="flex items-center gap-2 rounded-lg border border-indigo-500/25 bg-[#08090d] px-3 py-2.5"
				>
					<span class="font-mono text-xs text-indigo-400">$</span>
					<code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-white"
						>{install.mcp}</code
					>
					<CopyButton text={install.mcp} compact label="" ariaLabel="Copy MCP init command" />
				</div>

				<div class="mt-3 flex flex-wrap gap-1.5">
					{#each ['Cursor', 'Claude Code', 'Windsurf', 'VS Code'] as ide (ide)}
						<span class="pill">
							<span class="h-1 w-1 rounded-full bg-indigo-400"></span>{ide}
						</span>
					{/each}
				</div>

				<p class="mt-3 text-[10.5px] leading-relaxed text-[#64748b]">
					Bootstraps <code class="text-[#94a3b8]">.cursor/mcp.json</code>, a
					<code class="text-[#94a3b8]">.cursor/rules/preflight.mdc</code> rule and a
					<code class="text-[#94a3b8]">CLAUDE.md</code> section. Your agent can then call
					<code class="text-[#94a3b8]">run_readiness_audit</code> and
					<code class="text-[#94a3b8]">sync_stack_legal_docs</code> directly.
				</p>
				<a
					href="/#mcp-setup"
					class="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-indigo-300 hover:text-indigo-200"
					>Full integration guide <ArrowUpRight class="h-3 w-3" /></a
				>
			</div>
		{:else if active === 'binary'}
			<div id="dl-panel-binary" role="tabpanel" aria-labelledby="dl-tab-binary">
				<div class="mb-2 flex items-center justify-between gap-2">
					<span class="mono-label text-[#64748b]">Standalone binary</span>
					<span class="pill pill-ready">
						<span class="h-1 w-1 rounded-full bg-emerald-400"></span>
						{autoDetected ? activePlatform.label : 'Detecting OS…'}
					</span>
				</div>

				<div
					class="flex items-center gap-2 rounded-lg border border-[#2a3040] bg-[#08090d] px-3 py-2.5"
				>
					<span class="font-mono text-xs text-emerald-400">$</span>
					<code class="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-white"
						>{activePlatform.command}</code
					>
					<CopyButton
						text={activePlatform.command}
						compact
						label=""
						ariaLabel="Copy installer command"
					/>
				</div>

				<div class="mt-3 flex flex-wrap items-center gap-2">
					<a href={binaryUrl} class="btn btn-primary btn-sm" rel="noreferrer">
						<Download class="h-3.5 w-3.5" />
						Download {binaryName}
					</a>
					<span class="font-mono text-[10px] text-[#64748b]">
						{releaseTag}{binarySize ? ` · ${binarySize}` : ''}
					</span>
				</div>

				<div class="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9.5px] text-[#64748b]">
					<span class="text-[#475569]">All platforms:</span>
					<a class="hover:text-emerald-300" href={release ? assetUrl(release, 'preflight-darwin-arm64') : `${site.github}/releases/latest`}>macOS arm64</a>
					<a class="hover:text-emerald-300" href={release ? assetUrl(release, 'preflight-darwin-x64') : `${site.github}/releases/latest`}>macOS x64</a>
					<a class="hover:text-emerald-300" href={release ? assetUrl(release, 'preflight-linux-x64') : `${site.github}/releases/latest`}>Linux x64</a>
					<a class="hover:text-emerald-300" href={release ? assetUrl(release, 'preflight-windows-x64.exe') : `${site.github}/releases/latest`}>Windows x64</a>
					<a
						class="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300"
						href={release?.checksums?.url ?? `${site.github}/releases/latest`}
						>SHA-256 <ArrowUpRight class="h-2.5 w-2.5" /></a
					>
				</div>
			</div>
		{:else}
			<div id="dl-panel-extension" role="tabpanel" aria-labelledby="dl-tab-extension">
				<div class="mono-label mb-2 text-[#64748b]">IDE extension</div>
				<div class="grid gap-2 sm:grid-cols-2">
					<a href={vsixUrl} class="btn btn-primary btn-sm justify-center">
						<Download class="h-3.5 w-3.5" />
						Download .VSIX (v1.0)
					</a>
					<a
						href={site.marketplaceCursor}
						target="_blank"
						rel="noreferrer"
						class="btn btn-secondary btn-sm justify-center"
					>
						<Boxes class="h-3.5 w-3.5" />
						Open in Cursor
						<ArrowUpRight class="h-3 w-3 text-[#64748b]" />
					</a>
				</div>

				<div class="mt-3 grid gap-2 sm:grid-cols-2">
					<div
						class="flex items-center gap-2 rounded-md border border-[#222634] bg-[#0b0d14] px-2.5 py-2"
					>
						<MonitorSmartphone class="h-3.5 w-3.5 text-[#64748b]" />
						<span class="font-mono text-[10.5px] text-[#cbd5e1]"
							>code --install-extension preflight-latest.vsix</span
						>
					</div>
					<a
						href={site.marketplaceVscode}
						target="_blank"
						rel="noreferrer"
						class="flex items-center justify-between gap-2 rounded-md border border-[#222634] bg-[#0b0d14] px-2.5 py-2 transition-colors hover:border-[#2d3242]"
					>
						<span class="font-mono text-[10.5px] text-[#cbd5e1]">VS Code Marketplace</span>
						<ArrowUpRight class="h-3 w-3 text-[#64748b]" />
					</a>
				</div>

				<p class="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#64748b]">
					<Apple class="mt-0.5 h-3 w-3 shrink-0 text-[#94a3b8]" />
					<span
						>Inline findings, 1-click Agent Fix Bridge, and signed certificate export — without
						leaving the editor.</span
					>
				</p>
			</div>
		{/if}
	</div>
</div>
