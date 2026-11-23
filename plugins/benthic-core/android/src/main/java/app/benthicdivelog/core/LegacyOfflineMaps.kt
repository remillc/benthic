package app.benthicdivelog.core

import android.app.NotificationManager
import android.content.Context
import java.io.File

/**
 * Offline maps were removed. Versions before it stored downloaded regions in the app's
 * no-backup storage (`maps/`, `maps-state.json`) and showed their progress in the notification
 * channel `offline-maps`. [remove] deletes what is left of them; it does nothing on a device that
 * never had them, so it runs at every start.
 */
object LegacyOfflineMaps {
    private const val DIR = "maps"
    private const val STATE_FILE = "maps-state.json"
    private const val CHANNEL = "offline-maps"

    fun remove(context: Context) {
        val root = context.applicationContext.noBackupFilesDir
        File(root, DIR).takeIf { it.exists() }?.deleteRecursively()
        File(root, STATE_FILE).delete()
        File(root, "$STATE_FILE.tmp").delete()
        val manager = context.getSystemService(NotificationManager::class.java)
        if (manager?.getNotificationChannel(CHANNEL) != null) manager.deleteNotificationChannel(CHANNEL)
    }
}
