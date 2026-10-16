// A proxy or interrupted CAD process can return an empty/HTML response.
// Never treat that as a successful measurement or retry a heavy upload silently.
export async function api(url, options = {}) {
  let response, text;
  try {
    response = await fetch(url, options);
    text = await response.text();
  } catch {
    throw Error('连接中断，未收到完整测量结果。请检查网络，稍后重新选择文件；若反复失败，请提供该 STEP 文件排查。');
  }
  let data;
  try { data = JSON.parse(text); } catch { /* Handle non-JSON below. */ }
  if (!response.ok) {
    if (typeof data?.detail === 'string') throw Error(data.detail);
    const messages = {
      413: '文件超过服务器允许的大小，请导出单个载条后重试。',
      429: '请求过于频繁，请稍后重试。',
      502: '测量服务中断，未返回结果。请稍后重试；若同一文件持续失败，请提供 STEP 文件排查。',
      503: '测量服务暂不可用或正在启动，请稍后重试。',
      504: '测量请求超时，未返回结果。请尝试导出单个载条后重试。'
    };
    throw Error(`${messages[response.status] || '服务器未完成请求，请稍后重试。'}（HTTP ${response.status}）`);
  }
  if (data === undefined || data === null) {
    throw Error('服务器返回的结果为空或不完整，无法完成测量。请稍后重新选择文件；若持续失败，请提供 STEP 文件排查。');
  }
  return data;
}
