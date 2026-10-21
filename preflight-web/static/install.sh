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
