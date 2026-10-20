import { readFileSync } from "node:fs";
import { Markdown } from "@/components/Markdown";

export default function Page() {
  return <Markdown html={readFileSync("legal/privacy-policy.md", "utf8")} />;
}
