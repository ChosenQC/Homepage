package com.daybook.scalebridge;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

final class ScaleStore {
    static final String SITE="https://chosenqc.github.io/Homepage/";
    static final String API="https://floral-flower-7c16.chen-qiu.workers.dev/api/health/ingest";
    private static final ExecutorService NETWORK=Executors.newSingleThreadExecutor();
    private static final AtomicBoolean SENDING=new AtomicBoolean(false);
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("daybook",Context.MODE_PRIVATE); }
    static String keyFromLink(String text) {
        String value=text.trim();
        if(value.matches("[a-f0-9]{64}")) return value;
        try { android.net.Uri u=android.net.Uri.parse(value); if(!"https".equals(u.getScheme()) || !"chosenqc.github.io".equals(u.getHost()) || !u.getPath().startsWith("/Homepage/")) return null;
            String key=android.net.Uri.parse("https://local/?"+u.getFragment()).getQueryParameter("calendar");
            return key!=null && key.matches("[a-f0-9]{64}")?key:null;
        } catch(Exception e) { return null; }
    }
    static String ensureKey(Context c) {
        String key=prefs(c).getString("key","");
        if(!key.matches("[a-f0-9]{64}")) { byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder b=new StringBuilder();for(byte v:bytes)b.append(String.format("%02x",v&255));key=b.toString();prefs(c).edit().putString("key",key).apply(); }
        return key;
    }
    static void status(Context c,String text) { prefs(c).edit().putString("status",text).apply(); }
    private static JSONArray queue(Context c) { try { return new JSONArray(prefs(c).getString("queue","[]")); }catch(Exception e){return new JSONArray();} }
    static synchronized int queueCount(Context c) { return queue(c).length(); }
    static synchronized boolean enqueue(Context c,String key,JSONObject measurement) {
        JSONArray q=queue(c);String id=measurement.optString("id");
        try {
            JSONObject item=new JSONObject().put("key",key).put("measurement",measurement);
            for(int i=0;i<q.length();i++) if(q.getJSONObject(i).optString("key").equals(key) && q.getJSONObject(i).getJSONObject("measurement").optString("id").equals(id)) {q.put(i,item);prefs(c).edit().putString("queue",q.toString()).commit();return true;}
            if(q.length()>=100) {status(c,"待传记录已满，请联网后重传");return false;}
            q.put(item);return prefs(c).edit().putString("queue",q.toString()).commit();
        } catch(Exception e) {status(c,"本地暂存失败，请检查剩余空间");return false;}
    }
    private static synchronized JSONObject first(Context c) { JSONArray q=queue(c);return q.optJSONObject(0); }
    private static synchronized void acknowledge(Context c,JSONObject sent) {
        JSONArray q=queue(c),next=new JSONArray();
        for(int i=0;i<q.length();i++) {JSONObject item=q.optJSONObject(i);if(item!=null && !item.toString().equals(sent.toString()))next.put(item);}
        prefs(c).edit().putString("queue",next.toString()).commit();
    }
    static void flush(Context context) {
        final Context c=context.getApplicationContext();
        if(!SENDING.compareAndSet(false,true))return;
        NETWORK.execute(()->{
            try {
                for(int n=0;n<100;n++) {
                    JSONObject item=first(c);if(item==null)break;
                    HttpURLConnection connection=null;
                    try {
                        connection=(HttpURLConnection)new URL(API).openConnection();
                        connection.setInstanceFollowRedirects(false);connection.setRequestMethod("POST");connection.setConnectTimeout(10000);connection.setReadTimeout(20000);connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");
                        try(OutputStream out=connection.getOutputStream()){out.write(item.toString().getBytes(StandardCharsets.UTF_8));}
                        int code=connection.getResponseCode();
                        if(code!=200)throw new IOException("HTTP "+code);
                        try(InputStream in=connection.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){byte[] buffer=new byte[2048];int nread;while((nread=in.read(buffer))!=-1)bytes.write(buffer,0,nread);JSONObject result=new JSONObject(bytes.toString("UTF-8"));if(!result.optBoolean("ok"))throw new IOException("服务器未确认保存");}
                        acknowledge(c,item);status(c,"已上传到云端 · "+java.time.LocalTime.now().withNano(0));
                    } catch(Exception e) {status(c,"上传暂未完成，记录已保留（"+e.getMessage()+"）");break;}
                    finally {if(connection!=null)connection.disconnect();}
                }
            } finally {SENDING.set(false);}
        });
    }
}
