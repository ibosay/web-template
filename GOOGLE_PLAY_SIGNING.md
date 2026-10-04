# Quiz Arena Google Play signing

This file documents the secure signing setup for Android version 1.0.0.

## Recommended model

Use Google Play App Signing for the app signing key.

Keep a separate upload key for signing the Android App Bundle before it is uploaded to Google Play.

Do not commit the upload keystore or any signing password to this repository.

## Repository protection

The Android gitignore excludes:

1. *.jks
2. *.keystore
3. keystore.properties

## Build configuration

The Android release build can read signing credentials from environment variables or Gradle properties.

Required names:

QUIZ_ARENA_UPLOAD_KEYSTORE

QUIZ_ARENA_UPLOAD_STORE_PASSWORD

QUIZ_ARENA_UPLOAD_KEY_ALIAS

QUIZ_ARENA_UPLOAD_KEY_PASSWORD

All four values must be present before Gradle applies the release signing configuration.

If any value is missing, the repository can still build an unsigned release bundle for verification.

## Local release build

Store the upload keystore outside the repository.

Provide the four signing values through your local environment or your private user Gradle properties.

Then build:

./gradlew bundleRelease

## Google Play release

Before the first upload:

1. Create the app in Google Play Console.
2. Use Play App Signing.
3. Create a separate upload key in Android Studio or with keytool.
4. Keep the private upload keystore in secure private storage.
5. Export the public upload certificate if Google Play requests it.
6. Sign the release bundle with the upload key.
7. Upload the signed .aab to Google Play Console.
8. Confirm package name at.ibosay.quiz.
9. Confirm version code 1 and version name 1.0.0.
10. Complete internal testing before production release.

## Key security

Never place the upload keystore, passwords, private key or signing secrets in Git.

If the upload key is lost or compromised, use Google Play's upload key reset process rather than changing the application package name.

## Release gate

Android signing is complete only when:

1. Play App Signing is configured.
2. A secure upload key exists.
3. A signed release .aab is produced.
4. The signed .aab is accepted by Google Play Console.
5. Internal testing passes on a physical Android device.
