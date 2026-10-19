# Android Packaging & Google Play Store Submission Guide

This guide details how to build and package **Forex Signal Pro** as a native Android application using Capacitor and prepare a signed **Android App Bundle (AAB)** for Google Play Console submission.

---

## 1. Prerequisites

1. **Android Studio**: Install [Android Studio Hedgehog / Jellyfish / Ladybug](https://developer.android.com/studio).
2. **Java Development Kit (JDK)**: JDK 17 or JDK 21 installed and `JAVA_HOME` environment variable configured.
3. **Android SDK**: Install Android SDK API Level 34 / 35 via Android Studio SDK Manager.

---

## 2. Initialize and Sync Android Project

From the `frontend` folder:

```bash
# 1. Build the production React web bundle
npm run build

# 2. Add Android native platform (first-time only)
npx cap add android

# 3. Synchronize web assets and plugins to Android native project
npx cap sync
```

This creates the native `android/` directory with `AndroidManifest.xml`, gradle build scripts, and resource directories.

---

## 3. Configure Android Manifest & Permissions

In `frontend/android/app/src/main/AndroidManifest.xml`, the following permissions are configured for notifications and network feeds:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />
```

---

## 4. Setup Push Notifications (Firebase Cloud Messaging)

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a project named **Forex Signal Pro**.
3. Register your Android app with package name: `com.forexsignalpro.app`.
4. Download `google-services.json`.
5. Place `google-services.json` into `frontend/android/app/google-services.json`.

---

## 5. Generate Release Signing Keystore

Run the following command in terminal to create your release keystore:

```bash
keytool -genkey -v -keystore forex-signal-pro-release.keystore -alias fsp-release -keyalg RSA -keysize 2048 -validity 10000
```

Store this keystore file and its passwords securely; Google Play requires this key for all future application updates.

---

## 6. Build Signed Android App Bundle (AAB)

1. Open the project in Android Studio:
   ```bash
   npx cap open android
   ```
2. In Android Studio, go to the top menu: **Build > Generate Signed Bundle / APK...**
3. Select **Android App Bundle** (required by Google Play).
4. Browse to your `forex-signal-pro-release.keystore`, enter key alias and passwords.
5. Select **Release** build variant.
6. Click **Finish**. Android Studio will compile and output:
   `app-release.aab` under `android/app/release/`.

Upload this `app-release.aab` directly to Google Play Console under **Production / Internal Testing**.
