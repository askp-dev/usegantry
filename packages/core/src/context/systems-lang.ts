/**
 * Go/Rust language adapter (Sprint 14). These languages need the optional `@ast-grep/napi` (≥ 0.51)
 * plus `@ast-grep/lang-go` / `@ast-grep/lang-rust`. Grammars are registered lazily, once, the first
 * time a repo contains Go or Rust sources (registration costs ~150–250 ms cold). The grammars don't
 * embed in `bun build --compile` (quirk 37), so the standalone binary reports them as unavailable.
 */
import type { SgRoot } from "./types";

export type SysLang = "go" | "rust";

const GRAMMAR: Record<SysLang, string> = { go: "@ast-grep/lang-go", rust: "@ast-grep/lang-rust" };

/** Go/Rust source files the adapter analyses (tests, vendored code and build output excluded). */
export function sysLangOf(rel: string): SysLang | null {
  if (/(^|\/)(vendor|target|testdata|tests?)\//.test(rel)) return null;
  if (rel.endsWith(".go")) return rel.endsWith("_test.go") ? null : "go";
  if (rel.endsWith(".rs")) return "rust";
  return null;
}

let napi: any;
const firstLine = (e: unknown) => (e instanceof Error ? e.message.split("\n")[0] : String(e));
let failures: Partial<Record<SysLang, string>> | undefined;

/**
 * Returns null when the language is usable, otherwise why it isn't (for the engine's info notice).
 * Each `registerDynamicLanguage` call replaces the previous set, so every grammar that loads is
 * registered in one call on first use.
 */
export function sysLangUnavailable(lang: SysLang): string | null {
  if (!failures) {
    failures = {};
    const grammars: Record<string, unknown> = {};
    let napiErr = "";
    try {
      // GANTRY_NO_NAPI=1 forces the no-grammar path (CI's without-napi job, debugging).
      if (process.env.GANTRY_NO_NAPI === "1") throw new Error("disabled by GANTRY_NO_NAPI=1");
      napi = require("@ast-grep/napi");
      if (typeof napi.registerDynamicLanguage !== "function") napiErr = "@ast-grep/napi < 0.51 has no registerDynamicLanguage";
    } catch (e) {
      napiErr = firstLine(e);
    }
    for (const l of Object.keys(GRAMMAR) as SysLang[]) {
      if (napiErr) failures[l] = napiErr;
      else
        try {
          const g = require(GRAMMAR[l]);
          grammars[l] = g.default ?? g;
        } catch (e) {
          failures[l] = firstLine(e);
        }
    }
    if (Object.keys(grammars).length)
      try {
        napi.registerDynamicLanguage(grammars);
      } catch (e) {
        for (const l of Object.keys(grammars) as SysLang[]) failures[l] = firstLine(e);
      }
  }
  const why = failures[lang];
  return why
    ? `${lang === "go" ? "Go" : "Rust"} analysis needs the optional \`@ast-grep/napi\` ≥ 0.51 and \`${GRAMMAR[lang]}\` (npm install; not available in the standalone binary): ${why}`
    : null;
}

/** Parse Go/Rust text. Callers must check `sysLangUnavailable(lang)` first. */
export function parseSys(lang: SysLang, text: string): SgRoot {
  return napi.parse(lang, text) as SgRoot;
}
