#!/bin/bash
# Patches expo-modules-core (nested inside expo/) for Xcode 16.4+ compatibility.
# This fixes Swift 6 actor/sendable issues that break local iOS archive.
# Run this after npm install.

set -e

EMC_CANDIDATES=(
  "node_modules/expo/node_modules/expo-modules-core/ios"
  "node_modules/expo-modules-core/ios"
)

echo "🔧 Patching expo-modules-core for Xcode 16.4+..."

patch_file_if_exists() {
  local file="$1"
  local from="$2"
  local to="$3"
  local label="$4"

  if [ -f "$file" ]; then
    sed -i '' "s|$from|$to|g" "$file"
    echo "  ✅ $label"
  fi
}

# Removes redundant @MainActor on override when parent ExpoFabricView.viewDidUpdateProps is already @MainActor
# (Swift 6: "declaration can not have multiple global actor attributes").
patch_remove_duplicate_mainactor_override() {
  local file="$1"
  if [ -f "$file" ]; then
    perl -i -0pe 's/\n    \@MainActor\n    override func viewDidUpdateProps\(\)/\n    override func viewDidUpdateProps()/g' "$file"
    echo "  ✅ $(basename "$file") (strip duplicate @MainActor on viewDidUpdateProps override)"
  fi
}

# Swift 6: use isolated conformance to ViewWrapper (see HostingView + AnyExpoSwiftUIHostingView).
patch_mainactor_viewwrapper_extension() {
  local file="$1"
  if [ -f "$file" ] && grep -q '^@MainActor extension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper {$' "$file"; then
    sed -i '' 's/^@MainActor extension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper {$/extension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper {/' "$file"
    echo "  ✅ $(basename "$file") (normalize ViewWrapper extension syntax)"
  fi
}

# Swift 6: protocol requirements should be MainActor-isolated.
patch_mainactor_hosting_protocol() {
  local file="$1"
  if [ -f "$file" ] && grep -q '^internal protocol AnyExpoSwiftUIHostingView {$' "$file"; then
    sed -i '' 's/^internal protocol AnyExpoSwiftUIHostingView {$/@MainActor internal protocol AnyExpoSwiftUIHostingView {/' "$file"
    echo "  ✅ $(basename "$file") (@MainActor AnyExpoSwiftUIHostingView protocol)"
  fi
}

# Swift 6: ViewWrapper requirements should be MainActor-isolated.
patch_mainactor_viewwrapper_protocol() {
  local file="$1"
  if [ -f "$file" ] && grep -q '^  public protocol ViewWrapper {$' "$file"; then
    sed -i '' 's/^  public protocol ViewWrapper {$/  @MainActor public protocol ViewWrapper {/' "$file"
    echo "  ✅ $(basename "$file") (@MainActor ViewWrapper protocol)"
  fi
}

# Swift 6: getWrappedView / getContentView are MainActor; these call sites are not.
patch_dynamic_swift_ui_view_type_assume_isolated() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  # Idempotent: only when the original two-line if-let form is still present.
  if grep -q 'ofType: ExpoSwiftUI.ViewWrapper.self),' "$file"; then
    perl -i -0777 -pe 's/if let provider = appContext\.findView\(withTag: viewTag, ofType: ExpoSwiftUI\.ViewWrapper\.self\),\s*\n\s*let innerView = provider\.getWrappedView\(\) as\? ViewType \{\s*\n\s*return innerView\s*\n\s*\}/if let provider = appContext.findView(withTag: viewTag, ofType: ExpoSwiftUI.ViewWrapper.self) {\n      let innerView = MainActor.assumeIsolated {\n        provider.getWrappedView() as? ViewType\n      }\n      if let innerView = innerView {\n        return innerView\n      }\n    }/s' "$file"
    echo "  ✅ $(basename "$file") (assumeIsolated getWrappedView)"
  fi
  if grep -q '^    return view.getContentView()$' "$file"; then
    perl -i -pe 's/^    return view\.getContentView\(\)$/    return MainActor.assumeIsolated {\n      view.getContentView()\n    }/' "$file"
    echo "  ✅ $(basename "$file") (assumeIsolated getContentView in cast)"
  fi
}

patch_swift_ui_view_definition_unwrapped_assume_isolated() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  if grep -q 'let content = hostingUIView.getContentView()' "$file"; then
    perl -i -pe 's/let content = hostingUIView\.getContentView\(\)/let content = MainActor.assumeIsolated {\n              hostingUIView.getContentView()\n            }/' "$file"
    echo "  ✅ $(basename "$file") (assumeIsolated getContentView in UnwrappedChildren)"
  fi
}

# Swift 6: props / appContext / child views are MainActor-isolated; default extension is nonisolated.
patch_expo_swift_ui_view_mainactor_extension() {
  local file="$1"
  if [ -f "$file" ] && grep -q '^extension ExpoSwiftUIView {$' "$file"; then
    sed -i '' 's/^extension ExpoSwiftUIView {$/@MainActor extension ExpoSwiftUIView {/' "$file"
    echo "  ✅ $(basename "$file") (@MainActor extension ExpoSwiftUIView)"
  fi
}

# Xcode 16.4 / Swift 6: non-Sendable values must not be "sent" across isolation boundaries.
# A tiny unchecked box is used only where upstream already assumes correct threading.
insert_expo_concurrency_unchecked_shim() {
  local file="$1"
  if [ ! -f "$file" ] || grep -q 'struct ExpoConcurrencyUnchecked' "$file"; then
    return
  fi
  python3 - "$file" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
lines = text.splitlines(keepends=True)

shim_lines = [
  "\n",
  "// Xcode 16.4 / Swift 6: unchecked Sendable shim for actor boundary bridging.\n",
  "private struct ExpoConcurrencyUnchecked<Value>: @unchecked Sendable {\n",
  "  let value: Value\n",
  "}\n",
  "\n",
]

insert_at = 0
for i, line in enumerate(lines):
  if line.startswith("import "):
    insert_at = i + 1

# Files without imports (some upstream Swift files only have comments) — keep the old behavior.
if insert_at == 0:
  insert_at = min(2, len(lines))

lines[insert_at:insert_at] = shim_lines
path.write_text("".join(lines), encoding="utf-8")
PY
  echo "  ✅ $(basename "$file") (ExpoConcurrencyUnchecked shim)"
}

patch_dynamic_raw_type_java_script_object_builder() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  if grep -q 'let boxed = ExpoConcurrencyUnchecked(value: objectBuilder)' "$file"; then
    return
  fi
  perl -i -0777 -pe 's/if let objectBuilder = result as\? JavaScriptObjectBuilder \{\n      return try JavaScriptActor\.assumeIsolated \{\n        return try objectBuilder\.build\(appContext: appContext\)\n      \} as Any\n    \}/if let objectBuilder = result as? JavaScriptObjectBuilder {\n      let boxed = ExpoConcurrencyUnchecked(value: objectBuilder)\n      return try JavaScriptActor.assumeIsolated {\n        return try boxed.value.build(appContext: appContext)\n      } as Any\n    }/s' "$file"
  echo "  ✅ $(basename "$file") (box JavaScriptObjectBuilder for JS actor)"
}

patch_shared_object_emit_argument_pairs() {
  local file="$1"
  if [ ! -f "$file" ] || grep -q 'UInt(bitPattern: Unmanaged.passRetained(self).toOpaque())' "$file"; then
    return
  fi
  python3 - "$file" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
if "UInt(bitPattern: Unmanaged.passRetained(self).toOpaque())" in text:
    raise SystemExit(0)

if "let boxedArgumentPairs = ExpoConcurrencyUnchecked(value: argumentPairs)" in text:
    start = text.index("    let boxedArgumentPairs = ExpoConcurrencyUnchecked(value: argumentPairs)\n")
else:
    start = text.index("    // Schedule the event to be asynchronously emitted from the runtime's thread\n")

end = text.index(
    "      JSUtils.emitEvent(event, to: jsObject, withArguments: arguments, in: runtime)\n    }\n",
    start,
) + len("      JSUtils.emitEvent(event, to: jsObject, withArguments: arguments, in: runtime)\n    }\n")

new = """    let boxedArgumentPairs = ExpoConcurrencyUnchecked(value: argumentPairs)
    // Retain `self` for the scheduled closure using a Sendable `UInt` token (Swift 6 `sending` rules).
    let selfRetainToken = UInt(bitPattern: Unmanaged.passRetained(self).toOpaque())
    // Schedule the event to be asynchronously emitted from the runtime's thread
    runtime.schedule { [weak appContext, boxedArgumentPairs, selfRetainToken] in
      let ptr = UnsafeMutableRawPointer(bitPattern: selfRetainToken)!
      defer { Unmanaged<SharedObject>.fromOpaque(ptr).release() }

      guard let appContext else {
        return
      }
      guard let runtime = try? appContext.runtime else {
        return
      }

      let strongSelf = Unmanaged<SharedObject>.fromOpaque(ptr).takeUnretainedValue()
      guard let jsObject = strongSelf.getJavaScriptObject() else {
        log.warn("Trying to send event '\\(event)' to \\(type(of: strongSelf)), but the JS object is no longer associated with the native instance")
        return
      }

      let argumentPairs = boxedArgumentPairs.value

      // Convert native arguments to JS, just like function results
      let arguments = argumentPairs.map { argument, dynamicType in
        return Conversions.convertFunctionResult(argument, appContext: appContext, dynamicType: dynamicType)
      }

      JSUtils.emitEvent(event, to: jsObject, withArguments: arguments, in: runtime)
    }
"""

path.write_text(text[:start] + new + text[end:], encoding="utf-8")
PY
  echo "  ✅ $(basename "$file") (emit: box argument pairs + Unmanaged self token)"
}

# Swift 6 isolated conformance: HostingView's witness to AnyExpoSwiftUIHostingView is MainActor.
patch_hosting_view_isolated_conformance() {
  local file="$1"
  if [ -f "$file" ] && grep -q 'public final class HostingView<Props: ViewProps, ContentView: View<Props>>: ExpoView, @MainActor AnyExpoSwiftUIHostingView {' "$file"; then
    sed -i '' 's/public final class HostingView<Props: ViewProps, ContentView: View<Props>>: ExpoView, @MainActor AnyExpoSwiftUIHostingView {/public final class HostingView<Props: ViewProps, ContentView: View<Props>>: ExpoView, AnyExpoSwiftUIHostingView {/' "$file"
    echo "  ✅ $(basename "$file") (remove invalid @MainActor conformance syntax)"
  fi
}

# Swift 6: SwiftUIVirtualView overrides are nonisolated; bridge actor-sensitive access explicitly.
patch_swift_ui_virtual_view_assume_isolated() {
  local file="$1"
  if [ ! -f "$file" ]; then
    return
  fi
  if ! grep -q 'boxedRawProps' "$file"; then
    perl -i -0777 -pe 's/override func updateProps\(_ rawProps: \[String: Any\]\) \{[\s\S]*?\n    \}\n\n    \/\*\*\n     Returns the view\x27s props/override func updateProps(_ rawProps: [String: Any]) {\n      let boxedRawProps = ExpoConcurrencyUnchecked(value: rawProps)\n      MainActor.assumeIsolated {\n        guard let appContext = self.appContext else {\n          log.error("AppContext is not available, view props cannot be updated for \\(self)")\n          return\n        }\n        do {\n          try self.props.updateRawProps(boxedRawProps.value, appContext: appContext)\n        } catch let error {\n          log.error("Updating props for \\(self) has failed: \\(error.localizedDescription)")\n        }\n      }\n    }\n\n    \/**\n     Returns the view\x27s props/s' "$file"
    echo "  ✅ $(basename "$file") (updateProps: box rawProps + MainActor.assumeIsolated)"
  fi

  patch_file_if_exists \
    "$file" \
    "props.children = children.filter({ -e.id != childViewId })" \
    "props.children = children.filter({ \$0.id != childViewId })" \
    "$(basename "$file") (repair children filter expression)"

  if grep -q 'override func mountChildComponentView(_ childComponentView: UIView, index: Int) {' "$file" && grep -q 'var children = props.children ?? \[\]' "$file"; then
    perl -i -0777 -pe 's/override func mountChildComponentView\(_ childComponentView: UIView, index: Int\) \{\n\s*var children = props\.children \?\? \[\]\n\s*let child: any AnyChild\n\s*if let view = childComponentView as AnyObject as\? \(any ExpoSwiftUI\.View\) \{\n\s*child = view\n\s*\} else \{\n\s*child = UIViewHost\(view: childComponentView\)\n\s*\}\n\s*children\.insert\(child, at: index\)\n\n\s*props\.children = children\n\s*props\.objectWillChange\.send\(\)\n\s*\}/override func mountChildComponentView(_ childComponentView: UIView, index: Int) {\n      MainActor.assumeIsolated {\n        var children = props.children ?? []\n        let child: any AnyChild\n        if let view = childComponentView as AnyObject as? (any ExpoSwiftUI.View) {\n          child = view\n        } else {\n          child = UIViewHost(view: childComponentView)\n        }\n        children.insert(child, at: index)\n\n        props.children = children\n        props.objectWillChange.send()\n      }\n    }/s' "$file"
    echo "  ✅ $(basename "$file") (mountChildComponentView assumeIsolated)"
  fi

  if grep -q 'override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {' "$file" && grep -q 'childComponentView.removeFromSuperview()' "$file"; then
    perl -i -0777 -pe 's/override func unmountChildComponentView\(_ childComponentView: UIView, index: Int\) \{\n\s*\/\/ Make sure the view has no superview, React Native asserts against this\.\n\s*childComponentView\.removeFromSuperview\(\)\n\n\s*let childViewId: ObjectIdentifier\n\s*if let child = childComponentView as AnyObject as\? \(any AnyChild\) \{\n\s*childViewId = child\.id\n\s*\} else \{\n\s*childViewId = ObjectIdentifier\(childComponentView\)\n\s*\}\n\n\s*if let children = props\.children \{\n\s*props\.children = children\.filter\(\{ \$0\.id != childViewId \}\)\n\s*#if DEBUG\n\s*assert\(props\.children\?\.count == children\.count - 1, "Failed to remove child view"\)\n\s*#endif\n\s*props\.objectWillChange\.send\(\)\n\s*\}\n\s*\}/override func unmountChildComponentView(_ childComponentView: UIView, index: Int) {\n      MainActor.assumeIsolated {\n        \/\/ Make sure the view has no superview, React Native asserts against this.\n        childComponentView.removeFromSuperview()\n\n        let childViewId: ObjectIdentifier\n        if let child = childComponentView as AnyObject as? (any AnyChild) {\n          childViewId = child.id\n        } else {\n          childViewId = ObjectIdentifier(childComponentView)\n        }\n\n        if let children = props.children {\n          props.children = children.filter({ \$0.id != childViewId })\n          #if DEBUG\n          assert(props.children?.count == children.count - 1, "Failed to remove child view")\n          #endif\n          props.objectWillChange.send()\n        }\n      }\n    }/s' "$file"
    echo "  ✅ $(basename "$file") (unmountChildComponentView assumeIsolated)"
  fi
}

patch_expo_react_delegate_mainactor_fallback() {
  local file="$1"
  if [ -f "$file" ] && grep -q '\.first(where: { _ in true }) ?? UIViewController()' "$file"; then
    sed -i '' 's/\.first(where: { _ in true }) ?? UIViewController()/\.first(where: { _ in true }) ?? MainActor.assumeIsolated { UIViewController() }/' "$file"
    echo "  ✅ $(basename "$file") (MainActor fallback UIViewController init)"
  fi
}

for EMC in "${EMC_CANDIDATES[@]}"; do
  if [ ! -d "$EMC" ]; then
    continue
  fi

  # 1) Remove invalid @MainActor conformance syntax in ViewDefinition.
  patch_file_if_exists \
    "$EMC/Core/Views/ViewDefinition.swift" \
    "extension UIView: @MainActor AnyArgument" \
    "extension UIView: AnyArgument" \
    "ViewDefinition.swift"

  # 2) Remove invalid @MainActor protocol conformance syntax in SwiftUI virtual view.
  patch_file_if_exists \
    "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift" \
    "ExpoFabricView, @MainActor AnySwiftUIVirtualView" \
    "ExpoFabricView, AnySwiftUIVirtualView" \
    "SwiftUIVirtualView.swift (AnySwiftUIVirtualView)"

  patch_file_if_exists \
    "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift" \
    "extension ExpoSwiftUI.SwiftUIVirtualView: @MainActor ExpoSwiftUI.ViewWrapper {" \
    "extension ExpoSwiftUI.SwiftUIVirtualView: ExpoSwiftUI.ViewWrapper {" \
    "SwiftUIVirtualView.swift (ViewWrapper conformance)"

  # 2b) Swift 6: unchecked bridging for JS actor + runtime scheduling (Swift 6 `sending` checks).
  insert_expo_concurrency_unchecked_shim "$EMC/Core/DynamicTypes/DynamicRawType.swift"
  patch_dynamic_raw_type_java_script_object_builder "$EMC/Core/DynamicTypes/DynamicRawType.swift"

  insert_expo_concurrency_unchecked_shim "$EMC/Core/SharedObjects/SharedObject.swift"
  patch_shared_object_emit_argument_pairs "$EMC/Core/SharedObjects/SharedObject.swift"

  # 3) Swift 6: isolated conformances + MainActor extension (do not strip protocol attributes).
  patch_mainactor_hosting_protocol "$EMC/Core/Views/SwiftUI/SwiftUIHostingView.swift"
  patch_hosting_view_isolated_conformance "$EMC/Core/Views/SwiftUI/SwiftUIHostingView.swift"
  patch_mainactor_viewwrapper_protocol "$EMC/Core/Views/SwiftUI/ExpoSwiftUI.swift"
  patch_mainactor_viewwrapper_extension "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift"
  insert_expo_concurrency_unchecked_shim "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift"
  patch_swift_ui_virtual_view_assume_isolated "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift"

  patch_remove_duplicate_mainactor_override "$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift"

  # 3d) MainActor-isolated getWrappedView / getContentView called from nonisolated Swift 6 contexts.
  patch_dynamic_swift_ui_view_type_assume_isolated "$EMC/Core/DynamicTypes/DynamicSwiftUIViewType.swift"
  patch_swift_ui_view_definition_unwrapped_assume_isolated "$EMC/Core/Views/SwiftUI/SwiftUIViewDefinition.swift"
  patch_expo_swift_ui_view_mainactor_extension "$EMC/Core/Views/SwiftUI/SwiftUIViewDefinition.swift"
  patch_expo_react_delegate_mainactor_fallback "$EMC/ReactDelegates/ExpoReactDelegate.swift"

  # 3c) Frame observer: KVO closure is Sendable but UIView.frame is MainActor-isolated.
  patch_file_if_exists \
    "$EMC/Core/Views/SwiftUI/SwiftUIViewFrameObserver.swift" \
    "        callback(CGRect(origin: view.frame.origin, size: newValue.size))" \
    "        let rect = MainActor.assumeIsolated {\n          CGRect(origin: view.frame.origin, size: newValue.size)\n        }\n        callback(rect)" \
    "SwiftUIViewFrameObserver.swift (MainActor + frame in KVO)"

  # 4) Fix non-sendable closure capture in persistent logging queue.
  patch_file_if_exists \
    "$EMC/Core/Logging/PersistentFileLog.swift" \
    "public typealias PersistentFileLogFilter = (String) -> Bool" \
    "public typealias PersistentFileLogFilter = @Sendable (String) -> Bool" \
    "PersistentFileLog.swift"

  # 5) Fix Sendable checks in DevTools URLSession helpers.
  patch_file_if_exists \
    "$EMC/DevTools/URLAuthenticationChallengeForwardSender.swift" \
    "internal final class URLAuthenticationChallengeForwardSender: NSObject, URLAuthenticationChallengeSender {" \
    "internal final class URLAuthenticationChallengeForwardSender: NSObject, URLAuthenticationChallengeSender, @unchecked Sendable {" \
    "URLAuthenticationChallengeForwardSender.swift"

  patch_file_if_exists \
    "$EMC/DevTools/URLSessionSessionDelegateProxy.swift" \
    "public final class URLSessionSessionDelegateProxy: NSObject, URLSessionDataDelegate {" \
    "public final class URLSessionSessionDelegateProxy: NSObject, URLSessionDataDelegate, @unchecked Sendable {" \
    "URLSessionSessionDelegateProxy.swift"
done

echo "✅ expo-modules-core patch pass complete"
