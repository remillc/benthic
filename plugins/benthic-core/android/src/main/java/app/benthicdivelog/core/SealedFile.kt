// SPDX-License-Identifier: GPL-2.0
package app.benthicdivelog.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * A text kept in the app's private storage, encrypted with AES-GCM by a key
 * that never leaves the Android Keystore (hardware-backed when available).
 * Only the ciphertext is stored. One alias and one file per secret.
 */
internal class SealedFile(
    context: Context,
    private val keyAlias: String,
    fileName: String,
    /** The alias this secret had before the rename to Benthic (22 November 2026), moved to `keyAlias` on first use. */
    private val legacyAlias: String? = null,
) {
    private val name = fileName
    private val file = File(context.filesDir, fileName)

    /** The text, or null when there is none or it cannot be decrypted (a key lost with a restore). */
    fun read(): String? {
        if (!file.exists()) return null
        moveLegacyKey()
        return try {
            val bytes = file.readBytes()
            val iv = bytes.copyOfRange(0, IV_SIZE)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    fun write(text: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
        val sealed = cipher.iv + cipher.doFinal(text.toByteArray(Charsets.UTF_8))
        val tmp = File(file.parentFile, "$name.tmp")
        tmp.writeBytes(sealed)
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IllegalStateException("CREDENTIALS_NOT_SAVED")
        }
    }

    fun delete() {
        file.delete()
        File(file.parentFile, "$name.tmp").delete()
        for (alias in listOfNotNull(keyAlias, legacyAlias)) {
            try {
                keyStore().deleteEntry(alias)
            } catch (e: Exception) {
                // Nothing to delete.
            }
        }
    }

    /**
     * A file sealed under the old alias is decrypted with that key and sealed again under the new alias; the old
     * key is then deleted. Nothing happens when there is no old key or the new one exists (so it runs once).
     */
    private fun moveLegacyKey() {
        val old = legacyAlias ?: return
        try {
            val store = keyStore()
            if (store.containsAlias(keyAlias) || !store.containsAlias(old)) return
            val oldKey = (store.getEntry(old, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: return
            val bytes = file.readBytes()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, oldKey, GCMParameterSpec(TAG_BITS, bytes.copyOfRange(0, IV_SIZE)))
            val text = String(cipher.doFinal(bytes, IV_SIZE, bytes.size - IV_SIZE), Charsets.UTF_8)
            write(text)
            store.deleteEntry(old)
        } catch (e: Exception) {
            // The old key cannot be used: the secret reads as missing and the diver signs in again.
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(): SecretKey? = (keyStore().getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey(): SecretKey {
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
        const val TAG_BITS = 128
    }
}
