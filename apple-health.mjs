import {activityDays,sleepDays,localDay} from './apple-health-data.mjs?v=20261028-apple-2';
import {deviceTimeZone} from './health-daily.mjs?v=20261027-suite-2';
const API='https://floral-flower-7c16.chen-qiu.workers.dev/api/apple/', $=id=>document.getElementById(id);
let zone=deviceTimeZone(),records=[],meta=null,loading=false,active=false,connection=null,connecting=false;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=()=>new URLSearchParams(location.hash.slice(1)).get('calendar');
async function api(route,data={}){const r=await fetch(API+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:key(),...data}),signal:AbortSignal.timeout(25000)});const result=await r.json();if(!r.ok||!result.ok)throw Error(result.error||'苹果健康同步失败');return result;}
const time=value=>new Date(value).toLocaleString('zh-CN',{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
const duration=minutes=>{const m=Math.round(minutes);return `${Math.floor(m/60)} 小时 ${m%60} 分钟`;};
function daysEnding(day){const d=new Date(day+'T12:00:00Z');return Array.from({length:7},(_,i)=>{const v=new Date(d);v.setUTCDate(d.getUTCDate()-6+i);return v.toISOString().slice(0,10);});}
function bars(id,days,series,field,unit){const map=new Map(series.map(x=>[x.day,x])),max=Math.max(1,...days.map(d=>map.get(d)?.[field]||0));$(id).innerHTML=days.map(day=>{const value=map.get(day)?.[field],missing=value===undefined;return `<button type="button" class="apple-bar${missing?' missing':''}" data-health-day="${day}" aria-label="${day}，${missing?'没有记录':Math.round(value)+' '+unit}"><span class="apple-bar-track"><i style="height:${missing?0:Math.max(2,value/max*100)}%"></i>${missing?'<b>—</b>':''}</span><small>${Number(day.slice(5,7))}/${Number(day.slice(8))}</small></button>`;}).join('');for(const b of $(id).querySelectorAll('button'))b.onclick=()=>{$('appleHealthDay').value=b.dataset.healthDay;draw();};}
function draw(){
  const day=$('appleHealthDay').value||localDay(Date.now(),zone),days=daysEnding(day),energy=activityDays(records,zone),sleep=sleepDays(records,zone),e=energy.find(x=>x.day===day),s=sleep.find(x=>x.day===day);
  $('appleEnergyValue').textContent=e?Math.round(e.kcal).toLocaleString():'—';$('appleSleepValue').textContent=s?duration(s.minutes):'—';
  $('appleEnergyDetail').textContent=e?`${e.samples} 条样本 · 记录到 ${time(e.lastAt)}${e.multipleSources?' · 优先采用手表来源':''}`:'这一天没有活动热量记录';
  $('appleSleepDetail').textContent=s?`${time(s.start)} — ${time(s.end)} · 按醒来日归档`:'这一天没有可用的睡眠记录';
  bars('appleEnergyChart',days,energy,'kcal','千卡');bars('appleSleepChart',days,sleep,'minutes','分钟');
  const labels={deep:'深睡',rem:'REM',core:'核心睡眠',asleep:'未分期'};
  $('appleSleepStages').innerHTML=s?Object.entries(labels).filter(([stage])=>s.stages[stage]>0).map(([stage,label])=>`<span class="stage-${stage}"><i></i>${label} ${Math.round(s.stages[stage])} 分</span>`).join(''):'';
  if(meta){$('appleHealthStatus').textContent=meta.lastSync?`最近同步 ${time(meta.lastSync)}`:meta.connected?'连接已生成，等待 iPhone 首次上传':'连接 iPhone 快捷指令后显示记录';if(meta.lastCounts?.energy===0&&meta.lastCounts?.sleep===0)$('appleHealthStatus').textContent+=' · 上次未读到样本，请检查健康权限和日期范围';if(meta.lastCounts?.unknownSleep)$('appleHealthStatus').textContent+=` · ${meta.lastCounts.unknownSleep} 条睡眠阶段待识别，未计入时长`;}
}
async function refresh(){if(loading||document.visibilityState!=='visible')return;loading=true;try{const result=await api('get');records=result.records||[];meta=result;draw();}catch(error){$('appleHealthStatus').textContent=error.message;}finally{loading=false;}}
$('appleHealthDay').value=localDay(Date.now(),zone);$('appleHealthDay').onchange=draw;
function showConnection(){
  $('appleUploadURL').value=connection?.endpoint||API+'ingest';$('appleUploadToken').value=connection?.token||'';
  $('appleConnectionStatus').textContent=connection?'把连接码填到快捷指令的 token 字段。':'在 iPhone 上按下面步骤配置一次。';$('copyAppleToken').disabled=!connection;$('appleSyncDialog').showModal();
}
$('connectAppleHealth').onclick=async()=>{showConnection();if(connection||connecting)return;connecting=true;$('appleConnectionStatus').textContent='正在生成连接码…';try{connection=await api('connect');showConnection();}catch(error){$('appleConnectionStatus').textContent=error.message;}finally{connecting=false;}};
$('closeAppleSync').onclick=()=>$('appleSyncDialog').close();
async function copy(value,message){try{await navigator.clipboard.writeText(value);$('appleConnectionStatus').textContent=message;}catch{$('appleConnectionStatus').textContent='请长按输入框，选择并复制。';}}
$('copyAppleToken').onclick=()=>copy(connection.token,'连接码已复制');$('copyAppleURL').onclick=()=>copy($('appleUploadURL').value,'上传地址已复制');
$('rotateAppleToken').onclick=async()=>{const b=$('rotateAppleToken');b.disabled=true;try{connection=await api('rotate');showConnection();$('appleConnectionStatus').textContent='新连接码已生成，旧快捷指令需替换 token；历史数据保留。';}catch(error){$('appleConnectionStatus').textContent=error.message;}finally{b.disabled=false;}};
$('appleRefresh').onclick=refresh;
window.addEventListener('daybook-tab',e=>{active=e.detail==='health';if(active)refresh();});window.addEventListener('daybook-sync',e=>{if(e.detail==='health')refresh();});
window.addEventListener('daybook-health-zone',e=>{zone=e.detail||deviceTimeZone();draw();});window.addEventListener('focus',()=>{if(active)refresh();});document.addEventListener('visibilitychange',()=>{if(active)refresh();});setInterval(()=>{if(active)refresh();},60000);
draw();if(new URLSearchParams(location.hash.slice(1)).get('tab')==='health'){active=true;refresh();}
