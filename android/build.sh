#!/usr/bin/env bash
# Qor (Android) — APK yig'ish skripti. Gradle talab qilinmaydi:
# aapt2 + javac + d8 + zipalign + apksigner yetarli.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_SDK:-$ROOT/../.android-sdk}"
BT_VERSION="${BUILD_TOOLS:-35.0.0}"
PLATFORM_VERSION="${PLATFORM:-android-34}"
BT="$SDK/build-tools/$BT_VERSION"
ANDROID_JAR="$SDK/platforms/$PLATFORM_VERSION/android.jar"
OUT="$ROOT/build"
DIST="$(cd "$ROOT/.." && pwd)/dist-android"
VERSION="1.0.0"
APK_NAME="Qor-$VERSION.apk"

pick() { if [ -f "$1.exe" ]; then echo "$1.exe"; elif [ -f "$1.bat" ]; then echo "$1.bat"; else echo "$1"; fi; }
AAPT2="$(pick "$BT/aapt2")"
ZIPALIGN="$(pick "$BT/zipalign")"
APKSIGNER="$(pick "$BT/apksigner")"

[ -f "$AAPT2" ] || { echo "aapt2 topilmadi: $BT"; exit 1; }
[ -f "$ANDROID_JAR" ] || { echo "android.jar topilmadi: $ANDROID_JAR"; exit 1; }

echo "==> tozalash"
rm -rf "$OUT"
mkdir -p "$OUT/compiled" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$DIST"

echo "==> resurslarni kompilyatsiya (aapt2)"
"$AAPT2" compile --dir "$ROOT/res" -o "$OUT/compiled/res.zip"

echo "==> link (aapt2) + R.java"
"$AAPT2" link \
  -o "$OUT/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT/AndroidManifest.xml" \
  -R "$OUT/compiled/res.zip" \
  --java "$OUT/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --version-code 1 \
  --version-name "$VERSION" \
  --auto-add-overlay

echo "==> javac"
cd "$ROOT"
ANDROID_JAR_WIN="$(cygpath -w "$ANDROID_JAR")"
find java build/gen -name '*.java' > build/sources.txt
javac -encoding UTF-8 --release 11 -nowarn \
  -classpath "$ANDROID_JAR_WIN" \
  -d build/classes \
  @build/sources.txt

echo "==> d8 (dex)"
find build/classes -name '*.class' > build/classes.txt
java -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --min-api 24 \
  --lib "$ANDROID_JAR_WIN" --output build/dex @build/classes.txt

echo "==> classes.dex ni APK ga qo'shish"
cp "$OUT/base.apk" "$OUT/unsigned.apk"
python - "$OUT/unsigned.apk" "$OUT/dex/classes.dex" <<'PY'
import sys, zipfile
apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(dex, 'classes.dex')
print('classes.dex qo\'shildi')
PY

echo "==> zipalign"
KS="$ROOT/debug.keystore"
if [ ! -f "$KS" ]; then
  echo "==> kalit yaratish (debug.keystore)"
  keytool -genkeypair -v -keystore "$KS" -alias qor -keyalg RSA -keysize 2048 \
    -validity 10000 -storepass qorqorqor -keypass qorqorqor \
    -dname "CN=Qor, OU=Qor, O=Qor, L=Tashkent, C=UZ" > /dev/null 2>&1
fi

"$ZIPALIGN" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "==> imzolash (apksigner)"
"$APKSIGNER" sign \
  --ks "$KS" --ks-pass pass:qorqorqor --key-pass pass:qorqorqor \
  --out "$DIST/$APK_NAME" "$OUT/aligned.apk"

echo "==> tekshirish"
"$APKSIGNER" verify "$DIST/$APK_NAME"
"$AAPT2" dump badging "$DIST/$APK_NAME" | head -3

ls -la "$DIST/$APK_NAME"
echo "TAYYOR: $DIST/$APK_NAME"
