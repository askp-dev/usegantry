/**
 * Single source of truth for links, versions and release configuration.
 * Swap `repo` and `domain` when deploying to your own organisation.
 */
export const site = {
	name: 'Preflight',
	tagline: 'Tactical pre-flight avionics for AI-built software',
	domain: 'https://preflight.dev',
	repo: 'preflight-ai/preflight',
	github: 'https://github.com/preflight-ai/preflight',
	discussions: 'https://github.com/preflight-ai/preflight/discussions',
	marketplaceVscode:
		'https://marketplace.visualstudio.com/items?itemName=preflight-ai.preflight',
	marketplaceCursor: 'https://cursor.com/marketplace',
	email: 'hello@preflight.dev',
	salesEmail: 'sales@preflight.dev',
	fallbackVersion: 'v1.0.4',
	fallbackVersionLabel: 'v1.0.4',
	license: 'MIT Core'
} as const;

export const install = {
	quick: 'bunx preflight scan',
	npx: 'npx preflight scan',
	mcp: 'bunx preflight init --mcp',
	hook: 'npx preflight hook install',
	unix: `curl -fsSL ${site.domain}/install.sh | sh`,
	windows: `irm ${site.domain}/install.ps1 | iex`
} as const;

export function absoluteUrl(path = '/'): string {
	return `${site.domain}${path}`;
}
