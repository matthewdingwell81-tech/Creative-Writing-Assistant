# Publishing Lumina to Google Play

This guide covers the manual steps to publish the Lumina Android app on the Google Play Store. The app is built with Capacitor, which wraps the existing Lumina web app in a native Android shell.

---

## Prerequisites

- A computer with [Android Studio](https://developer.android.com/studio) installed
- A [Google Play Developer account](https://play.google.com/console/signup) ($25 one-time fee)

---

## Step 1 — Set up your Google Play Developer Account

1. Go to [play.google.com/console/signup](https://play.google.com/console/signup)
2. Sign in with a Google account
3. Pay the $25 one-time registration fee
4. Fill in your developer name and contact details
5. Accept the Developer Distribution Agreement
6. Wait for your account to be approved (usually within a few hours)

---

## Step 2 — Set the Production URL

The root `capacitor.config.ts` sets `server.url` to
`https://creative-writing-assistant.replit.app`. The Android WebView loads this
published website remotely, **not** the copied web bundle. The optional
`LUMINA_PREVIEW_URL` override is for development only.

To change the production domain, update that config and rebuild the APK.
Do not use `LUMINA_PRODUCTION_URL`: it is not read by the current Capacitor config.

> **Important:** Always use the permanent production deployment URL, **not** the
> ephemeral Replit dev domain. The dev domain changes whenever the dev environment
> resets and will break the published app.

After any URL change, re-run `cap sync android` so the Android project picks up the
new config.

The website can start calling a new native plugin immediately after publishing,
but **publishing cannot add native code to an already installed APK**. Install a
new APK whenever the native plugin contract changes.

---

## Step 3 — Open the Android Project in Android Studio

1. Make sure you have the latest web build synced:
   ```bash
   pnpm install --frozen-lockfile
   pnpm android:sync
   ```
   *(Or use the **Sync Android** workflow in Replit)*

2. Open Android Studio, then open the project at:
   ```
   android/
   ```

   This is the directory directly inside the repository root. Do not open
   `client/android`, `.migration-backup/client/android`, or
   `artifacts/lumina/android` (the last path does not exist).

3. Wait for Gradle to finish syncing (first time may take a few minutes).
   Use pnpm, not `npm install`, for this pnpm workspace. The sync command resolves
   the installed dependencies and rewrites native Gradle paths for your computer.

---

## Step 4 — Configure the App Version

In Android Studio, open `app/build.gradle` and update the version info:

```gradle
defaultConfig {
    versionCode 1        // increment this for every release (must be integer, always increasing)
    versionName "1.0.0"  // human-readable version shown on the Play Store
}
```

---

## Step 5 — Generate a Signed APK or AAB

Google Play requires your app to be signed with a private key.

1. In Android Studio, go to **Build → Generate Signed Bundle / APK**
2. Choose **Android App Bundle (AAB)** — this is the recommended format for Play Store
3. Click **Create new…** to create a new keystore (a file that holds your signing key)
   - Choose a safe location to save the `.jks` file — **back this up securely, you will need it for every future update**
   - Set a strong password
   - Fill in your name/organization details
4. Complete the wizard; Android Studio will build a signed `.aab` file (usually in `app/release/`)

---

## Step 6 — Create a New App in the Play Console

1. Go to [play.google.com/console](https://play.google.com/console)
2. Click **Create app**
3. Fill in:
   - **App name**: Lumina
   - **Default language**: English
   - **App or game**: App
   - **Free or paid**: your choice
4. Accept the declarations and click **Create app**

---

## Step 7 — Fill in Store Listing Details

In the Play Console, go to **Store presence → Main store listing** and fill in:

- **Short description** (80 chars): "AI writing companion for authors — draft, organize, and improve your work."
- **Full description**: describe Lumina's features — AI suggestions, chapter management, ideas scratchpad, etc.
- **Screenshots**: at least 2 phone screenshots (take them from the app running on a device or emulator)
- **Feature graphic**: a 1024×500px banner image with Lumina branding
- **App icon**: a 512×512px PNG icon (use the purple Lumina icon)
- **Category**: Productivity

---

## Step 8 — Upload the AAB

1. Go to **Release → Production** in the Play Console
2. Click **Create new release**
3. Upload the signed `.aab` file from Step 5
4. Add release notes (e.g., "Initial release of Lumina for Android")
5. Click **Save** then **Review release**

---

## Step 9 — Complete Content Rating and Other Requirements

Play Console will guide you through:

- **Content rating questionnaire** — answer questions about the app's content
- **Target audience** — select the appropriate age group
- **Data safety form** — declare what data the app collects

---

## Step 10 — Submit for Review

1. Once all required sections show a green checkmark in the Play Console, click **Submit for review**
2. Google typically reviews new apps within 3–7 days
3. You'll receive an email when the app is approved or if changes are needed

---

## Updating the App After Launch

Whenever the Lumina web app changes significantly, you can update the Android app:

1. Run the **Sync Android** workflow in Replit (or `pnpm android:sync` locally)
2. Since the app loads from the production URL (`server.url` in `capacitor.config.ts`), most changes to the web app appear automatically **without needing a new Play Store release**
3. Only release a new version to the Play Store if you change native Android code, Capacitor plugins, or want to update the store listing

---

## Useful Commands

```bash
# Sync latest web build to Android
pnpm android:sync

# Open Android project in Android Studio
pnpm exec cap open android

# Build a debug APK (for testing, not Play Store)
cd android && ./gradlew assembleDebug
```

## Windows PowerShell: sync, rebuild, and verify Google Sign-In

Prerequisites: Node 22+, pnpm 10.26.1, JDK 21, Android SDK Platform 36, and
Android Studio. Use the **repository root** (the folder containing
`pnpm-workspace.yaml` and `capacitor.config.ts`), not a nested app folder.

```powershell
git pull --ff-only
npm install --global pnpm@10.26.1
pnpm install --frozen-lockfile

# Default Android Studio installation paths; change them if installed elsewhere.
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

# Builds with PORT/BASE_PATH set correctly on Windows, syncs root android/,
# and checks the native package, Java/JS names, registry, and Gradle paths.
pnpm android:sync
if ($LASTEXITCODE -ne 0) { throw "Android sync/verification failed" }

Push-Location android
.\gradlew.bat clean :app:assembleDebug --no-build-cache --rerun-tasks
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "Android build failed" }

# Inspects the ACTUAL APK: registry entry AND defined native DEX class.
pnpm android:verify --apk android/app/build/outputs/apk/debug/app-debug.apk
if ($LASTEXITCODE -ne 0) { throw "Do not install: APK native verification failed" }

# Connect an Android device with USB debugging enabled, or start an emulator.
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb devices
& $adb install -r android/app/build/outputs/apk/debug/app-debug.apk
if ($LASTEXITCODE -ne 0) { throw "APK install failed; do not uninstall or clear app data" }
& $adb shell am force-stop com.lumina.app
& $adb shell am start -n com.lumina.app/.MainActivity
```

`install -r` preserves app data. If Android reports a signing-key mismatch, stop;
do not uninstall the app without first considering unsynced user data.
Do not use an APK left in another directory or an old download.

### Prove the bridge works on Android (not just that Gradle compiled)

With an online device/emulator connected:

```powershell
Push-Location android
.\gradlew.bat :app:connectedDebugAndroidTest "-Pandroid.testInstrumentationRunnerArguments.class=com.lumina.app.GoogleSignInBridgeTest"
Pop-Location
```

This test launches the APK, checks the real WebView's `GoogleSignIn` headers and
methods, then calls native `initialize` through `window.Capacitor.nativePromise`.
It does **not** sign in, open the Google account picker, or send an identity token.
Only a passing device test proves that native initialization works. Separately
tap **Continue with Google** to verify account selection and server-session
exchange on the device.

For load failures, collect native startup logs (no tokens are logged by this check):

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" logcat -d -s LuminaNative Capacitor
```

### Confirmed diagnosis of the uploaded failing APK

The inspected APK had an **empty** `assets/capacitor.plugins.json` (`[]`) and
did not define `GoogleSignInPlugin` in any of its seven DEX files. Its remote URL
was the published Lumina website, whose JavaScript registers and calls
`GoogleSignIn`. Its embedded `webDir` was `artifacts/lumina/dist`, unlike the
current `artifacts/lumina/dist/public`. This proves a native/web contract mismatch
in that APK, not a JavaScript/Java plugin-name mismatch. It does not prove which
local command, source checkout, or old output produced the APK.

The project now pins the same Google Sign-In package in native and web packages,
tracks the generated registry, has a native startup registration fallback, and
refuses to build a missing Google registry. APK and device checks remain separate:
packaging checks do not establish that Google account sign-in completed.

Exact call chain:

- `artifacts/lumina/src/pages/AuthPage.tsx`: **Continue with Google** calls
  `handleGoogleSignIn` → `loginWithGoogle`.
- `artifacts/lumina/src/hooks/useAuth.ts`: native Android calls
  `GoogleSignIn.initialize({ clientId: googleWebClientId })` and
  `GoogleSignIn.signIn()` from `@capawesome/capacitor-google-sign-in@0.1.4`.
  The returned Google ID token becomes a Firebase credential, and the Firebase
  ID token is exchanged with `/api/auth/firebase-session`.
- The npm package's `dist/esm/index.js` registers `GoogleSignIn`; its Android
  `GoogleSignInPlugin.java` has `@CapacitorPlugin(name = "GoogleSignIn")`.
  There is no name mismatch.
- `android/capacitor.settings.gradle` includes the native module;
  `android/app/capacitor.build.gradle` includes it as an app dependency;
  `android/app/src/main/assets/capacitor.plugins.json` maps the package to
  `io.capawesome.capacitorjs.plugins.googlesignin.GoogleSignInPlugin`.

The package previously excluded Windows binaries for esbuild, Rollup,
Lightning CSS, and Tailwind Oxide. These exclusions were removed so the documented
Windows web-build-and-native-sync command can install its platform dependencies.
