// Phase weights describe work, not a time estimate. Only world readiness can
// finish the bar; concurrent assets and newly discovered items never rewind it.
export function createLoadingProgress(onProgress=()=>{},{hasCity=false}={}){
 const weights=hasCity?{assets:.15,aircraft:.1,city:.75}:{assets:.6,aircraft:.4},values={assets:0,aircraft:0,city:0},details={};
 let percent=0,finished=false;
 function emit(){
  const pending=hasCity&&values.city<1?'city':values.aircraft<1?'aircraft':'assets';
  onProgress({stage:pending==='city'?'imagery':pending,...details[pending],percent});
 }
 return{
  update(part,fraction,detail={}){
   if(finished||!Object.hasOwn(values,part))return;
   values[part]=Math.max(values[part],Math.min(1,Math.max(0,Number(fraction)||0)));details[part]=detail;
   percent=Math.max(percent,Math.min(99,Math.floor(Object.entries(weights).reduce((sum,[key,w])=>sum+values[key]*w,0)*100)));emit();
  },
  complete(){if(finished)return;finished=true;percent=100;onProgress({stage:'ready',percent});}
 };
}

export const LOADING_STAGES={assets:'正在加载场景素材',aircraft:'正在加载飞机模型',imagery:'正在加载机场航片',download:'正在下载建筑数据',decompress:'正在解压建筑数据',decode:'正在建立建筑索引',models:'正在准备建筑模型',roads:'正在准备道路与车流',cache:'正在读取本地缓存',save:'正在保存本地缓存',ready:'机场已准备就绪'};
