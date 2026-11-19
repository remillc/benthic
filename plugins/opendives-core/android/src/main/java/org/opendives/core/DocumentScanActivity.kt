package org.opendives.core

import android.app.Activity
import android.graphics.BitmapFactory
import android.os.Bundle
import android.util.Log
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Scans one certification card (inbox task 2026-11-18-277). The framing, the automatic capture, the
 * crop, the straightening and the corners are ML Kit Document Scanner's own screens (full mode, one
 * page, JPEG; the gallery import is allowed). The scanned picture is then read on the device by the
 * bundled ML Kit text recognition (the one the gauge camera uses). Ends with {action: "cancelled"}
 * or {action: "done", path: <JPEG file in the cache; the plugin turns it into base64>, text: <the lines, separated by line breaks>}; every rule
 * about what the text means is in the app's JavaScript (app/src/lib/card-scan.js).
 */
class DocumentScanActivity : ComponentActivity() {
    private val worker = Executors.newSingleThreadExecutor()

    private val launcher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@registerForActivityResult finishWith(null)
        val page = GmsDocumentScanningResult.fromActivityResultIntent(result.data)?.pages?.firstOrNull()
        val uri = page?.imageUri ?: return@registerForActivityResult finishWith(null)
        worker.execute {
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes == null) {
                    runOnUiThread { finishWith(null) }
                    return@execute
                }
                val text = recognise(bytes)
                // The picture goes through a cache file, not the result Intent: a Binder transaction is limited to about
                // 1 MB, and a base64 scan above it was dropped (TransactionTooLargeException), so the screen got nothing.
                val file = java.io.File(cacheDir, "scan-${System.nanoTime()}.jpg")
                file.writeBytes(bytes)
                val json = JSONObject()
                    .put("action", "done")
                    .put("path", file.absolutePath)
                    .put("text", text)
                runOnUiThread { finishWith(json) }
            } catch (e: Exception) {
                Log.w("DocumentScan", "reading the scan failed", e)
                runOnUiThread { finishWith(null) }
            }
        }
    }

    /** The recognised lines; '' when nothing is read (the picture is still returned). */
    private fun recognise(bytes: ByteArray): String {
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return ""
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        try {
            val text = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
            return text.textBlocks.flatMap { b -> b.lines.map { it.text } }.joinToString("\n")
        } catch (e: Exception) {
            return ""
        } finally {
            recognizer.close()
            bitmap.recycle()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (savedInstanceState != null) return // The launcher keeps its own state after a rotation.
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build()
        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener { launcher.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener {
                Log.w("DocumentScan", "the scanner is not available", it)
                finishWith(JSONObject().put("action", "unavailable"))
            }
    }

    private fun finishWith(json: JSONObject?) {
        val data = android.content.Intent().putExtra("result", (json ?: JSONObject().put("action", "cancelled")).toString())
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
