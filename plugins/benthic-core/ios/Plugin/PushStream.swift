import Foundation

/// The push channel's connection (to-do #185, lib/push-events.js): one Server-Sent Events stream, read as it arrives
/// with a `URLSession` data task. It parses nothing beyond cutting lines: every line goes to `listener` as it is, and the
/// JavaScript side owns the protocol, the reconnection and the backoff. iOS suspends an app in the background after a
/// short time and the connection with it; the page reconnects when the app comes back to the front (`resume`), and the
/// hello that follows brings what was missed.
final class PushStream: NSObject, URLSessionDataDelegate {
    typealias Listener = (_ id: Int, _ kind: String, _ line: String?, _ status: Int, _ message: String?) -> Void

    private let listener: Listener
    private let lock = NSLock()
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var currentId = 0
    private var buffer = Data()
    private var status = 0

    init(listener: @escaping Listener) {
        self.listener = listener
    }

    /// Opens the stream; any earlier one is closed first.
    func open(id: Int, url: URL, token: String) {
        close()
        lock.lock()
        currentId = id
        buffer = Data()
        status = 0
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let configuration = URLSessionConfiguration.ephemeral
        // The stream is quiet between pushes: no limit on the wait for data; the page's watchdog ends a dead one.
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = TimeInterval(Int32.max)
        configuration.waitsForConnectivity = false
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        let task = session.dataTask(with: request)
        self.task = task
        lock.unlock()
        task.resume()
    }

    /// Closes the stream (when `id` is nil or the current one); no event follows.
    func close(id: Int? = nil) {
        lock.lock()
        defer { lock.unlock() }
        if let id = id, id != currentId { return }
        task?.cancel()
        session?.invalidateAndCancel()
        task = nil
        session = nil
        currentId = -1
    }

    private func current(_ session: URLSession) -> Int? {
        lock.lock()
        defer { lock.unlock() }
        return self.session === session ? currentId : nil
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let id = current(session) else {
            completionHandler(.cancel)
            return
        }
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        lock.lock()
        status = code
        lock.unlock()
        if code == 200 {
            listener(id, "open", nil, 200, nil)
            completionHandler(.allow)
        } else {
            listener(id, "closed", nil, code, nil)
            lock.lock()
            if self.session === session { self.session = nil }
            lock.unlock()
            completionHandler(.cancel)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let id = current(session) else { return }
        lock.lock()
        buffer.append(data)
        var lines: [String] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let lineData = buffer[buffer.startIndex..<newline]
            lines.append(String(decoding: lineData, as: UTF8.self))
            buffer.removeSubrange(buffer.startIndex...newline)
        }
        lock.unlock()
        for line in lines { listener(id, "line", line, 200, nil) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // A non-200 answer already reported its end (the session was released then); a cancelled task is a close.
        guard let id = current(session) else { return }
        if let error = error as NSError?, error.code == NSURLErrorCancelled { return }
        listener(id, "closed", nil, 0, error?.localizedDescription)
    }
}
