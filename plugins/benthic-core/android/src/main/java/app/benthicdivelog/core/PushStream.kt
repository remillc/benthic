package app.benthicdivelog.core

import android.util.Log
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

/**
 * The push channel's connection (to-do #185, lib/push-events.js): one Server-Sent Events stream, read line by line on a
 * background thread. It parses nothing: every line goes to [listener] as it is, and the JavaScript side owns the
 * protocol, the reconnection and the backoff. It lives as long as the process (no foreground service, no wake lock), so
 * the system decides how long it stays alive in the background.
 */
class PushStream(private val listener: (id: Int, kind: String, line: String?, status: Int, message: String?) -> Unit) {
    private var current: Connection? = null

    private class Connection(val id: Int) {
        @Volatile var cancelled = false
        @Volatile var http: HttpURLConnection? = null
    }

    /** Opens the stream; any earlier one is closed first. */
    @Synchronized
    fun open(id: Int, url: String, token: String) {
        close()
        val connection = Connection(id)
        current = connection
        Thread({
            try {
                run(connection, url, token)
            } catch (e: Throwable) {
                Log.w(TAG, "The push stream failed: ${e.message}")
            }
        }, "benthic-push").apply { isDaemon = true }.start()
    }

    /** Closes the stream; no event follows. */
    @Synchronized
    fun close(id: Int? = null) {
        val connection = current ?: return
        if (id != null && connection.id != id) return
        connection.cancelled = true
        // Disconnecting from another thread ends the blocked read.
        try {
            connection.http?.disconnect()
        } catch (_: Exception) {
        }
        current = null
    }

    /** The page's listener must never take the reader thread down. */
    private fun emit(id: Int, kind: String, line: String?, status: Int, message: String?) {
        try {
            listener(id, kind, line, status, message)
        } catch (e: Throwable) {
            Log.w(TAG, "The push listener failed: ${e.message}")
        }
    }

    private fun run(connection: Connection, url: String, token: String) {
        var status = 0
        var message: String? = null
        try {
            val http = URL(url).openConnection() as HttpURLConnection
            connection.http = http
            http.requestMethod = "GET"
            http.connectTimeout = 15000
            // No read timeout: the stream is quiet between pushes; the JavaScript watchdog ends a dead one.
            http.readTimeout = 0
            http.setRequestProperty("Accept", "text/event-stream")
            http.setRequestProperty("Cache-Control", "no-cache")
            http.setRequestProperty("Authorization", "Bearer $token")
            status = http.responseCode
            if (connection.cancelled) return
            if (status != 200) {
                emit(connection.id, "closed", null, status, null)
                return
            }
            emit(connection.id, "open", null, 200, null)
            BufferedReader(InputStreamReader(http.inputStream, Charsets.UTF_8)).use { reader ->
                while (!connection.cancelled) {
                    val line = reader.readLine() ?: break
                    emit(connection.id, "line", line, 200, null)
                }
            }
        } catch (e: Throwable) {
            if (!connection.cancelled) message = e.message
        } finally {
            try {
                connection.http?.disconnect()
            } catch (_: Exception) {
            }
        }
        if (!connection.cancelled) {
            Log.i(TAG, "The push stream ended: ${message ?: "closed by the server"}")
            emit(connection.id, "closed", null, 0, message)
        }
    }

    private companion object {
        const val TAG = "BenthicPush"
    }
}
