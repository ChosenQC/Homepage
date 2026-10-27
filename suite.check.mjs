import assert from 'node:assert/strict';
import {morningDaily,isMorning,weekDays,deviceTimeZone} from './health-daily.mjs';
import {weeklyExercise,normalizeGroups,groupForTask} from './task-groups.mjs';
const r=(id,time,imp=500)=>({id,measuredAt:`2026-10-27T${time}+03:00`,weightKg:70,impedanceOhm:imp});
assert.equal(isMorning(r('a','05:00:00').measuredAt,'Asia/Riyadh'),false);assert.equal(isMorning(r('a','05:00:00.001').measuredAt,'Asia/Riyadh'),true);assert.equal(isMorning(r('a','12:00:00').measuredAt,'Asia/Riyadh'),false);
assert.deepEqual(morningDaily([r('late','21:00:00'),r('early','06:00:00'),r('last','11:59:59',null),r('noon','12:00:00')],'Asia/Riyadh').map(x=>x.id),['last']);
const originalZone=process.env.TZ;try{process.env.TZ='Asia/Shanghai';assert.equal(deviceTimeZone(),'Asia/Shanghai');process.env.TZ='Asia/Riyadh';assert.equal(deviceTimeZone(),'Asia/Riyadh');}finally{if(originalZone===undefined)delete process.env.TZ;else process.env.TZ=originalZone;}
assert.equal(morningDaily([r('late','21:00:00')],'Asia/Shanghai').length,0);
assert.deepEqual(weekDays('2026-10-27T10:00:00Z'),['2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31']);
const groups=normalizeGroups();assert.ok(groups[0].activities.includes('游泳'));groups[0].name='训练';
assert.equal(groupForTask({title:'健身 · 练胸'},groups).id,'exercise');assert.equal(groupForTask({title:'游泳',groupId:null},groups),null);
const store={taskGroups:groups,tasks:[{id:'one',title:'游泳',type:'scheduled',completed:true,startISO:'2026-10-27T08:00:00+03:00',durationMin:30},{id:'repeat',title:'跑步',groupId:'exercise',type:'scheduled',durationMin:60,recurrence:{frequency:'daily',startDate:'2026-10-25',time:'09:00'},completionDates:{'2026-10-25':true,'2026-10-26':true},skippedDates:{'2026-10-26':true}},{id:'not-workout',type:'scheduled',title:'开会',completed:true,startISO:'2026-10-27T10:00:00+03:00'}]};
let week=weeklyExercise(store,'2026-10-27T10:00:00Z');assert.equal(week.count,2);assert.equal(week.minutes,90);
store.tasks[0].completed=false;assert.equal(weeklyExercise(store,'2026-10-27T10:00:00Z').count,1);
store.tasks[1].overrides={'2026-10-25':{groupId:null,startLocal:'2026-10-25T09:00'}};assert.equal(weeklyExercise(store,'2026-10-27T10:00:00Z').count,0);
console.log('PASS: morning boundaries, final whole weigh-in selection, timezone, weekly recurrence/completion/skip and group rename/swimming');
