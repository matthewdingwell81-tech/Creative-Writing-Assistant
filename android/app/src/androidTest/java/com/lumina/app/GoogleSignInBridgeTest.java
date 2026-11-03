package com.lumina.app;

import static org.junit.Assert.*;

import android.net.Uri;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Device-only verification: native class + headers + actual JS-to-Java call.
 * Needs network access to the configured website; does not prompt for an account
 * or sign the user in. A passing assembleDebug is NOT a substitute for this test.
 */
@RunWith(AndroidJUnit4.class)
public class GoogleSignInBridgeTest {

    @Test
    public void publishedWebsiteBridgeCanInitializeNativeGoogleSignIn() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<String> clientId = new AtomicReference<>();
            AtomicReference<String> serverOrigin = new AtomicReference<>();
            scenario.onActivity(activity -> {
                assertNotNull("Native plugin handle is missing", activity.getBridge().getPlugin("GoogleSignIn"));
                int id = activity.getResources().getIdentifier("default_web_client_id", "string", activity.getPackageName());
                assertNotEquals("Google web client ID resource is missing", 0, id);
                clientId.set(activity.getString(id));
                Uri server = Uri.parse(activity.getBridge().getConfig().getServerUrl());
                serverOrigin.set(server.getScheme() + "://" + server.getAuthority());
            });

            await(scenario,
                "(function(){var c=window.Capacitor;return !!(c && c.nativePromise && c.PluginHeaders && " +
                "c.PluginHeaders.some(function(p){return p.name==='GoogleSignIn' && " +
                "['initialize','signIn','signOut'].every(function(m){return p.methods.some(function(x){return x.name===m;});});}));})()",
                "true");
            assertEquals("Test is not running on the APK's configured remote website",
                JSONObject.quote(serverOrigin.get()), evaluate(scenario, "window.location.origin"));

            evaluate(scenario,
                "window.__luminaGoogleBridgeProbe='pending';" +
                "window.Capacitor.nativePromise('GoogleSignIn','initialize',{clientId:" +
                JSONObject.quote(clientId.get()) + "})" +
                ".then(function(){window.__luminaGoogleBridgeProbe='resolved';}," +
                "function(e){window.__luminaGoogleBridgeProbe='rejected:'+String(e.message||e);});");
            await(scenario, "window.__luminaGoogleBridgeProbe", "\"resolved\"");
        }
    }

    private static void await(ActivityScenario<MainActivity> scenario, String script, String expected) throws Exception {
        String last = "";
        long deadline = SystemClock.elapsedRealtime() + 60000;
        do {
            last = evaluate(scenario, script);
            if (expected.equals(last)) return;
            if (last != null && last.contains("rejected:")) break;
            SystemClock.sleep(250);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Native bridge did not return " + expected + "; last result=" + last + ". Inspect adb logcat -s LuminaNative Capacitor");
    }

    private static String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity ->
            activity.getBridge().getWebView().evaluateJavascript(script, value -> {
                result.set(value);
                completed.countDown();
            })
        );
        assertTrue("WebView JavaScript callback timed out", completed.await(10, TimeUnit.SECONDS));
        return result.get();
    }
}
