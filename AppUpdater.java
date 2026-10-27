package com.daybook.scalebridge;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.provider.Settings;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.concurrent.*;
import org.json.*;
final class AppUpdater {
    private final MainActivity activity;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private volatile boolean busy;
    private boolean pendingInstall;
    private File verified;
    AppUpdater(MainActivity activity){this.activity=activity;}
    private void status(String value){ScaleStore.prefs(activity).edit().putString("updateStatus",value).apply();activity.runOnUiThread(activity::sendState);}
    static boolean trusted(String url){try{URI u=new URI(url);return "https".equals(u.getScheme())&&"chosenqc.github.io".equals(u.getHost())&&u.getUserInfo()==null&&u.getPort()==-1&&u.getPath().startsWith("/Homepage/");}catch(Exception e){return false;}}
    private HttpURLConnection connection(String url)throws Exception{
        if(!trusted(url))throw new IOException("更新地址无效");HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(20000);if(c.getResponseCode()!=200){c.disconnect();throw new IOException("暂时无法连接更新服务器");}return c;
    }
    void check(){
        if(busy)return;busy=true;status("正在检查应用版本…");network.execute(()->{
            try{
                HttpURLConnection c=connection(ScaleStore.SITE+"android-version.json?check="+System.currentTimeMillis());JSONObject version;
                try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[2048];int n;while((n=in.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>16384)throw new IOException("版本信息过大");}version=new JSONObject(out.toString("UTF-8"));}finally{c.disconnect();}
                long current=activity.getPackageManager().getPackageInfo(activity.getPackageName(),0).getLongVersionCode();
                if(!activity.getPackageName().equals(version.optString("packageName")))throw new IOException("更新不适用于当前应用");
                if(version.getLong("versionCode")<=current){status("应用已是最新版；界面与算法可直接刷新");return;}
                String url=version.getString("url"),sha=version.getString("sha256");if(!trusted(url)||!sha.matches("[a-f0-9]{64}"))throw new IOException("更新信息无效");status("发现新版本 "+version.optString("versionName"));
                activity.runOnUiThread(()->{if(activity.isFinishing()||activity.isDestroyed())return;new AlertDialog.Builder(activity).setTitle("更新 Daybook "+version.optString("versionName")).setMessage(version.optString("notes","应用更新")).setNegativeButton("稍后",null).setPositiveButton("下载并安装",(d,w)->download(url,sha)).show();});
            }catch(Exception e){status("检查未完成："+e.getMessage());}finally{busy=false;}
        });
    }
    private void download(String url,String sha){
        if(busy)return;busy=true;status("正在下载安装包…");network.execute(()->{
            File temp=new File(activity.getExternalFilesDir("updates"),"update.download");
            try{
                HttpURLConnection c=connection(url);MessageDigest digest=MessageDigest.getInstance("SHA-256");
                try(InputStream in=c.getInputStream();OutputStream out=new FileOutputStream(temp)){byte[] buffer=new byte[16384];int n;long total=0;while((n=in.read(buffer))!=-1){total+=n;if(total>50*1024*1024)throw new IOException("安装包超过允许大小");digest.update(buffer,0,n);out.write(buffer,0,n);}}finally{c.disconnect();}
                StringBuilder actual=new StringBuilder();for(byte b:digest.digest())actual.append(String.format("%02x",b&255));if(!sha.equals(actual.toString()))throw new IOException("安装包校验失败，请重新检查更新");
                android.content.pm.PackageManager pm=activity.getPackageManager();
                android.content.pm.PackageInfo incoming=pm.getPackageArchiveInfo(temp.getAbsolutePath(),android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES);
                android.content.pm.PackageInfo installed=pm.getPackageInfo(activity.getPackageName(),android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES);
                if(incoming==null||!activity.getPackageName().equals(incoming.packageName)||incoming.getLongVersionCode()<=installed.getLongVersionCode()||incoming.signingInfo==null||installed.signingInfo==null||!java.util.Arrays.equals(incoming.signingInfo.getApkContentsSigners()[0].toByteArray(),installed.signingInfo.getApkContentsSigners()[0].toByteArray()))throw new IOException("安装包名称、版本或签名不匹配");
                File target=new File(temp.getParentFile(),"update.apk");if(target.exists()&&!target.delete())throw new IOException("旧安装包无法替换");if(!temp.renameTo(target))throw new IOException("无法保存安装包");verified=target;status("下载校验完成，等待系统安装确认");activity.runOnUiThread(this::install);
            }catch(Exception e){temp.delete();status("更新未完成："+e.getMessage());}finally{busy=false;}
        });
    }
    private void install(){
        if(verified==null||!verified.isFile()||activity.isFinishing())return;
        if(!activity.getPackageManager().canRequestPackageInstalls()){
            new AlertDialog.Builder(activity).setTitle("允许应用内更新").setMessage("请在系统中允许 Daybook 安装更新，然后返回。每次更新仍由系统确认安装。").setNegativeButton("稍后",null).setPositiveButton("打开系统设置",(d,w)->{pendingInstall=true;activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())));}).show();return;
        }
        try{Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("content://"+activity.getPackageName()+".updates/update.apk"),"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);activity.startActivity(intent);}catch(Exception e){status("无法打开系统安装器，请稍后重试");}
    }
    void resumeInstall(){if(pendingInstall){pendingInstall=false;if(activity.getPackageManager().canRequestPackageInstalls())install();}}
}
