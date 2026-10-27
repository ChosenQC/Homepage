package com.daybook.scalebridge;

import android.Manifest;
import android.app.*;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.*;
import org.json.*;
import java.time.Instant;
import java.util.*;

public final class ScaleService extends Service {
    static final String STOP="com.daybook.STOP";
    private static final ParcelUuid SERVICE=ParcelUuid.fromString("0000181b-0000-1000-8000-00805f9b34fb");
    private final Handler handler=new Handler(Looper.getMainLooper());
    private BluetoothLeScanner scanner;
    private boolean scanning;
    private String sessionId,sessionKey,time,sent="";
    private double weight;
    private Integer impedance;
    private long lastSeen;
    private final Runnable save=this::saveSession;
    private final Runnable retry=new Runnable(){public void run(){ScaleStore.flush(ScaleService.this);if(!scanning)startScan();handler.postDelayed(this,60000);}};
    private final BroadcastReceiver bluetoothState=new BroadcastReceiver(){public void onReceive(Context c,Intent i){
        if(i.getIntExtra(BluetoothAdapter.EXTRA_STATE,0)==BluetoothAdapter.STATE_ON)startScan();
        else if(i.getIntExtra(BluetoothAdapter.EXTRA_STATE,0)==BluetoothAdapter.STATE_OFF){scanning=false;scanner=null;ScaleStore.status(c,"蓝牙已关闭，打开后继续采集");}
    }};
    private final ScanCallback callback=new ScanCallback(){
        @Override public void onScanResult(int type,ScanResult result){receive(result);}
        @Override public void onBatchScanResults(List<ScanResult> results){for(ScanResult r:results)receive(r);}
        @Override public void onScanFailed(int code){scanning=false;ScaleStore.status(ScaleService.this,"蓝牙扫描暂不可用（"+code+"），稍后重试");}
    };
    @Override public void onCreate(){
        super.onCreate();
        NotificationManager nm=getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel("scale","体脂秤后台采集",NotificationManager.IMPORTANCE_LOW));
        IntentFilter filter=new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED);
        if(Build.VERSION.SDK_INT>=33)registerReceiver(bluetoothState,filter,Context.RECEIVER_EXPORTED);else registerReceiver(bluetoothState,filter);
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null && STOP.equals(intent.getAction())){ScaleStore.prefs(this).edit().putBoolean("enabled",false).apply();stopSelf();return START_NOT_STICKY;}
        if(!ScaleStore.prefs(this).getBoolean("enabled",false)){stopSelf();return START_NOT_STICKY;}
        if(checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)!=PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED){ScaleStore.status(this,"请在设置允许附近设备权限");stopSelf();return START_NOT_STICKY;}
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,ScaleService.class).setAction(STOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification=new Notification.Builder(this,"scale").setSmallIcon(android.R.drawable.ic_menu_my_calendar).setContentTitle("Daybook · 体脂秤后台采集").setContentText("等待绑定的秤 · 称重后自动同步").setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"停止采集",stop).build()).build();
        startForeground(10,notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        startScan();handler.removeCallbacks(retry);handler.post(retry);
        return START_STICKY;
    }
    private void startScan(){
        if(scanning)return;
        try{
            BluetoothManager manager=getSystemService(BluetoothManager.class);BluetoothAdapter adapter=manager==null?null:manager.getAdapter();
            if(adapter==null || !adapter.isEnabled()){ScaleStore.status(this,"请打开蓝牙");return;}
            scanner=adapter.getBluetoothLeScanner();if(scanner==null)return;
            // Service-data filtering also works when the UUID is absent from the UUID list.
            ScanFilter filter=new ScanFilter.Builder().setServiceData(SERVICE,new byte[0]).build();
            scanner.startScan(Collections.singletonList(filter),new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).setReportDelay(0).build(),callback);
            scanning=true;ScaleStore.status(this,ScaleStore.prefs(this).getString("mac","").isEmpty()?"请踩亮自己的秤，然后在设置中确认绑定":"后台等待称重");
        }catch(Exception e){scanning=false;ScaleStore.status(this,"无法扫描，请检查蓝牙和附近设备权限");}
    }
    private void receive(ScanResult result){
        if(result.getScanRecord()==null)return;
        byte[] data=result.getScanRecord().getServiceData(SERVICE);if(data==null || data.length!=13)return;
        String address=result.getDevice().getAddress();String bound=ScaleStore.prefs(this).getString("mac","");
        if(bound.isEmpty()){
            // Discovery stores only the identifier. Measurements require explicit binding.
            ScaleStore.prefs(this).edit().putString("candidate",address).apply();
            ScaleStore.status(this,"发现体脂秤 "+address+"，请在设置中确认绑定");return;
        }
        if(!address.equalsIgnoreCase(bound))return;
        if(ScalePacket.removed(data)){saveSession();sessionId=null;handler.removeCallbacks(save);return;}
        ScalePacket packet=ScalePacket.parse(data);if(packet==null)return;
        long now=SystemClock.elapsedRealtime();
        if(sessionId==null || now-lastSeen>120000 || Math.abs(weight-packet.weightKg)>.2){
            saveSession();sessionId=UUID.randomUUID().toString();sessionKey=ScaleStore.ensureKey(this);time=Instant.now().toString();weight=packet.weightKg;impedance=null;sent="";
        }
        lastSeen=now;weight=packet.weightKg;
        if(packet.impedanceOhm!=null)impedance=packet.impedanceOhm;
        if(impedance!=null){handler.removeCallbacks(save);saveSession();}
        else if(!handler.hasCallbacks(save))handler.postDelayed(save,8000);
    }
    private void saveSession(){
        if(sessionId==null)return;
        try{
            JSONObject record=new JSONObject().put("id",sessionId).put("measuredAt",time).put("weightKg",weight).put("impedanceOhm",impedance==null?JSONObject.NULL:impedance);
            String signature=record.toString();if(signature.equals(sent))return;
            if(ScaleStore.enqueue(this,sessionKey,record)){sent=signature;ScaleStore.status(this,"称重已暂存，正在同步");ScaleStore.flush(this);}
        }catch(JSONException e){ScaleStore.status(this,"称重暂存失败");}
    }
    @Override public void onDestroy(){
        saveSession();handler.removeCallbacksAndMessages(null);
        if(scanner!=null && scanning)try{scanner.stopScan(callback);}catch(Exception ignored){}
        try{unregisterReceiver(bluetoothState);}catch(Exception ignored){}
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){return null;}
}
