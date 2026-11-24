package app.benthicdivelog.core

import android.util.Log
import com.capacitorjs.plugins.pushnotifications.MessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives Firebase Cloud Messaging data messages (inbox task 2026-11-23-356, part 3). It replaces the push plugin's own service
 * (which shows nothing for a data message), extends it so that the token still reaches the web layer, and builds the notification
 * of an access request itself, with the app closed. The only messages the server sends:
 * `{type: "access-request", requestId, deviceName, code, expiresAt}` and `{type: "access-request-done", requestId}`.
 * Anything else, and any error, is ignored: a push must never break the app.
 */
class BenthicMessagingService : MessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        try {
            val data = remoteMessage.data
            val request = AccessRequestNotifier.parse(data)
            when {
                request != null -> AccessRequestNotifier.show(applicationContext, request)
                data["type"] == "access-request-done" -> data["requestId"]?.let { AccessRequestNotifier.cancel(applicationContext, it) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Handling a push message", e)
        }
        // The push plugin tells the web layer when it runs (a new request may be waiting to be read).
        try {
            super.onMessageReceived(remoteMessage)
        } catch (e: Exception) {
            Log.w(TAG, "Forwarding a push message", e)
        }
    }

    companion object {
        private const val TAG = "BenthicMessaging"
    }
}
