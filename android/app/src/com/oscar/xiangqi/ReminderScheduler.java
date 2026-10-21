package com.oscar.xiangqi;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

/** 每日提醒：用 AlarmManager 的不精确重复闹钟，省电，也不需要精确闹钟权限 */
public final class ReminderScheduler {

    private static final String PREFS = "xq_reminder";
    private static final int REQ = 1001;

    private ReminderScheduler() {}

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void schedule(Context ctx, int hour, int minute, String title, String body) {
        prefs(ctx).edit()
                .putBoolean("enabled", true)
                .putInt("hour", hour)
                .putInt("minute", minute)
                .putString("title", title == null ? "奥斯卡喊你下棋了" : title)
                .putString("body", body == null ? "棋盘在等你。" : body)
                .apply();

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        PendingIntent pi = pending(ctx);
        am.cancel(pi);

        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) {
            c.add(Calendar.DAY_OF_YEAR, 1);
        }
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    public static void cancel(Context ctx) {
        prefs(ctx).edit().putBoolean("enabled", false).apply();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx));
    }

    public static boolean isEnabled(Context ctx) {
        return prefs(ctx).getBoolean("enabled", false);
    }

    /** 重启后闹钟会被清空，开机广播里重新排一次 */
    public static void rescheduleIfNeeded(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (!sp.getBoolean("enabled", false)) return;
        schedule(ctx, sp.getInt("hour", 20), sp.getInt("minute", 0),
                sp.getString("title", "奥斯卡喊你下棋了"), sp.getString("body", "棋盘在等你。"));
    }

    static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, REQ, i, flags);
    }
}
