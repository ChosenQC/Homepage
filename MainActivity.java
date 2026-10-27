package com.daybook.scalebridge;
import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.util.*;
public final class MainActivity extends Activity {
    private WebView web;
    private AppUpdater updater;
    @Override public void onCreate(Bundle state){
        setTheme(R.style.Daybook);super.onCreate(state);updater=new AppUpdater(this);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(248,249,242));
        root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(20),0,dp(12),0);
        TextView title=new TextView(this);title.setText("Daybook");title.setTextSize(17);title.setTextColor(Color.rgb(48,65,45));title.setGravity(Gravity.CENTER_VERTICAL);bar.addView(title,new LinearLayout.LayoutParams(0,dp(44),1));
        TextView settings=new TextView(this);settings.setText("设置");settings.setTextSize(13);settings.setTextColor(Color.rgb(91,119,74));settings.setGravity(Gravity.CENTER);settings.setPadding(dp(16),dp(12),dp(16),dp(12));bar.addView(settings);settings.setOnClickListener(v->showSettings());root.addView(bar);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setGeolocationEnabled(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);ws.setCacheMode(WebSettings.LOAD_NO_CACHE);ws.setUserAgentString(ws.getUserAgentString()+" DaybookAndroid/0.2.0");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();if("daybook".equals(uri.getScheme())){if(request.isForMainFrame()&&trusted(view.getUrl()))handleAction(uri);return true;}
                if(trusted(uri.toString()))return false;
                if(request.isForMainFrame()&&"https".equals(uri.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}return true;
            }
            @Override public void onPageFinished(WebView view,String url){captureBook(url);sendState();}
            @Override public void doUpdateVisitedHistory(WebView view,String url,boolean reload){captureBook(url);}
        });
        web.setDownloadListener((url,ua,disposition,mime,length)->{if(trusted(url))try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}});
        web.loadUrl(ScaleStore.SITE+"?app=0.2.0#calendar="+ScaleStore.ensureKey(this));
    }
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private boolean trusted(String value){if(value==null)return false;Uri u=Uri.parse(value);return "https".equals(u.getScheme())&&"chosenqc.github.io".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/Homepage/");}
    private void captureBook(String url){String key=ScaleStore.keyFromLink(url);if(key!=null&&!key.equals(ScaleStore.ensureKey(this))){stopCollection();ScaleStore.prefs(this).edit().putString("key",key).apply();Toast.makeText(this,"已切换 Book，请重新开启采集",Toast.LENGTH_LONG).show();}}
    private void showSettings(){if(!trusted(web.getUrl()))return;web.evaluateJavascript("Boolean(window.daybookSettingsReady)",value->{if("true".equals(value)){web.evaluateJavascript("window.dispatchEvent(new Event('daybook-settings'))",null);sendState();}else Toast.makeText(this,"设置正在加载，请联网后重试",Toast.LENGTH_LONG).show();});}
    private void handleAction(Uri uri){
        String action=uri.getHost();if("settings".equals(action)){showSettings();return;}
        if("collection".equals(action)){if("true".equals(uri.getQueryParameter("enabled")))startCollection();else{stopCollection();ScaleStore.status(this,"采集已停止");}}
        else if("bind".equals(action)){
            String value=uri.getQueryParameter("mac");String mac=value==null?"":value.trim().toUpperCase(Locale.ROOT);
            if(!android.bluetooth.BluetoothAdapter.checkBluetoothAddress(mac)){Toast.makeText(this,"请先踩亮自己的秤，或填写有效地址",Toast.LENGTH_LONG).show();return;}
            new AlertDialog.Builder(this).setTitle("绑定这台体脂秤？").setMessage(mac+"\n确认它是你的秤。绑定后，测量将保存到当前 Book。").setNegativeButton("取消",null).setPositiveButton("确认绑定",(d,w)->{stopCollection();ScaleStore.prefs(this).edit().putString("mac",mac).apply();startCollection();sendState();}).show();
        }
        else if("retry".equals(action))ScaleStore.flush(this);
        else if("refresh".equals(action)){web.clearCache(false);web.reload();return;}
        else if("update".equals(action))updater.check();sendState();
    }
    private void stopCollection(){ScaleStore.prefs(this).edit().putBoolean("enabled",false).apply();stopService(new Intent(this,ScaleService.class));}
    private void startCollection(){
        ArrayList<String> missing=new ArrayList<>();for(String p:new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT})if(checkSelfPermission(p)!=PackageManager.PERMISSION_GRANTED)missing.add(p);
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)missing.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!missing.isEmpty()){requestPermissions(missing.toArray(new String[0]),20);return;}
        ScaleStore.prefs(this).edit().putBoolean("enabled",true).apply();try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception e){ScaleStore.prefs(this).edit().putBoolean("enabled",false).apply();ScaleStore.status(this,"请保持应用打开后重新开启采集");}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==20){if(checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED){ScaleStore.prefs(this).edit().putBoolean("enabled",true).apply();try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception e){ScaleStore.status(this,"后台服务未启动，请重试");}}else ScaleStore.status(this,"需要附近设备权限才能读取秤");sendState();}}
    void sendState(){
        if(web==null||!trusted(web.getUrl()))return;
        try{android.content.SharedPreferences p=ScaleStore.prefs(this);JSONObject data=new JSONObject().put("enabled",p.getBoolean("enabled",false)).put("mac",p.getString("mac","")).put("candidate",p.getString("candidate","")).put("status",p.getString("status","尚未开启采集")).put("queue",ScaleStore.queueCount(this)).put("version",getPackageManager().getPackageInfo(getPackageName(),0).versionName).put("updateStatus",p.getString("updateStatus",""));web.evaluateJavascript("window.dispatchEvent(new CustomEvent('daybook-native-state',{detail:"+data+"}))",null);}catch(Exception ignored){}
    }
    @Override public void onResume(){super.onResume();ScaleStore.flush(this);if(updater!=null)updater.resumeInstall();if(ScaleStore.prefs(this).getBoolean("enabled",false)&&checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED)try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception ignored){}sendState();}
    @Override public void onBackPressed(){web.evaluateJavascript("Boolean(document.getElementById('healthSettings')?.open)",value->{if("true".equals(value))web.evaluateJavascript("document.getElementById('healthSettings').close()",null);else if(web.canGoBack())web.goBack();else finish();});}
    @Override public void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
