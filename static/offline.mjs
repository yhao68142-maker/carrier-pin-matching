export async function setupOffline({onChange,isBusy=()=>false}){
 const prepare=document.getElementById('prepareOffline'),toggle=document.getElementById('offlineToggle'),status=document.getElementById('offlineStatus');
 let worker,info={ready:false,enabled:false};
 const request=(type,extra={},progress)=>new Promise((resolve,reject)=>{
  const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('等待离线准备超时，请检查网络后重试。'))},300000);
  channel.port1.onmessage=({data})=>{if(data.progress!=null){progress?.(data.progress);return}clearTimeout(timer);channel.port1.close();data.error?reject(Error(data.error)):resolve(data.done)};
  worker.postMessage({type,...extra},[channel.port2]);
 });
 const render=()=>{toggle.disabled=!info.ready;toggle.checked=info.enabled;prepare.disabled=info.ready;prepare.textContent=info.ready?'离线资源已就绪':'准备离线使用';status.textContent=info.ready?`${info.enabled?'离线模式：测量与匹配均在本机完成':'离线资源已保存，可开启离线模式'} · 保存于 ${new Date(info.savedAt).toLocaleString()}。断网后请用当前浏览器打开此网址；清理网站数据后需重新准备。`:'首次请联网准备网页、CAD 引擎和尺寸库；完成后可断网使用。';onChange(info.enabled||!navigator.onLine)};
 try{
  if(!('serviceWorker' in navigator))throw Error('此浏览器不支持离线网页，请使用新版 Edge 或 Chrome。');
  const registration=await navigator.serviceWorker.register('/offline-sw.js',{scope:'/',updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  worker=registration.active||navigator.serviceWorker.controller;
  if(!worker)throw Error('离线功能正在初始化，请刷新网页。');
  info=await request('status');render();
  prepare.onclick=async()=>{if(isBusy()){status.textContent='请等待当前解析完成后再准备离线模式。';return}prepare.disabled=true;try{info=await request('prepare',{},percent=>{status.textContent=`正在准备离线资源 ${percent}%（按资源数量计算）…请保持联网。`});info=await request('mode',{enabled:true});render()}catch(e){status.textContent=e.message;prepare.disabled=false}};
  toggle.onchange=async()=>{if(isBusy()){toggle.checked=info.enabled;status.textContent='请等待当前解析完成后再切换模式。';return}toggle.disabled=true;try{info=await request('mode',{enabled:toggle.checked});render()}catch(e){status.textContent=e.message;toggle.checked=info.enabled;toggle.disabled=false}};
  for(const event of ['online','offline'])window.addEventListener(event,render);
 }catch(e){prepare.disabled=true;toggle.disabled=true;status.textContent=e.message;onChange(!navigator.onLine)}
}
