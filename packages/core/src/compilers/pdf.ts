/** Hand-rolled single-page PDF 1.4 writer (Helvetica/Courier, text + filled rects). No dependencies. */
export type Rgb = [number, number, number];
export type PdfOp =
  | { kind: "text"; x: number; y: number; size: number; text: string; font?: "sans" | "bold" | "mono"; color?: Rgb }
  | { kind: "rect"; x: number; y: number; w: number; h: number; color: Rgb };

const FONTS = { sans: "F1", bold: "F2", mono: "F3" } as const;
const esc = (s: string) =>
  s
    .replace(/[^\x20-\x7e]/g, (c) => ({ "·": "-", "—": "-", "–": "-", "✓": "v", "✗": "x", "…": "...", "≥": ">=", "→": "->" })[c] ?? "?")
    .replace(/[\\()]/g, "\\$&");
const rgb = (c: Rgb) => c.map((v) => (v / 255).toFixed(3)).join(" ");

export function hex(h: string): Rgb {
  const n = Number.parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Page is US Letter (612×792 pt); y grows upward from the bottom. */
export function renderPdf(ops: PdfOp[], meta: { title: string; subject?: string } = { title: "Gantry" }): Uint8Array {
  const content = ops
    .map((o) =>
      o.kind === "rect"
        ? `${rgb(o.color)} rg ${o.x} ${o.y} ${o.w} ${o.h} re f`
        : `BT /${FONTS[o.font ?? "sans"]} ${o.size} Tf ${rgb(o.color ?? [0, 0, 0])} rg ${o.x} ${o.y} Td (${esc(o.text)}) Tj ET`,
    )
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title (${esc(meta.title)}) /Subject (${esc(meta.subject ?? "")}) /Producer (Gantry) >>`,
  ];
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Every char is < 0x100 (latin1), so byte offsets == string offsets.
  return Uint8Array.from(out, (c) => c.charCodeAt(0));
}
