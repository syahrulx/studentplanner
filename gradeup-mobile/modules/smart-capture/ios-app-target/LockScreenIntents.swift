//
//  LockScreenIntents.swift
//  Rencana
//
//  Copied into the main app target by plugins/withSmartCapture.js. Do not edit
//  the copy under ios/ — it is regenerated on every `expo prebuild`.
//
//  iOS gives apps no way to set the wallpaper. Only the Shortcuts app can, with
//  its "Set Wallpaper" action. So the lock screen refreshes through a shortcut
//  the student installs once:
//
//    Rencana Lock Screen:
//      Get lock screen image (this intent)  →  Set Wallpaper (Lock Screen)
//
//  and a personal automation that runs it every morning and/or whenever
//  Rencana is closed.
//
//  The pictures themselves are drawn by the app (src/lib/lockScreen/), not
//  here. Whenever the timetable, tasks or design change, the app renders one
//  image for each of the next seven days — each with that day marked as today —
//  plus an undated fallback, and writes them to the App Group:
//
//    <group>/lock-screen/manifest.json
//    <group>/lock-screen/2026-09-27.<generation>.jpg … (seven days)
//    <group>/lock-screen/fallback.<generation>.jpg
//
//  This intent only has to pick the right file for the local date. It runs at
//  sunrise with the app closed, so it must not depend on JavaScript being alive.
//
//  It also writes <group>/lock-screen/status.json, which is how the app knows
//  the shortcut is installed and allowed, and when it last ran.
//

import AppIntents
import Foundation
import UniformTypeIdentifiers

enum LockScreenSharedStore {
  static let directoryName = "lock-screen"
  static let manifestName = "manifest.json"
  static let statusName = "status.json"

  /// Same App Group the widgets and the share extension use.
  static var appGroupId: String {
    (Bundle.main.object(forInfoDictionaryKey: "ExpoShareIntoAppGroupId") as? String)
      ?? "group.com.aizztech.rencana"
  }

  static func directory() throws -> URL {
    guard let container = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
    else {
      throw LockScreenIntentError.appGroupUnavailable
    }
    return container.appendingPathComponent(directoryName, isDirectory: true)
  }

  /// Written by src/lib/lockScreen/lockScreenStore.ts.
  struct Manifest: Decodable {
    let version: Int
    let days: [String: String]
    let fallback: String?
  }

  struct Resolved {
    let url: URL
    let dateKey: String
    let usedFallback: Bool
  }

  /// Local calendar date as YYYY-MM-DD — the same key the app writes.
  static func dateKey(for date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }

  /// Manifest entries are reduced to a bare file name, so a malformed manifest
  /// can never point the intent outside its own directory.
  private static func file(named raw: String?, in directory: URL) -> URL? {
    guard let raw else { return nil }
    let name = (raw as NSString).lastPathComponent
    guard !name.isEmpty, name != ".", name != ".." else { return nil }
    let url = directory.appendingPathComponent(name)
    return FileManager.default.fileExists(atPath: url.path) ? url : nil
  }

  /// Newest `<prefix>.<generation>.jpg` in the directory. Used when the
  /// manifest cannot be read: expo-file-system does not write atomically, so a
  /// shortcut that fires while the app is rewriting it can see a torn file.
  /// Image names carry the date, so the right picture is still findable.
  private static func newestFile(prefix: String, in directory: URL) -> URL? {
    let entries = (try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: [.contentModificationDateKey],
      options: [.skipsHiddenFiles]
    )) ?? []
    return entries
      .filter { $0.lastPathComponent.hasPrefix("\(prefix).") && $0.pathExtension == "jpg" }
      .max { lhs, rhs in
        let l = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        let r = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        return (l ?? .distantPast) < (r ?? .distantPast)
      }
  }

  static func resolveImage(now: Date = Date()) throws -> Resolved {
    let directory = try directory()
    let key = dateKey(for: now)

    let manifestURL = directory.appendingPathComponent(manifestName)
    let manifest = (try? Data(contentsOf: manifestURL))
      .flatMap { try? JSONDecoder().decode(Manifest.self, from: $0) }

    if let url = file(named: manifest?.days[key], in: directory) ?? newestFile(prefix: key, in: directory) {
      return Resolved(url: url, dateKey: key, usedFallback: false)
    }
    // The app has not been opened for a week or more. The fallback has no
    // "today" mark, so it is stale but never confidently wrong.
    if let url = file(named: manifest?.fallback, in: directory) ?? newestFile(prefix: "fallback", in: directory) {
      return Resolved(url: url, dateKey: key, usedFallback: true)
    }
    throw LockScreenIntentError.nothingRendered
  }

  /// The app deletes the previous generation right after writing a new
  /// manifest, so a file resolved a moment earlier can vanish before it is
  /// read. Resolving again picks up the new generation.
  static func readTodaysImage(now: Date = Date()) throws -> (Resolved, Data) {
    let first = try resolveImage(now: now)
    do {
      return (first, try Data(contentsOf: first.url))
    } catch {
      if isProtectedDataError(error) { throw LockScreenIntentError.deviceLocked }
    }
    let second = try resolveImage(now: now)
    do {
      return (second, try Data(contentsOf: second.url))
    } catch {
      throw isProtectedDataError(error) ? LockScreenIntentError.deviceLocked : error
    }
  }

  /// The pictures use the default data protection class, readable while the
  /// phone is locked once it has been unlocked since boot. Straight after a
  /// restart they are not, and the read fails with a permission error.
  /// `UIApplication.isProtectedDataAvailable` is not used: it is false whenever
  /// the phone is locked, which would break the 6 AM run.
  private static func isProtectedDataError(_ error: Error) -> Bool {
    let nsError = error as NSError
    return nsError.domain == NSCocoaErrorDomain
      && (nsError.code == NSFileReadNoPermissionError || nsError.code == NSFileReadUnknownError)
  }

  /// Best effort: failing to record a run must never fail the run itself.
  static func recordServed(_ resolved: Resolved, at date: Date = Date()) {
    guard let directory = try? directory() else { return }
    let statusURL = directory.appendingPathComponent(statusName)

    var count = 0
    if let data = try? Data(contentsOf: statusURL),
       let previous = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let previousCount = previous["count"] as? Int {
      count = previousCount
    }

    let status: [String: Any] = [
      "lastServedAt": (date.timeIntervalSince1970 * 1000).rounded(),
      "servedDateISO": resolved.dateKey,
      "servedFile": resolved.url.lastPathComponent,
      "usedFallback": resolved.usedFallback,
      "count": count + 1,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: status) else { return }
    try? data.write(to: statusURL, options: .atomic)
  }
}

enum LockScreenIntentError: Swift.Error, CustomLocalizedStringResourceConvertible {
  case appGroupUnavailable
  case nothingRendered
  case deviceLocked

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .deviceLocked:
      return "Unlock your iPhone once after restarting, then run it again."
    case .appGroupUnavailable:
      return "Rencana could not open its shared storage. Reinstall the app and try again."
    case .nothingRendered:
      return "Your lock screen isn't ready yet. Open Rencana, go to Timetable › Lock screen, and turn on auto-refresh."
    }
  }
}

struct GetLockScreenImageIntent: AppIntent {
  static var title: LocalizedStringResource = "Get lock screen image"
  static var description = IntentDescription(
    "Today's Rencana lock screen: your week and what's due, drawn over your photo. Pass it to Set Wallpaper."
  )

  /// Runs at sunrise from an automation, so it must work without the UI.
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult & ReturnsValue<IntentFile> {
    // Handed over as data rather than a file URL: the Shortcuts process has no
    // access to Rencana's App Group container.
    let (resolved, data) = try LockScreenSharedStore.readTodaysImage()
    LockScreenSharedStore.recordServed(resolved)
    return .result(value: IntentFile(data: data, filename: "rencana-lock-screen.jpg", type: .jpeg))
  }
}
