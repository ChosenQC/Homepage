// SPDX-License-Identifier: Apache-2.0
// Xiaomi Legacy calculations adapted from dckiller51/bodymiscale (Apache-2.0),
// commit f1be05b0339cf14b85e17054bf02331ca921ed58, metrics/impedance.py and weight.py.
// Modified: JavaScript port, explicit missing-data handling and year-based age.
export const ALGORITHM = 'xiaomi-legacy-2017-v1';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function validProfile(p) {
  return !!p && typeof p.heightCm==='number' && Number.isFinite(p.heightCm) && p.heightCm>=90 && p.heightCm<=230 && Number.isInteger(p.age) && p.age>=6 && p.age<=100 && ['male','female'].includes(p.sex) && Number.isInteger(p.year) && p.year>=2000 && p.year<=2200;
}
export function bodyMetrics(record,profile) {
  if(!validProfile(profile) || !Number.isFinite(record.weightKg) || record.weightKg<1 || record.weightKg>300 || !Number.isFinite(Date.parse(record.measuredAt)))return {};
  const h=profile.heightCm,w=record.weightKg,a=profile.age+new Date(record.measuredAt).getUTCFullYear()-profile.year,male=profile.sex==='male';
  if(a<6 || a>100)return {};
  const bmi=clamp(w/(h/100)**2,10,90);
  const bmrKcal=clamp(male?877.8+w*14.916-h*.726-a*8.976:864.6+w*10.2036-h*.39336-a*6.204,500,5000);
  let visceral;
  if(male)visceral=h<w*1.6+63?a*.15+(w*305/(h*.0826*h-h*.4+48)-2.9):a*.15+(w*(h*-.0015+.765)-h*.143)-5;
  else visceral=w<=h*.5-13?a*.07+(w*(h*-.0024+.691)-h*.027)-10.5:a*.07+(w*500/(h*1.45+h*.1158*h-120)-6);
  const result={bmi,bmrKcal,visceralFat:clamp(visceral,1,50)};
  const z=record.impedanceOhm;
  if(!Number.isInteger(z) || z<=0 || z>=3000)return result;
  const lbm=Math.min((h*9.058/100)*(h/100)+w*.32+12.226-z*.0068-a*.0542,w*.98);
  if(lbm<=0)return result;
  let adjust,coeff;
  if(male){adjust=.8;coeff=w<61?.98:1;}
  else {adjust=a<=49?9.25:7.25;coeff=1;if(w>60)coeff=.96*(h>160?1.03:1);else if(w<50)coeff=1.02*(h>160?1.03:1);}
  const bodyFatPct=clamp((1-(lbm-adjust)*coeff/w)*100,5,75);
  let waterPct=(100-bodyFatPct)*.7;waterPct=clamp(waterPct*(waterPct<=50?1.02:.98),35,75);
  let boneKg=lbm*.05158-(male?.18016894:.245691014);boneKg+=boneKg>2.2?.1:-.1;
  if(boneKg>(male?5.2:5.1))boneKg=8;boneKg=clamp(boneKg,.5,8);
  let muscleKg=w-bodyFatPct*.01*w-boneKg;if(muscleKg>=(male?93.5:84))muscleKg=120;muscleKg=clamp(muscleKg,10,120);
  const proteinPct=clamp(muscleKg/w*100-waterPct,5,32);
  const bodyAge=clamp(male?h*-.7471+w*.9161+a*.4184+z*.0517+54.2267:h*-1.1165+w*1.5784+a*.4615+z*.0415+83.2548,15,80);
  return {...result,bodyFatPct,muscleKg,waterPct,boneKg,proteinPct,bodyAge};
}
export const METRICS={
  weightKg:{label:'体重',unit:'kg',digits:2,span:.5},bodyFatPct:{label:'体脂率',unit:'%',digits:1,span:1},muscleKg:{label:'肌肉量',unit:'kg',digits:2,span:.5},waterPct:{label:'含水量',unit:'%',digits:1,span:1},
  bmi:{label:'BMI',unit:'',digits:1,span:.5},boneKg:{label:'骨量',unit:'kg',digits:2,span:.1},bmrKcal:{label:'基础代谢',unit:'kcal/天',digits:0,span:20},proteinPct:{label:'蛋白质',unit:'%',digits:1,span:1},visceralFat:{label:'内脏脂肪等级',unit:'级',digits:1,span:1},bodyAge:{label:'身体年龄',unit:'岁',digits:0,span:1},impedanceOhm:{label:'阻抗',unit:'Ω',digits:0,span:10}
};
