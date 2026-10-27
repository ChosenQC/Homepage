export const DEFAULT_HEALTH_ZONE='Asia/Riyadh';
const formatters=new Map();
export function validTimeZone(zone){try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return typeof zone==='string';}catch{return false;}}
export function zonedParts(value,zone=DEFAULT_HEALTH_ZONE){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
  if(!validTimeZone(zone))zone=DEFAULT_HEALTH_ZONE;
  if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const p=Object.fromEntries(formatters.get(zone).formatToParts(date).map(x=>[x.type,x.value]));
  return {day:`${p.year}-${p.month}-${p.day}`,milliseconds:(Number(p.hour)*3600+Number(p.minute)*60+Number(p.second))*1000+date.getUTCMilliseconds()};
}
export function isMorning(value,zone=DEFAULT_HEALTH_ZONE){const p=zonedParts(value,zone);return !!p&&p.milliseconds>5*3600000&&p.milliseconds<12*3600000;}
export function morningDaily(records,zone=DEFAULT_HEALTH_ZONE){
  const days=new Map();for(const r of records){if(!isMorning(r.measuredAt,zone))continue;const day=zonedParts(r.measuredAt,zone).day,old=days.get(day);if(!old||Date.parse(r.measuredAt)>Date.parse(old.measuredAt)||(r.measuredAt===old.measuredAt&&String(r.id)>String(old.id)))days.set(day,r);}
  return [...days.values()].sort((a,b)=>Date.parse(a.measuredAt)-Date.parse(b.measuredAt));
}
export function weekDays(now,offset=0,zone=DEFAULT_HEALTH_ZONE){const today=zonedParts(now,zone).day,base=new Date(today+'T12:00:00Z');base.setUTCDate(base.getUTCDate()-base.getUTCDay()+offset*7);return Array.from({length:7},(_,i)=>{const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});}
