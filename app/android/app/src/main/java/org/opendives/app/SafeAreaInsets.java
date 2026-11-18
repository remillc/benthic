package org.opendives.app;

import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * The safe area of the window (system bars and display cutout), read from the window insets and
 * handed to the web layer.
 *
 * The WebView's own env(safe-area-inset-*) is not reliable here: it never reports the navigation
 * bar (bottom is always 0) and the top is 52 px on one launch and 0 on the next. So the insets are
 * read from the window, in CSS pixels, and:
 *  - the page reads them at boot through the OpenDivesInsets interface (synchronous, there before
 *    the first script runs, so there is no race with the page load);
 *  - every change (rotation, gesture or 3-button navigation, multi-window, cutout) is pushed to the
 *    page by calling window.__odSetInsets (src/lib/safe-area.js).
 * The insets are not consumed: the WebView still receives them.
 */
final class SafeAreaInsets {

    private static final String TAG = "OpenDivesInsets";

    private final WebView webView;
    private volatile String json = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}";
    /** The window's insets were read at least once: until then get() only has zeros and the page would lay out twice. */
    private volatile boolean known = false;
    /** When the last insets were sent to the page (uptime ms); 0 before. */
    private volatile long sentAt = 0;

    SafeAreaInsets(WebView webView) {
        this.webView = webView;
        webView.addJavascriptInterface(this, "OpenDivesInsets");
        ViewCompat.setOnApplyWindowInsetsListener(webView, (view, windowInsets) -> {
            update(windowInsets);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(webView);
    }

    /** True once the window's insets were read; the launch screen waits for it (MainActivity). */
    boolean isKnown() {
        return known;
    }

    /** Uptime (ms) when the insets were last pushed to the page; 0 when none were. */
    long lastSentAt() {
        return sentAt;
    }

    /** The current insets as JSON in CSS pixels: {"top":..,"right":..,"bottom":..,"left":..}. */
    @JavascriptInterface
    public String get() {
        Log.i(TAG, "page reads " + json);
        return json;
    }

    private void update(WindowInsetsCompat windowInsets) {
        // Ignoring visibility: hiding the bars (full screen) does not move the layout.
        Insets insets = windowInsets.getInsetsIgnoringVisibility(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = webView.getResources().getDisplayMetrics().density;
        String next = "{\"top\":" + css(insets.top, density)
            + ",\"right\":" + css(insets.right, density)
            + ",\"bottom\":" + css(insets.bottom, density)
            + ",\"left\":" + css(insets.left, density) + "}";
        known = true;
        if (next.equals(json)) return;
        json = next;
        sentAt = android.os.SystemClock.uptimeMillis();
        Log.i(TAG, "insets " + next + " density " + density);
        webView.post(() -> webView.evaluateJavascript(
            "window.__odSetInsets && window.__odSetInsets(" + next + ")", null));
    }

    private static String css(int px, float density) {
        float value = px / density;
        return value == Math.rint(value) ? String.valueOf((int) value) : String.format(java.util.Locale.ROOT, "%.2f", value);
    }
}
