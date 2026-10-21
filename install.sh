#!/bin/sh
# Gantry installer: curl -fsSL https://usegantry.app/install.sh | sh
# Downloads the standalone binary for this OS/arch from GitHub Releases and refuses to install it unless its
# SHA-256 matches the release's SHA256SUMS. The standalone binary has no Go/Rust coverage; for that, use
# `bunx @usegantry/cli` (it installs the optional ast-grep grammars).
#   GANTRY_VERSION=v0.1.2   pin a release (default: latest)
#   GANTRY_INSTALL_DIR=...  where to put `gantry` (default: $HOME/.gantry/bin)
set -eu

REPO="askp-dev/usegantry"
VERSION="${GANTRY_VERSION:-latest}"
INSTALL_DIR="${GANTRY_INSTALL_DIR:-$HOME/.gantry/bin}"
if [ "$VERSION" = "latest" ]; then BASE="https://github.com/$REPO/releases/latest/download"; else BASE="https://github.com/$REPO/releases/download/$VERSION"; fi
BASE="${GANTRY_DOWNLOAD_BASE:-$BASE}"

fail() { echo "gantry install: $*" >&2; exit 1; }

case "$BASE" in
  https://*|http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing a non-https download base: $BASE" ;;
esac
case "$VERSION" in latest|v[0-9]*) ;; *) fail "GANTRY_VERSION must look like v1.2.3" ;; esac

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "unsupported OS $(uname -s); use: bunx @usegantry/cli" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x64 ;;
  *) fail "unsupported CPU $(uname -m); use: bunx @usegantry/cli" ;;
esac
asset="gantry-$os-$arch"

if command -v sha256sum >/dev/null 2>&1; then sha() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
else fail "need sha256sum or shasum to verify the download"; fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM
echo "Downloading $asset ($VERSION)…"
curl -fsSL --proto '=https,http' -o "$tmp/$asset" "$BASE/$asset" || fail "download failed: $BASE/$asset"
curl -fsSL --proto '=https,http' -o "$tmp/SHA256SUMS" "$BASE/SHA256SUMS" || fail "download failed: $BASE/SHA256SUMS"

expected=$(awk -v f="$asset" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
[ -n "$expected" ] || fail "SHA256SUMS has no entry for $asset"
actual=$(sha "$tmp/$asset")
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset (expected $expected, got $actual). Not installing."

mkdir -p "$INSTALL_DIR"
chmod 755 "$tmp/$asset"
mv "$tmp/$asset" "$INSTALL_DIR/gantry"
echo "Installed gantry to $INSTALL_DIR/gantry (sha256 $actual)"
echo "Note: the standalone binary skips Go/Rust rules; use 'bunx @usegantry/cli' for those."
case ":$PATH:" in *":$INSTALL_DIR:"*) ;; *) echo "Add it to your PATH: export PATH=\"$INSTALL_DIR:\$PATH\"" ;; esac
