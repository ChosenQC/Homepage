package com.daybook.scalebridge;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;
import java.time.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import org.json.*;
public final class NoonReminder extends BroadcastReceiver {
    static final String ACTION="com.daybook.faq.NOON_CHECK";
    static String zone(Context c){return ScaleStore.prefs(c).getString("healthZone","Asia/Riyadh");}
    static boolean notificationsAllowed(Context c){NotificationManager manager=c.getSystemService(NotificationManager.class);NotificationChannel channel=manager.getNotificationChannel("morning-weight");return (Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager.areNotificationsEnabled()&&(channel==null||channel.getImportance()!=NotificationManager.IMPORTANCE_NONE);}
    static String status(Context c){
        if(!ScaleStore.prefs(c).getBoolean("noonEnabled",false))return ScaleStore.prefs(c).getString("noonError","未开启");
        if(!notificationsAllowed(c))return "请允许手机通知";
        return (c.getSystemService(AlarmManager.class).canScheduleExactAlarms()?"每日 12:00 检查":"约 12:00 检查，允许准点提醒可减少延迟")+" · "+zone(c);
    }
    static void schedule(Context c){
        AlarmManager alarms=c.getSystemService(AlarmManager.class);ZonedDateTime next=MorningWindow.nextNoon(Instant.now(),zone(c));
        Intent intent=new Intent(c,NoonReminder.class).setAction(ACTION).putExtra("day",next.toLocalDate().toString()).putExtra("book",ScaleStore.ensureKey(c));
        PendingIntent pending=PendingIntent.getBroadcast(c,220,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        if(!ScaleStore.prefs(c).getBoolean("noonEnabled",false)||!notificationsAllowed(c)){alarms.cancel(pending);return;}
        try{if(alarms.canScheduleExactAlarms())alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.toInstant().toEpochMilli(),pending);else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.toInstant().toEpochMilli(),pending);}catch(SecurityException e){alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next.toInstant().toEpochMilli(),pending);}
    }
    @Override public void onReceive(Context c,Intent intent){
        if(!ACTION.equals(intent.getAction())){schedule(c);return;}
        final String expectedDay=intent.getStringExtra("day"),book=intent.getStringExtra("book"),zone=zone(c);schedule(c);
        if(!ScaleStore.prefs(c).getBoolean("noonEnabled",false)||!ScaleStore.ensureKey(c).equals(book)||!MorningWindow.day(Instant.now(),zone).equals(expectedDay))return;
        PendingResult result=goAsync();java.util.concurrent.ExecutorService executor=Executors.newSingleThreadExecutor();executor.execute(()->{try{check(c,book,expectedDay,zone);}finally{result.finish();executor.shutdown();}});
    }
    private static void check(Context c,String book,String day,String zone){
        if(ScaleStore.hasMorning(c,book,day,zone))return;
        boolean cloudChecked=false,found=false;HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)new URL(ScaleStore.SITE_API+"/api/health/get").openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(2500);connection.setReadTimeout(5000);connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
            try(OutputStream out=connection.getOutputStream()){out.write(new JSONObject().put("key",book).toString().getBytes(StandardCharsets.UTF_8));}
            if(connection.getResponseCode()!=200)throw new IOException();
            try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>4*1024*1024)throw new IOException();}JSONObject response=new JSONObject(out.toString("UTF-8"));if(!response.optBoolean("ok"))throw new IOException();JSONArray records=response.optJSONArray("records");for(int i=0;records!=null&&i<records.length();i++){Instant time=Instant.parse(records.getJSONObject(i).getString("measuredAt"));if(MorningWindow.includes(time,zone)&&MorningWindow.day(time,zone).equals(day)){found=true;break;}}cloudChecked=true;}
        }catch(Exception ignored){}finally{if(connection!=null)connection.disconnect();}
        if(found||ScaleStore.hasMorning(c,book,day,zone)||!ScaleStore.ensureKey(c).equals(book)||!ScaleStore.prefs(c).getBoolean("noonEnabled",false))return;
        String marker=book+":"+day;if(marker.equals(ScaleStore.prefs(c).getString("noonSent","")))return;
        if(notify(c,"今天称重了吗？",cloudChecked?"还没有找到今天 05:00—12:00 的称重记录。记得保持晨间称重习惯。":"手机还未确认今天的晨间称重；联网后可查看记录。",book))ScaleStore.prefs(c).edit().putString("noonSent",marker).apply();
    }
    static boolean notify(Context c,String title,String text,String book){
        if(!notificationsAllowed(c))return false;NotificationManager manager=c.getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("morning-weight","午间称重提醒",NotificationManager.IMPORTANCE_DEFAULT));
        Intent open=new Intent(c,MainActivity.class).putExtra("openHealth",true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);PendingIntent pending=PendingIntent.getActivity(c,221,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification message=new Notification.Builder(c,"morning-weight").setSmallIcon(android.R.drawable.ic_menu_my_calendar).setContentTitle(title).setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(pending).setAutoCancel(true).build();manager.notify(221,message);return true;
    }
}
