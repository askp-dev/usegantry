/**
 * Starter legal templates. NOT LEGAL ADVICE: they're scaffolding for a lawyer to review.
 * `{{key}}` placeholders are filled from LegalManifest; PREFLIGHT:AUTO blocks are regenerated on every compile.
 */
export const AUTO_BLOCKS = ["SUBPROCESSORS", "PII_TABLE", "AI_SCHEDULE", "NO_TRAINING", "PCI", "ERASURE", "VERSION_META"] as const;
export type AutoBlock = (typeof AUTO_BLOCKS)[number];

const block = (b: AutoBlock) => `<!-- PREFLIGHT:AUTO:${b} -->\n<!-- /PREFLIGHT:AUTO:${b} -->`;

export const LEGAL_DISCLAIMER = "Preflight legal templates are starting points, not legal advice. Have a qualified lawyer review them before you publish.";

export const TEMPLATES: Record<"privacy-policy.md" | "eula.md" | "terms.md", string> = {
  "privacy-policy.md": `# Privacy Policy

${block("VERSION_META")}

{{companyName}} ("we", "us") operates {{productName}}. This policy explains what personal data we collect, why, and who we share it with. Questions: {{contactEmail}}.

## Data we collect

${block("PII_TABLE")}

## Sub-processors

We share personal data only with the service providers below, under data processing agreements.

${block("SUBPROCESSORS")}

## AI providers

${block("NO_TRAINING")}

## Payments

${block("PCI")}

## Your rights

${block("ERASURE")}

## Changes

We'll notify you of material changes and ask you to re-accept where the law requires it.
`,
  "eula.md": `# End User License Agreement

${block("VERSION_META")}

This agreement is between you and {{companyName}} for use of {{productName}}. By creating an account you accept it.

## License

We grant you a limited, non-exclusive, non-transferable, revocable license to use {{productName}} for its intended purpose.

## Acceptable use

You may not reverse engineer, resell, overload, or use {{productName}} to break the law or infringe others' rights.

## AI features

${block("AI_SCHEDULE")}

## Termination

We may suspend accounts that breach this agreement. You may stop using {{productName}} at any time.

## Contact

{{contactEmail}}
`,
  "terms.md": `# Terms of Service

${block("VERSION_META")}

These terms govern your use of {{productName}}, provided by {{companyName}}. Governing law: {{jurisdiction}}.

## Accounts

You're responsible for your account credentials and all activity under your account.

## Billing

${block("PCI")}

## Disclaimers

{{productName}} is provided "as is" to the maximum extent permitted by law.

## Contact

{{contactEmail}}
`,
};
