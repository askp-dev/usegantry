/**
 * All roast-card copy lives here so it's easy to edit. Rules for every line:
 * punch at the code, never the person; no profanity; no "hacked"/"breach" claims (this is static analysis);
 * no named third parties; and nothing specific (no paths, routes, tables, vendors or exploit steps): the card is public.
 */
import type { Pillar } from "../context/types";

export type RoastPillar = "Security" | "Privacy" | "Legal" | "Cost";
export const PILLAR_LABEL: Record<Pillar, RoastPillar> = { SECURITY: "Security", PRIVACY: "Privacy", LEGAL: "Legal", FINOPS_OPS: "Cost" };

export const VERDICT = { LAUNCH_READY: "Survives launch", NEEDS_REVIEW: "Shaky", LAUNCH_BLOCKED: "Won't survive launch" } as const;

/** One line per rule family. Keys are rule-id prefixes (`SEC-01`) or families (`SEC`); the most specific wins. */
export const RULE_LINES: Record<string, string> = {
  "SEC-01": "Your database has an open-door policy.",
  "SEC-02": "There's a side entrance that skips the bouncer.",
  "SEC-03": "Guess an ID, get someone else's stuff.",
  "SEC-04": "Your file storage is a public lending library.",
  "SEC-05": "A secret is riding along in the browser bundle.",
  "SEC-06": "Your git history remembers a secret it shouldn't.",
  "SEC-07": "Some buttons work for anyone, logged in or not.",
  "SEC-08": "Anyone can mail your app a fake receipt.",
  "SEC-09": "Your AI endpoint has an all-you-can-eat buffet sign.",
  "SEC-10": "Users can fill in fields they were never offered.",
  "SEC-11": "Your server will fetch whatever it's handed.",
  "SEC-12": "Some input goes straight to the database, unchaperoned.",
  MCP: "Your AI agent's config is holding keys in plain sight.",
  VEC: "The AI's memory doesn't know whose memories are whose.",
  "CACHE-02": "Some cache entries plan to live forever.",
  CACHE: "The cache plays favourites with the wrong users.",
  BAAS: "Your backend trusts everybody a little too much.",
  EDGE: "The edge database skips the 'whose data is this' question.",
  IAC: "Your infrastructure leaves a few doors propped open.",
  CLIENT: "The app hands the device more power than it needs.",
  PY: "The Python side is a little too trusting.",
  SYS: "The backend can be talked into falling over.",
  PRIV: "Personal data is wandering further than it should.",
  SOV: "Your 'offline' build still phones home.",
  HIPAA: "Health data rules are still on the to-do list.",
  LEG: "The legal paperwork hasn't caught up with the code.",
  LGL: "Privileged material isn't fenced off yet.",
  AIA: "The AI inventory paperwork is missing.",
  FIN: "Something in here could run up a surprise bill.",
  PAY: "The payments flow could count the same money twice.",
  PCI: "The money maths needs a calculator, not floats.",
  OPS: "Production would be flying without instruments.",
  A11Y: "Some visitors can't use the buttons.",
  SEO: "Search engines won't know what this is.",
};

/** Shown for a pillar with no findings. */
export const CLEAN_LINES: Record<RoastPillar, string> = {
  Security: "Locks on every door we checked.",
  Privacy: "Personal data stays where it belongs.",
  Legal: "The paperwork matches the code.",
  Cost: "No runaway bills spotted.",
};

export const FOOTER = "Static scan, not a pentest. Run `gantry check` for the fixes.";

/** The canned line for a rule id, or undefined if no family matches (never falls back to rule text). */
export function lineFor(ruleId: string): string | undefined {
  return RULE_LINES[ruleId] ?? RULE_LINES[ruleId.split("-")[0]];
}
