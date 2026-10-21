package com.oscar.xiangqi;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.util.Log;
import android.view.View;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.Locale;

public class MainActivity extends Activity {

    private WebView web;
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(0xFFFFFFFF);
        getWindow().setNavigationBarColor(0xFFFFFFFF);
        if (Build.VERSION.SDK_INT >= 23) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        web = new WebView(this);
        web.setBackgroundColor(0xFFFFFFFF);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        @SuppressWarnings("deprecation")
        WebSettings deprecated = s;
        try {
            deprecated.setAllowFileAccessFromFileURLs(true);
            deprecated.setAllowUniversalAccessFromFileURLs(true);
        } catch (Throwable ignored) {
            // 高版本已移除该开关，单文件构建本身不依赖它
        }

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            /** 把网页控制台输出转到 logcat，白屏时 adb logcat -s XQWeb 就能定位 */
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                if (m == null) return false;
                Log.i("XQWeb", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        // 允许 chrome://inspect 远程调试（真机排障用；仅本机 adb 可达）
        if (Build.VERSION.SDK_INT >= 19) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web.addJavascriptInterface(new Bridge(), "XQNative");

        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    ttsReady = false;
                    return;
                }
                int r = tts.setLanguage(new Locale("zh", "CN"));
                ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            }
        });

        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 101);
        }

        ReminderScheduler.rescheduleIfNeeded(this);
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 切后台 / 锁屏：通知网页暂停对局计时。
        // 不调用 web.onPause()，否则会把刚投递的脚本一起冻住。
        if (web != null) {
            web.evaluateJavascript("window.XQAppState&&window.XQAppState('pause')", null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.evaluateJavascript("window.XQAppState&&window.XQAppState('resume')", null);
        }
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return (window.XQBack&&window.XQBack())||'exit';}catch(e){return 'exit';}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || value.contains("exit")) {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Throwable ignored) {
            }
            tts = null;
        }
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    /** 暴露给网页的原生能力：语音、震动、每日提醒 */
    private class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public void speak(final String text, final float pitch, final float rate) {
            if (text == null || text.length() == 0) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (tts != null && ttsReady) {
                        tts.setPitch(pitch <= 0 ? 1f : pitch);
                        tts.setSpeechRate(rate <= 0 ? 1f : rate);
                        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "oscar");
                    }
                }
            });
        }

        @JavascriptInterface
        public void stopSpeak() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (tts != null) tts.stop();
                }
            });
        }

        @JavascriptInterface
        public void vibrate(final int ms) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                    if (v == null || !v.hasVibrator()) return;
                    try {
                        if (Build.VERSION.SDK_INT >= 26) {
                            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                        } else {
                            v.vibrate(ms);
                        }
                    } catch (Throwable ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void scheduleReminder(int hour, int minute, String title, String body) {
            ReminderScheduler.schedule(MainActivity.this, hour, minute, title, body);
        }

        @JavascriptInterface
        public void cancelReminder() {
            ReminderScheduler.cancel(MainActivity.this);
        }

        @JavascriptInterface
        public void requestNotifications() {
            if (Build.VERSION.SDK_INT >= 33) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 102);
                    }
                });
            }
        }
    }
}
