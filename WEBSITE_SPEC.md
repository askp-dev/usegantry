This static site specification (`WEBSITE_SPEC.md`) is engineered to be compiled into pure HTML/CSS/JS via **SvelteKit (`@sveltejs/adapter-static`)** or **Astro** and deployed directly to **GitHub Pages** with zero backend dependencies.

Because GitHub Pages cannot execute server-side databases or verification logic, this architecture uses **Client-Side WebCrypto Verification** (embedding the verification data directly in URL fragment hashes for the `/verify` page) and **GitHub Releases API fetching** so binary downloads and release versions update automatically whenever you push a new tag.

---

# `WEBSITE_SPEC.md` — Static Marketing, Docs & Verification Portal

## 1. Tech Stack & GitHub Pages Hosting Architecture

- **Framework:** **SvelteKit 2 (Svelte 5 Runes)** with `@sveltejs/adapter-static` (or Astro 5).
- **Styling:** **Tailwind CSS v4** using the exact **"Tactical Pre-Flight Avionics"** design tokens from `DESIGN.md` (Obsidian Carbon `#090A0F`, Surface `#11131C`, Hairline `#222634`, Signal Emerald `#10B981`, Block Red `#EF4444`, JetBrains Mono + Inter).
- **Zero-Backend Dynamic Tricks on GitHub Pages:**

1. **Auto-Updating Binary Downloads:** On load, the download selector fetches `[https://api.github.com/repos/](https://api.github.com/repos/)<org>/preflight/releases/latest` (cached in `sessionStorage`) to pull the exact version tag (`v1.0.4`), binary asset links (`preflight-darwin-arm64`, `preflight-linux-x64`, `preflight-windows-x64.exe`, `.vsix`), and SHA-256 checksums.
2. **Install Script Hosting (`/install.sh` & `/install.ps1`):** Placed in the `static/` folder so users can run `curl -fsSL https://<yourdomain>/install.sh | sh` directly from GitHub Pages.
3. **Client-Side Certificate Verification (`/verify#...`):** When `npx preflight cert` generates a Launch Certificate, it encodes the compact audit payload + Ed25519 signature into a Base64URL fragment (`https://<yourdomain>/verify#eyJwcm9qZWN0...`). The static `/verify` page verifies the cryptographic signature directly in the browser using `window.crypto.subtle.verify()` against your public key—requiring **zero backend database** on GitHub Pages.

---

## 2. Static Repository Structure (`apps/web/` or standalone repo)

```text
preflight-web/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml          # Auto-builds & deploys to GitHub Pages on push to main
├── static/
│   ├── .nojekyll                     # Prevents GitHub Pages from ignoring `_app/` folders
│   ├── CNAME                         # Custom domain (e.g., preflight.dev)
│   ├── install.sh                    # POSIX shell installer (macOS / Linux)
│   ├── install.ps1                   # PowerShell installer (Windows)
│   └── downloads/
│       └── preflight-latest.vsix     # Direct fallback link for Cursor / VS Code extension
├── src/
│   ├── app.css                       # Tailwind v4 + Avionics CSS variables
│   ├── lib/
│   │   ├── data/
│   │   │   └── rules-catalog.json    # All 43 rules (SEC, PRIV, LEG, FIN, PAY, OPS, PT)
│   │   └── components/
│   │       ├── HeroTerminal.svelte   # Interactive simulated `npx preflight scan` player
│   │       ├── OsDownloadBar.svelte  # Auto-detects macOS/Linux/Win + CLI/MCP/VSIX tabs
│   │       ├── BentoArchitecture.svelte # 4-Pillar interactive bento grid
│   │       ├── RuleExplorer.svelte   # Instant client-side search/filter of all 43 checks
│   │       └── CertVerifier.svelte   # Client-side WebCrypto certificate validator
│   └── routes/
│       ├── +layout.ts                # `export const prerender = true; export const trailingSlash = 'always';`
│       ├── +page.svelte              # Landing Page, Interactive Demo, Downloads & Pricing
│       ├── rules/+page.svelte        # Searchable 43-Rule & Probe Documentation Registry
│       └── verify/+page.svelte       # Client-side Launch Certificate Verification Portal
├── svelte.config.js
└── package.json

```

---

## 3. Page-by-Page Wireframe & Section Outline

### Page 1: The Primary Landing & Download Hub (`/`)

#### Section 1: Sticky Avionics Navbar (`height: 56px`)

- **Left:** `[⚡ PREFLIGHT]` (`font-mono bold`) + Live Release Badge (`v1.0.0 • MIT Core`).
- **Center:** Anchor links (`#how-it-works`, `#rules-43`, `#mcp-setup`, `#pricing`, `/verify`).
- **Right:** `[★ Star on GitHub]` button + `[Download CLI / Extension]` primary CTA.

#### Section 2: Split Hero — "Ship Vibe-Coded Apps Without the Breach or Lawsuit"

- **Left Column (Copy + OS-Aware Command Switcher):**
- **Eyebrow Pill:** `43 DETERMINISTIC CHECKS • <1.1s EXECUTION • ZERO CLOUD UPLOAD`
- **H1 Headline:** _The Pre-Flight Compliance, Security & FinOps Engine for AI-Built Software._
- **Subheadline:** Catch missing Supabase RLS, hallucinated packages, AGPL license traps, infinite token loops, and stale EULA/Privacy Policies inside Cursor & Claude Code before you launch.
- **Interactive 4-Tab Install Switcher (`<OsDownloadBar/>`):**
- **Tab 1: Quick Scan (NPX / Bunx):** `bunx preflight scan` `[Copy]`
- **Tab 2: Cursor / Claude MCP:** `bunx preflight init --mcp` `[Copy]`
- **Tab 3: Standalone Binary:** Auto-detects `navigator.userAgent` (macOS Apple Silicon / Intel / Linux / Windows) and shows `curl -fsSL https://.../install.sh | sh` + direct binary download button.
- **Tab 4: Cursor / VS Code Extension:** `[Download .VSIX (v1.0)]` + `[Open in Cursor Marketplace]`.

- **Right Column (`<HeroTerminal/>` — Interactive 3-Step Simulator):**
- A pure-HTML/CSS dark terminal window where visitors can click between 3 live tabs without installing anything:

1. **`$ preflight scan`:** Renders the exact ANSI box scorecard (`65/100 LAUNCH BLOCKED` — flagging `SEC-01` Missing RLS, `LEG-02` AGPL conflict, and `FIN-01` infinite `useEffect`).
2. **`$ preflight legal --sync`:** Shows the live Markdown diff auto-injecting `Stripe, Inc.`, `OpenAI, L.L.C.`, and `Supabase, Inc.` into `/legal/privacy-policy.md`.
3. **`$ preflight attack`:** Plays a 5-second animation of the 6 active pentest probes firing against `localhost:3000` and catching a forged Stripe webhook (`PT-04`).

---

#### Section 3: The 6-Card Master Bento Grid (`<BentoArchitecture/>`)

Uses a crisp `1px solid #222634` hairline grid (`gap: 1px; background: #222634`) so cards fit together like an aircraft instrument panel:

```
+---------------------------------------------------+-----------------------------------+
| CARD 1 (Col Span 7):                              | CARD 2 (Col Span 5):              |
| 🛡️ AI-FOOTGUN SECURITY SCANNER (SEC-01 to SEC-12) | ⚖️ CODE-BOUND LEGAL & EULA ENGINE |
| Visual: AST tree matching an unscoped Prisma      | Visual: `package.json` imports    |
| `.update()` and auto-injecting `userId` + RLS.    | compiling into `/legal/eula.md`.  |
+-----------------------------------+---------------+-----------------------------------+
| CARD 3 (Col Span 4):              | CARD 4 (Col Span 4):      | CARD 5 (Col Span 4):  |
| 💸 ANTI-BANKRUPTCY FINOPS         | 🎯 AST-GUIDED PENTESTER   | 🤝 B2B VENDOR PACK    |
| Catches recursive `useEffect` &   | Fires 6 live exploit      | Exports signed HTML   |
| uncapped LLM loops before a       | probes (`PT-01`–`PT-06`)  | Launch Certificate,   |
| $14k overnight cloud bill.        | against `localhost:3000`. | SBOM & RoPA Mermaid.  |
+-----------------------------------+---------------------------+-----------------------+

```

---

#### Section 4: Interactive 43-Rule Explorer (`#rules-43`)

Instead of burying your 43 checks in a separate docs site, display an interactive, filterable table right on the landing page (backed by `rules-catalog.json`):

- **Filter Pills:** `[All (43)]` `[Security (12)]` `[Data Privacy (7)]` `[EULA & Legal (6)]` `[FinOps & Payments (12)]` `[Active Pentest (6)]`
- **Search Input:** _"Filter by keyword (e.g., Supabase, Stripe, GDPR, AGPL, useEffect)..."_
- **Expandable Rows:** Clicking any rule (e.g., `SEC-01` or `LEG-04`) expands to show:

1. _Vulnerable AI-Generated Code Example_ (Red border)
2. _Preflight Auto-Remediated Patch_ (Emerald border)
3. _The exact MCP Prompt sent to Cursor/Claude Code_

---

#### Section 5: 1-Click MCP & IDE Integration Guide (`#mcp-setup`)

Shows side-by-side copyable snippets for wiring Preflight into the user's daily workflow in 15 seconds:

- **Tab A: `.cursor/mcp.json` / Claude Code (`claude mcp add`)**
- **Tab B: GitHub Actions CI Gate (`.github/workflows/preflight.yml`)**
- **Tab C: Pre-Push Git Hook (`npx preflight hook install`)**

---

#### Section 6: Pricing & Open-Core Comparison Matrix (`#pricing`)

Three high-contrast columns tailored to your exact monetization tiers:

1. **Community / Open Core (`$0 / forever`):** Static 37-rule CLI scan (`<1.1s`), `READINESS_CHECKLIST.md` generator, `.cursor/rules` bootstrapper, local MCP server.
2. **Pro Builder (`$39 / mo`):** VS Code / Cursor Extension with 1-click Agent Fix Bridge, Dynamic Stack-Synced Legal & EULA Compiler, Active 6-Probe Pentester (`preflight attack`).
3. **Agency & Team (`$299 / mo`):** Cryptographically Signed Client Launch Certificates (`HTML/PDF`), B2B Vendor Deal-Closer Pack (`SBOM.json` + `DATA_FLOW.mermaid` + Security Questionnaire), Multi-repo CI gates.

---

### Page 2: Zero-Backend Certificate Verifier (`/verify`)

When an agency or founder exports a `LAUNCH_CERTIFICATE.pdf` for a client, the certificate includes a verification URL:
`https://<yourdomain>/verify#eyJwcm9qZWN0IjoiYWNtZS1zYWFzIiwic2NvcmUiOjEwMCwi...`

Because the payload is stored in the **URL `#hash` fragment**, the browser never even needs to send a server request, and GitHub Pages can host it as a 100% static file:

1. **`CertVerifier.svelte` reads `window.location.hash` on mount.**
2. Decodes the Base64URL JSON bundle containing `{ projectName, commitSha, timestamp, overallScore, verificationHash, passedRules, subprocessors, signature }`.
3. Runs `crypto.subtle.verify("Ed25519", PUBLIC_KEY, signature, payloadBytes)` in the browser.
4. Renders either a green **`[✓ CRYPTOGRAPHICALLY VERIFIED AUDIT RECORD]`** badge with the full 43-check attestation table, or a red **`[✗ TAMPERED OR INVALID SIGNATURE]`** warning if someone edited the JSON/score.

---

## 4. Universal Shell Installer (`static/install.sh`)

Putting this file in `static/install.sh` lets users install the compiled binary straight from your GitHub Pages domain (`curl -fsSL [https://yourdomain.com/install.sh](https://yourdomain.com/install.sh) | sh`):

```bash
#!/bin/sh
set -e

REPO="your-org/preflight"
INSTALL_DIR="${HOME}/.preflight/bin"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_TARGET="darwin" ;;
  Linux)  OS_TARGET="linux" ;;
  *)      echo "Unsupported OS: $OS. Use 'npx preflight' or install via Windows PowerShell."; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_TARGET="x64" ;;
  arm64|aarch64) ARCH_TARGET="arm64" ;;
  *)             echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY_NAME="preflight-${OS_TARGET}-${ARCH_TARGET}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"

echo "⚡ Downloading Preflight AI (${OS_TARGET}-${ARCH_TARGET})..."
mkdir -p "$INSTALL_DIR"
curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/preflight"
chmod +x "${INSTALL_DIR}/preflight"

echo "✅ Installed to ${INSTALL_DIR}/preflight"
echo "👉 Run 'preflight scan' inside any repository to start your audit."

```

---

## 5. GitHub Actions Workflow for GitHub Pages (`.github/workflows/deploy-pages.yml`)

Drop this workflow into the repository to automatically compile the static site with Bun and deploy it to GitHub Pages on every push to `main`:

```yaml
name: Deploy Static Site to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies & build static site
        run: |
          bun install --frozen-lockfile
          bun run build

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./build

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```
