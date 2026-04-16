#!/bin/bash
# Patches expo-image iOS sources for Swift 6 / Xcode 16.4 (MainActor + sendable). Run after npm install.
set -e

EXI_CANDIDATES=(
  "node_modules/expo-image/ios"
)

echo "🔧 Patching expo-image for Xcode 16.4+..."

# Swift 6: VisionKit's ImageAnalysis is not annotated as Sendable in the Xcode 16.4 SDK.
# @preconcurrency import tells the compiler to trust the framework's types across isolation
# boundaries — the standard Apple-recommended approach for un-annotated system frameworks.
patch_preconcurrency_visionkit() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  # Idempotent: skip if already patched
  if grep -q '@preconcurrency import VisionKit' "$file"; then
    echo "  ⏭  $(basename "$file") (@preconcurrency VisionKit already applied)"
    return 0
  fi
  if grep -q '^import VisionKit$' "$file"; then
    sed -i '' 's/^import VisionKit$/@preconcurrency import VisionKit/' "$file"
    echo "  ✅ $(basename "$file") (@preconcurrency import VisionKit)"
  fi
}

patch_expo_image_module() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  python3 - "$file" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
idx = text.find('AsyncFunction("startAnimating")')
if idx != -1 and 'MainActor.assumeIsolated' in text[idx : idx + 500]:
    raise SystemExit(0)

old = """      AsyncFunction("startAnimating") { (view: ImageView) in
        if view.isSFSymbolSource {
          view.startSymbolAnimation()
        } else {
          view.sdImageView.startAnimating()
        }
      }

      AsyncFunction("stopAnimating") { (view: ImageView) in
        if view.isSFSymbolSource {
          view.stopSymbolAnimation()
        } else {
          view.sdImageView.stopAnimating()
        }
      }

      AsyncFunction("lockResourceAsync") { (view: ImageView) in
        view.lockResource = true
      }

      AsyncFunction("unlockResourceAsync") { (view: ImageView) in
        view.lockResource = false
      }

      AsyncFunction("reloadAsync") { (view: ImageView) in
        view.reload(force: true)
      }"""

new = """      AsyncFunction("startAnimating") { (view: ImageView) in
        MainActor.assumeIsolated {
          if view.isSFSymbolSource {
            view.startSymbolAnimation()
          } else {
            view.sdImageView.startAnimating()
          }
        }
      }

      AsyncFunction("stopAnimating") { (view: ImageView) in
        MainActor.assumeIsolated {
          if view.isSFSymbolSource {
            view.stopSymbolAnimation()
          } else {
            view.sdImageView.stopAnimating()
          }
        }
      }

      AsyncFunction("lockResourceAsync") { (view: ImageView) in
        MainActor.assumeIsolated {
          view.lockResource = true
        }
      }

      AsyncFunction("unlockResourceAsync") { (view: ImageView) in
        MainActor.assumeIsolated {
          view.lockResource = false
        }
      }

      AsyncFunction("reloadAsync") { (view: ImageView) in
        MainActor.assumeIsolated {
          view.reload(force: true)
        }
      }"""

if old not in text:
    print("expo-image patch: ImageModule block not found", file=sys.stderr)
    raise SystemExit(1)

path.write_text(text.replace(old, new, 1), encoding="utf-8")
PY
  echo "  ✅ $(basename "$file") (AsyncFunction MainActor)"
}

patch_expo_image_view() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return 0
  fi
  python3 - "$file" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
t = path.read_text(encoding="utf-8")

old_deinit = """  deinit {
    // Cancel pending requests when the view is deallocated.
    cancelPendingOperation()
  }"""
new_deinit = """  deinit {
    // Cancel pending requests when the view is deallocated.
    MainActor.assumeIsolated {
      cancelPendingOperation()
    }
  }"""
if old_deinit in t:
    t = t.replace(old_deinit, new_deinit, 1)

old_task = """    Task {
      guard let imageAnalyzer = Self.imageAnalyzer, let imageAnalysisInteraction = findImageAnalysisInteraction() else {
        return
      }
      let configuration = ImageAnalyzer.Configuration([.text, .machineReadableCode])

      do {
        let imageAnalysis = try await imageAnalyzer.analyze(image, configuration: configuration)

        // Make sure the image haven't changed in the meantime.
        if image == sdImageView.image {
          imageAnalysisInteraction.analysis = imageAnalysis
          imageAnalysisInteraction.preferredInteractionTypes = .automatic
        }
      } catch {
        log.error(error)
      }
    }"""

new_task = """    Task { @MainActor in
      guard let imageAnalyzer = Self.imageAnalyzer, let imageAnalysisInteraction = findImageAnalysisInteraction() else {
        return
      }
      let configuration = ImageAnalyzer.Configuration([.text, .machineReadableCode])

      do {
        let imageAnalysis = try await imageAnalyzer.analyze(image, configuration: configuration)

        // Make sure the image haven't changed in the meantime.
        if image == sdImageView.image {
          imageAnalysisInteraction.analysis = imageAnalysis
          imageAnalysisInteraction.preferredInteractionTypes = .automatic
        }
      } catch {
        log.error(error)
      }
    }"""

if old_task in t:
    t = t.replace(old_task, new_task, 1)

path.write_text(t, encoding="utf-8")
PY
  echo "  ✅ $(basename "$file") (deinit + ImageAnalysis Task)"
}

for EXI in "${EXI_CANDIDATES[@]}"; do
  if [ ! -d "$EXI" ]; then
    continue
  fi
  patch_preconcurrency_visionkit "$EXI/ImageView.swift"
  patch_expo_image_module "$EXI/ImageModule.swift"
  patch_expo_image_view "$EXI/ImageView.swift"
done

echo "✅ expo-image iOS patch pass complete"
