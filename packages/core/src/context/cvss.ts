/** CVSS v3.x base score from a vector string (FIRST spec §7.1). null for v2/v4 or malformed vectors. */
const W = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

/** Round up to one decimal, avoiding float artefacts (spec Appendix A). */
const roundUp = (x: number) => {
  const i = Math.round(x * 100_000);
  return i % 10_000 === 0 ? i / 100_000 : (Math.floor(i / 10_000) + 1) / 10;
};

export function cvss3BaseScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m = Object.fromEntries(
    vector
      .split("/")
      .slice(1)
      .map((p) => p.split(":")),
  );
  const av = W.AV[m.AV as keyof typeof W.AV];
  const ac = W.AC[m.AC as keyof typeof W.AC];
  const ui = W.UI[m.UI as keyof typeof W.UI];
  const [c, i, a] = [m.C, m.I, m.A].map((x) => W.CIA[x as keyof typeof W.CIA]);
  const changed = m.S === "C";
  const pr = ({ N: 0.85, L: changed ? 0.68 : 0.62, H: changed ? 0.5 : 0.27 } as Record<string, number>)[m.PR];
  if ([av, ac, ui, c, i, a, pr].some((x) => x === undefined) || !/^[UC]$/.test(m.S)) return null;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed ? 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15 : 6.42 * iss;
  if (impact <= 0) return 0;
  const exploit = 8.22 * av * ac * pr * ui;
  return roundUp(Math.min(changed ? 1.08 * (impact + exploit) : impact + exploit, 10));
}
