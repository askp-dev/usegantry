// Re-export the core data contracts so the UI never drifts from the scanner's JSON.
export type {
  AuditReport,
  DataFlowNode,
  Finding,
  HttpTrace,
  LegalManifest,
  PentestEvent,
  PillarScore,
  ProbeResult,
} from "../../../core/src/context/types";

export type Tone = "ready" | "warn" | "block";
export const toneOf = (s: string): Tone =>
  s === "block" || s === "CRITICAL" || s === "EXPLOITED" || s === "LAUNCH_BLOCKED"
    ? "block"
    : s === "warn" || s === "HIGH" || s === "NEEDS_REVIEW"
      ? "warn"
      : "ready";
/** Full class names so Tailwind's scanner sees them (it can't resolve `bg-${tone}-bg`). */
export const PILL: Record<Tone, string> = { ready: "bg-ready-bg text-ready", warn: "bg-warn-bg text-warn", block: "bg-block-bg text-block" };
