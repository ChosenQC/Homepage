export function sleepStage(value){
  const names=['inBed','asleep','awake','core','deep','rem'];
  if(typeof value==='number'&&Number.isInteger(value))return names[value]||'unknown';
  const text=String(value??'').toLowerCase().replace(/[\s_()（）-]/g,'');
  if(/^(0|inbed|卧床|卧床时间|在床上)$/.test(text))return 'inBed';
  if(/^(1|asleep|asleepunspecified|睡眠|已入睡|入睡|睡着|睡眠未指定)$/.test(text))return 'asleep';
  if(/^(2|awake|清醒|清醒时间|醒着)$/.test(text))return 'awake';
  if(/^(3|core|asleepcore|核心|核心睡眠|浅睡|浅睡眠)$/.test(text))return 'core';
  if(/^(4|deep|asleepdeep|深睡|深睡眠|深度睡眠)$/.test(text))return 'deep';
  if(/^(5|rem|asleeprem|rem睡眠|快速眼动|快速眼动睡眠|快速动眼|快速动眼睡眠)$/.test(text))return 'rem';
  return 'unknown';
}
export function energyKcal(value,unit='kcal'){
  if(typeof value==='string'){
    const m=value.trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(kcal|cal|kj|千卡|大卡|卡路里|千焦)?$/i);
    if(!m)return null;value=Number(m[1].replace(',','.'));if(m[2])unit=m[2];
  }
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
  const u=String(unit).trim().toLowerCase();
  if(['kcal','千卡','大卡','卡路里'].includes(u))return value;
  if(['kj','千焦'].includes(u))return value/4.184;
  if(u==='cal')return value/1000;
  return null;
}
export const localDay=(value,zone)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const asleep=s=>['asleep','core','deep','rem'].includes(s);
function sourceRank(source){return /watch|手表|腕表/i.test(source)?2:/iphone|手机/i.test(source)?1:0;}
function pickSource(records){
  const groups=new Map();for(const r of records){const source=r.source||'Apple Health';if(!groups.has(source))groups.set(source,[]);groups.get(source).push(r);}
  return [...groups.entries()].sort((a,b)=>sourceRank(b[0])-sourceRank(a[0])||b[1].length-a[1].length||a[0].localeCompare(b[0]))[0]?.[1]||[];
}
function unique(records,type){return [...new Map(records.map(r=>[`${r.type}|${r.start}|${r.end}|${r.source||''}`,r])).values()].filter(r=>r.type===type&&Number.isFinite(r.start)&&Number.isFinite(r.end));}
function minutesByStage(records){
  const valid=records.filter(r=>asleep(r.stage)&&r.end>r.start),edges=[...new Set(valid.flatMap(r=>[r.start,r.end]))].sort((a,b)=>a-b),out={asleep:0,core:0,deep:0,rem:0};
  const ranks={asleep:0,core:1,rem:2,deep:3};
  for(let i=1;i<edges.length;i++){const a=edges[i-1],b=edges[i],overlap=valid.filter(r=>r.start<b&&r.end>a).sort((x,y)=>ranks[y.stage]-ranks[x.stage]);if(overlap.length)out[overlap[0].stage]+=(b-a)/60000;}
  return out;
}
export function activityDays(records,zone){
  const days=new Map();for(const r of unique(records,'energy')){const day=localDay(r.start,zone);if(!days.has(day))days.set(day,[]);days.get(day).push(r);}
  return [...days.entries()].map(([day,raw])=>{const data=pickSource(raw);return {day,kcal:data.reduce((n,r)=>n+r.kcal,0),samples:data.length,source:data[0].source,lastAt:Math.max(...data.map(r=>r.end)),multipleSources:new Set(raw.map(r=>r.source)).size>1};}).sort((a,b)=>a.day.localeCompare(b.day));
}
export function sleepDays(records,zone){
  const raw=unique(records,'sleep').sort((a,b)=>a.start-b.start),sessions=[];
  for(const r of raw){const last=sessions.at(-1);if(last&&r.start-last.end<=3*3600000){last.records.push(r);last.end=Math.max(last.end,r.end);}else sessions.push({end:r.end,records:[r]});}
  const days=new Map();for(const session of sessions){
    const selected=pickSource(session.records),sleep=selected.filter(r=>asleep(r.stage));if(!sleep.length)continue;
    const wake=Math.max(...sleep.map(r=>r.end)),day=localDay(wake,zone);if(!days.has(day))days.set(day,[]);days.get(day).push(...selected);
  }
  return [...days.entries()].map(([day,data])=>{const stages=minutesByStage(data);return {day,minutes:Object.values(stages).reduce((a,b)=>a+b,0),stages,samples:data.filter(r=>asleep(r.stage)).length,start:Math.min(...data.filter(r=>asleep(r.stage)).map(r=>r.start)),end:Math.max(...data.filter(r=>asleep(r.stage)).map(r=>r.end)),sources:[...new Set(data.map(r=>r.source))]};}).sort((a,b)=>a.day.localeCompare(b.day));
}
