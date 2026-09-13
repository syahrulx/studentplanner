//
//  SmartCaptureIntents.swift
//  Rencana
//
//  Copied into the main app target by plugins/withSmartCapture.js. Do not edit
//  the copy under ios/ — it is regenerated on every `expo prebuild`.
//
//  This file must be compiled into the APP target (not a pod) so that iOS can
//  extract the App Intents metadata and surface "Plan from screenshot" in the
//  Shortcuts app.
//
//  Intended user setup:
//    Shortcuts › new shortcut › Take Screenshot → Rencana: Plan from screenshot
//    Settings › Accessibility › Touch › Back Tap › Double Tap → that shortcut
//

import AppIntents
import Foundation
import ImageIO

enum SmartCaptureSharedStore {
  static let pendingKey = "smart-capture.pending"
  static let notificationName = Notification.Name("com.aizztech.rencana.smartCapturePending")

  static var appGroupId: String {
    (Bundle.main.object(forInfoDictionaryKey: "ExpoShareIntoAppGroupId") as? String)
      ?? "group.com.aizztech.rencana"
  }

  static func inboxDirectory() throws -> URL {
    guard let container = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    else {
      throw SmartCaptureIntentError.appGroupUnavailable
    }
    let directory = container.appendingPathComponent("Library/Caches/smart-capture/inbox", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}

enum SmartCaptureIntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
  case appGroupUnavailable
  case notAnImage

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .appGroupUnavailable:
      return "Rencana could not open its shared storage. Reinstall the app and try again."
    case .notAnImage:
      return "Rencana can only plan from an image. Pass it a screenshot."
    }
  }
}

struct PlanFromScreenshotIntent: AppIntent {
  static var title: LocalizedStringResource = "Plan from screenshot"
  static var description = IntentDescription(
    "Reads a screenshot with Rencana and turns any deadlines it finds into tasks."
  )

  /// Rencana needs its UI to review the extracted tasks, so always foreground.
  static var openAppWhenRun: Bool = true

  // `supportedContentTypes:` would filter this to images in the Shortcuts
  // editor, but that initializer is iOS 18+ and Rencana ships to iOS 16.2, so
  // the file is validated in `perform()` instead.
  @Parameter(title: "Screenshot")
  var screenshot: IntentFile

  static var parameterSummary: some ParameterSummary {
    Summary("Plan from \(\.$screenshot)")
  }

  @MainActor
  func perform() async throws -> some IntentResult {
    let data = screenshot.data
    guard !data.isEmpty,
          CGImageSourceCreateWithData(data as CFData, nil) != nil
    else { throw SmartCaptureIntentError.notAnImage }

    let directory = try SmartCaptureSharedStore.inboxDirectory()
    let ext = screenshot.filename.split(separator: ".").last.map(String.init) ?? "png"
    let fileURL = directory.appendingPathComponent("\(UUID().uuidString).\(ext)")
    try data.write(to: fileURL, options: .atomic)

    let marker: [String: Any] = [
      "uri": fileURL.absoluteString,
      "createdAt": Date().timeIntervalSince1970 * 1000,
      "source": "back_tap",
    ]
    UserDefaults(suiteName: SmartCaptureSharedStore.appGroupId)?
      .set(marker, forKey: SmartCaptureSharedStore.pendingKey)

    // With `openAppWhenRun` the intent runs inside the app process once it is
    // foregrounded, so the running JS layer hears about the capture right away.
    // A cold launch misses this notification and falls back to reading the
    // marker when the Smart Capture launcher mounts.
    NotificationCenter.default.post(
      name: SmartCaptureSharedStore.notificationName,
      object: nil,
      userInfo: marker
    )

    return .result()
  }
}

struct RencanaAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: PlanFromScreenshotIntent(),
      phrases: [
        "Plan from screenshot in \(.applicationName)",
        "Capture this with \(.applicationName)",
        "Add to my planner with \(.applicationName)",
      ]
    )
  }
}
