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

`capacitor.config.ts` reads `server.url` from the `LUMINA_PRODUCTION_URL` environment
variable at build time, falling back to `https://lumina.replit.app`. This means you
can change the domain in the future without editing source code — just set the env var
before running `cap sync`.

**If the default `https://lumina.replit.app` is correct**, no action is needed.

**If you are using a custom domain**, set the variable before syncing:

```bash
export LUMINA_PRODUCTION_URL=https://your-custom-domain.com
```

or inline:

```bash
LUMINA_PRODUCTION_URL=https://your-custom-domain.com npx cap sync android
```

> **Important:** Always use the permanent production deployment URL, **not** the
> ephemeral Replit dev domain. The dev domain changes whenever the dev environment
> resets and will break the published app.

After any URL change, re-run `cap sync android` so the Android project picks up the
new config.

> **Validation:** The **Sync Android** workflow automatically validates
> `LUMINA_PRODUCTION_URL` before building. If the value is set but is not a
> well-formed `https://` URL the sync is aborted with a clear error message so a
> broken URL can never silently ship in a Play Store build.
>
> You can also run the check independently:
> ```bash
> pnpm --filter @workspace/lumina run validate-url
> ```

---

## Step 3 — Open the Android Project in Android Studio

1. Make sure you have the latest web build synced:
   ```bash
   pnpm --filter @workspace/lumina run validate-url
   pnpm --filter @workspace/lumina run build
   npx cap sync android
   ```
   *(Or use the **Sync Android** workflow in Replit)*

2. Open Android Studio, then open the project at:
   ```
   artifacts/lumina/android/
   ```

3. Wait for Gradle to finish syncing (first time may take a few minutes)

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

1. Run the **Sync Android** workflow in Replit (or `npx cap sync android` locally)
2. Since the app loads from the production URL (`server.url` in `capacitor.config.ts`), most changes to the web app appear automatically **without needing a new Play Store release**
3. Only release a new version to the Play Store if you change native Android code, Capacitor plugins, or want to update the store listing

---

## Useful Commands

```bash
# Sync latest web build to Android
pnpm --filter @workspace/lumina run build && npx cap sync android

# Open Android project in Android Studio
cd artifacts/lumina && npx cap open android

# Build a debug APK (for testing, not Play Store)
cd artifacts/lumina/android && ./gradlew assembleDebug
```
