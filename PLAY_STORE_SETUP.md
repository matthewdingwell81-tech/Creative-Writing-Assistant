# Google Play Store Setup for Lumina

This guide walks you through publishing Lumina to the Google Play Store.

## Prerequisites

1. **Google Play Developer Account** - Sign up at https://play.google/console (one-time $25 fee)
2. **Android device or emulator** - For testing
3. **Java Development Kit (JDK) 17+** - For building the APK
4. **Android SDK** - Install via Android Studio or command-line tools

## Step 1: Build the APK/AAB

### Option A: Build on Replit (Recommended)

1. Open your Lumina project on Replit
2. Make sure the web app is deployed (https://lumina-creative-hub.replit.app)
3. In the terminal, run:
   ```bash
   cd client
   npx cap sync android
   npx cap open android
   ```
4. This opens Android Studio - from there:
   - Go to **Build > Generate Signed Bundle/APK**
   - Choose **Android App Bundle (AAB)** for Play Store, or **APK** for testing
   - Follow the prompts to create or use a signing key
   - Save the output file

### Option B: Build Locally

1. Install Android Studio
2. Clone the repo locally
3. Run:
   ```bash
   cd client
   npm install
   npx cap sync android
   npx cap open android
   ```
4. In Android Studio, build as above

## Step 2: Upload to Google Play Console

1. Go to https://play.google/console and sign in
2. Create a new app:
   - **App name**: Lumina
   - **Default language**: English (US)
   - **App type**: Android app
3. Fill in the required sections:
   - **App listings** - Screenshots, description, icons
   - **Pricing & distribution** - Free or paid, countries
   - **Content rating** - Complete the questionnaire
   - **Target audience** - Set age ranges
4. Upload your AAB/APK in the **Release** section
5. Submit for review

## Step 3: After Approval

Once Google approves your app (usually within 24-48 hours), it will be live on the Play Store!

## Notes

- The Android app loads the live website (https://lumina-creative-hub.replit.app) - no need to rebuild for minor updates
- Make sure your backend stays deployed, or the app won't work
- For app icon customization, replace the files in `client/android/app/src/main/res/mipmap-*`

## Troubleshooting

- **Build fails**: Make sure JDK 17+ and Android SDK are properly installed
- **App crashes on launch**: Check that the server URL in capacitor.config.json is correct and the site is live
- **Play Store rejected**: Common reasons include missing privacy policy, incorrect content rating, or trademark issues in screenshots
