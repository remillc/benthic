// SPDX-License-Identifier: GPL-2.0
package app.benthicdivelog.core

import android.content.Context
import android.util.Base64
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Dive photos and videos on the device (docs/architecture.md, 11.6): objects kept as files filesDir/media/<sha-256>.
 * Uploads and downloads stream between a file and a signed URL, so that a video never crosses the bridge.
 */
class DiveMedia(private val context: Context) {
    private val dir get() = File(context.filesDir, "media").also { it.mkdirs() }

    class Failure(val code: String) : IOException(code)

    private fun fileOf(hash: String?): File {
        if (hash == null || !HASH.matches(hash)) throw Failure("BAD_REQUEST")
        return File(dir, hash)
    }

    private fun hexOf(digest: MessageDigest) = digest.digest().joinToString("") { "%02x".format(it) }

    private fun hashOf(file: File): Pair<String, Long> {
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
                size += n
            }
        }
        return hexOf(digest) to size
    }

    /** A staged file (in the cache, import- prefix) becomes the object of its content. */
    fun adopt(staged: File): Pair<String, Long> {
        if (!staged.exists()) throw Failure("NOT_FOUND")
        val (hash, size) = hashOf(staged)
        if (size == 0L) throw Failure("BAD_REQUEST")
        val target = fileOf(hash)
        if (target.exists()) staged.delete()
        else if (!staged.renameTo(target)) {
            staged.copyTo(target, overwrite = true)
            staged.delete()
        }
        return hash to size
    }

    fun putBytes(base64: String): Pair<String, Long> {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        if (bytes.isEmpty()) throw Failure("BAD_REQUEST")
        val hash = hexOf(MessageDigest.getInstance("SHA-256").also { it.update(bytes) })
        val target = fileOf(hash)
        if (!target.exists()) {
            val tmp = File(dir, "$hash.tmp")
            tmp.writeBytes(bytes)
            tmp.renameTo(target)
        }
        return hash to bytes.size.toLong()
    }

    /** The file of an object, or null when the device does not hold it. */
    fun stat(hash: String?): File? = fileOf(hash).takeIf { it.exists() }

    fun delete(hash: String?) {
        fileOf(hash).delete()
    }

    /** PUT of the object's file to a signed URL; the storage's HTTP status. */
    fun upload(hash: String?, url: String, headers: Map<String, String>): Int {
        val file = fileOf(hash)
        if (!file.exists()) throw Failure("NOT_FOUND")
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "PUT"
            connection.doOutput = true
            connection.connectTimeout = 15000
            connection.readTimeout = 10 * 60 * 1000
            connection.setFixedLengthStreamingMode(file.length())
            for ((k, v) in headers) if (!k.equals("content-length", true)) connection.setRequestProperty(k, v)
            file.inputStream().use { input -> connection.outputStream.use { out -> input.copyTo(out, 64 * 1024) } }
            val status = connection.responseCode
            (if (status >= 400) connection.errorStream else connection.inputStream)?.close()
            return status
        } catch (e: IOException) {
            throw Failure("NETWORK")
        } finally {
            connection.disconnect()
        }
    }

    /** GET of a signed URL into the media folder; the SHA-256 is checked before the object is kept. */
    fun download(hash: String?, url: String): Long {
        val target = fileOf(hash)
        val part = File(dir, "$hash.part")
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15000
            connection.readTimeout = 60000
            val status = connection.responseCode
            if (status != 200) throw Failure("HTTP_$status")
            connection.inputStream.use { input -> part.outputStream().use { out -> input.copyTo(out, 64 * 1024) } }
            val (actual, size) = hashOf(part)
            if (actual != hash) throw Failure("HASH_MISMATCH")
            if (!part.renameTo(target)) part.copyTo(target, overwrite = true)
            return size
        } catch (e: Failure) {
            throw e
        } catch (e: IOException) {
            throw Failure("NETWORK")
        } finally {
            part.delete()
            connection.disconnect()
        }
    }

    companion object {
        private val HASH = Regex("^[0-9a-f]{64}$")
    }
}
