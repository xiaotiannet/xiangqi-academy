package com.oscar.xiangqi;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机后把每日提醒重新挂上 */
public class BootReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            ReminderScheduler.rescheduleIfNeeded(context);
        }
    }
}
