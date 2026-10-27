import {subscribeCalendar,calendarSnapshot} from './suite-state.mjs?v=20261027-suite-1';
import {weeklyExercise} from './task-groups.mjs?v=20261027-suite-1';
import {DEFAULT_HEALTH_ZONE,zonedParts} from './health-daily.mjs?v=20261027-suite-1';
const $=id=>document.getElementById(id),escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active='daybook',weekOffset=0,zone=DEFAULT_HEALTH_ZONE;
export function selectPage(page){
  if(!['daybook','health','insight'].includes(page))page='daybook';active=page;
  document.body.dataset.activePage=page;
  for(const name of ['daybook','health','insight'])$('page-'+name).classList.toggle('hidden',name!==page);
  for(const b of document.querySelectorAll('[data-app-tab]')){if(b.dataset.appTab===page)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  const hash=new URLSearchParams(location.hash.slice(1));hash.set('tab',page);history.replaceState(null,'',location.pathname+location.search+'#'+hash);
  document.title={daybook:'日程',health:'健康',insight:'Insight'}[page]+' · Daybook';
  window.dispatchEvent(new CustomEvent('daybook-tab',{detail:page}));if(page==='health')renderExercise();
}
for(const button of document.querySelectorAll('[data-app-tab]'))button.onclick=()=>selectPage(button.dataset.appTab);
$('syncBtn').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('daybook-sync',{detail:active})));
window.addEventListener('daybook-navigate',e=>selectPage(e.detail));
window.addEventListener('hashchange',()=>selectPage(new URLSearchParams(location.hash.slice(1)).get('tab')));
function renderExercise(){
  const state=calendarSnapshot(),week=weeklyExercise(state,new Date(),weekOffset,zone);
  $('workoutCount').textContent=week.count+' 次';$('workoutMinutes').textContent=`${week.activeDays} 天 · ${week.minutes} 分钟`;
  const short=key=>`${Number(key.slice(5,7))}/${Number(key.slice(8,10))}`;$('workoutWeekLabel').textContent=short(week.days[0])+' — '+short(week.days[6]);
  $('workoutDays').innerHTML=week.days.map((day,i)=>{const count=week.records.filter(t=>zonedParts(t.startISO||t.deadlineISO,zone).day===day).length;return `<div class="workout-day${count?' active':''}"><span>${['日','一','二','三','四','五','六'][i]}</span><strong>${day.slice(8)}</strong><i>${count?count:'·'}</i></div>`;}).join('');
  $('workoutLog').innerHTML=week.records.length?week.records.map(t=>`<article class="workout-item"><span class="workout-check">✓</span><div><strong>${escape(t.title)}</strong><span>${escape(new Date(t.startISO||t.deadlineISO).toLocaleString('zh-CN',{timeZone:zone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</span></div><span>${t.type==='scheduled'?`${Number(t.durationMin)||0} 分钟`:'已完成'}</span></article>`).join(''):`<div class="workout-empty">${state?'这一周还没有完成的锻炼记录':'正在读取日程…'}</div>`;
}
subscribeCalendar(renderExercise);window.addEventListener('daybook-health-zone',e=>{zone=e.detail||DEFAULT_HEALTH_ZONE;renderExercise();});
$('workoutPrev').onclick=()=>{weekOffset--;renderExercise();};$('workoutNext').onclick=()=>{weekOffset++;renderExercise();};$('workoutToday').onclick=()=>{weekOffset=0;renderExercise();};
$('healthReminderSettings').onclick=()=>$('bodySettings').click();
selectPage(new URLSearchParams(location.hash.slice(1)).get('tab')||'daybook');
