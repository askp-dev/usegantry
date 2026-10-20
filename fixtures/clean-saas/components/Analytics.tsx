"use client";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useConsent } from "@/components/useConsent";

export function Analytics() {
  const consent = useConsent();
  useEffect(() => {
    if (consent.analytics) posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { api_host: "https://eu.i.posthog.com" });
  }, [consent.analytics]);
  return null;
}
