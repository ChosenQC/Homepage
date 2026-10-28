import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the actual UI controller without opening a browser or using real Books.
const source=await readFile(new URL('./app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const connectionDialog ='),source.indexOf('function openModal()'));
function fixture(load){
  const nodes=new Map(),events=new Map();
  const dialog={open:false,showModal(){this.open=true;},close(){this.open=false;events.get('close')?.();},addEventListener(name,fn){events.set(name,fn);}};
  nodes.set('calendarConnectionDialog',dialog);
  const context={loaded:false,calendarKey:'test-book',loadRemote:load,setAppMsg:()=>{},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}}};
  vm.runInNewContext(code+'; this.createWhenReady=requestTaskCreation;',context);
  return {context,dialog,nodes};
}
let created=0;
const failed=fixture(async()=>{throw Error('当前网络无法连接云端服务');});
await failed.context.createWhenReady(()=>created++);
assert.equal(created,0);assert.ok(failed.dialog.open);
assert.equal(failed.nodes.get('calendarConnectionTitle').textContent,'暂时无法连接云端');
assert.match(failed.nodes.get('calendarConnectionMessage').textContent,/无法连接/);
assert.equal(failed.nodes.get('calendarConnectionRetry').disabled,false);
failed.context.loadRemote=async()=>{failed.context.loaded=true;};
await failed.nodes.get('calendarConnectionRetry').onclick();
assert.equal(created,1);assert.equal(failed.dialog.open,false);

let finish,chosen=[];
const pending=new Promise(resolve=>{finish=resolve;});
const cancelled=fixture(()=>pending);
const first=cancelled.context.createWhenReady(()=>chosen.push('old date'));
assert.ok(cancelled.dialog.open);cancelled.dialog.close();
const second=cancelled.context.createWhenReady(()=>chosen.push('new date'));
cancelled.context.loaded=true;finish();await Promise.all([first,second]);
assert.deepEqual(chosen,['new date']);
await cancelled.context.createWhenReady(()=>chosen.push('ready'));
assert.deepEqual(chosen,['new date','ready']);
console.log('PASS: blocked cloud load shows an actionable error; successful retry opens once; cancellation and stale requests cannot open the wrong date; ready calendars open immediately.');
