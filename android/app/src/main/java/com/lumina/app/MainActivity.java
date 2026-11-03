package com.lumina.app;

import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginLoadException;
import com.getcapacitor.PluginManager;
import io.capawesome.capacitorjs.plugins.googlesignin.GoogleSignInPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    protected void load() {
        // BridgeActivity has read the generated registry, but has not constructed
        // the bridge yet. Recover an older/missing registry without registering
        // a second instance when cap sync has already included this plugin.
        try {
            if (!new PluginManager(getAssets()).loadPluginClasses().contains(GoogleSignInPlugin.class)) {
                registerPlugin(GoogleSignInPlugin.class);
                Log.w("LuminaNative", "GoogleSignIn explicitly registered: absent from generated registry");
            }
        } catch (PluginLoadException error) {
            registerPlugin(GoogleSignInPlugin.class);
            Log.e("LuminaNative", "Generated registry failed; explicitly registering GoogleSignIn", error);
        }

        super.load();
        if (getBridge().getPlugin("GoogleSignIn") != null) {
            Log.i("LuminaNative", "GoogleSignIn native bridge registered: " + GoogleSignInPlugin.class.getName());
        } else {
            // A Java load exception must be investigated, not reported as a
            // successful registration merely because the Gradle build passed.
            Log.e("LuminaNative", "GoogleSignIn native bridge MISSING; inspect Capacitor plugin load errors");
        }
    }
}
