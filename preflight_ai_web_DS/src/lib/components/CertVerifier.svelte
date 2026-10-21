<script lang="ts">
	import { onMount } from 'svelte';
	import {
		ShieldCheck,
		ShieldAlert,
		ShieldX,
		CheckCircle2,
		XCircle,
		Copy,
		Check,
		RefreshCw,
		Fingerprint,
		Lock,
		Printer,
		KeyRound,
		Globe,
		ArrowUpRight,
		AlertTriangle,
		FileSearch,
		ScanLine,
		Cpu,
		Terminal
	} from 'lucide-svelte';
	import { DEMO_BUNDLES, DEMO_PUBLIC_KEY_B64URL, DEMO_KEY_FINGERPRINT, type DemoBundleKey } from '#lib/data/demo-certs';
	import catalog from '#lib/data/rules-catalog.json';
	import { CATEGORIES, type Rule } from '#lib/data/rules';
	import { copyText } from '#lib/clipboard';
	import { site } from '#lib/config';

	interface CertPayload {
		v: number;
		projectName: string;
		repo: string;
		commitSha: string;
		timestamp: string;
		overallScore: number;
		passedRules: number;
		totalRules: number;
		blockers: number;
		failedRules: string[];
		subprocessors: string[];
		auditor: string;
		legalVersion: string;
		jurisdiction: string;
		nonce: string;
		[key: string]: unknown;
	}

	type Status = 'idle' | 'verifying' | 'verified' | 'blocked' | 'invalid' | 'error';

	const rules = catalog as Rule[];
	const ruleGroups = CATEGORIES.filter((category) => category.key !== 'all');

	let status = $state<Status>('idle');
	let payload = $state<CertPayload | null>(null);
	let claim = $state<CertPayload | null>(null);
	let signatureValid = $state<boolean | null>(null);
	let errorMessage = $state('');
	let digest = $state('');
	let verifiedAt = $state('');
	let input = $state('');
	let inputError = $state('');
	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let verifyingId = $state('');

	// ---------------------------------------------------------------
	// Base64URL + canonical JSON helpers
	// ---------------------------------------------------------------

	function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
		const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const binary = atob(padded);
		const buffer = new ArrayBuffer(binary.length);
		const bytes = new Uint8Array(buffer);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	/** Stable key ordering so the exact same bytes are verified everywhere. */
	function canonicalize(value: unknown): string {
		if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
		if (value && typeof value === 'object') {
			const record = value as Record<string, unknown>;
			return `{${Object.keys(record)
				.sort()
				.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
				.join(',')}}`;
		}
		return JSON.stringify(value);
	}

	function decodeBundle(raw: string): { payload: CertPayload; signature: string } {
		let token = raw.trim();
		if (!token) throw new Error('No certificate fragment supplied.');

		// Accept a full verification URL as well as a raw fragment.
		if (/^https?:\/\//i.test(token)) {
			try {
				token = new URL(token).hash.replace(/^#/, '');
			} catch {
				throw new Error('That URL could not be parsed.');
			}
		}
		if (token.startsWith('#')) token = token.slice(1);
		token = token.split('#').pop() ?? token;
		if (!token) throw new Error('The URL has no #fragment to verify.');

		let parsed: unknown;
		try {
			const json = new TextDecoder().decode(base64UrlToBytes(token));
			parsed = JSON.parse(json);
		} catch {
			throw new Error('The fragment is not valid Base64URL-encoded JSON.');
		}

		const bundle = parsed as { payload?: CertPayload; signature?: unknown };
		if (!bundle?.payload || typeof bundle.payload !== 'object') {
			throw new Error('The bundle is missing a certificate payload.');
		}
		if (typeof bundle.signature !== 'string' || bundle.signature.length < 32) {
			throw new Error('The bundle is missing a valid Ed25519 signature.');
		}
		if (typeof bundle.payload.projectName !== 'string' || typeof bundle.payload.overallScore !== 'number') {
			throw new Error('The payload is missing required certificate fields.');
		}
		return { payload: bundle.payload, signature: bundle.signature };
	}

	async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
		const hash = await crypto.subtle.digest('SHA-256', bytes);
		return Array.from(new Uint8Array(hash))
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('');
	}

	function formatDigest(hex: string): string {
		return hex.slice(0, 32).match(/.{1,4}/g)?.join(' ') ?? hex.slice(0, 32);
	}

	function formatTimestamp(iso: string): string {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return iso;
		return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
	}

	function failedSet(): Set<string> {
		return new Set(payload?.failedRules ?? []);
	}

	const groupStats = $derived.by(() => {
		const failed = failedSet();
		return ruleGroups.map((group) => {
			const items = rules.filter((rule) => rule.category === group.key);
			const failedItems = items.filter((rule) => failed.has(rule.id));
			return {
				...group,
				items,
				failed: failedItems,
				passed: items.length - failedItems.length
			};
		});
	});

	const failedCount = $derived(payload?.failedRules?.length ?? 0);

	// ---------------------------------------------------------------
	// Core verification
	// ---------------------------------------------------------------

	async function verifyFragment(fragment: string, source = '') {
		status = 'verifying';
		payload = null;
		claim = null;
		signatureValid = null;
		errorMessage = '';
		inputError = '';
		digest = '';
		verifiedAt = '';
		verifyingId = source;

		try {
			const bundle = decodeBundle(fragment);
			claim = bundle.payload;

			if (!window.crypto?.subtle) {
				throw new Error('WebCrypto is unavailable. Open this page over HTTPS or localhost.');
			}

			const canonical = canonicalize(bundle.payload);
			const data = new TextEncoder().encode(canonical);
			const signature = base64UrlToBytes(bundle.signature);
			const rawKey = base64UrlToBytes(DEMO_PUBLIC_KEY_B64URL);

			let key: CryptoKey;
			try {
				key = await crypto.subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, [
					'verify'
				]);
			} catch {
				throw new Error(
					'This browser does not support Ed25519 in WebCrypto. Update Chrome, Edge, Safari or Firefox.'
				);
			}

			const valid = await crypto.subtle.verify('Ed25519', key, signature, data);
			signatureValid = valid;

			if (!valid) {
				status = 'invalid';
				errorMessage =
					'The Ed25519 signature does not match the canonical payload. The score, commit, rules or sub-processors were modified after signing.';
				return;
			}

			payload = bundle.payload;
			digest = formatDigest(await sha256Hex(data));
			verifiedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

			const cleared = payload.overallScore >= 90 && payload.blockers === 0 && failedCount === 0;
			status = cleared ? 'verified' : 'blocked';
			if (!cleared) {
				errorMessage =
					'Signature is authentic, but this certificate does not meet launch clearance: 90+ score and zero blocking rules are required.';
			}
		} catch (error) {
			status = 'error';
			errorMessage = error instanceof Error ? error.message : 'Unknown verification error.';
		} finally {
			verifyingId = '';
		}
	}

	async function loadDemo(key: DemoBundleKey) {
		const bundle = DEMO_BUNDLES[key];
		input = '';
		setHash(bundle);
		await verifyFragment(bundle, key);
	}

	function setHash(bundle: string) {
		if (typeof window === 'undefined') return;
		const next = `${window.location.pathname}${window.location.search}#${bundle}`;
		history.replaceState(null, '', next);
	}

	async function verifyInput() {
		if (!input.trim()) {
			inputError = 'Paste a verification URL or Base64URL fragment first.';
			return;
		}
		inputError = '';
		const token = input.trim();
		if (/^https?:\/\//i.test(token)) {
			setHash(token.split('#').pop() ?? '');
		} else {
			setHash(token.replace(/^#/, ''));
		}
		await verifyFragment(token, 'manual');
	}

	async function copyLink() {
		if (typeof window === 'undefined') return;
		if (await copyText(window.location.href)) {
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		}
	}

	function reset() {
		status = 'idle';
		payload = null;
		claim = null;
		signatureValid = null;
		errorMessage = '';
		digest = '';
		input = '';
		inputError = '';
		history.replaceState(null, '', window.location.pathname + window.location.search);
	}

	onMount(() => {
		const hash = window.location.hash;
		if (hash && hash.length > 12) {
			verifyFragment(hash);
		}

		const onHash = () => {
			const next = window.location.hash;
			if (next && next.length > 12) verifyFragment(next);
		};
		window.addEventListener('hashchange', onHash);
		return () => {
			window.removeEventListener('hashchange', onHash);
			if (copyTimer) clearTimeout(copyTimer);
		};
	});
</script>

<div class="space-y-5">
	<!-- Demo lab -->
	<div
		class="no-print flex flex-col gap-3 rounded-xl border border-[#222634] bg-[#0d0f16] p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
	>
		<div class="flex items-center gap-2">
			<FileSearch class="h-3.5 w-3.5 text-emerald-400" />
			<div>
				<span class="mono-label text-[9px] text-[#cbd5e1]">Demo lab</span>
				<span class="ml-2 text-[10px] text-[#64748b]">Pre-signed fixtures using a demo Ed25519 key</span>
			</div>
		</div>
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				onclick={() => loadDemo('verified')}
				class="btn btn-secondary btn-sm"
				disabled={status === 'verifying'}
			>
				<CheckCircle2 class="h-3 w-3 text-emerald-400" /> 100/100 verified
			</button>
			<button
				type="button"
				onclick={() => loadDemo('blocked')}
				class="btn btn-secondary btn-sm"
				disabled={status === 'verifying'}
			>
				<ShieldAlert class="h-3 w-3 text-amber-400" /> 65/100 blocked
			</button>
			<button
				type="button"
				onclick={() => loadDemo('tampered')}
				class="btn btn-secondary btn-sm"
				disabled={status === 'verifying'}
			>
				<ShieldX class="h-3 w-3 text-red-400" /> Tampered score
			</button>
		</div>
	</div>

	<!-- Paste bar -->
	<div class="no-print rounded-xl border border-[#222634] bg-[#11131c] p-3 sm:p-4">
		<label for="cert-input" class="mono-label mb-2 block text-[9px] text-[#94a3b8]">
			Verify a certificate URL or fragment
		</label>
		<div class="flex flex-col gap-2 sm:flex-row">
			<div class="relative min-w-0 flex-1">
				<Terminal class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#475569]" />
				<input
					id="cert-input"
					bind:value={input}
					onkeydown={(event) => {
						if (event.key === 'Enter') verifyInput();
					}}
					type="text"
					spellcheck="false"
					autocomplete="off"
					placeholder="https://preflight.dev/verify/#eyJwYXlsb2FkIjp7…"
					class="h-9 w-full rounded-md border border-[#222634] bg-[#08090d] pl-8 pr-2.5 font-mono text-[10.5px] text-white placeholder:text-[#3f485c] focus:border-emerald-500/50 focus:outline-none"
				/>
			</div>
			<button type="button" onclick={verifyInput} class="btn btn-primary btn-sm shrink-0">
				<ScanLine class="h-3.5 w-3.5" /> Verify fragment
			</button>
			{#if status !== 'idle'}
				<button type="button" onclick={reset} class="btn btn-secondary btn-sm shrink-0">
					<RefreshCw class="h-3 w-3" /> Reset
				</button>
			{/if}
		</div>
		{#if inputError}
			<p class="mt-1.5 font-mono text-[9.5px] text-red-400">{inputError}</p>
		{:else}
			<p class="mt-1.5 flex items-center gap-1 font-mono text-[9px] text-[#475569]">
				<Lock class="h-2.5 w-2.5" /> The fragment is read locally. It is never sent to a server.
			</p>
		{/if}
	</div>

	<!-- Verifying -->
	{#if status === 'verifying'}
		<div
			class="flex items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-5"
		>
			<RefreshCw class="h-5 w-5 animate-spin text-indigo-400" />
			<div>
				<p class="font-mono text-xs font-semibold text-indigo-200">
					Running Ed25519 verification in WebCrypto…
				</p>
				<p class="mt-1 font-mono text-[9.5px] text-[#64748b]">
					canonicalize(payload) → subtle.verify(signature, publicKey)
				</p>
			</div>
		</div>
	{:else if status === 'invalid'}
		<!-- Invalid signature -->
		<div class="rounded-xl border border-red-500/45 bg-red-500/[0.06] p-5 sm:p-6">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/40 bg-red-500/15 text-red-400">
						<ShieldX class="h-5 w-5" />
					</span>
					<div>
						<span class="mono-label text-[9px] text-red-400">Security warning</span>
						<h2 class="mt-1 font-mono text-[15px] font-bold text-red-300 sm:text-[17px]">
							[✗ TAMPERED OR INVALID SIGNATURE]
						</h2>
						<p class="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-[#fecaca]/80">
							{errorMessage}
						</p>
					</div>
				</div>
				<span class="pill pill-block shrink-0">signature invalid</span>
			</div>

			{#if claim}
				<div class="mt-4 rounded-lg border border-red-500/25 bg-[#0a0c12] p-3">
					<div class="mono-label mb-2 text-[9px] text-red-300">Untrusted claims in payload</div>
					<div class="grid grid-cols-2 gap-2 font-mono text-[10px] sm:grid-cols-4">
						<div>
							<div class="text-[8px] text-[#64748b]">PROJECT</div>
							<div class="truncate text-[#e2e8f0]">{claim.projectName}</div>
						</div>
						<div>
							<div class="text-[8px] text-[#64748b]">CLAIMED SCORE</div>
							<div class="text-red-300">{claim.overallScore}/100</div>
						</div>
						<div>
							<div class="text-[8px] text-[#64748b]">COMMIT</div>
							<div class="truncate text-[#e2e8f0]">{claim.commitSha?.slice(0, 10)}</div>
						</div>
						<div>
							<div class="text-[8px] text-[#64748b]">BLOCKERS</div>
							<div class="text-red-300">{claim.blockers}</div>
						</div>
					</div>
				</div>
			{/if}

			<p class="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#94a3b8]">
				<AlertTriangle class="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
				Only the holder of the private signing key can produce a valid certificate. Editing any field — score, rule results, commit or sub-processor — invalidates the signature.
			</p>
		</div>
	{:else if status === 'error'}
		<div class="rounded-xl border border-amber-500/35 bg-amber-500/[0.05] p-5">
			<div class="flex items-center gap-2">
				<AlertTriangle class="h-4 w-4 text-amber-400" />
				<span class="font-mono text-xs font-semibold text-amber-200">Could not verify this fragment</span>
			</div>
			<p class="mt-2 text-[11px] leading-relaxed text-[#94a3b8]">{errorMessage}</p>
		</div>
	{:else if status === 'idle'}
		<!-- Empty state -->
		<div
			class="relative overflow-hidden rounded-xl border border-dashed border-[#2d3242] bg-[#0c0e15] px-6 py-12 text-center"
		>
			<div class="pointer-events-none absolute inset-0 dot-bg opacity-20" aria-hidden="true"></div>
			<div class="relative mx-auto max-w-md">
				<span class="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#2d3242] bg-[#11131c]">
					<Fingerprint class="h-5 w-5 text-[#64748b]" />
				</span>
				<h2 class="mt-4 text-[17px] font-semibold text-white">Awaiting a certificate fragment</h2>
				<p class="mt-2 text-[11.5px] leading-relaxed text-[#94a3b8]">
					Open a <code class="text-[#cbd5e1]">/verify#…</code> link or load one of the signed demo
					fixtures above. Verification happens entirely in this browser.
				</p>
				<div class="mt-4 flex flex-wrap justify-center gap-2">
					<button type="button" onclick={() => loadDemo('verified')} class="btn btn-primary btn-sm">
						<CheckCircle2 class="h-3 w-3" /> Load verified sample
					</button>
					<button type="button" onclick={() => loadDemo('tampered')} class="btn btn-secondary btn-sm">
						<ShieldX class="h-3 w-3" /> Load tampered sample
					</button>
				</div>
			</div>
		</div>
	{:else if payload}
		<!-- Valid signature: ready or blocked -->
		{@const ready = status === 'verified'}
		<div
			class="no-print flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 {ready
				? 'border-emerald-500/40 bg-emerald-500/[0.06]'
				: 'border-amber-500/40 bg-amber-500/[0.06]'}"
		>
			<div class="flex items-center gap-3">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border {ready
						? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
						: 'border-amber-500/40 bg-amber-500/15 text-amber-400'}"
				>
					{#if ready}
						<ShieldCheck class="h-5 w-5" />
					{:else}
						<ShieldAlert class="h-5 w-5" />
					{/if}
				</span>
				<div>
					<h2 class="font-mono text-[13px] font-bold {ready ? 'text-emerald-300' : 'text-amber-300'} sm:text-[15px]">
						{ready
							? '[✓ CRYPTOGRAPHICALLY VERIFIED AUDIT RECORD]'
							: '[✓ SIGNATURE VALID · ✗ LAUNCH NOT CLEARED]'}
					</h2>
					<p class="mt-0.5 text-[10.5px] text-[#94a3b8]">
						{ready
							? 'The payload is authentic and every launch gate passed.'
							: errorMessage}
					</p>
				</div>
			</div>
			<div class="flex shrink-0 items-center gap-2 font-mono text-[9px]">
				<span class="pill {ready ? 'pill-ready' : 'pill-warn'}">
					{ready ? '100% cleared' : `${payload.blockers} blockers`}
				</span>
				<span class="pill">{payload.overallScore}/100</span>
			</div>
		</div>

		<div class="grid gap-5 xl:grid-cols-[1fr_320px]">
			<!-- Certificate document -->
			<div class="print-doc overflow-hidden rounded-xl border border-[#222634] bg-[#0f111a]">
				<div class="relative border-b border-[#222634] bg-[#0b0d14] p-5 sm:p-6">
					<div
						class="pointer-events-none absolute inset-0 dot-bg opacity-20"
						aria-hidden="true"
					></div>
					<div class="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div class="flex items-center gap-2.5">
							<span
								class="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10"
							>
								<svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
									<path
										d="M12 2.6 20 6v6.1c0 4.5-3.1 7.9-8 9.3-4.9-1.4-8-4.8-8-9.3V6l8-3.4Z"
										stroke="#10b981"
										stroke-width="1.4"
										stroke-linejoin="round"
									/>
									<path d="m12.9 7-4.2 6.1h3.1l-.7 4 4.2-6.1h-3.1l.7-4Z" fill="#10b981" />
								</svg>
							</span>
							<div>
								<div class="font-mono text-[10px] font-extrabold tracking-[0.12em] text-white">
									PREFLIGHT
								</div>
								<div class="font-mono text-[8px] uppercase tracking-[0.16em] text-[#64748b]">
									Launch certificate
								</div>
							</div>
						</div>

						<div class="sm:text-right">
							<div class="inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[9px] font-bold {ready
								? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300'
								: 'border-amber-500/35 bg-amber-500/10 text-amber-300'}"
							>
								{#if ready}
									<CheckCircle2 class="h-3 w-3" /> VERIFIED
								{:else}
									<XCircle class="h-3 w-3" /> NOT CLEARED
								{/if}
							</div>
							<div class="mt-1 font-mono text-[8px] text-[#475569]">
								Ed25519 · zero-backend attestation
							</div>
						</div>
					</div>

					<div class="relative mt-5">
						<div class="mono-label text-[8px] text-[#64748b]">Project</div>
						<h1 class="mt-1 break-all font-mono text-[20px] font-extrabold tracking-[-0.02em] text-white sm:text-[24px]">
							{payload.projectName}
						</h1>
						<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] text-[#64748b]">
							<span>{payload.repo}</span>
							<span class="text-[#2d3242]">·</span>
							<span>commit {payload.commitSha?.slice(0, 8)}</span>
							<span class="text-[#2d3242]">·</span>
							<span>{formatTimestamp(payload.timestamp)}</span>
						</div>
					</div>
				</div>

				<div class="p-5 sm:p-6">
					<div class="grid gap-4 sm:grid-cols-[160px_1fr]">
						<!-- Score -->
						<div
							class="flex flex-col items-center justify-center rounded-lg border p-4 {ready
								? 'border-emerald-500/25 bg-emerald-500/[0.04]'
								: 'border-amber-500/25 bg-amber-500/[0.04]'}"
						>
							<div class="font-mono text-[9px] uppercase tracking-[0.14em] text-[#64748b]">
								Readiness score
							</div>
							<div class="mt-1 font-mono text-[44px] font-extrabold leading-none tracking-[-0.05em] {ready
								? 'text-emerald-400'
								: 'text-amber-400'}">
								{payload.overallScore}
							</div>
							<div class="font-mono text-[9px] text-[#64748b]">/ 100</div>
							<div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1c2130]">
								<div
									class="h-full rounded-full {ready ? 'bg-emerald-400' : 'bg-amber-400'}"
									style:width={`${Math.max(0, Math.min(100, payload.overallScore))}%`}
								></div>
							</div>
							<div class="mt-2 font-mono text-[8px] uppercase tracking-wide {ready ? 'text-emerald-400' : 'text-amber-400'}">
								{ready ? 'Launch ready' : 'Launch blocked'}
							</div>
						</div>

						<!-- Facts -->
						<div class="grid grid-cols-2 gap-2">
							<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-2.5">
								<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">Rules passed</div>
								<div class="mt-1 font-mono text-[15px] font-bold text-white">
									{payload.passedRules}<span class="text-[9px] text-[#64748b]">/{payload.totalRules}</span>
								</div>
							</div>
							<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-2.5">
								<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">Blockers</div>
								<div class="mt-1 font-mono text-[15px] font-bold {payload.blockers === 0 ? 'text-emerald-400' : 'text-red-400'}">
									{payload.blockers}
								</div>
							</div>
							<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-2.5">
								<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">Legal version</div>
								<div class="mt-1 truncate font-mono text-[11px] font-semibold text-[#e2e8f0]">
									{payload.legalVersion}
								</div>
							</div>
							<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-2.5">
								<div class="font-mono text-[8px] uppercase tracking-wide text-[#64748b]">Jurisdiction</div>
								<div class="mt-1 truncate font-mono text-[10px] font-semibold text-[#e2e8f0]">
									{payload.jurisdiction}
								</div>
							</div>
						</div>
					</div>

					<!-- Sub-processors -->
					<div class="mt-4 rounded-lg border border-[#222634] bg-[#0b0d14] p-3">
						<div class="flex items-center justify-between">
							<span class="mono-label text-[8.5px] text-[#94a3b8]">Sub-processor ledger</span>
							<span class="font-mono text-[8px] text-[#475569]">{payload.subprocessors.length} declared</span>
						</div>
						<div class="mt-2 flex flex-wrap gap-1.5">
							{#each payload.subprocessors as processor (processor)}
								<span class="rounded border border-[#2d3242] bg-[#11131c] px-1.5 py-0.5 font-mono text-[8.5px] text-[#cbd5e1]">
									{processor}
								</span>
							{/each}
						</div>
					</div>

					<!-- Signature -->
					<div class="mt-4 grid gap-2 rounded-lg border border-[#222634] bg-[#0b0d14] p-3 font-mono text-[8.5px] sm:grid-cols-2">
						<div>
							<div class="text-[8px] uppercase tracking-wide text-[#64748b]">Public key fingerprint</div>
							<div class="mt-1 break-all text-emerald-300">{DEMO_KEY_FINGERPRINT}</div>
						</div>
						<div>
							<div class="text-[8px] uppercase tracking-wide text-[#64748b]">Payload digest · SHA-256</div>
							<div class="mt-1 break-all text-[#cbd5e1]">{digest}</div>
						</div>
						<div class="sm:col-span-2">
							<div class="text-[8px] uppercase tracking-wide text-[#64748b]">Auditor</div>
							<div class="mt-1 text-[#94a3b8]">
								{payload.auditor} · {verifiedAt}
							</div>
						</div>
					</div>

					<div class="mt-4 flex flex-col items-start justify-between gap-2 border-t border-[#222634] pt-3 sm:flex-row sm:items-center">
						<p class="font-mono text-[8px] text-[#475569]">
							Verify at <span class="text-[#94a3b8]">{site.domain}/verify/#…</span> · record {payload.nonce}
						</p>
						<div class="flex items-center gap-1 font-mono text-[8px] text-emerald-400/80">
							<Fingerprint class="h-2.5 w-2.5" />
							{signatureValid ? 'Ed25519 signature verified' : 'signature unchecked'}
						</div>
					</div>
				</div>
			</div>

			<!-- Telemetry -->
			<aside class="no-print space-y-3">
				<div class="rounded-xl border border-[#222634] bg-[#0f111a] p-4">
					<div class="mono-label text-[9px] text-[#cbd5e1]">Verification telemetry</div>
					<div class="mt-3 space-y-2.5">
						<div class="flex items-center justify-between gap-2 font-mono text-[9px]">
							<span class="text-[#64748b]">algorithm</span>
							<span class="text-[#e2e8f0]">Ed25519</span>
						</div>
						<div class="flex items-center justify-between gap-2 font-mono text-[9px]">
							<span class="text-[#64748b]">key</span>
							<span class="truncate text-[#e2e8f0]">demo · {DEMO_KEY_FINGERPRINT.slice(0, 9)}</span>
						</div>
						<div class="flex items-center justify-between gap-2 font-mono text-[9px]">
							<span class="text-[#64748b]">signature</span>
							<span class={ready ? 'text-emerald-400' : 'text-amber-400'}>
								{ready ? 'valid' : 'valid · gate failed'}
							</span>
						</div>
						<div class="flex items-center justify-between gap-2 font-mono text-[9px]">
							<span class="text-[#64748b]">server requests</span>
							<span class="text-emerald-400">0</span>
						</div>
						<div class="flex items-center justify-between gap-2 font-mono text-[9px]">
							<span class="text-[#64748b]">verified at</span>
							<span class="text-[#e2e8f0]">{verifiedAt.slice(11, 19)} UTC</span>
						</div>
					</div>

					<div class="mt-4 grid gap-2">
						<button type="button" onclick={copyLink} class="btn btn-secondary btn-sm justify-center">
							{#if copied}
								<Check class="h-3 w-3 text-emerald-400" /> Link copied
							{:else}
								<Copy class="h-3 w-3" /> Copy verification link
							{/if}
						</button>
						<button
							type="button"
							onclick={() => window.print()}
							class="btn btn-secondary btn-sm justify-center"
						>
							<Printer class="h-3 w-3" /> Print / save as PDF
						</button>
					</div>
				</div>

				<div class="rounded-xl border border-[#222634] bg-[#0f111a] p-4">
					<div class="mono-label text-[9px] text-[#cbd5e1]">Trust model</div>
					<ul class="mt-2.5 space-y-2">
						{#each [
							{ icon: Lock, text: 'Payload lives in the URL fragment, so no server ever receives it.' },
							{ icon: KeyRound, text: 'SubtleCrypto imports the raw Ed25519 public key locally.' },
							{ icon: Cpu, text: 'Canonical JSON bytes are hashed and checked against the signature.' },
							{ icon: Globe, text: 'GitHub Pages serves static files. There is no backend to compromise.' }
						] as item (item.text)}
							{@const Icon = item.icon}
							<li class="flex items-start gap-2 text-[10px] leading-relaxed text-[#94a3b8]">
								<Icon class="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
								<span>{item.text}</span>
							</li>
						{/each}
					</ul>
				</div>

				<div class="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.04] p-4">
					<div class="flex items-center gap-1.5">
						<KeyRound class="h-3 w-3 text-indigo-300" />
						<span class="mono-label text-[9px] text-indigo-300">Public key</span>
					</div>
					<code class="mt-2 block break-all font-mono text-[8.5px] leading-relaxed text-[#c7d2fe]">
						{DEMO_PUBLIC_KEY_B64URL}
					</code>
					<p class="mt-2 text-[9.5px] leading-relaxed text-[#64748b]">
						Demo key. Replace with your production key and regenerate fixtures before launch.
					</p>
				</div>
			</aside>
		</div>

		<!-- Attestation -->
		{#if payload}
			<div class="rounded-xl border border-[#222634] bg-[#0f111a]">
				<div class="flex flex-col gap-2 border-b border-[#222634] bg-[#0d0f16] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<div class="mono-label text-[9px] text-[#cbd5e1]">43-check attestation record</div>
						<p class="mt-1 text-[10.5px] text-[#64748b]">
							Every static rule and active probe, bound to commit {payload.commitSha?.slice(0, 8)}.
						</p>
					</div>
					<div class="flex items-center gap-2 font-mono text-[9px]">
						<span class="pill pill-ready">{payload.totalRules - payload.failedRules.length} passed</span>
						{#if payload.failedRules.length}
							<span class="pill pill-block">{payload.failedRules.length} failed</span>
						{:else}
							<span class="pill">0 failed</span>
						{/if}
					</div>
				</div>

				<div class="grid gap-px bg-[#222634] sm:grid-cols-2 xl:grid-cols-3">
					{#each groupStats as group (group.key)}
						<div class="bg-[#0b0d14] p-3.5">
							<div class="flex items-center justify-between border-b border-[#222634] pb-2">
								<div class="flex items-center gap-1.5">
									<span class="font-mono text-[9px] font-bold uppercase tracking-wide text-[#cbd5e1]">{group.label}</span>
								</div>
								<span class="font-mono text-[8.5px] text-[#64748b]">
									{group.passed}/{group.items.length}
								</span>
							</div>
							<div class="mt-1.5 space-y-[3px]">
								{#each group.items as rule (rule.id)}
									{@const failed = failedSet().has(rule.id)}
									<div class="flex items-center gap-1.5 rounded px-1 py-[3px] {failed ? 'bg-red-500/[0.06]' : ''}">
										{#if failed}
											<XCircle class="h-2.5 w-2.5 shrink-0 text-red-400" />
										{:else}
											<Check class="h-2.5 w-2.5 shrink-0 text-emerald-500/80" />
										{/if}
										<span class="w-9 shrink-0 font-mono text-[8px] {failed ? 'text-red-300' : 'text-[#64748b]'}">{rule.id}</span>
										<span class="min-w-0 flex-1 truncate font-mono text-[8px] {failed ? 'text-red-200' : 'text-[#94a3b8]'}">{rule.title}</span>
										<span class="shrink-0 font-mono text-[7px] uppercase {failed ? 'text-red-400' : 'text-emerald-500/60'}">
											{failed ? 'fail' : 'pass'}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#222634] px-4 py-2.5 font-mono text-[8.5px] text-[#64748b]">
					<span class="flex items-center gap-1"><Check class="h-2.5 w-2.5 text-emerald-500" />signature verified locally</span>
					<span class="flex items-center gap-1"><Lock class="h-2.5 w-2.5 text-[#475569]" />no server request</span>
					<span class="ml-auto">payload {digest.slice(0, 12)}…</span>
				</div>
			</div>
		{/if}
	{/if}

	<!-- How it works -->
	<div class="no-print grid gap-3 sm:grid-cols-3">
		{#each [
			{ n: '01', icon: Lock, title: 'Fragment stays local', text: 'The certificate payload lives after the #. Browsers never send fragments to GitHub Pages.' },
			{ n: '02', icon: KeyRound, title: 'Ed25519 in WebCrypto', text: 'Canonical JSON is verified against the raw public key with subtle.verify().' },
			{ n: '03', icon: ShieldCheck, title: 'Verdict is reproducible', text: 'A valid signature plus 90+ score and zero blockers equals launch clearance.' }
		] as step (step.n)}
			{@const Icon = step.icon}
			<div class="rounded-lg border border-[#222634] bg-[#0b0d14] p-3.5">
				<div class="flex items-center justify-between">
					<span class="font-mono text-[9px] font-bold tracking-[0.16em] text-emerald-400">{step.n}</span>
					<Icon class="h-3.5 w-3.5 text-[#64748b]" />
				</div>
				<div class="mt-2 text-[11px] font-semibold text-[#e2e8f0]">{step.title}</div>
				<p class="mt-1 text-[10px] leading-relaxed text-[#64748b]">{step.text}</p>
			</div>
		{/each}
	</div>
</div>
