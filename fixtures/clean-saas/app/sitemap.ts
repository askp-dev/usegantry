import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://clean-saas.example/" }, { url: "https://clean-saas.example/privacy" }, { url: "https://clean-saas.example/terms" }];
}
