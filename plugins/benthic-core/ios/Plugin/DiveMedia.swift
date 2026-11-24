// SPDX-License-Identifier: GPL-2.0
import CryptoKit
import Foundation

/// Dive photos and videos on the device (docs/architecture.md, 11.6): objects kept as files
/// <Application Support>/media/<sha-256>. Uploads and downloads stream between a file and a signed URL (URLSession file
/// tasks), so that a video never crosses the bridge. Written without a Mac to try it on: it follows DiveMedia.kt.
final class DiveMedia {
    private let dir: URL
    private static let hashPattern = try! NSRegularExpression(pattern: "^[0-9a-f]{64}$")

    init() {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("media", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    private func file(of hash: String?) throws -> URL {
        guard let hash = hash,
              DiveMedia.hashPattern.firstMatch(in: hash, range: NSRange(hash.startIndex..., in: hash)) != nil else {
            throw Failure("BAD_REQUEST")
        }
        return dir.appendingPathComponent(hash)
    }

    private func hexOf(_ digest: SHA256.Digest) -> String {
        digest.map { String(format: "%02x", $0) }.joined()
    }

    /// SHA-256 and size of a file, read in pieces of 64 KB.
    private func hashOf(_ url: URL) throws -> (String, Int64) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var size: Int64 = 0
        while true {
            guard let chunk = try handle.read(upToCount: 64 * 1024), !chunk.isEmpty else { break }
            hasher.update(data: chunk)
            size += Int64(chunk.count)
        }
        return (hexOf(hasher.finalize()), size)
    }

    /// A staged file becomes the object of its content.
    func adopt(_ staged: URL) throws -> (String, Int64) {
        guard FileManager.default.fileExists(atPath: staged.path) else { throw Failure("NOT_FOUND") }
        let (hash, size) = try hashOf(staged)
        if size == 0 { throw Failure("BAD_REQUEST") }
        let target = try file(of: hash)
        if FileManager.default.fileExists(atPath: target.path) {
            try? FileManager.default.removeItem(at: staged)
        } else {
            try FileManager.default.moveItem(at: staged, to: target)
        }
        return (hash, size)
    }

    func putBytes(_ base64: String) throws -> (String, Int64) {
        guard let bytes = Data(base64Encoded: base64, options: .ignoreUnknownCharacters), !bytes.isEmpty else {
            throw Failure("BAD_REQUEST")
        }
        let hash = hexOf(SHA256.hash(data: bytes))
        let target = try file(of: hash)
        if !FileManager.default.fileExists(atPath: target.path) { try bytes.write(to: target, options: .atomic) }
        return (hash, Int64(bytes.count))
    }

    /// The object's file, nil when the device does not hold it.
    func stat(_ hash: String?) throws -> URL? {
        let url = try file(of: hash)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func delete(_ hash: String?) throws {
        try? FileManager.default.removeItem(at: try file(of: hash))
    }

    /// PUT of the object's file to a signed URL; the storage's HTTP status.
    func upload(_ hash: String?, url: String, headers: [String: String]) throws -> Int {
        let source = try file(of: hash)
        guard FileManager.default.fileExists(atPath: source.path) else { throw Failure("NOT_FOUND") }
        guard let address = URL(string: url) else { throw Failure("BAD_REQUEST") }
        var request = URLRequest(url: address)
        request.httpMethod = "PUT"
        request.timeoutInterval = 600
        for (key, value) in headers where key.lowercased() != "content-length" { request.setValue(value, forHTTPHeaderField: key) }
        let done = DispatchSemaphore(value: 0)
        var status = -1
        URLSession.shared.uploadTask(with: request, fromFile: source) { _, response, error in
            if error == nil, let http = response as? HTTPURLResponse { status = http.statusCode }
            done.signal()
        }.resume()
        done.wait()
        if status < 0 { throw Failure("NETWORK") }
        return status
    }

    /// GET of a signed URL into the media folder; the SHA-256 is checked before the object is kept.
    func download(_ hash: String?, url: String) throws -> Int64 {
        let target = try file(of: hash)
        guard let address = URL(string: url) else { throw Failure("BAD_REQUEST") }
        let done = DispatchSemaphore(value: 0)
        var received: URL?
        var status = -1
        var failed = false
        URLSession.shared.downloadTask(with: address) { location, response, error in
            if let http = response as? HTTPURLResponse { status = http.statusCode }
            if error != nil { failed = true }
            if let location = location {
                // The system deletes `location` when this block returns: move it now.
                let kept = self.dir.appendingPathComponent("\(UUID().uuidString).part")
                if (try? FileManager.default.moveItem(at: location, to: kept)) != nil { received = kept }
            }
            done.signal()
        }.resume()
        done.wait()
        guard let part = received else { throw Failure(failed ? "NETWORK" : "HTTP_\(status)") }
        defer { try? FileManager.default.removeItem(at: part) }
        if status != 200 { throw Failure("HTTP_\(status)") }
        let (actual, size) = try hashOf(part)
        if actual != hash { throw Failure("HASH_MISMATCH") }
        if !FileManager.default.fileExists(atPath: target.path) { try FileManager.default.moveItem(at: part, to: target) }
        return size
    }
}
