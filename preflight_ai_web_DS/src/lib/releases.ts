import { site } from './config';
import { TOTAL_RULES } from './data/rules';

export interface ReleaseAsset {
	name: string;
	url: string;
	size: number | null;
}

export interface ReleaseInfo {
	tag: string;
	name: string;
	htmlUrl: string;
	publishedAt: string | null;
	assets: ReleaseAsset[];
	source: 'github' | 'fallback';
	checksums: ReleaseAsset | null;
}

const ASSET_NAMES = [
	'preflight-darwin-arm64',
	'preflight-darwin-x64',
	'preflight-linux-x64',
	'preflight-linux-arm64',
	'preflight-windows-x64.exe',
	'preflight-latest.vsix'
];

const FALLBACK: ReleaseInfo = {
	tag: site.fallbackVersion,
	name: `Preflight ${site.fallbackVersion}`,
	htmlUrl: `${site.github}/releases/latest`,
	publishedAt: null,
	source: 'fallback',
	assets: ASSET_NAMES.map((name) => ({
		name,
		url: `${site.github}/releases/latest/download/${name}`,
		size: null
	})),
	checksums: {
		name: 'SHA256SUMS.txt',
		url: `${site.github}/releases/latest/download/SHA256SUMS.txt`,
		size: null
	}
};

const CACHE_KEY = 'preflight.release.v1';
const CACHE_TTL = 1000 * 60 * 10;

let inflight: Promise<ReleaseInfo> | null = null;

interface CachedRelease {
	at: number;
	release: ReleaseInfo;
}

function readCache(): ReleaseInfo | null {
	try {
		const raw = sessionStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedRelease;
		if (!parsed?.release || Date.now() - parsed.at > CACHE_TTL) return null;
		return parsed.release;
	} catch {
		return null;
	}
}

function writeCache(release: ReleaseInfo): void {
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), release }));
	} catch {
		/* private mode / quota — ignore */
	}
}

/**
 * Pulls the latest release from the GitHub Releases API and normalises the
 * asset list. Cached in sessionStorage so navigating between pages is free.
 * Falls back to the last known tag if the API is rate limited or unreachable.
 */
export function getLatestRelease(): Promise<ReleaseInfo> {
	if (typeof window === 'undefined') return Promise.resolve(FALLBACK);
	if (inflight) return inflight;

	const cached = readCache();
	if (cached) {
		inflight = Promise.resolve(cached);
		return inflight;
	}

	inflight = (async () => {
		try {
			const response = await fetch(
				`https://api.github.com/repos/${site.repo}/releases/latest`,
				{
					headers: {
						Accept: 'application/vnd.github+json',
						'X-GitHub-Api-Version': '2022-11-28'
					},
					signal: AbortSignal.timeout(4500)
				}
			);
			if (!response.ok) throw new Error(`GitHub API ${response.status}`);
			const json = (await response.json()) as {
				tag_name?: string;
				name?: string;
				html_url?: string;
				published_at?: string;
				assets?: Array<{ name?: string; browser_download_url?: string; size?: number }>;
			};

			const assets: ReleaseAsset[] = (json.assets ?? [])
				.filter((asset) => asset.name && asset.browser_download_url)
				.map((asset) => ({
					name: asset.name as string,
					url: asset.browser_download_url as string,
					size: typeof asset.size === 'number' ? asset.size : null
				}));

			const checksums =
				assets.find((asset) => /sha256|checksums/i.test(asset.name)) ?? null;

			const release: ReleaseInfo = {
				tag: json.tag_name || site.fallbackVersion,
				name: json.name || json.tag_name || `Preflight ${site.fallbackVersion}`,
				htmlUrl: json.html_url || `${site.github}/releases/latest`,
				publishedAt: json.published_at ?? null,
				assets: assets.length ? assets : FALLBACK.assets,
				source: 'github',
				checksums
			};
			writeCache(release);
			return release;
		} catch {
			writeCache(FALLBACK);
			return FALLBACK;
		}
	})();

	return inflight;
}

export function assetUrl(release: ReleaseInfo, name: string): string {
	return (
		release.assets.find((asset) => asset.name === name)?.url ??
		`${site.github}/releases/latest/download/${name}`
	);
}

export function formatBytes(bytes: number | null): string | null {
	if (!bytes || bytes <= 0) return null;
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function releaseSummary(release: ReleaseInfo): string {
	return `${TOTAL_RULES} checks · ${release.tag}`;
}
