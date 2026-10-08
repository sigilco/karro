# Android deploy

`.github/workflows/android.yml` builds `app-debug.apk` and `app-release.aab` on
`ubuntu-latest` and uploads them as the `karro-android` workflow artifact. A
second job, `play-internal`, pushes the AAB to the Google Play **internal**
track via `fastlane supply`.

## Required secrets

Set these under **Settings -> Secrets and variables -> Actions**:

| Secret / variable | Type | Required | Purpose |
| --- | --- | --- | --- |
| `PLAY_SERVICE_ACCOUNT_JSON` | secret | for `play-internal` | Full contents of a Google Play service-account key JSON. If absent, the job prints a notice and skips every upload step (exit green). |
| `PLAY_PACKAGE_NAME` | variable | optional | Application id on Play Console. Defaults to `com.sigilco.karro` (`android.package` in `app.json`). |

### Creating the service account

1. Google Cloud Console -> IAM -> Service Accounts -> create one, then create a
   JSON key for it.
2. Play Console -> Setup -> API access -> link the GCP project, then grant the
   account "Release apps to testing tracks" (internal) permission on the app.
3. Paste the entire JSON file into the `PLAY_SERVICE_ACCOUNT_JSON` secret.

The upload runs `fastlane supply --track internal --release_status draft`, so
the first upload lands as a draft release you promote by hand. Internal track
requires the app to already exist in Play Console and its package name to match
the signing key's upload certificate; the workflow currently signs with the
debug keystore, which is fine for CI artifacts but **not** for a real Play
upload — generate an upload keystore before pointing this at production.

## Running locally

```bash
pnpm install
cd android && ./gradlew assembleDebug bundleRelease
fastlane supply --track internal --release_status draft \
  --aab app/build/outputs/bundle/release/app-release.aab \
  --package_name com.sigilco.karro \
  --json_key_data "$PLAY_SERVICE_ACCOUNT_JSON"
```

## Notes

- `android/` is generated (`one prebuild`) and gitignored; the workflow
  regenerates it when `android/gradlew` is missing and skips prebuild when the
  directory is checked in.
- Maven Central rate-limits (HTTP 429) some egress IPs. If Gradle dependency
  downloads fail locally, use a mirror via `~/.gradle/init.d/mirrors.gradle` —
  keep the full Gradle module metadata (`.module`) enabled or KGP's
  Gradle-variant resolution silently degrades.
