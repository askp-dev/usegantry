import { defineRule } from "../helpers";

const ROOT_LAYOUT =
  /^(src\/)?app\/layout\.[tj]sx?$|^src\/routes\/\+layout\.svelte$|^src\/app\.html$|^(public\/)?index\.html$|^pages\/_(app|document)\.[tj]sx?$|^app\/root\.tsx$/;

export const seo01LaunchMeta = defineRule(
  { id: "SEO-01", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Missing Launch Metadata (robots.txt, sitemap, OpenGraph)" },
  (ctx, emit) => {
    const layouts = ctx.files.all.filter((f) => ROOT_LAYOUT.test(f));
    if (!layouts.length) return;
    const all = ctx.files.all;
    const text = layouts.map((f) => ctx.getText(f)).join("\n");
    const metaObj = /export\s+(?:const\s+metadata|(?:async\s+)?function\s+generateMetadata)/.test(text);
    const has = (re: RegExp) => re.test(text);
    const missing: string[] = [];
    if (!has(/\btitle\s*:|<title\b/)) missing.push("title");
    if (!has(/\bdescription\s*:|name\s*=\s*["']description["']/)) missing.push("meta description");
    const ogFile = all.some((f) => /(^|\/)app\/(?:.*\/)?opengraph-image\.\w+$/.test(f));
    if (!ogFile && !has(/openGraph\s*:\s*\{[\s\S]*?images\s*:|property\s*=\s*["']og:image["']/)) missing.push("OpenGraph image");
    if (!all.some((f) => /(^|\/)(src\/)?app\/robots\.(ts|js|txt)$|(^|\/)(public|static)\/robots\.txt$|(^|\/)routes\/robots\.txt\/\+server\.[tj]s$/.test(f)))
      missing.push("robots.txt");
    if (
      !all.some((f) =>
        /(^|\/)(src\/)?app\/sitemap\.(ts|js|xml)$|(^|\/)(public|static)\/sitemap(-index)?\.xml$|(^|\/)routes\/sitemap\.xml\/\+server\.[tj]s$/.test(f),
      )
    )
      missing.push("sitemap");
    if (!missing.length) return;
    emit({
      file: layouts[0],
      line: 1,
      evidence: `missing: ${missing.join(", ")}${metaObj ? "" : " (no `export const metadata` in root layout)"}`,
      impact: `Launch traffic from search and social shares underperforms: no ${missing.join(", ")} means blank link previews on X/LinkedIn/Slack and slower or incomplete indexing.`,
      agentRemediationPrompt: /app\/layout/.test(layouts[0])
        ? `In ${layouts[0]}, export \`metadata: Metadata = { title: { default: "<Product>", template: "%s · <Product>" }, description: "…", openGraph: { images: ["/og.png"] }, twitter: { card: "summary_large_image" } }\` (remove any manual <head><title>), and add \`app/robots.ts\` and \`app/sitemap.ts\` using MetadataRoute.Robots / MetadataRoute.Sitemap with your production URL.`
        : `Add <title>, <meta name="description">, og:image/twitter:card tags to ${layouts[0]}, plus a robots.txt and sitemap.xml (static or generated).`,
    });
  },
);
