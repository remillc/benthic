package org.opendives.app;

import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import android.os.SystemClock;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import org.opendives.core.SplashGate;

public class MainActivity extends BridgeActivity {

    /** The launch screen is never kept longer than this, whatever the web layer does. */
    private static final long SPLASH_LIMIT_MS = 4000;

    private SafeAreaInsets safeArea;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // The launch screen stays until the first screen is drawn (SplashGate).
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        final long start = SystemClock.uptimeMillis();
        splash.setKeepOnScreenCondition(() -> !SplashGate.INSTANCE.getContentShown() && SystemClock.uptimeMillis() - start < SPLASH_LIMIT_MS);
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
