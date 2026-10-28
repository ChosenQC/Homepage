import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {fetchCloud,singleFlight,CloudConnectionError,API_ORIGIN,API_ORIGINS,currentApiOrigin} from './cloud-api.mjs';
const originalFetch=globalThis.fetch,probe=o=>o?.body==='{"key":"invalid"}';
const validProbe=()=>new Response('{"error":"Invalid calendar link"}',{status:400});
try {
  let calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});if(probe(options)){if(url.startsWith(API_ORIGIN))return validProbe();throw new TypeError('blocked');}return new Response('{"ok":true}');};
  await fetchCloud('/api/shared/get',{method:'POST',body:'{"key":"test-only"}'});
  assert.equal(currentApiOrigin(),API_ORIGIN);
  assert.equal(calls.filter(c=>probe(c.options)).length,2);
  assert.equal(calls.filter(c=>c.options.body.includes('test-only')).length,1);
  assert.equal(calls.at(-1).url,API_ORIGIN+'/api/shared/get');
  await assert.rejects(fetchCloud('https://untrusted.example/api/get'),/Invalid API path/);
  let writes=0;globalThis.fetch=async()=>{writes++;throw new TypeError('lost write response');};
  await assert.rejects(fetchCloud('/api/shared/set',{method:'POST',body:'{}'}),CloudConnectionError);
  assert.equal(writes,1,'Never resend a write against another route');
  calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,options});if(probe(options)){if(url.startsWith(API_ORIGIN))throw new TypeError('blocked');return validProbe();}return new Response('{"error":"conflict"}',{status:409});};
  assert.equal((await fetchCloud('/api/shared/set',{method:'POST',body:'{}'})).status,409);
  assert.equal(currentApiOrigin(),API_ORIGINS[1]);assert.equal(calls.filter(c=>!probe(c.options)).length,1);
  let aborted=false;
  globalThis.fetch=(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}));
  await assert.rejects(fetchCloud('/api/shared/get',{},5),e=>/超时/.test(e.message));assert.ok(aborted);
  globalThis.fetch=async()=>{throw new TypeError('offline');};
  await assert.rejects(fetchCloud('/api/shared/get'),e=>/无法连接/.test(e.message));
  globalThis.fetch=async(_,o)=>probe(o)?validProbe():new Response('{"ok":true}');
  assert.equal((await fetchCloud('/api/health/get')).status,200);
  let release,reads=0;const load=singleFlight(()=>{reads++;return new Promise(resolve=>{release=resolve;});});
  const a=load(),b=load();assert.equal(a,b);await Promise.resolve();assert.equal(reads,1);release('loaded');assert.equal(await a,'loaded');
  const c=load();await Promise.resolve();assert.equal(reads,2);release('retry');await c;
  let attempts=0;const retry=singleFlight(async()=>{if(++attempts===1)throw Error('offline');return true;});
  await assert.rejects(retry(),/offline/);assert.equal(await retry(),true);
  const source=await readFile(new URL('./cloud-api.mjs',import.meta.url),'utf8');
  const bridge=source.slice(source.indexOf('function informNativeRoute'),source.indexOf('export class CloudConnectionError'));
  function nativeContext(ua,host='chosenqc.github.io'){
    const context={window:{},navigator:{userAgent:ua},location:{protocol:'https:',hostname:host,href:''}};
    vm.runInNewContext(bridge+'; this.notify=informNativeRoute;',context);return context;
  }
  const modern=nativeContext('Android DaybookAndroid/0.3.2');modern.notify(API_ORIGIN);
  assert.equal(modern.location.href,'daybook://api-route?origin='+encodeURIComponent(API_ORIGIN));
  const legacy=nativeContext('Android DaybookAndroid/0.3.1');legacy.notify(API_ORIGIN);assert.equal(legacy.location.href,'');
  const other=nativeContext('Android DaybookAndroid/0.3.2','other.example');other.notify(API_ORIGIN);assert.equal(other.location.href,'');
  console.log('PASS: probes contain no credentials; both regional routes; cached selection and offline recovery; timeout cancellation; single-flight loads; no duplicate writes or retries on 409.');
  console.log('PASS: native route notification only on the trusted website and Android 0.3.2 or newer.');
}finally{globalThis.fetch=originalFetch;}
