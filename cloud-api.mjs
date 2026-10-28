// Change this only after the replacement domain is configured and verified.
// Keep Book keys in POST bodies and never send them to arbitrary fallback hosts.
export const API_ORIGIN = 'https://floral-flower-7c16.chen-qiu.workers.dev';

export class CloudConnectionError extends Error {
  constructor(message) { super(message); this.name = 'CloudConnectionError'; }
}

export async function fetchCloud(path, options = {}, timeoutMs = 20000) {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      fetch(API_ORIGIN + path, { ...options, signal: controller.signal }),
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
