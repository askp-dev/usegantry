<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		Terminal,
		Scale,
		Crosshair,
		RotateCw,
		ShieldAlert,
		ShieldCheck,
		ArrowRight,
		Copy,
		AlertTriangle,
		Check,
		Zap
	} from 'lucide-svelte';
	import CopyButton from './CopyButton.svelte';

	type Tab = 'scan' | 'legal' | 'attack';

	let active = $state<Tab>('scan');
	let scanCycle = $state(0);
	let attackVisible = $state(0);
	let attackRunning = $state(false);
	let reduceMotion = false;
	let timer: ReturnType<typeof setInterval> | null = null;

	const scanFindings = [
		{
			id: 'SEC-01',
			title: 'Missing or permissive Row-Level Security',
			file: 'supabase/migrations/001_init.sql',
			severity: 'CRITICAL',
			status: 'BLOCKER'
		},
		{
			id: 'LEG-02',
			title: 'AGPL-3.0 dependency vs commercial EULA',
			file: 'bun.lock › @acme/realtime@4.2.1',
			severity: 'CRITICAL',
			status: 'BLOCKER'
		},
		{
			id: 'FIN-01',
			title: 'useEffect fetch → setState render loop',
			file: 'src/hooks/useProjects.ts:42',
			severity: 'CRITICAL',
			status: 'BLOCKER'
		},
		{
			id: 'PRIV-04',
			title: 'Analytics SDK fires before consent',
			file: 'src/routes/+layout.svelte:18',
			severity: 'HIGH',
			status: 'WARN'
		}
	];

	const legalAdds = [
		{
			gutter: '14',
			prefix: '+',
			text: '| Stripe, Inc. | Payments | PCI DSS L1 · SCCs |',
			kind: 'add'
		},
		{
			gutter: '15',
			prefix: '+',
			text: '| OpenAI, L.L.C. | AI inference | DPA · zero retention |',
			kind: 'add'
		},
		{
			gutter: '16',
			prefix: '+',
			text: '| Supabase, Inc. | Auth + database | DPA · SOC 2 |',
			kind: 'add'
		},
		{
			gutter: '17',
			prefix: '+',
			text: '<!-- /PREFLIGHT:AUTO:SUBPROCESSORS -->',
			kind: 'add'
		}
	];

	const probes = [
		{ id: 'PT-01', name: 'Supabase anon-key table dump', status: 'BLOCKED', code: '401', ms: 34 },
		{ id: 'PT-02', name: 'Unauthenticated mutation replay', status: 'BLOCKED', code: '401', ms: 27 },
		{ id: 'PT-03', name: 'Cross-tenant IDOR tampering', status: 'BLOCKED', code: '404', ms: 41 },
		{ id: 'PT-04', name: 'Forged Stripe webhook signature', status: 'EXPLOITED', code: '200', ms: 38 },
		{ id: 'PT-05', name: 'Prompt-injection + 20× burst', status: 'BLOCKED', code: '429', ms: 52 },
		{ id: 'PT-06', name: 'Client bundle source-map scrape', status: 'BLOCKED', code: '404', ms: 22 }
	];

	const fixPrompt =
		'PT-04: verify Stripe webhook signatures with stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET) and return 400 on mismatch.';

	function clearAttack() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function runScan() {
		scanCycle += 1;
	}

	function fireProbes() {
		clearAttack();
		attackVisible = 0;
		if (reduceMotion) {
			attackVisible = probes.length;
			attackRunning = false;
			return;
		}
		attackRunning = true;
		let index = 0;
		timer = setInterval(() => {
			index += 1;
			attackVisible = index;
			if (index >= probes.length) {
				clearAttack();
				attackRunning = false;
			}
		}, 620);
	}

	function selectTab(tab: Tab) {
		if (active === tab) {
			if (tab === 'scan') runScan();
			if (tab === 'attack') fireProbes();
			return;
		}
		active = tab;
		if (tab === 'scan') runScan();
		if (tab === 'attack') fireProbes();
	}

	function onTabKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const order: Tab[] = ['scan', 'legal', 'attack'];
		const next =
			event.key === 'ArrowRight'
				? (index + 1) % order.length
				: (index - 1 + order.length) % order.length;
		selectTab(order[next]);
		document.getElementById(`hero-tab-${order[next]}`)?.focus();
	}

	function handleMotionPreference() {
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	}

	$effect(() => {
		handleMotionPreference();
	});

	onDestroy(clearAttack);
</script>

<div class="term relative w-full">
	<span class="scanline"></span>

	<!-- Window chrome -->
	<div class="term-bar">
		<div class="flex items-center gap-1.5">
			<span class="term-dot bg-[#ef4444]/60"></span>
			<span class="term-dot bg-[#f59e0b]/60"></span>
			<span class="term-dot bg-[#10b981]/60"></span>
		</div>
		<div class="ml-1 flex min-w-0 items-center gap-2">
			<Terminal class="h-3 w-3 shrink-0 text-[#64748b]" />
			<span class="truncate font-mono text-[10px] text-[#94a3b8]"
				>preflight — zsh — 120×34</span
			>
		</div>
		<div class="ml-auto flex items-center gap-2">
			<span class="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-[#475569] sm:inline"
				>simulated</span
			>
			<span class="flex items-center gap-1 font-mono text-[9px] text-emerald-400/90">
				<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>local
			</span>
		</div>
	</div>

	<!-- Command tabs -->
	<div
		class="flex items-center overflow-x-auto border-b border-[#222634] bg-[#0b0d13]"
		role="tablist"
		aria-label="Preflight demo commands"
	>
		<button
			type="button"
			id="hero-tab-scan"
			role="tab"
			aria-selected={active === 'scan'}
			aria-controls="hero-panel-scan"
			tabindex={active === 'scan' ? 0 : -1}
			onclick={() => selectTab('scan')}
			onkeydown={(event) => onTabKeydown(event, 0)}
			class="relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 font-mono text-[10.5px] transition-colors {active ===
			'scan'
				? 'bg-[#11131c] text-emerald-300'
				: 'text-[#64748b] hover:bg-[#11131c]/60 hover:text-[#cbd5e1]'}"
		>
			<Terminal class="h-3 w-3" />
			<span>preflight scan</span>
			{#if active === 'scan'}
				<span class="absolute inset-x-0 bottom-0 h-px bg-emerald-400"></span>
			{/if}
		</button>
		<button
			type="button"
			id="hero-tab-legal"
			role="tab"
			aria-selected={active === 'legal'}
			aria-controls="hero-panel-legal"
			tabindex={active === 'legal' ? 0 : -1}
			onclick={() => selectTab('legal')}
			onkeydown={(event) => onTabKeydown(event, 1)}
			class="relative flex shrink-0 items-center gap-1.5 border-l border-[#222634]/70 px-3 py-2.5 font-mono text-[10.5px] transition-colors {active ===
			'legal'
				? 'bg-[#11131c] text-emerald-300'
				: 'text-[#64748b] hover:bg-[#11131c]/60 hover:text-[#cbd5e1]'}"
		>
			<Scale class="h-3 w-3" />
			<span>legal --sync</span>
			{#if active === 'legal'}
				<span class="absolute inset-x-0 bottom-0 h-px bg-emerald-400"></span>
			{/if}
		</button>
		<button
			type="button"
			id="hero-tab-attack"
			role="tab"
			aria-selected={active === 'attack'}
			aria-controls="hero-panel-attack"
			tabindex={active === 'attack' ? 0 : -1}
			onclick={() => selectTab('attack')}
			onkeydown={(event) => onTabKeydown(event, 2)}
			class="relative flex shrink-0 items-center gap-1.5 border-l border-[#222634]/70 px-3 py-2.5 font-mono text-[10.5px] transition-colors {active ===
			'attack'
				? 'bg-[#11131c] text-emerald-300'
				: 'text-[#64748b] hover:bg-[#11131c]/60 hover:text-[#cbd5e1]'}"
		>
			<Crosshair class="h-3 w-3" />
			<span>attack</span>
			{#if active === 'attack'}
				<span class="absolute inset-x-0 bottom-0 h-px bg-emerald-400"></span>
			{/if}
		</button>
		<button
			type="button"
			onclick={() => (active === 'attack' ? fireProbes() : runScan())}
			class="ml-auto flex shrink-0 items-center gap-1 border-l border-[#222634]/70 px-2.5 py-2.5 font-mono text-[9px] uppercase tracking-wide text-[#64748b] transition-colors hover:text-emerald-300"
			aria-label="Replay animation"
		>
			<RotateCw class="h-3 w-3" />
			<span class="hidden sm:inline">replay</span>
		</button>
	</div>

	<!-- Panels -->
	<div class="term-body min-h-[404px] sm:min-h-[430px]">
		{#if active === 'scan'}
			<div id="hero-panel-scan" role="tabpanel" aria-labelledby="hero-tab-scan">
				<div class="mb-3 flex items-center gap-2 text-[#64748b]">
					<span class="text-emerald-400">❯</span>
					<span class="text-[#e2e8f0]">npx preflight scan</span>
					<span class="caret"></span>
					<span class="ml-auto hidden text-[9px] uppercase tracking-[0.14em] sm:inline"
						>1.08s · offline</span
					>
				</div>

				{#key scanCycle}
					<!-- Scorecard -->
					<div
						class="anim-line rounded-lg border border-[#2a2f3e] bg-[#0c0e15] p-3"
						style="animation-delay: 40ms"
					>
						<div class="flex items-center justify-between border-b border-[#222634] pb-2">
							<span class="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#64748b]"
								>Readiness scorecard</span
							>
							<span class="font-mono text-[9px] text-[#475569]">repo: acme-saas</span>
						</div>

						<div class="mt-3 flex items-center gap-4">
							<div class="relative h-[74px] w-[74px] shrink-0">
								<svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
									<circle
										cx="50"
										cy="50"
										r="42"
										fill="none"
										stroke="#1c2130"
										stroke-width="7"
									/>
									<circle
										cx="50"
										cy="50"
										r="42"
										fill="none"
										stroke="#ef4444"
										stroke-width="7"
										stroke-linecap="round"
										stroke-dasharray="263.9"
										stroke-dashoffset={263.9 * (1 - 0.65)}
									/>
								</svg>
								<div class="absolute inset-0 flex flex-col items-center justify-center">
									<span class="font-mono text-[22px] font-extrabold leading-none text-white">65</span>
									<span class="font-mono text-[8px] text-[#64748b]">/100</span>
								</div>
							</div>

							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="pill pill-block"
										><span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>LAUNCH BLOCKED</span
									>
									<span class="font-mono text-[9px] text-[#64748b]">3 blockers</span>
								</div>
								<div class="mt-2 grid grid-cols-3 gap-2">
									<div>
										<div class="font-mono text-[15px] font-bold text-white">37<span class="text-[9px] text-[#64748b]">/43</span></div>
										<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">passed</div>
									</div>
									<div>
										<div class="font-mono text-[15px] font-bold text-red-400">6</div>
										<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">flagged</div>
									</div>
									<div>
										<div class="font-mono text-[15px] font-bold text-[#e2e8f0]">1.08<span class="text-[9px] text-[#64748b]">s</span></div>
										<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">exec</div>
									</div>
								</div>
								<div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1c2130]">
									<div class="h-full w-[65%] rounded-full bg-gradient-to-r from-red-500 to-amber-400"></div>
								</div>
							</div>
						</div>
					</div>

					<!-- Findings -->
					<div class="mt-3 space-y-1">
						{#each scanFindings as finding, i (finding.id)}
							<div
								class="anim-line group flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 transition-colors hover:border-[#222634] hover:bg-[#11131c]"
								style="animation-delay: {110 + i * 70}ms"
							>
								<span
									class="h-1.5 w-1.5 shrink-0 rounded-full"
									style:background-color={finding.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b'}
								></span>
								<span
									class="w-[46px] shrink-0 font-mono text-[9.5px] font-semibold"
									class:text-red-400={finding.severity === 'CRITICAL'}
									class:text-amber-400={finding.severity !== 'CRITICAL'}>{finding.id}</span
								>
								<span class="min-w-0 flex-1 truncate text-[10.5px] text-[#cbd5e1]"
									>{finding.title}</span
								>
								<span class="hidden truncate font-mono text-[9px] text-[#475569] md:block"
									>{finding.file}</span
								>
								<span
									class="shrink-0 font-mono text-[8px] font-bold uppercase tracking-wide"
									class:text-red-400={finding.status === 'BLOCKER'}
									class:text-amber-400={finding.status !== 'BLOCKER'}>{finding.status}</span
								>
							</div>
						{/each}
						<div class="anim-line px-2 pt-1 font-mono text-[9px] text-[#64748b]" style="animation-delay: 440ms">
							+ 2 more HIGH findings · 4 MEDIUM hardening notes
						</div>
					</div>

					<div
						class="anim-line mt-3 flex flex-wrap items-center gap-2 border-t border-[#222634] pt-3"
						style="animation-delay: 480ms"
					>
						<span class="font-mono text-[9px] text-[#475569]">$</span>
						<span class="font-mono text-[10px] text-[#94a3b8]">npx preflight fix --all</span>
						<CopyButton
							text={'Fix SEC-01, LEG-02, FIN-01: ' + fixPrompt}
							compact
							label="copy fix prompt"
							ariaLabel="Copy agent fix prompt"
						/>
						<span class="ml-auto hidden font-mono text-[9px] text-[#475569] sm:inline"
							>agent-ready</span
						>
					</div>
				{/key}
			</div>
		{:else if active === 'legal'}
			<div id="hero-panel-legal" role="tabpanel" aria-labelledby="hero-tab-legal">
				<div class="mb-3 flex items-center gap-2 text-[#64748b]">
					<span class="text-emerald-400">❯</span>
					<span class="text-[#e2e8f0]">npx preflight legal --sync</span>
					<span class="caret"></span>
					<span class="ml-auto hidden text-[9px] uppercase tracking-[0.14em] sm:inline"
						>stack hash match</span
					>
				</div>

				<div class="anim-line rounded-lg border border-[#2a2f3e] bg-[#0c0e15]" style="animation-delay: 40ms">
					<div class="flex items-center justify-between border-b border-[#222634] px-3 py-2">
						<div class="flex min-w-0 items-center gap-2">
							<span class="font-mono text-[9.5px] text-[#cbd5e1]">legal/privacy-policy.md</span>
							<span class="pill px-1.5 py-0 text-[8px] text-indigo-300">AUTO</span>
						</div>
						<div class="flex items-center gap-2 font-mono text-[9px]">
							<span class="text-emerald-400">+4</span>
							<span class="text-[#475569]">−0</span>
						</div>
					</div>

					<div class="overflow-x-auto p-2.5 font-mono text-[10px] leading-[1.9]">
						<div class="diff-line diff-ctx">
							<span class="diff-gutter">11</span><span class="diff-gutter"></span>
							<span>| Sub-processor | Purpose | Safeguards |</span>
						</div>
						<div class="diff-line diff-ctx">
							<span class="diff-gutter">12</span><span class="diff-gutter"></span>
							<span>| --- | --- | --- |</span>
						</div>
						<div class="diff-line diff-ctx">
							<span class="diff-gutter">13</span><span class="diff-gutter"></span>
							<span class="marker">&lt;!-- PREFLIGHT:AUTO:SUBPROCESSORS --&gt;</span>
						</div>
						{#each legalAdds as line, i (line.gutter)}
							<div
								class="diff-line diff-add anim-line"
								style="animation-delay: {120 + i * 90}ms"
							>
								<span class="diff-gutter">{line.gutter}</span>
								<span class="diff-gutter text-emerald-400">{line.prefix}</span>
								<span>{line.text}</span>
							</div>
						{/each}
						<div class="diff-line diff-ctx">
							<span class="diff-gutter">18</span><span class="diff-gutter"></span>
							<span>Last updated: <span class="marker">2026-10-20</span></span>
						</div>
					</div>

					<div class="grid gap-px border-t border-[#222634] bg-[#222634] sm:grid-cols-2">
						<div class="bg-[#0c0e15] px-3 py-2">
							<div class="font-mono text-[8px] uppercase tracking-[0.12em] text-[#64748b]">
								detected sub-processors
							</div>
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each ['stripe', 'openai', '@supabase/supabase-js', 'posthog-js'] as dep (dep)}
									<span class="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 font-mono text-[8.5px] text-emerald-300">{dep}</span>
								{/each}
							</div>
						</div>
						<div class="bg-[#0c0e15] px-3 py-2">
							<div class="font-mono text-[8px] uppercase tracking-[0.12em] text-[#64748b]">
								legal version
							</div>
							<div class="mt-1.5 flex items-center gap-2 font-mono text-[10px]">
								<span class="text-[#64748b] line-through">1.4.0</span>
								<ArrowRight class="h-3 w-3 text-[#475569]" />
								<span class="text-emerald-300">1.5.0</span>
								<span class="ml-auto text-[8.5px] text-[#475569]">7 files compiled</span>
							</div>
						</div>
					</div>
				</div>

				<div class="anim-line mt-3 flex flex-wrap items-center gap-2 text-[9.5px]" style="animation-delay: 540ms">
					<span class="pill pill-ready"><Check class="h-2.5 w-2.5" />No lawyer hours</span>
					<span class="pill pill-agent">EULA schedule injected</span>
					<span class="pill">DPA references linked</span>
					<span class="ml-auto font-mono text-[9px] text-[#475569]">0 bytes uploaded</span>
				</div>
			</div>
		{:else}
			<div id="hero-panel-attack" role="tabpanel" aria-labelledby="hero-tab-attack">
				<div class="mb-3 flex items-center gap-2 text-[#64748b]">
					<span class="text-emerald-400">❯</span>
					<span class="text-[#e2e8f0]">npx preflight attack --target http://localhost:3000</span>
					<span class="caret"></span>
				</div>

				<div class="flex items-center justify-between rounded-md border border-[#222634] bg-[#0c0e15] px-2.5 py-1.5">
					<div class="flex min-w-0 items-center gap-2 font-mono text-[9px]">
						<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
						<span class="text-[#64748b]">TARGET</span>
						<span class="truncate text-[#cbd5e1]">http://localhost:3000</span>
					</div>
					<span class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]"
						>non-destructive</span
					>
				</div>

				<div class="mt-2 flex items-center gap-2">
					<div class="probe-bar flex-1">
						<span style:width={`${(attackVisible / probes.length) * 100}%`}></span>
					</div>
					<span class="w-12 text-right font-mono text-[8.5px] text-[#64748b]"
						>{attackVisible}/{probes.length}</span
					>
				</div>

				<div class="mt-2 space-y-1">
					{#each probes as probe, i (probe.id)}
						{#if i < attackVisible}
							<div
								class="probe-row-enter flex items-center gap-2 rounded px-1.5 py-1.5 font-mono text-[10px] {probe.status ===
								'EXPLOITED'
									? 'probe-hit bg-red-500/5'
									: 'hover:bg-[#11131c]'}"
							>
								<span class="w-[48px] shrink-0 text-[9px] text-[#64748b]">{probe.id}</span>
								<span class="min-w-0 flex-1 truncate text-[#cbd5e1]">{probe.name}</span>
								<span
									class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold {probe.status ===
									'EXPLOITED'
										? 'border border-red-500/40 bg-red-500/15 text-red-300'
										: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}"
								>
									{probe.status} · {probe.code}
								</span>
								<span class="w-[34px] shrink-0 text-right text-[8.5px] text-[#475569]"
									>{probe.ms}ms</span
								>
							</div>
						{:else}
							<div class="flex items-center gap-2 rounded px-1.5 py-1.5 opacity-30">
								<span class="w-[48px] shrink-0 font-mono text-[9px] text-[#475569]">{probe.id}</span>
								<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-[#475569]"
									>{attackRunning ? 'queued…' : 'waiting'}</span
								>
							</div>
						{/if}
					{/each}
				</div>

				{#if attackVisible >= probes.length && !attackRunning}
					<div
						class="anim-up mt-3 rounded-md border border-red-500/30 bg-red-500/[0.07] p-2.5"
					>
						<div class="flex items-center gap-2">
							<ShieldAlert class="h-4 w-4 shrink-0 text-red-400" />
							<div class="min-w-0 flex-1">
								<div class="font-mono text-[9px] font-bold uppercase tracking-wide text-red-300">
									1 critical exploit confirmed
								</div>
								<p class="mt-0.5 truncate text-[10px] text-[#cbd5e1]">
									Forged <span class="text-red-300">checkout.session.completed</span> accepted with
									200 OK → free Pro upgrade.
								</p>
							</div>
							<CopyButton
								text={fixPrompt}
								compact
								label="fix prompt"
								ariaLabel="Copy PT-04 fix prompt"
							/>
						</div>
					</div>
				{:else if attackRunning}
					<div class="mt-3 flex items-center gap-2 rounded-md border border-[#222634] bg-[#0c0e15] px-2.5 py-2 font-mono text-[9px] text-[#94a3b8]">
						<RotateCw class="h-3 w-3 animate-spin text-emerald-400" />
						Firing non-destructive probes against localhost…
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Status bar -->
	<div
		class="flex items-center justify-between gap-2 border-t border-[#222634] bg-[#0b0d13] px-3 py-1.5 font-mono text-[8.5px] text-[#475569]"
	>
		<div class="flex items-center gap-3">
			<span class="flex items-center gap-1">
				{#if active === 'scan'}
					<ShieldAlert class="h-2.5 w-2.5 text-red-400" /> 3 launch blockers
				{:else if active === 'legal'}
					<ShieldCheck class="h-2.5 w-2.5 text-emerald-400" /> legal stack in sync
				{:else}
					<Zap class="h-2.5 w-2.5 text-amber-400" /> 5 / 6 probes blocked
				{/if}
			</span>
			<span class="hidden sm:inline">AST + lockfile + live probe</span>
		</div>
		<span class="hidden items-center gap-1 sm:flex">
			<Copy class="h-2.5 w-2.5" /> click a tab to run
		</span>
	</div>
</div>
