"use client";
import { useSyncExternalStore } from "react";

const read = () => (typeof document !== "undefined" && document.cookie.includes("consent=analytics") ? "yes" : "no");
export function useConsent() {
  const v = useSyncExternalStore((cb) => (window.addEventListener("consentchange", cb), () => window.removeEventListener("consentchange", cb)), read, () => "no");
  return { analytics: v === "yes" };
}
