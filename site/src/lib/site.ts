import meta from "./data/meta.json";

export const REPO = "askp-dev/usegantry";
export const REPO_URL = `https://github.com/${REPO}`;
export const SITE = "https://usegantry.app";
export const META = meta;
export const CONTACT = { email: "ask@askp.one", web: "https://askp.one" };

export type PillarKey = "SECURITY" | "PRIVACY" | "LEGAL" | "FINOPS_OPS";
export const STATION: Record<PillarKey, string> = { SECURITY: "Security", PRIVACY: "Privacy", LEGAL: "Legal", FINOPS_OPS: "Cost" };
export const PILLARS: PillarKey[] = ["SECURITY", "PRIVACY", "LEGAL", "FINOPS_OPS"];

export type Call = "GO" | "HOLD" | "NO-GO";
/** DESIGN.md §5.2: NO-GO on any blocker, HOLD on any HIGH, otherwise GO. */
export const callOf = (p: { critical: number; high: number }): Call => (p.critical > 0 ? "NO-GO" : p.high > 0 ? "HOLD" : "GO");
export const statusCall = (s: string): Call => (s === "LAUNCH_BLOCKED" ? "NO-GO" : s === "NEEDS_REVIEW" ? "HOLD" : "GO");
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
