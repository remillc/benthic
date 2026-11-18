// SPDX-License-Identifier: GPL-2.0
package org.opendives.core

import android.content.Context

/** The session of the OpenDives server (release edition): who is signed in, and the access to the repository. */
internal data class ServerSession(
    val email: String,
    val sessionToken: String,
    val repositoryUrl: String,
    val branch: String,
    val gitUsername: String,
    val gitToken: String,
) {
    // The tokens must never end up in a log line or a crash report.
    override fun toString() = "ServerSession(email=$email, repositoryUrl=$repositoryUrl, tokens=***)"
}

/**
 * The session token and the git token, as one text encrypted by an Android Keystore key (SealedFile) in
 * `server-session.bin`, a file excluded from Android backups like the other credentials. Never in the device store,
 * never in a log; the web layer only reads who is signed in (`serverSessionInfo`).
 */
internal class ServerSessionStore(context: Context) {
    private val sealed = SealedFile(context, "opendives-server-session", "server-session.bin")

    fun read(): ServerSession? {
        val parts = sealed.read()?.split('\n') ?: return null
        if (parts.size != 6 || parts.any { it.isEmpty() }) return null
        return ServerSession(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5])
    }

    fun write(session: ServerSession) {
        val fields = listOf(session.email, session.sessionToken, session.repositoryUrl, session.branch, session.gitUsername, session.gitToken)
        require(fields.none { it.isEmpty() || it.contains('\n') })
        sealed.write(fields.joinToString("\n"))
    }

    fun delete() = sealed.delete()
}
