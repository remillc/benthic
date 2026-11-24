package app.benthicdivelog.core

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * The system notification of an access request (inbox task 2026-11-23-356, part 3): a new device asks a paired device for the data
 * key, and the server sends a data message through FCM (BenthicMessagingService). This builds the notification itself, so that it
 * shows with the app closed:
 *  - title "Donner acces a ... ?", body "Code de verification 482 913. Touchez pour repondre." (from the string resources, French
 *    and English), one action "Repondre"; the notification and the action open the app on the request;
 *  - the channel "Demandes d'acces", high importance;
 *  - the tag is the request id: the same request never shows twice, and "access-request-done" cancels it; it also times out at
 *    `expiresAt`, so that a request nobody answers does not stay (the server sends no cancel for an expiry).
 * There is no "Autoriser" action: the diver must compare the code in the app.
 */
object AccessRequestNotifier {
    private const val TAG = "AccessRequestNotifier"
    const val CHANNEL = "access-requests"

    /** The one notification id; the tag (the request id) tells the requests apart. */
    private const val ID = 4201

    /** The intent extra the plugin reads to open the request (BenthicCorePlugin.offerAccessRequest). */
    const val EXTRA_REQUEST_ID = "app.benthicdivelog.accessRequestId"

    /** The ids the server sends: letters, digits, `_` and `-`. */
    private val ID_RE = Regex("^[A-Za-z0-9_-]{1,64}$")

    /** Whether the app is in front: the web layer then shows the request itself (the dialog), no notification. */
    fun appInForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    /** What the data message of an access request says. */
    class Request(val id: String, val deviceName: String, val code: String, val expiresAt: Long)

    /** The request a data message carries; null for anything else. */
    fun parse(data: Map<String, String>): Request? {
        if (data["type"] != "access-request") return null
        val id = data["requestId"] ?: return null
        if (!ID_RE.matches(id)) return null
        return Request(id, data["deviceName"] ?: "", data["code"] ?: "", data["expiresAt"]?.toLongOrNull() ?: 0L)
    }

    /** The code in two groups of three, as the app shows it (a no-break space between them). */
    fun groupedCode(code: String): String = if (code.length == 6) code.substring(0, 3) + " " + code.substring(3) else code

    fun show(context: Context, request: Request, now: Long = System.currentTimeMillis()) {
        // Expired already (a message that waited): nothing to answer.
        if (request.expiresAt in 1..now) return
        if (appInForeground()) return
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel(context)
        val body = context.getString(R.string.bc_access_body, groupedCode(request.code))
        val builder = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(smallIcon(context))
            .setColor(0xFF2D5E90.toInt())
            .setContentTitle(context.getString(R.string.bc_access_title, request.deviceName))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openIntent(context, request.id, 0))
            .addAction(0, context.getString(R.string.bc_access_action), openIntent(context, request.id, 1))
        if (request.expiresAt > now) builder.setTimeoutAfter(request.expiresAt - now)
        try {
            manager.notify(request.id, ID, builder.build())
        } catch (e: SecurityException) {
            Log.w(TAG, "Showing an access request", e)
        }
    }

    /** "access-request-done": the request was answered on another device, refused or cleaned up. */
    fun cancel(context: Context, requestId: String) {
        if (!ID_RE.matches(requestId)) return
        NotificationManagerCompat.from(context).cancel(requestId, ID)
    }

    /** Opens the app on the request: the intent that starts the app carries the request id. */
    private fun openIntent(context: Context, requestId: String, slot: Int): PendingIntent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        launch.putExtra(EXTRA_REQUEST_ID, requestId)
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            requestId.hashCode() * 2 + slot,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** The small status-bar icon the app already uses for its other notifications (the plugin cannot name the app's resources). */
    private fun smallIcon(context: Context): Int {
        val id = context.resources.getIdentifier("ic_stat_flight", "drawable", context.packageName)
        return if (id != 0) id else android.R.drawable.ic_dialog_info
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val notifications = context.getSystemService(NotificationManager::class.java) ?: return
        if (notifications.getNotificationChannel(CHANNEL) != null) return
        val channel = NotificationChannel(CHANNEL, context.getString(R.string.bc_access_channel), NotificationManager.IMPORTANCE_HIGH)
        channel.description = context.getString(R.string.bc_access_channel_description)
        channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        notifications.createNotificationChannel(channel)
    }
}
