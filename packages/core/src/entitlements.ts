/**
 * Feature tiers from WEBSITE_SPEC §6 (Community / Pro Builder / Agency & Team).
 * At launch every feature is free: `resolveTier()` always grants the top tier.
 * To start gating, replace `resolveTier()` with a real license lookup — every gated entry point
 * already goes through `requireFeature()`, so nothing else needs to change.
 */
export type Tier = "community" | "pro" | "agency";

export const FEATURE_TIER = {
  scan: "community",
  checklist: "community",
  init: "community",
  mcp: "community",
  legal: "pro",
  attack: "pro",
  ide: "pro",
  cert: "agency",
  vendorPack: "agency",
} as const satisfies Record<string, Tier>;
export type Feature = keyof typeof FEATURE_TIER;

const RANK: Record<Tier, number> = { community: 0, pro: 1, agency: 2 };

/** Launch: everything unlocked. Swap in license verification here when paid tiers go live. */
export function resolveTier(): Tier {
  return "agency";
}

export const hasFeature = (f: Feature, tier: Tier = resolveTier()) => RANK[tier] >= RANK[FEATURE_TIER[f]];

export class FeatureLockedError extends Error {
  constructor(readonly feature: Feature) {
    super(`\`${feature}\` requires the ${FEATURE_TIER[feature]} plan.`);
  }
}

export function requireFeature(f: Feature, tier?: Tier): void {
  if (!hasFeature(f, tier)) throw new FeatureLockedError(f);
}
