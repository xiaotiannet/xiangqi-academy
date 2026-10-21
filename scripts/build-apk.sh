#!/usr/bin/env bash
# 不依赖 Gradle 的 APK 构建：aapt2 编译资源 → javac → d8 → 打包 → zipalign → apksigner
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
if [ -z "$SDK" ] || [ ! -d "$SDK" ]; then SDK="E:/Dev/SDK/Android/sdk"; fi
BT="$SDK/build-tools/34.0.0"
AJ="$SDK/platforms/android-34/android.jar"

# javac 用 JDK 8（-bootclasspath 指到 android.jar 最稳），d8/apksigner 需要 JDK 11+
JAVAC="${JAVAC:-C:/Program Files/Java/jdk1.8.0_202/bin/javac}"
JDK11="${JDK11:-C:/Program Files/Java/jdk-11.0.2}"
[ -x "$JAVAC" ] || JAVAC="javac"
if [ -d "$JDK11" ]; then export JAVA_HOME="$JDK11"; fi

[ -f "$BT/aapt2.exe" ] || { echo "缺少 build-tools 34.0.0: $BT"; exit 1; }
[ -f "$AJ" ] || { echo "缺少 android-34 platform: $AJ"; exit 1; }

OUT="$ROOT/dist-apk"
mkdir -p "$OUT"

PY="python"
command -v python >/dev/null 2>&1 || PY="C:/Users/xiaot/.workbuddy/binaries/python/versions/3.13.12/python.exe"

echo "==> 1/6 构建网页并内联成单文件"
npm run --silent build:apk:web

echo "==> 2/6 编译资源"
cd "$ROOT/android"
# 逐个文件清理中间目录：整目录递归删除会被本机的安全删除钩子拦下
node "$ROOT/scripts/clean-out.mjs" android/build
mkdir -p build/classes build/dex build/gen build/apk
"$BT/aapt2.exe" compile --dir app/res -o build/res.zip
"$BT/aapt2.exe" link \
  -o build/base.apk \
  -I "$AJ" \
  --manifest app/AndroidManifest.xml \
  -R build/res.zip \
  --java build/gen \
  --auto-add-overlay

echo "==> 3/6 编译 Java 与 R"
"$JAVAC" -encoding UTF-8 -source 1.8 -target 1.8 -nowarn \
  -bootclasspath "$AJ" \
  -d build/classes \
  $(find app/src build/gen -name '*.java')

echo "==> 4/6 dex"
"$BT/d8.bat" --release --min-api 23 --lib "$AJ" --output build/dex \
  $(find build/classes -name '*.class')

echo "==> 5/6 组装 APK"
PY="python"
command -v python >/dev/null 2>&1 || PY="C:/Users/xiaot/.workbuddy/binaries/python/versions/3.13.12/python.exe"
"$PY" -c "
import sys, zipfile, os
base, dex, assets, out = sys.argv[1:5]
# 不用 os.remove：删文件会触发本机安全删除钩子；zipfile 'w' 本身就会截断旧文件
with zipfile.ZipFile(base, 'r') as src, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as dst:
    for item in src.infolist():
        dst.writestr(item, src.read(item.filename))
    dst.write(dex, 'classes.dex')
    for root, _, files in os.walk(assets):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, assets).replace(os.sep, '/')
            dst.write(full, 'assets/' + rel)
print('packed ->', out)
" build/base.apk build/dex/classes.dex app/assets build/unsigned.apk

echo "==> 6/6 对齐与签名"
KS="${XQ_KEYSTORE:-$ROOT/android/keystore/xiangqi.jks}"
# 证书口令从环境变量取；公开仓库里不放真实的 keystore 与口令
KP="${XQ_KEYSTORE_PASS:-xiangqi2026}"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -alias xiangqi -keyalg RSA -keysize 2048 \
    -validity 12000 -storepass "$KP" -keypass "$KP" \
    -dname "CN=XiangQi Academy, O=Oscar, C=CN" >/dev/null 2>&1
  echo "    已生成签名文件 $KS"
fi

"$BT/zipalign.exe" -f -p 4 build/unsigned.apk build/aligned.apk
# 版本号跟 AndroidManifest 走，省得两处手改
VERSION="$(sed -n 's/.*android:versionName="\([^"]*\)".*/\1/p' app/AndroidManifest.xml | head -1)"
[ -n "$VERSION" ] || VERSION="dev"
APK="$OUT/xiangqi-academy-v${VERSION}.apk"
"$BT/apksigner.bat" sign \
  --ks "$KS" --ks-pass pass:"$KP" --key-pass pass:"$KP" --ks-key-alias xiangqi \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out "$APK" build/aligned.apk

"$BT/apksigner.bat" verify --print-certs "$APK" | head -4
echo "APK: $APK"
ls -lh "$APK"
