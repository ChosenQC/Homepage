let snapshot=null;
const listeners=new Set();
export function publishCalendar(value){snapshot=structuredClone(value);for(const cb of listeners)cb(snapshot);}
export function calendarSnapshot(){return snapshot;}
export function subscribeCalendar(cb){listeners.add(cb);if(snapshot)cb(snapshot);return()=>listeners.delete(cb);}
