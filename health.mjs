import {METRICS,validProfile} from './body-metrics.mjs?v=20261027-body-2';
import {morningDaily,DEFAULT_HEALTH_ZONE,validTimeZone,deviceTimeZone} from './health-daily.mjs?v=20261027-suite-2';
const endpoint = 'https://floral-flower-7c16.chen-qiu.workers.dev/api/health/get';
let records = [], fetching = false, profile=null, profileRevision=null, profileReady=false, nativeState=null, settingsTimer, formDirty=false, refreshDone=Promise.resolve();
let preferences={timeZone:DEFAULT_HEALTH_ZONE},nativeZoneSent=null;
const $ = id => document.getElementById(id);
function escape(value) { return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const dateLabel = value => new Date(value).toLocaleDateString('zh-CN',{timeZone:preferences.timeZone,month:'numeric',day:'numeric'});
function draw() {
  const metric = $('bodyMetric').value, {unit,digits,span:minimumSpan,label}=METRICS[metric];
  const range = $('bodyRange').value;
  const cutoff = range === 'all' ? 0 : Date.now()-Number(range)*86400000;
  const daily=morningDaily(records,preferences.timeZone);
  const values = daily.filter(r=>Date.parse(r.measuredAt)>=cutoff && Number.isFinite(r[metric]));
  $('morningRule').textContent=`05:00 后至 12:00 前 · 每日最后一次称重 · ${preferences.timeZone}`;
  const latest = values.at(-1);
  $('bodyLatest').textContent = latest ? `${latest[metric].toFixed(digits)} ${unit}` : '—';
  $('bodyHistory').classList.toggle('hidden', !records.length);
  $('bodyHistoryRows').innerHTML = [...records].reverse().map(r=>`<tr${daily.some(d=>d.id===r.id)?' class="daily-selected"':''}><td>${escape(new Date(r.measuredAt).toLocaleString('zh-CN',{timeZone:preferences.timeZone}))}${daily.some(d=>d.id===r.id)?' · 趋势':''}</td>${['weightKg','bodyFatPct','muscleKg','waterPct','impedanceOhm'].map(k=>`<td>${Number.isFinite(r[k])?r[k].toFixed(METRICS[k].digits):'—'}</td>`).join('')}</tr>`).join('');
  if (!latest) {
    const derived=!['weightKg','impedanceOhm'].includes(metric);
    let message='晨间称重后，趋势会出现在这里';
    if(derived&&!profile)message='先在设置填写身高、年龄和性别';
    else if(!daily.length)message='还没有 05:00 后至 12:00 前的称重记录';
    else if(records.length)message=derived&&!daily.some(r=>Number.isFinite(r[metric]))?'晨间最后一次测量缺少有效阻抗':'所选范围内暂无这项数据';
    $('bodyChart').innerHTML = `<div class="body-empty"><svg viewBox="0 0 64 32" aria-hidden="true"><path d="M2 25h11l10-15 10 12 12-18 17 13"/></svg><span>${message}</span></div>`;
    $('bodyTrendSummary').textContent = `${daily.length} 天晨间记录`;
    return;
  }
  const data = values.map(r=>r[metric]);
  const min = Math.min(...data), max = Math.max(...data), span = Math.max(max-min,minimumSpan);
  const lo = min-span*.2, hi = max+span*.2;
  const t0=Date.parse(values[0].measuredAt), t1=Date.parse(latest.measuredAt);
  const width=Math.max(280,$('bodyChart').clientWidth), left=43, right=width-14;
  const points=values.map(r=>({x:t1===t0?(left+right)/2:left+(Date.parse(r.measuredAt)-t0)/(t1-t0)*(right-left),y:135-(r[metric]-lo)/(hi-lo)*110,r}));
  const line = points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const grid=[0,.5,1].map(f=>{const y=135-f*110;return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#e9eee3"/><text x="0" y="${y+4}" fill="#9caa92" font-size="11">${(lo+(hi-lo)*f).toFixed(Math.min(digits,1))}</text>`;}).join('');
  const dots=points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#5c8050"><title>${escape(new Date(p.r.measuredAt).toLocaleString('zh-CN'))} · ${p.r[metric]} ${unit}</title></circle>`).join('');
  $('bodyChart').innerHTML=`<svg viewBox="0 0 ${width} 165" role="img" aria-label="${escape(label)}趋势，${values.length}次测量"><defs><linearGradient id="body-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a4bf8d" stop-opacity=".25"/><stop offset="1" stop-color="#a4bf8d" stop-opacity="0"/></linearGradient></defs>${grid}${points.length>1?`<path d="${line} L${points.at(-1).x},135 L${points[0].x},135 Z" fill="url(#body-fill)"/><path d="${line}" fill="none" stroke="#5c8050" stroke-width="2.5"/>`:''}${dots}<text x="${left}" y="159" fill="#9caa92" font-size="11">${dateLabel(values[0].measuredAt)}</text><text x="${right}" y="159" text-anchor="end" fill="#9caa92" font-size="11">${dateLabel(latest.measuredAt)}</text></svg>`;
  const difference=latest[metric]-values[0][metric];
  $('bodyTrendSummary').textContent=(values.length>1?`${values.length} 次测量 · 较首条 ${difference>0?'+':''}${difference.toFixed(digits)} ${unit}`:'首次测量已记录')+(!['weightKg','impedanceOhm'].includes(metric)?' · 小米旧版估算':'');
}
async function refresh(force=false) {
  if(fetching){if(force===true){await refreshDone;return refresh(true);}return;}
  if(document.visibilityState !== 'visible')return;
  const key=new URLSearchParams(location.hash.slice(1)).get('calendar');
  if(!/^[a-f0-9]{64}$/.test(key||'')) return;
  fetching=true;
  let finish;refreshDone=new Promise(resolve=>{finish=resolve;});
  try {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'同步失败');
    records=(result.records||[]).filter(r=>Number.isFinite(r.weightKg)&&Number.isFinite(Date.parse(r.measuredAt))).sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt));
    preferences={timeZone:validTimeZone(nativeState?.timeZone)?nativeState.timeZone:deviceTimeZone()};
    window.dispatchEvent(new CustomEvent('daybook-health-zone',{detail:preferences.timeZone}));
    if(native()&&nativeZoneSent!==preferences.timeZone){nativeZoneSent=preferences.timeZone;nativeAction('health-config',{timeZone:preferences.timeZone});}
    profile=result.profile||null;profileRevision=result.profileRevision??null;profileReady=true;$('saveBodyProfile').disabled=false;
    if(!$('healthSettings').open||!formDirty)fillProfile();
    draw();$('bodyStatus').textContent=records.length?'已从云端同步':'';
  } catch { $('bodyStatus').textContent='身体数据暂未同步，请稍后重试'; }
  finally { fetching=false;finish(); }
}
const native=()=>{const v=navigator.userAgent.match(/DaybookAndroid\/(\d+)\.(\d+)/);return !!v&&(Number(v[1])>0||Number(v[2])>=2);};
const bookKey=()=>new URLSearchParams(location.hash.slice(1)).get('calendar');
function nativeAction(action,params={}){if(native())location.href='daybook://'+action+'?'+new URLSearchParams(params);}
function fillProfile(){
  formDirty=false;
  $('profileHeight').value=profile?.heightCm??'';$('profileAge').value=profile?profile.age+new Date().getUTCFullYear()-profile.year:'';$('profileSex').value=profile?.sex??'';
  $('profileStatus').textContent=profileReady?(profile?'已保存到当前 Book':'填写后即可生成身体成分趋势'):'正在读取云端资料…';
  $('healthZoneStatus').textContent='跟随设备系统时间 · '+preferences.timeZone;
}
function openSettings(){
  fillProfile();$('settingsBook').value=`https://chosenqc.github.io/Homepage/#calendar=${bookKey()}`;
  $('nativeScaleSettings').classList.toggle('hidden',!native());$('nativeAppUpdateRow').classList.toggle('hidden',!native());$('downloadFaq').classList.toggle('hidden',native());
  if(!$('healthSettings').open)$('healthSettings').showModal();
  nativeAction('state');clearInterval(settingsTimer);if(native())settingsTimer=setInterval(()=>nativeAction('state'),2000);
}
$('healthSettings').addEventListener('close',()=>clearInterval(settingsTimer));
$('bodyProfileForm').addEventListener('input',()=>{formDirty=true;});
$('closeHealthSettings').onclick=()=>$('healthSettings').close();
$('bodySettings').onclick=openSettings;window.addEventListener('daybook-settings',openSettings);
window.daybookSettingsReady=true;
$('bodyProfileForm').onsubmit=async event=>{
  event.preventDefault();if(!profileReady)return;
  const value={heightCm:Number($('profileHeight').value),age:Number($('profileAge').value),sex:$('profileSex').value,year:new Date().getUTCFullYear()};
  if(!validProfile(value)){ $('profileStatus').textContent='请检查身高、年龄和性别';return; }
  $('saveBodyProfile').disabled=true;$('profileStatus').textContent='正在保存…';
  try{
    const response=await fetch(endpoint.replace('/get','/profile'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:bookKey(),profile:value,revision:profileRevision}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'保存失败');
    profile=result.profile;profileRevision=result.revision;$('profileStatus').textContent='已保存，正在更新趋势';await refresh(true);$('profileStatus').textContent='已保存到云端';
  }catch(error){$('profileStatus').textContent=error.message;if(error.message.includes('其他设备')){await refresh();fillProfile();$('profileStatus').textContent='资料已更新，请核对后重新保存';}}
  finally{$('saveBodyProfile').disabled=false;}
};
$('settingsSaveBook').onclick=()=>{
  try{const u=new URL($('settingsBook').value.trim());const k=new URLSearchParams(u.hash.slice(1)).get('calendar');if(u.origin!=='https://chosenqc.github.io'||u.pathname!=='/Homepage/'||!/^[a-f0-9]{64}$/.test(k||''))throw Error();
    if(k===bookKey()){$('settingsBookStatus').textContent='当前已是这个 Book';return;}
    location.href=`https://chosenqc.github.io/Homepage/?open=${Date.now()}#calendar=${k}`;
  }catch{$('settingsBookStatus').textContent='请粘贴完整的 Daybook 同步链接';}
};
window.addEventListener('daybook-native-state',event=>{
  nativeState=event.detail;if(!nativeState)return;
  if(validTimeZone(nativeState.timeZone)&&preferences.timeZone!==nativeState.timeZone){preferences={timeZone:nativeState.timeZone};window.dispatchEvent(new CustomEvent('daybook-health-zone',{detail:preferences.timeZone}));draw();}
  $('healthZoneStatus').textContent='跟随手机系统时间 · '+preferences.timeZone;
  $('nativeScaleEnabled').checked=!!nativeState.enabled;$('nativeScaleSummary').textContent=nativeState.mac?'已绑定 · '+nativeState.mac:'尚未绑定';
  $('nativeScaleStatus').textContent=nativeState.status||'等待称重';$('nativeQueueCount').textContent=`待上传 ${nativeState.queue||0} 条`;
  $('candidateScaleRow').classList.toggle('hidden',!nativeState.candidate||nativeState.candidate===nativeState.mac);$('candidateScaleText').textContent='发现 '+(nativeState.candidate||'');
  $('nativeAppVersion').textContent='Daybook '+nativeState.version;$('nativeUpdateStatus').textContent=nativeState.updateStatus||'';
  const reminderSupported=!!nativeState.reminderSupported;$('noonReminderControls').classList.toggle('hidden',!reminderSupported);$('noonReminderUpgrade').classList.toggle('hidden',reminderSupported);
  $('noonReminderEnabled').checked=!!nativeState.noonEnabled;$('noonReminderStatus').textContent=nativeState.noonStatus||'未开启';
});
$('noonReminderEnabled').onchange=()=>nativeAction('reminder',{enabled:String($('noonReminderEnabled').checked),timeZone:preferences.timeZone});
$('noonReminderPermission').onclick=()=>nativeAction('reminder-permission',{timeZone:preferences.timeZone});
document.getElementById('testNoonReminder').onclick=()=>nativeAction('reminder-test');
$('nativeScaleEnabled').onchange=()=>nativeAction('collection',{enabled:String($('nativeScaleEnabled').checked)});
$('bindCandidateScale').onclick=()=>nativeAction('bind',{mac:nativeState?.candidate||''});
$('saveNativeMac').onclick=()=>nativeAction('bind',{mac:$('nativeScaleMac').value.trim()});
$('nativeRetryUpload').onclick=()=>nativeAction('retry');$('checkAppUpdate').onclick=()=>nativeAction('update');
$('refreshDaybook').onclick=()=>{if(native())nativeAction('refresh');else location.href=`https://chosenqc.github.io/Homepage/?refresh=${Date.now()}#calendar=${bookKey()}`;};
$('bodyMetric').onchange=draw;$('bodyRange').onchange=draw;
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('resize',draw);
window.addEventListener('daybook-tab',event=>{if(event.detail==='health'){draw();refresh();}});
window.addEventListener('daybook-sync',event=>{if(event.detail==='health')refresh(true);});
setInterval(refresh,60000);draw();refresh();
