import {api} from './api.mjs?v=staged-import-1';

export const stageNames={
 uploading:'上传文件',receiving:'上传完成，等待服务器接收',starting:'启动 CAD 解析',
 reading:'读取 STEP 文件',transferring:'转换 CAD 实体',basis:'识别载条基准面',
 outline:'测量外形长宽',pins:'识别定位销轴心',preview:'生成简化三维预览',
 saving:'整理测量结果',downloading:'下载测量结果',done:'加载完成'
};
export const stageStep=stage=>stage==='uploading'||stage==='receiving'?1:
 ['starting','reading','transferring'].includes(stage)?2:
 ['basis','outline','pins'].includes(stage)?3:
 ['preview','saving','downloading'].includes(stage)?4:5;

// Stage weights are estimates, never elapsed-time or geometric completion measurements.
export function overallPercent(state,previous=0){
 const weights={receiving:15,starting:18,reading:20,transferring:30,basis:65,outline:70,pins:75,preview:85,saving:92,downloading:96,done:100};
 const next=state.stage==='uploading'?Math.round((state.percent||0)*.15):(weights[state.stage]??previous);
 return state.stage==='done'?100:Math.min(99,Math.max(previous,next));
}

export function uploadJob(file,report){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST','/api/jobs');xhr.timeout=300000;
  xhr.upload.onprogress=e=>report({stage:'uploading',percent:e.lengthComputable?Math.min(100,Math.round(e.loaded/e.total*100)):null});
  xhr.upload.onload=()=>report({stage:'receiving'});
  xhr.onerror=()=>reject(Error('上传连接中断，请检查网络后重新选择文件。'));
  xhr.ontimeout=()=>reject(Error('上传等待超时，请检查网络后重试。'));
  xhr.onload=()=>{
   let data;try{data=JSON.parse(xhr.responseText)}catch{}
   if(xhr.status!==202||!data?.id){reject(Error(typeof data?.detail==='string'?data.detail:`服务器未接收文件（HTTP ${xhr.status}），请稍后重试。`));return}
   resolve(data.id);
  };
  const form=new FormData();form.append('file',file);xhr.send(form);
 });
}
export async function importModel(file,report){
 if(file.size>50*1024*1024)throw Error('文件超过 50 MB，请导出单个载条。');
 if(!file.size)throw Error('文件为空。');
 report({stage:'uploading',percent:0});
 const id=await uploadJob(file,report);let failures=0;
 const deadline=Date.now()+12*60*1000;
 while(Date.now()<deadline){
  let status;
  try{status=await api(`/api/jobs/${id}`);failures=0;}
  catch(e){if(++failures>=3)throw e;report({stage:'starting',message:'正在重新连接任务状态…'});await new Promise(r=>setTimeout(r,3000));continue}
  if(status.state==='error')throw Error(status.error||'解析失败，请检查模型。');
  if(status.state==='done'){
   report({stage:'downloading'});
   const result=await api(`/api/jobs/${id}/result`);
   report({stage:'done',percent:100});return result;
  }
  report({stage:status.stage});
  await new Promise(r=>setTimeout(r,2000));
 }
 throw Error('等待任务结果超时，请检查网络或重新选择文件。');
}
