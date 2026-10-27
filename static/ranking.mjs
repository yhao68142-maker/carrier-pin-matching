import Decimal from './lib/decimal.mjs';
const D=Decimal.clone({precision:28,rounding:Decimal.ROUND_HALF_EVEN});
const fields=[['x','X'],['y','Y'],['length','Length'],['width','Width']];
export function rankLocally(records,query){
 const measured={};
 for(const [key] of fields){try{measured[key]=new D(String(query[key]));if(!measured[key].isFinite()||measured[key].isNegative())throw Error()}catch{throw Error('尺寸必须为有限非负数')}}
 if(measured.length.lt(measured.width))throw Error('外形长应不小于宽，请核对长宽输入。');
 const compare=(a,b)=>a[0]-b[0]||a[1].cmp(b[1])||a[2].cmp(b[2]);
 const rows=records.map(record=>{
  const row={...record},errors=[],deltas=[],missing=[],passes=[];
  for(const [key,suffix] of fields){const value=record[key];
   if(value==null||String(value).trim()===''){row['delta'+suffix]=null;row['pass'+suffix]=null;missing.push(key);continue}
   const target=new D(value),delta=measured[key].minus(target),pass=delta.abs().lte('0.01'),scale=D.max(measured[key],target);
   row['delta'+suffix]=delta.toString();row['pass'+suffix]=pass;passes.push(pass);deltas.push(delta);errors.push(scale.isZero()?new D(0):delta.abs().div(scale));
  }
  row.complete=!missing.length;row.qualified=row.complete&&passes.every(Boolean);row.missing=missing;
  let key;
  if(missing.length){row.similarity=null;key=[2,new D(0),new D(0)]}
  else{const loss=errors.reduce((a,b)=>a.plus(b),new D(0)).div(4),score=new D(1).minus(loss).times(100);
   row.similarity=deltas.every(d=>d.abs().lt('1e-9'))?'100.00':D.min('99.99',score.toDecimalPlaces(2)).toFixed(2);
   key=[row.qualified?0:1,loss,deltas.reduce((a,d)=>a.plus(d.times(d)),new D(0))];
  }return {row,key};
 }).sort((a,b)=>compare(a.key,b.key));
 let previous,rank=0;
 return rows.map(({row,key},i)=>{if(!previous||compare(key,previous)!==0)rank=i+1;previous=key;return {...row,rank:row.complete?rank:null}});
}
