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
import java.util.*;

public final class MainActivity extends Activity {
    private WebView web;
    private TextView settingStatus;
    private EditText macField;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable updateSettings=new Runnable(){public void run(){if(settingStatus!=null){settingStatus.setText(ScaleStore.prefs(MainActivity.this).getString("status","尚未开启采集")+"\n待上传 "+ScaleStore.queueCount(MainActivity.this)+" 条\n发现的秤："+ScaleStore.prefs(MainActivity.this).getString("candidate","等待秤唤醒"));handler.postDelayed(this,1500);}}};
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(248,249,242));
        root.setOnApplyWindowInsetsListener((v,insets)->{android.graphics.Insets bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);return insets;});
        LinearLayout toolbar=new LinearLayout(this);toolbar.setGravity(Gravity.CENTER_VERTICAL);toolbar.setPadding(dp(18),0,dp(10),0);
        TextView title=new TextView(this);title.setText("Daybook");title.setTextSize(17);title.setTextColor(Color.rgb(48,65,45));toolbar.addView(title,new LinearLayout.LayoutParams(0,dp(44),1));title.setGravity(Gravity.CENTER_VERTICAL);
        Button settings=new Button(this);settings.setText("设置");settings.setTextSize(13);toolbar.addView(settings);settings.setOnClickListener(v->showSettings());root.addView(toolbar);
        web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(true);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setGeolocationEnabled(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);ws.setUserAgentString(ws.getUserAgentString()+" DaybookAndroid/0.1.0");
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                Uri uri=request.getUrl();
                if("daybook".equals(uri.getScheme()) && "settings".equals(uri.getHost()) && trusted(view.getUrl())){showSettings();return true;}
                if(trusted(uri.toString()))return false;
                if("https".equals(uri.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception ignored){}
                return true;
            }
            @Override public void onPageFinished(WebView view,String url){captureBook(url);}
            @Override public void doUpdateVisitedHistory(WebView view,String url,boolean reload){captureBook(url);}
        });
        web.setDownloadListener((url,ua,disposition,mime,length)->{if(trusted(url))try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception ignored){}});
        web.loadUrl(ScaleStore.SITE+"#calendar="+ScaleStore.ensureKey(this));
    }
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    private boolean trusted(String value){if(value==null)return false;Uri u=Uri.parse(value);return "https".equals(u.getScheme())&&"chosenqc.github.io".equals(u.getHost())&&u.getPath()!=null&&u.getPath().startsWith("/Homepage/");}
    private void captureBook(String url){String key=ScaleStore.keyFromLink(url);if(key!=null&&!key.equals(ScaleStore.ensureKey(this))){stopCollection();ScaleStore.prefs(this).edit().putString("key",key).apply();Toast.makeText(this,"已切换 Book，请在设置重新开启采集",Toast.LENGTH_LONG).show();}}
    private void stopCollection(){ScaleStore.prefs(this).edit().putBoolean("enabled",false).apply();stopService(new Intent(this,ScaleService.class));}
    private void startCollection(){
        ArrayList<String> missing=new ArrayList<>();
        for(String p:new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT})if(checkSelfPermission(p)!=PackageManager.PERMISSION_GRANTED)missing.add(p);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)missing.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!missing.isEmpty()){requestPermissions(missing.toArray(new String[0]),20);return;}
        ScaleStore.prefs(this).edit().putBoolean("enabled",true).apply();
        try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception e){ScaleStore.prefs(this).edit().putBoolean("enabled",false).apply();ScaleStore.status(this,"请保持应用打开后重新开启采集");}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==20){if(checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED){ScaleStore.prefs(this).edit().putBoolean("enabled",true).apply();try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception e){ScaleStore.status(this,"后台服务未能启动，请重试");}}else Toast.makeText(this,"需要附近设备权限才能读取秤",Toast.LENGTH_LONG).show();}}
    private void showSettings(){
        if(settingStatus!=null)return;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(22),dp(10),dp(22),dp(14));
        TextView bookLabel=new TextView(this);bookLabel.setText("同步 Book 链接");box.addView(bookLabel);
        EditText book=new EditText(this);book.setSingleLine(true);book.setText(ScaleStore.SITE+"#calendar="+ScaleStore.ensureKey(this));book.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_VARIATION_URI);box.addView(book);
        Button saveBook=new Button(this);saveBook.setText("保存 Book 链接");box.addView(saveBook);saveBook.setOnClickListener(v->{String key=ScaleStore.keyFromLink(book.getText().toString());if(key==null){book.setError("请粘贴完整的 Daybook 同步链接");return;}if(!key.equals(ScaleStore.ensureKey(this))){stopCollection();ScaleStore.prefs(this).edit().putString("key",key).apply();web.loadUrl(ScaleStore.SITE+"#calendar="+key);}Toast.makeText(this,"Book 已保存",Toast.LENGTH_SHORT).show();});
        TextView scaleLabel=new TextView(this);scaleLabel.setText("小米体脂秤 2 · 蓝牙地址");box.addView(scaleLabel);
        macField=new EditText(this);macField.setSingleLine(true);macField.setHint("AA:BB:CC:DD:EE:FF");macField.setText(ScaleStore.prefs(this).getString("mac",""));box.addView(macField);
        Button bind=new Button(this);bind.setText("绑定发现的秤 / 保存地址");box.addView(bind);bind.setOnClickListener(v->{String address=macField.getText().toString().trim().toUpperCase(Locale.ROOT);if(address.isEmpty())address=ScaleStore.prefs(this).getString("candidate","");if(!android.bluetooth.BluetoothAdapter.checkBluetoothAddress(address)){Toast.makeText(this,"先开启采集，再踩亮自己的秤",Toast.LENGTH_LONG).show();return;}final String selected=address;new AlertDialog.Builder(this).setTitle("确认这是你的秤？").setMessage(selected+"\n绑定后，该秤的称重会保存到当前 Book。多人共用同一台秤时也会采集到对方的称重。").setPositiveButton("确认绑定",(d,w)->{stopCollection();ScaleStore.prefs(this).edit().putString("mac",selected).apply();macField.setText(selected);startCollection();}).setNegativeButton("取消",null).show();});
        settingStatus=new TextView(this);settingStatus.setTextSize(13);settingStatus.setPadding(0,dp(10),0,dp(10));box.addView(settingStatus);
        Button enable=new Button(this);enable.setText("开启后台采集");enable.setOnClickListener(v->startCollection());box.addView(enable);
        Button disable=new Button(this);disable.setText("停止采集");disable.setOnClickListener(v->{stopCollection();ScaleStore.status(this,"采集已停止");});box.addView(disable);
        Button resend=new Button(this);resend.setText("重传待上传记录");resend.setOnClickListener(v->ScaleStore.flush(this));box.addView(resend);
        TextView hint=new TextView(this);hint.setText("首次使用：粘贴原 Book 链接 → 开启采集 → 踩亮秤 → 绑定 → 再次称重。\nOPPO 请允许 Daybook 后台活动；重启或强制停止后打开一次 App。离线称重先保存在手机，联网后重传。");hint.setTextSize(12);box.addView(hint);
        ScrollView scroll=new ScrollView(this);scroll.addView(box);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("设置").setView(scroll).setPositiveButton("完成",null).create();
        dialog.setOnDismissListener(d->{settingStatus=null;macField=null;handler.removeCallbacks(updateSettings);});dialog.show();handler.post(updateSettings);
    }
    @Override public void onResume(){super.onResume();ScaleStore.flush(this);if(ScaleStore.prefs(this).getBoolean("enabled",false)&&checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED)try{startForegroundService(new Intent(this,ScaleService.class));}catch(Exception ignored){}}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);web.destroy();super.onDestroy();}
}
