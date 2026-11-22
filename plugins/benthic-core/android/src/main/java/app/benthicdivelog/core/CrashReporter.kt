// SPDX-License-Identifier: GPL-2.0
package app.benthicdivelog.core

import android.content.Context
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.time.Instant

/**
 * Error reports (task #102): an uncaught exception of Kotlin code is written to a file in the app's private storage, then
 * the previous handler runs (the system's crash dialog). At the next launch the web layer reads the file
 * (pendingCrashReport), shows it to the user and sends it only if they tap « Envoyer »; clearCrashReport deletes it.
 * Native C++ crashes (signals) are not captured. Nothing leaves the device from here.
 */
internal object CrashReporter {
    private const val FILE = "crash-report.json"
    private const val MAX_STACK = 12000
    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val file = File(context.filesDir, FILE)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                write(file, error)
            } catch (_: Throwable) {
                // A fault while saving must not hide the crash itself.
            }
            previous?.uncaughtException(thread, error)
        }
    }

    private fun write(file: File, error: Throwable) {
        val json = JSONObject()
            .put("occurredAt", Instant.now().toString())
            .put("osVersion", "Android ${Build.VERSION.RELEASE}")
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("message", "${error.javaClass.name}: ${error.message ?: ""}")
            .put("stack", error.stackTraceToString().take(MAX_STACK))
        file.writeText(json.toString())
    }

    /** The saved crash as JSON text, or an empty string. */
    fun pending(context: Context): String {
        val file = File(context.filesDir, FILE)
        return if (file.isFile) file.readText() else ""
    }

    fun clear(context: Context) {
        File(context.filesDir, FILE).delete()
    }
}
