#!/bin/sh
# Preflight installer — macOS & Linux
# Usage: curl -fsSL https://preflight.dev/install.sh | sh
set -eu

REPO="${PREFLIGHT_REPO:-preflight-ai/preflight}"
VERSION="${PREFLIGHT_VERSION:-latest}"
INSTALL_DIR="${PREFLIGHT_INSTALL_DIR:-${HOME}/.preflight/bin}"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
	Darwin) OS_TARGET="darwin" ;;
	Linux) OS_TARGET="linux" ;;
	*)
		echo "✗ Unsupported OS: $OS"
		echo "  Use 'npx preflight' or the Windows PowerShell installer instead."
		exit 1
		;;
esac

case "$ARCH" in
	x86_64 | amd64) ARCH_TARGET="x64" ;;
	arm64 | aarch64) ARCH_TARGET="arm64" ;;
	*)
		echo "✗ Unsupported architecture: $ARCH"
		exit 1
		;;
esac

BINARY_NAME="preflight-${OS_TARGET}-${ARCH_TARGET}"

if [ "$VERSION" = "latest" ]; then
	BASE_URL="https://github.com/${REPO}/releases/latest/download"
else
	BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
fi

if command -v curl >/dev/null 2>&1; then
	download() { curl -fsSL "$1" -o "$2"; }
elif command -v wget >/dev/null 2>&1; then
	download() { wget -q "$1" -O "$2"; }
else
	echo "✗ curl or wget is required to install Preflight."
	exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

echo ""
echo "  ⚡  PREFLIGHT"
echo "  ─────────────────────────────────────────"
echo "  target   ${OS_TARGET}-${ARCH_TARGET}"
echo "  version  ${VERSION}"
echo "  install  ${INSTALL_DIR}"
echo ""

mkdir -p "$INSTALL_DIR"

echo "→ Downloading ${BINARY_NAME}…"
download "${BASE_URL}/${BINARY_NAME}" "${TMP_DIR}/preflight"
chmod +x "${TMP_DIR}/preflight"

# Best-effort SHA-256 verification when the release publishes a checksum file.
if download "${BASE_URL}/SHA256SUMS.txt" "${TMP_DIR}/SHA256SUMS.txt" 2>/dev/null; then
	EXPECTED="$(grep " ${BINARY_NAME}\$" "${TMP_DIR}/SHA256SUMS.txt" 2>/dev/null | awk '{print $1}' | head -n 1 || true)"
	if [ -n "${EXPECTED:-}" ]; then
		if command -v sha256sum >/dev/null 2>&1; then
			ACTUAL="$(sha256sum "${TMP_DIR}/preflight" | awk '{print $1}')"
		elif command -v shasum >/dev/null 2>&1; then
			ACTUAL="$(shasum -a 256 "${TMP_DIR}/preflight" | awk '{print $1}')"
		else
			ACTUAL=""
		fi
		if [ -n "${ACTUAL:-}" ] && [ "$ACTUAL" != "$EXPECTED" ]; then
			echo "✗ SHA-256 mismatch — aborting installation."
			echo "  expected $EXPECTED"
			echo "  actual   $ACTUAL"
			exit 1
		fi
		if [ -n "${ACTUAL:-}" ]; then
			echo "✓ SHA-256 verified"
		fi
	fi
fi

mv "${TMP_DIR}/preflight" "${INSTALL_DIR}/preflight"
chmod +x "${INSTALL_DIR}/preflight"

echo ""
echo "✅ Installed to ${INSTALL_DIR}/preflight"

case ":${PATH}:" in
	*":${INSTALL_DIR}:"*) ;;
	*)
		echo ""
		echo "👉 Add Preflight to your PATH:"
		echo ""
		echo "   export PATH=\"${INSTALL_DIR}:\$PATH\""
		echo ""
		echo "   Then append that line to ~/.zshrc or ~/.bashrc."
		;;
esac

echo ""
echo "👉 Run 'preflight scan' inside any repository to start your audit."
echo "   Docs: https://preflight.dev/#download"
echo ""
