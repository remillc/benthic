package org.opendives.app;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import android.os.SystemClock;
import android.view.View;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import app.benthicdivelog.core.SplashGate;

public class MainActivity extends BridgeActivity {

    /** The launch screen is never kept longer than this, whatever the web layer does. */
    private static final long SPLASH_LIMIT_MS = 4000;

    /** Frames (about five) given to the page to draw with the insets it was sent, before the launch screen goes. */
    private static final long INSETS_SETTLE_MS = 80;

    private volatile SafeAreaInsets safeArea;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The launch screen stays until the first screen is drawn (SplashGate).
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        final long start = SystemClock.uptimeMillis();
        // It also waits for the window's insets to have reached the page (and a few frames to be drawn with them): the
        // first screen is laid out once, with the real status bar height, not twice.
        splash.setKeepOnScreenCondition(() -> {
            long now = SystemClock.uptimeMillis();
            if (now - start >= SPLASH_LIMIT_MS) return false;
            if (!SplashGate.INSTANCE.getContentShown()) return true;
            SafeAreaInsets insets = safeArea;
            if (insets == null) return false;
            return !insets.isKnown() || now - insets.lastSentAt() < INSETS_SETTLE_MS;
        });
        // Short fade-out once the first screen is drawn, instead of the system's cut.
        splash.setOnExitAnimationListener(provider -> {
            View view = provider.getView();
            view.animate().alpha(0f).setDuration(150).withEndAction(provider::remove).start();
        });
        // Edge to edge on every Android version (forced from Android 15): the page draws behind
        // the system bars and pads itself with the insets SafeAreaInsets reports.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            safeArea = new SafeAreaInsets(getBridge().getWebView());
        }
        // Until the page paints, the WebView shows the app's background, not white.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(getColor(R.color.splash_background));
        }
    }
}
