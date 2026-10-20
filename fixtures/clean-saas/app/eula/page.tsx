import { readFileSync } from "node:fs";
import { Markdown } from "@/components/Markdown";

export default function Page() {
  return <Markdown html={readFileSync("legal/eula.md", "utf8")} />;
}
