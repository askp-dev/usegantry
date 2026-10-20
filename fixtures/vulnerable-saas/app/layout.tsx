"use client";
import posthog from "posthog-js";
import { useEffect } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { api_host: "https://us.i.posthog.com" });
  }, []);
  return (
    <html lang="en">
      <head><title>Vibe SaaS</title></head>
      <body>{children}</body>
    </html>
  );
}
