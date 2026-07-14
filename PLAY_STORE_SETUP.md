# Getting Lumina on the Google Play Store

This guide walks you through everything needed to publish Lumina to Google Play — no prior Android experience required.

---

## Before you begin

Make sure you have:
- A computer with [Android Studio](https://developer.android.com/studio) installed (free)
- A Google account
- $25 USD for the one-time Google Play developer registration fee

---

## Step 1 — Deploy the Lumina web app

The Android app loads Lumina from your live web server, so you need to deploy first.

1. In Replit, click the **Deploy** button and publish your app.
2. Note your deployed URL (it will look like `https://your-app.replit.app`).
3. Open `artifacts/lumina/capacitor.config.ts` and update the `server.url` line:
   ```ts
   url: "https://your-app.replit.app",  // ← replace with your actual URL
   ```
4. Run the **Sync Android** workflow in Replit to copy the latest assets.

---

## Step 2 — Open the Android project in Android Studio

1. On your computer, open a terminal and navigate to this project folder.
2. Run: `npx cap open android`  
   This opens Android Studio with the Lumina Android project.
3. Wait for Android Studio to finish syncing (a progress bar appears at the bottom — this can take a minute or two the first time).

---

## Step 3 — Generate a signed release build (APK or AAB)

Google Play requires a signed App Bundle (AAB). Here's how:

1. In Android Studio, go to **Build → Generate Signed Bundle / APK**.
2. Select **Android App Bundle** and click **Next**.
3. Click **Create new…** to create a keystore file:
   - Choose a location to save it (keep this file safe — you'll need it for every future update)
   - Fill in the alias, password, and your name/organization
4. Click **Next**, choose the **release** build variant, and click **Finish**.
5. Android Studio will build the `.aab` file — you'll find it in `android/app/release/`.

> **Important:** Back up your keystore file. If you lose it, you won't be able to update your app on Google Play.

---

## Step 4 — Create a Google Play Developer account

1. Go to [play.google.com/console](https://play.google.com/console) and sign in.
2. Accept the developer agreement and pay the $25 registration fee.
3. Fill in your developer profile (name, email, etc.).

---

## Step 5 — Create your app listing

1. In the Play Console, click **Create app**.
2. Fill in:
   - **App name:** Lumina
   - **Default language:** English
   - **App or game:** App
   - **Free or paid:** Your choice
3. Complete the required sections on the left sidebar:
   - **Store listing** — add a description, screenshots, and a feature graphic (1024×500 px)
   - **Content rating** — fill out the questionnaire (Lumina is a writing tool, rated for everyone)
   - **Target audience** — set the age range
   - **Privacy policy** — you'll need a URL to a privacy policy page

---

## Step 6 — Upload your App Bundle

1. Go to **Release → Production** (or **Internal testing** to test first).
2. Click **Create new release**.
3. Upload the `.aab` file you generated in Step 3.
4. Fill in the release notes (e.g. "Initial release of Lumina writing assistant").
5. Click **Review release** and then **Start rollout to Production**.

---

## Step 7 — Wait for review

Google typically reviews new apps within 1–7 days. You'll receive an email when it's approved or if any changes are needed.

---

## Updating the app in the future

Because Lumina loads its UI from your deployed web server, most updates (bug fixes, new features) only require redeploying the Replit app — **no new APK needed**.

You only need to submit a new APK/AAB to the Play Store if you:
- Change the `capacitor.config.ts` settings
- Add new native Capacitor plugins
- Update the Android project itself

---

## Useful commands

| Task | Command |
|------|---------|
| Open in Android Studio | `npx cap open android` |
| Sync web assets to Android | Run the **Sync Android** workflow in Replit |
| Build debug APK (for testing) | In Android Studio: Build → Build APK |

---

*Need help? Visit [capacitorjs.com/docs](https://capacitorjs.com/docs) for full Capacitor documentation.*
