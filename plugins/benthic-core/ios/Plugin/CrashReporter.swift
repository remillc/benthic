// SPDX-License-Identifier: GPL-2.0
import Foundation
import UIKit

/// Error reports (task #102), counterpart of CrashReporter.kt: an uncaught Objective-C exception is written to a file in
/// the app's private storage; at the next launch the web layer reads it (pendingCrashReport), shows it to the user and
/// sends it only if they tap « Envoyer »; clearCrashReport deletes it. Swift runtime traps and native C++ crashes (signals)
/// are not captured. Nothing leaves the device from here.
enum CrashReporter {
    private static let maxStack = 12000
    private static var previous: (@convention(c) (NSException) -> Void)?

    private static var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("crash-report.json")
    }

    static func install() {
        previous = NSGetUncaughtExceptionHandler()
        NSSetUncaughtExceptionHandler { exception in
            CrashReporter.write(exception)
            CrashReporter.previous?(exception)
        }
    }

    private static func write(_ exception: NSException) {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let stack = String(exception.callStackSymbols.joined(separator: "\n").prefix(maxStack))
        let report: [String: String] = [
            "occurredAt": formatter.string(from: Date()),
            "osVersion": "iOS \(UIDevice.current.systemVersion)",
            "device": UIDevice.current.model,
            "message": "\(exception.name.rawValue): \(exception.reason ?? "")",
            "stack": stack,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: report) else { return }
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: fileURL)
    }

    /// The saved crash as JSON text, or an empty string.
    static func pending() -> String {
        guard let data = try? Data(contentsOf: fileURL) else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
