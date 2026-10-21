import localFont from "next/font/local";
import posthog from "posthog-js";

const inter = localFont({ src: "./fonts/Inter.woff2" });
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, { api_host: "https://analytics.internal.northwind.example" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/fonts/roboto.css" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
