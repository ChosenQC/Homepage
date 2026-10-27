const endpoint = 'https://floral-flower-7c16.chen-qiu.workers.dev/api/health/get';
let records = [], fetching = false;
const $ = id => document.getElementById(id);
function escape(value) { return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const dateLabel = value => new Date(value).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
function draw() {
  const metric = $('bodyMetric').value, unit = metric === 'weightKg' ? 'kg' : 'Ω';
  const range = $('bodyRange').value;
  const cutoff = range === 'all' ? 0 : Date.now()-Number(range)*86400000;
  const values = records.filter(r=>Date.parse(r.measuredAt)>=cutoff && Number.isFinite(r[metric]));
  const latest = values.at(-1);
  $('bodyLatest').textContent = latest ? `${metric === 'weightKg' ? latest[metric].toFixed(2) : latest[metric]} ${unit}` : '—';
  $('bodyHistory').classList.toggle('hidden', !records.length);
  $('bodyHistoryRows').innerHTML = [...records].reverse().map(r=>`<tr><td>${escape(new Date(r.measuredAt).toLocaleString('zh-CN'))}</td><td>${r.weightKg.toFixed(2)}</td><td>${r.impedanceOhm ?? '—'}</td></tr>`).join('');
  if (!latest) {
    $('bodyChart').innerHTML = `<div class="body-empty"><svg viewBox="0 0 64 32" aria-hidden="true"><path d="M2 25h11l10-15 10 12 12-18 17 13"/></svg><span>${records.length ? '所选范围内暂无这项数据' : '称重后，趋势会自动出现在这里'}</span></div>`;
    $('bodyTrendSummary').textContent = records.length ? `${records.length} 次测量` : '体重与阻抗 · 自动同步';
    return;
  }
  const data = values.map(r=>r[metric]);
  const min = Math.min(...data), max = Math.max(...data), span = Math.max(max-min, metric==='weightKg'?0.5:10);
  const lo = min-span*.2, hi = max+span*.2;
  const t0=Date.parse(values[0].measuredAt), t1=Date.parse(latest.measuredAt);
  const width=Math.max(280,$('bodyChart').clientWidth), left=43, right=width-14;
  const points=values.map(r=>({x:t1===t0?(left+right)/2:left+(Date.parse(r.measuredAt)-t0)/(t1-t0)*(right-left),y:135-(r[metric]-lo)/(hi-lo)*110,r}));
  const line = points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const grid=[0,.5,1].map(f=>{const y=135-f*110;return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}" stroke="#e9eee3"/><text x="0" y="${y+4}" fill="#9caa92" font-size="11">${(lo+(hi-lo)*f).toFixed(metric==='weightKg'?1:0)}</text>`;}).join('');
  const dots=points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#5c8050"><title>${escape(new Date(p.r.measuredAt).toLocaleString('zh-CN'))} · ${p.r[metric]} ${unit}</title></circle>`).join('');
  $('bodyChart').innerHTML=`<svg viewBox="0 0 ${width} 165" role="img" aria-label="${escape(metric==='weightKg'?'体重趋势':'阻抗趋势')}，${values.length}次测量"><defs><linearGradient id="body-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#a4bf8d" stop-opacity=".25"/><stop offset="1" stop-color="#a4bf8d" stop-opacity="0"/></linearGradient></defs>${grid}${points.length>1?`<path d="${line} L${points.at(-1).x},135 L${points[0].x},135 Z" fill="url(#body-fill)"/><path d="${line}" fill="none" stroke="#5c8050" stroke-width="2.5"/>`:''}${dots}<text x="${left}" y="159" fill="#9caa92" font-size="11">${dateLabel(values[0].measuredAt)}</text><text x="${right}" y="159" text-anchor="end" fill="#9caa92" font-size="11">${dateLabel(latest.measuredAt)}</text></svg>`;
  const difference=latest[metric]-values[0][metric];
  $('bodyTrendSummary').textContent=values.length>1?`${values.length} 次测量 · 较首条 ${difference>0?'+':''}${difference.toFixed(metric==='weightKg'?2:0)} ${unit}`:'首次测量已记录';
}
async function refresh() {
  if (fetching || document.visibilityState !== 'visible') return;
  const key=new URLSearchParams(location.hash.slice(1)).get('calendar');
  if(!/^[a-f0-9]{64}$/.test(key||'')) return;
  fetching=true;
  try {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'同步失败');
    records=(result.records||[]).filter(r=>Number.isFinite(r.weightKg)&&Number.isFinite(Date.parse(r.measuredAt))).sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt));
    draw();$('bodyStatus').textContent=records.length?'已从云端同步':'';
  } catch { $('bodyStatus').textContent='身体数据暂未同步，请稍后重试'; }
  finally { fetching=false; }
}
$('bodySettings').onclick=()=>{if(navigator.userAgent.includes('DaybookAndroid/'))location.href='daybook://settings';else $('bodyHelp').classList.toggle('hidden');};
$('bodyMetric').onchange=draw;$('bodyRange').onchange=draw;
window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);window.addEventListener('resize',draw);
setInterval(refresh,60000);draw();refresh();
