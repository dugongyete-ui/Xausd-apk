#!/usr/bin/env bash
# FiboTrader — Fast Dependency Installer
# Run: bash scripts/install-deps.sh

set -e

echo ""
echo "╔════════════════════════════════════╗"
echo "║   FiboTrader Dependency Installer  ║"
echo "╚════════════════════════════════════╝"
echo ""

# Check node is available
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed. Please install Node.js first."
  exit 1
fi

# Check npm is available
if ! command -v npm &> /dev/null; then
  echo "ERROR: npm is not installed."
  exit 1
fi

NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "Node: $NODE_VERSION"
echo "npm:  $NPM_VERSION"
echo ""

# Install with prefer-offline and maximal concurrency
echo "Installing dependencies (this may take a minute)..."
npm install \
  --prefer-offline \
  --no-audit \
  --no-fund \
  --loglevel=error

echo ""
echo "Running postinstall patches..."
npx patch-package 2>/dev/null || true

echo ""
echo "✓ All dependencies installed successfully!"
echo ""
echo "Start the app:"
echo "  Backend:  npm run server:dev"
echo "  Frontend: npm run expo:dev"
echo ""
