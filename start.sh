#!/bin/sh
# Preview Stark Museo locally. Needs Node.js: https://nodejs.org
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js is not installed."
  echo "  Install it from https://nodejs.org and run this again."
  echo
  exit 1
fi
exec node serve.mjs
