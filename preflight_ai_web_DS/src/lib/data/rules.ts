export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

export interface Rule {
	id: string;
	title: string;
	category: string;
	severity: Severity;
	blocking: boolean;
	penalty: string;
	targetFiles: string;
	detectionLogic: string;
	remediation: string;
	vulnerableCode: string;
	fixedCode: string;
	mcpPrompt: string;
}

export interface CategoryDef {
	key: string;
	label: string;
	short: string;
	prefix: string;
	blurb: string;
}

export const CATEGORIES: CategoryDef[] = [
	{
		key: 'all',
		label: 'All',
		short: 'ALL',
		prefix: 'ALL',
		blurb: 'Static rules plus active probes'
	},
	{
		key: 'Security',
		label: 'Security',
		short: 'SEC',
		prefix: 'SEC',
		blurb: 'Tenant isolation, secrets, auth & webhooks'
	},
	{
		key: 'Data Privacy',
		label: 'Data Privacy',
		short: 'PRIV',
		prefix: 'PRIV',
		blurb: 'GDPR, PII, consent & data lifecycle'
	},
	{
		key: 'EULA & Legal',
		label: 'EULA & Legal',
		short: 'LEG',
		prefix: 'LEG',
		blurb: 'Licensing, clickwrap & sub-processor drift'
	},
	{
		key: 'FinOps & Payments',
		label: 'FinOps & Payments',
		short: 'FIN',
		prefix: 'FIN',
		blurb: 'Burn loops, billing races, ops & a11y'
	},
	{
		key: 'Active Pentest',
		label: 'Active Pentest',
		short: 'PT',
		prefix: 'PT',
		blurb: 'Six non-destructive live exploit probes'
	}
];

export const STATIC_RULES = 37;
export const ACTIVE_PROBES = 6;
export const TOTAL_RULES = STATIC_RULES + ACTIVE_PROBES;

export const SEVERITY_META: Record<
	Severity,
	{ label: string; className: string; dot: string; penalty: string }
> = {
	CRITICAL: {
		label: 'Critical',
		className: 'sev-critical',
		dot: '#ef4444',
		penalty: '-25 pts'
	},
	HIGH: { label: 'High', className: 'sev-high', dot: '#f59e0b', penalty: '-10 pts' },
	MEDIUM: { label: 'Medium', className: 'sev-medium', dot: '#3b82f6', penalty: '-4 pts' }
};

export function severityClass(severity: Severity): string {
	return SEVERITY_META[severity]?.className ?? 'sev-medium';
}

export function categoryFor(key: string): CategoryDef {
	return CATEGORIES.find((category) => category.key === key) ?? CATEGORIES[0];
}

export function searchableText(rule: Rule): string {
	return [
		rule.id,
		rule.title,
		rule.category,
		rule.severity,
		rule.targetFiles,
		rule.detectionLogic,
		rule.remediation,
		rule.mcpPrompt
	]
		.join(' ')
		.toLowerCase();
}
