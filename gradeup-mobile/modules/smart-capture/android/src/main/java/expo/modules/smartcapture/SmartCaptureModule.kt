package expo.modules.smartcapture

import android.net.Uri
import android.webkit.MimeTypeMap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * On-device OCR for Smart Capture.
 *
 * Android has no Back Tap equivalent, so the pending-capture inbox functions
 * are present but always empty — the JS surface stays identical across
 * platforms and the share sheet covers the same ground here.
 */
class SmartCaptureModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmartCapture")

    Events("onPendingCapture")

    Function("peekPendingCapture") { null }

    AsyncFunction("consumePendingCapture") { null }

    AsyncFunction("sweepStaleCaptures") {
      val dir = File(context.cacheDir, CACHE_DIR)
      if (dir.isDirectory) {
        val cutoff = System.currentTimeMillis() - STALE_AFTER_MS
        dir.listFiles()?.forEach { file ->
          if (file.lastModified() < cutoff) file.delete()
        }
      }
    }

    /**
     * Copies a shared image into our own cache. Content URIs handed over by the
     * share sheet are only readable while the delivering intent is alive, so
     * this has to run before the payload is cleared.
     */
    AsyncFunction("importCaptureFile") { uri: String ->
      val source = Uri.parse(uri)
      val resolver = context.contentResolver
      val mime = resolver.type(source) ?: "image/png"
      val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime) ?: "png"

      val dir = File(context.cacheDir, CACHE_DIR).apply { mkdirs() }
      val destination = File(dir, "${UUID.randomUUID()}.$ext")

      val input = resolver.openInputStream(source)
        ?: throw IOException("Could not open the shared image at $uri")
      input.use { stream -> destination.outputStream().use(stream::copyTo) }

      Uri.fromFile(destination).toString()
    }

    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (e: IOException) {
        promise.reject("ERR_SMART_CAPTURE_IMAGE", e.message ?: "Could not read the image", e)
        return@AsyncFunction
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          val lines = result.textBlocks
            .flatMap { it.lines }
            .sortedBy { it.boundingBox?.top ?: 0 }
            .map { it.text }
          promise.resolve(
            mapOf(
              "text" to lines.joinToString("\n"),
              "lines" to lines,
              "width" to image.width,
              "height" to image.height,
            )
          )
        }
        .addOnFailureListener { error ->
          promise.reject("ERR_SMART_CAPTURE_OCR", error.message ?: "Text recognition failed", error)
        }
        .addOnCompleteListener { recognizer.close() }
    }
  }

  private fun android.content.ContentResolver.type(uri: Uri): String? =
    if (uri.scheme == "file") {
      MimeTypeMap.getSingleton().getMimeTypeFromExtension(uri.lastPathSegment?.substringAfterLast('.', ""))
    } else {
      getType(uri)
    }

  companion object {
    private const val CACHE_DIR = "smart-capture"
    private const val STALE_AFTER_MS = 24L * 60 * 60 * 1000
  }
}
