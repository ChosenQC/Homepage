// Both hosts route to the same Worker. Probes contain no Book key or user data.
export const API_ORIGIN = 'https://api.chenqiu.top';
export const API_ORIGINS = Object.freeze([API_ORIGIN,'https://floral-flower-7c16.chen-qiu.workers.dev']);
let selectedOrigin = null, selection = null;
function informNativeRoute(origin) {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  const v=navigator.userAgent.match(/DaybookAndroid\/(\d+)\.(\d+)\.(\d+)/);
  if (!v || !(Number(v[1])>0 || Number(v[2])>3 || Number(v[2])===3&&Number(v[3])>=2)) return;
  if(location.protocol==='https:'&&location.hostname==='chosenqc.github.io') location.href='daybook://api-route?origin='+encodeURIComponent(origin);
}

export class CloudConnectionError extends Error {
  constructor(message) { super(message); this.name = 'CloudConnectionError'; }
}

async function requestAt(origin, path, options = {}, timeoutMs = 20000) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      fetch(origin + path, { ...options, signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new CloudConnectionError('连接云端超时，请检查网络后重试。'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof CloudConnectionError) throw error;
    if (error instanceof TypeError || error.name === 'AbortError') {
      throw new CloudConnectionError('当前网络无法连接云端服务，请检查网络后重试。');
    }
    throw error;
  } finally { clearTimeout(timer); }
}

export const currentApiOrigin = () => selectedOrigin || API_ORIGIN;
export function resolveApiOrigin() {
  if (!selection) {
    selection = new Promise((resolve, reject) => {
      let failed = 0;
      for (const origin of API_ORIGINS) {
        (async () => {
          const response = await requestAt(origin,'/api/shared/get',{
            method:'POST',headers:{'Content-Type':'application/json'},body:'{"key":"invalid"}'
          },6000);
          if (response.status !== 400 || (await response.json()).error !== 'Invalid calendar link') throw new Error('Probe failed');
          return origin;
        })().then(resolve, () => {
          if (++failed === API_ORIGINS.length) reject(new CloudConnectionError('当前网络无法连接同步服务，请稍后重试。'));
        });
      }
    }).then(origin => { selectedOrigin = origin; informNativeRoute(origin); return origin; }).catch(error => {
      selection = null; selectedOrigin = null; throw error;
    });
  }
  return selection;
}

export async function fetchCloud(path, options = {}, timeoutMs = 20000) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const origin = await resolveApiOrigin();
  try { return await requestAt(origin,path,options,timeoutMs); }
  catch(error) {
    // A write may have committed before its response was lost. Never resend it.
    selection = null; selectedOrigin = null; throw error;
  }
}

// Initial load, foreground refresh and the visible retry button share one read.
export function singleFlight(load) {
  let pending;
  return function (...args) {
    if (!pending) {
      const request = Promise.resolve().then(() => load(...args));
      pending = request.finally(() => { pending = null; });
    }
    return pending;
  };
}
