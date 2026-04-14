#!/bin/bash
# Patches expo-modules-core (nested inside expo/) for Xcode 16.4 compatibility.
# This fixes Swift 6 @MainActor conformance syntax and @unchecked Sendable issues.
# Run this after npm install.

EMC="node_modules/expo/node_modules/expo-modules-core/ios"

echo "🔧 Patching expo-modules-core for Xcode 16.4..."

# 1. Fix @MainActor on conformance in ViewDefinition.swift
FILE="$EMC/Core/Views/ViewDefinition.swift"
if [ -f "$FILE" ]; then
  sed -i '' 's/extension UIView: @MainActor AnyArgument/extension UIView: AnyArgument/' "$FILE"
  echo "  ✅ ViewDefinition.swift"
fi

# 2. Fix @MainActor on conformance in SwiftUIVirtualView.swift
FILE="$EMC/Core/Views/SwiftUI/SwiftUIVirtualView.swift"
if [ -f "$FILE" ]; then
  sed -i '' 's/ExpoFabricView, @MainActor AnySwiftUIVirtualView/ExpoFabricView, AnySwiftUIVirtualView/' "$FILE"
  echo "  ✅ SwiftUIVirtualView.swift"
fi

# 3. Fix @MainActor on conformance in SwiftUIHostingView.swift
FILE="$EMC/Core/Views/SwiftUI/SwiftUIHostingView.swift"
if [ -f "$FILE" ]; then
  sed -i '' 's/ExpoView, @MainActor AnyExpoSwiftUIHostingView/ExpoView, AnyExpoSwiftUIHostingView/' "$FILE"
  echo "  ✅ SwiftUIHostingView.swift"
fi

# 4. Fix @unchecked Sendable in URLAuthenticationChallengeForwardSender.swift
FILE="$EMC/Core/Modules/URLSession/URLAuthenticationChallengeForwardSender.swift"
if [ -f "$FILE" ]; then
  sed -i '' 's/class URLAuthenticationChallengeForwardSender: NSObject, URLAuthenticationChallengeSender/class URLAuthenticationChallengeForwardSender: NSObject, URLAuthenticationChallengeSender, @unchecked Sendable/' "$FILE"
  echo "  ✅ URLAuthenticationChallengeForwardSender.swift"
fi

# 5. Fix @unchecked Sendable in URLSessionSessionDelegateProxy.swift
FILE="$EMC/Core/Modules/URLSession/URLSessionSessionDelegateProxy.swift"
if [ -f "$FILE" ]; then
  sed -i '' 's/class URLSessionSessionDelegateProxy: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDownloadDelegate, URLSessionDataDelegate/class URLSessionSessionDelegateProxy: NSObject, URLSessionDelegate, URLSessionTaskDelegate, URLSessionDownloadDelegate, URLSessionDataDelegate, @unchecked Sendable/' "$FILE"
  echo "  ✅ URLSessionSessionDelegateProxy.swift"
fi

echo "✅ expo-modules-core patched for Xcode 16.4"
