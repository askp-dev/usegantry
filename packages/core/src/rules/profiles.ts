/** Compliance profiles (agency tier): opt-in rule packs plus stricter severities for existing rules. */
import type { Severity } from "../context/types";

export const PROFILES = ["hipaa", "fintech-pci", "legal-privilege", "eu-ai-act", "airgap"] as const;
export type Profile = (typeof PROFILES)[number];

/** Existing rules whose findings are raised to this severity while the profile is active (never lowered). */
export const PROFILE_SEVERITY: Record<Profile, Record<string, Severity>> = {
  // PHI in logs, unencrypted tokens or LLM prompts is a reportable breach under HIPAA.
  hipaa: { "PRIV-01": "CRITICAL", "PRIV-03": "CRITICAL", "PRIV-05": "CRITICAL" },
  // Double-processed webhooks and balance races move real money.
  "fintech-pci": { "PAY-01": "CRITICAL", "PAY-02": "CRITICAL" },
  // Cross-matter retrieval or client data in vectors/LLM prompts can waive privilege.
  "legal-privilege": { "VEC-01": "CRITICAL", "VEC-03": "CRITICAL", "PRIV-05": "CRITICAL" },
  // EU AI Act Art. 50: users must be told they're interacting with AI.
  "eu-ai-act": { "LEG-06": "CRITICAL" },
  airgap: {},
};

const SEV_RANK: Record<Severity, number> = { MEDIUM: 0, HIGH: 1, CRITICAL: 2 };

export function assertProfiles(profiles: readonly string[] = []): void {
  const bad = profiles.filter((p) => !(PROFILES as readonly string[]).includes(p));
  if (bad.length) throw new Error(`Unknown profile ${bad.map((p) => `"${p}"`).join(", ")}. Valid: ${PROFILES.join(", ")}.`);
}

/** Highest severity any active profile assigns to this rule's finding. */
export function profileSeverity(ruleId: string, sev: Severity, profiles: readonly string[] = []): Severity {
  let out = sev;
  for (const p of profiles) {
    const s = PROFILE_SEVERITY[p as Profile]?.[ruleId];
    if (s && SEV_RANK[s] > SEV_RANK[out]) out = s;
  }
  return out;
}
