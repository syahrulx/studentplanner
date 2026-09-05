#!/usr/bin/env bash
set -euo pipefail

test_out="$(mktemp -d)"
trap 'rm -rf "$test_out"' EXIT

./node_modules/.bin/tsc \
  tests/calendarOfferUtils.test.ts \
  src/lib/calendarOfferUtils.ts \
  src/types.ts \
  --outDir "$test_out" \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck

node "$test_out/tests/calendarOfferUtils.test.js"
