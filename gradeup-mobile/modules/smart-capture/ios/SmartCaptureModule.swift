import ExpoModulesCore
import UIKit
import Vision

/// Shared contract with `SmartCaptureIntents.swift`, which is compiled into the
/// main app target (see plugins/withSmartCapture.js) and therefore lives in a
/// different Swift module — the constants must be duplicated, not imported.
enum SmartCaptureInbox {
  static let pendingKey = "smart-capture.pending"
  static let notificationName = Notification.Name("com.aizztech.rencana.smartCapturePending")
  static let inboxSubpath = "Library/Caches/smart-capture/inbox"
  static let cacheDirName = "smart-capture"

  /// Written into the main Info.plist by the expo-sharing config plugin, so the
  /// group id never has to be hard-coded in two places.
  static var appGroupId: String {
    (Bundle.main.object(forInfoDictionaryKey: "ExpoShareIntoAppGroupId") as? String)
      ?? "group.com.aizztech.rencana"
  }

  static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  static func readPending() -> [String: Any]? {
    guard let marker = defaults?.dictionary(forKey: pendingKey),
          let uri = marker["uri"] as? String,
          let url = URL(string: uri),
          FileManager.default.fileExists(atPath: url.path)
    else { return nil }
    return marker
  }

  static func clearPending() {
    defaults?.removeObject(forKey: pendingKey)
  }

  /// Copies a file into the app's own caches directory. Files handed to us by
  /// the share extension live in the App Group container and files from the App
  /// Intent live in its inbox — neither is reachable from expo-file-system.
  static func importIntoCaches(_ source: URL, deleteSource: Bool) throws -> URL {
    let fm = FileManager.default
    let caches = try fm.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let dir = caches.appendingPathComponent(cacheDirName, isDirectory: true)
    try fm.createDirectory(at: dir, withIntermediateDirectories: true)

    let ext = source.pathExtension.isEmpty ? "png" : source.pathExtension
    let destination = dir.appendingPathComponent("\(UUID().uuidString).\(ext)")

    if deleteSource, fm.isDeletableFile(atPath: source.path) {
      do {
        try fm.moveItem(at: source, to: destination)
        return destination
      } catch {
        // Fall through to a copy — a move across volumes or a read-only source
        // must not lose the capture.
      }
    }
    try fm.copyItem(at: source, to: destination)
    if deleteSource { try? fm.removeItem(at: source) }
    return destination
  }

  /// Removes capture leftovers older than a day. The share extension copies
  /// files into the App Group container and never cleans up after itself.
  static func sweepStaleFiles(olderThan seconds: TimeInterval = 24 * 60 * 60) {
    let fm = FileManager.default
    var directories: [URL] = []
    if let container = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) {
      directories.append(container.appendingPathComponent(inboxSubpath, isDirectory: true))
    }
    if let caches = try? fm.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: false) {
      directories.append(caches.appendingPathComponent(cacheDirName, isDirectory: true))
    }
    let cutoff = Date().addingTimeInterval(-seconds)
    let pendingPath = (readPending()?["uri"] as? String).flatMap(URL.init(string:))?.path
    for dir in directories {
      guard let entries = try? fm.contentsOfDirectory(
        at: dir, includingPropertiesForKeys: [.contentModificationDateKey], options: [.skipsHiddenFiles]
      ) else { continue }
      for entry in entries where entry.path != pendingPath {
        let modified = (try? entry.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
        if let modified, modified > cutoff { continue }
        try? fm.removeItem(at: entry)
      }
    }
  }
}

public final class SmartCaptureModule: Module {
  private var pendingObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("SmartCapture")

    Events("onPendingCapture")

    OnStartObserving {
      self.pendingObserver = NotificationCenter.default.addObserver(
        forName: SmartCaptureInbox.notificationName,
        object: nil,
        queue: .main
      ) { [weak self] notification in
        guard let marker = notification.userInfo as? [String: Any] else { return }
        self?.sendEvent("onPendingCapture", marker)
      }
    }

    OnStopObserving {
      if let observer = self.pendingObserver {
        NotificationCenter.default.removeObserver(observer)
        self.pendingObserver = nil
      }
    }

    // Covers the warm path where the intent ran while JS was already alive but
    // the app had not been foregrounded yet.
    OnAppBecomesActive {
      if let marker = SmartCaptureInbox.readPending() {
        self.sendEvent("onPendingCapture", marker)
      }
    }

    Function("peekPendingCapture") { () -> [String: Any]? in
      SmartCaptureInbox.readPending()
    }

    AsyncFunction("consumePendingCapture") { () -> [String: Any]? in
      guard let marker = SmartCaptureInbox.readPending(),
            let uri = marker["uri"] as? String,
            let source = URL(string: uri)
      else {
        SmartCaptureInbox.clearPending()
        return nil
      }
      let imported = try SmartCaptureInbox.importIntoCaches(source, deleteSource: true)
      SmartCaptureInbox.clearPending()
      var result = marker
      result["uri"] = imported.absoluteString
      return result
    }

    AsyncFunction("importCaptureFile") { (uri: URL) -> String in
      try SmartCaptureInbox.importIntoCaches(uri, deleteSource: false).absoluteString
    }

    AsyncFunction("sweepStaleCaptures") { () -> Void in
      SmartCaptureInbox.sweepStaleFiles()
    }

    AsyncFunction("recognizeText") { (uri: URL, promise: Promise) in
      guard let data = try? Data(contentsOf: uri),
            let image = UIImage(data: data),
            let cgImage = image.cgImage
      else {
        promise.reject("ERR_SMART_CAPTURE_IMAGE", "Could not read an image at \(uri.absoluteString)")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error {
          promise.reject("ERR_SMART_CAPTURE_OCR", error.localizedDescription)
          return
        }
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        // Vision's origin is bottom-left, so reading order is descending midY.
        let lines = observations
          .sorted { $0.boundingBox.midY > $1.boundingBox.midY }
          .compactMap { $0.topCandidates(1).first?.string }
        promise.resolve([
          "text": lines.joined(separator: "\n"),
          "lines": lines,
          "width": cgImage.width,
          "height": cgImage.height,
        ])
      }
      request.recognitionLevel = .accurate

      // Malay is not in Vision's supported list on current iOS releases and an
      // unsupported code makes `perform` throw, so filter before assigning.
      let supported = (try? request.supportedRecognitionLanguages()) ?? []
      let wanted = ["en-US", "ms-MY"].filter { supported.contains($0) }
      if !wanted.isEmpty { request.recognitionLanguages = wanted }
      // Without Malay in the model, English autocorrect mangles Malay words.
      request.usesLanguageCorrection = supported.contains("ms-MY")

      let orientation = Self.cgOrientation(from: image.imageOrientation)
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
          try handler.perform([request])
        } catch {
          promise.reject("ERR_SMART_CAPTURE_OCR", error.localizedDescription)
        }
      }
    }
  }

  private static func cgOrientation(from orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch orientation {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
