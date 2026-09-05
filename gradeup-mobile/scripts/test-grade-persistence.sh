#!/usr/bin/env bash
set -euo pipefail

test_out="$(mktemp -d)"
trap 'rm -rf "$test_out"' EXIT

./node_modules/.bin/tsc \
  tests/gradePersistence.test.ts \
  src/lib/gradeCalculator.ts \
  src/lib/gradeConfigCodec.ts \
  src/types.ts \
  --outDir "$test_out" \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck

node "$test_out/tests/gradePersistence.test.js"
