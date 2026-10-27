import {expandTasks} from './recurrence.mjs?v=20261027-suite-1';
import {weekDays,zonedParts} from './health-daily.mjs?v=20261027-suite-1';
export const DEFAULT_GROUPS=[{id:'exercise',name:'锻炼',exercise:true,activities:['练腿','练胸','练背','游泳']}];
export function normalizeGroups(groups){
  if(!Array.isArray(groups))return structuredClone(DEFAULT_GROUPS);
  const ids=new Set();return groups.filter(g=>g&&typeof g.id==='string'&&!ids.has(g.id)&&ids.add(g.id)&&typeof g.name==='string'&&g.name.trim()).slice(0,30).map(g=>({id:g.id,name:g.name.trim().slice(0,30),exercise:g.exercise===true,activities:[...new Set((Array.isArray(g.activities)?g.activities:[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean))].slice(0,20).map(x=>x.slice(0,40))}));
}
export function groupForTask(task,groups){
  if(task.groupId!==undefined)return groups.find(g=>g.id===task.groupId)||null;
  return /^(健身|锻炼|游泳)(?:$|[\s·:：-])/.test(task.title||'')?groups.find(g=>g.id==='exercise')||null:null;
}
export function weeklyExercise(store,now,offset=0,zone='Asia/Riyadh'){
  const days=weekDays(now,offset,zone),groups=normalizeGroups(store?.taskGroups),start=new Date(Date.parse(days[0]+'T00:00:00Z')-2*86400000),end=new Date(Date.parse(days[6]+'T00:00:00Z')+3*86400000);
  const records=expandTasks(store?.tasks||[],start,end).filter(t=>t.completed&&groupForTask(t,groups)?.exercise&&days.includes(zonedParts(t.type==='scheduled'?t.startISO:t.deadlineISO,zone)?.day)).sort((a,b)=>Date.parse(a.startISO||a.deadlineISO)-Date.parse(b.startISO||b.deadlineISO));
  return {days,records,count:records.length,minutes:records.reduce((n,t)=>n+(t.type==='scheduled'?Number(t.durationMin)||0:0),0),activeDays:new Set(records.map(t=>zonedParts(t.startISO||t.deadlineISO,zone).day)).size};
}
