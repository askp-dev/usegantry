import type { Metadata } from "next";
import { Analytics } from "@/components/Analytics";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: { default: "Clean SaaS", template: "%s · Clean SaaS" },
  description: "A well-built SaaS used as Gantry's false-positive guard.",
  openGraph: { images: ["/og.png"] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
