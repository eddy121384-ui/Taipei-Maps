const DISTRICT_BY_CODE=new Map([
  ['63000010','松山區'],['63000020','信義區'],['63000030','大安區'],['63000040','中山區'],
  ['63000050','中正區'],['63000060','大同區'],['63000070','萬華區'],['63000080','文山區'],
  ['63000090','南港區'],['63000100','內湖區'],['63000110','士林區'],['63000120','北投區']
]);

const SECTION_NUMERALS=new Map([
  ['一','1'],['二','2'],['三','3'],['四','4'],['五','5'],['六','6'],['七','7'],['八','8'],['九','9'],['十','10']
]);

const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').trim();
const suffix=(v,s)=>{const t=clean(v);if(!t||t==='0'||t==='null'||t==='NULL')return '';return t.endsWith(s)?t:`${t}${s}`};

export function districtNameFromCode(value=''){
  const raw=clean(value);
  if(/區$/.test(raw))return raw;
  const digits=raw.replace(/\D/g,'');
  if(DISTRICT_BY_CODE.has(digits))return DISTRICT_BY_CODE.get(digits);
  const padded=digits.padStart(8,'0');
  return DISTRICT_BY_CODE.get(padded)||'';
}

export function normalizeDoorplateAddress(address=''){
  let s=clean(address)
    .replace(/^中華民國/,'')
    .replace(/^台灣/,'')
    .replace(/^臺灣/,'')
    .replace(/^臺北市/,'台北市')
    .replace(/^台北市/,'')
    .replace(/[，,。．·]/g,'')
    .replace(/[-－]/g,'');
  s=s.replace(/([一二三四五六七八九十])段/g,(_,n)=>`${SECTION_NUMERALS.get(n)||n}段`);
  s=s.replace(/(?:地下)?\d+樓(?:之\d+)?(?:.*)?$/,'');
  s=s.replace(/之\d+樓(?:.*)?$/,'');
  return s;
}

export function buildDoorplateAddressFromRow(row={}){
  const district=districtNameFromCode(row['鄉鎮市區代碼']??row['行政區']??row['區']??'');
  const street=clean(row['街路段']??row['路街']??row['道路']??row['路名']??'');
  const area=clean(row['地區']??'');
  const lane=suffix(row['巷'],'巷');
  const alley=suffix(row['弄'],'弄');
  const number=suffix(row['號']??row['門牌號碼']??row['門牌'],'號');
  const explicit=clean(row['地址']??row['完整地址']??row['門牌地址']??'');
  const composed=`台北市${district}${area}${street}${lane}${alley}${number}`;
  return normalizeDoorplateAddress(explicit||composed);
}

export function coordinateToWgs84(xValue,yValue){
  const x=Number(xValue),y=Number(yValue);
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  if(x>=119&&x<=123&&y>=20&&y<=27)return {lon:x,lat:y,basis:'wgs84'};
  if(x<100000||x>400000||y<2400000||y>2900000)return null;
  return {...twd97Tm2ToWgs84(x,y),basis:'twd97-tm2-121'};
}

export function twd97Tm2ToWgs84(x,y){
  const a=6378137.0;
  const b=6356752.314245;
  const lon0=121*Math.PI/180;
  const k0=0.9999;
  const dx=250000;
  const dy=0;
  const e=1-(b*b)/(a*a);
  const e1=(1-Math.sqrt(1-e))/(1+Math.sqrt(1-e));
  const xAdj=x-dx;
  const yAdj=y-dy;
  const M=yAdj/k0;
  const mu=M/(a*(1-e/4-3*e*e/64-5*e*e*e/256));
  const J1=3*e1/2-27*Math.pow(e1,3)/32;
  const J2=21*e1*e1/16-55*Math.pow(e1,4)/32;
  const J3=151*Math.pow(e1,3)/96;
  const J4=1097*Math.pow(e1,4)/512;
  const fp=mu+J1*Math.sin(2*mu)+J2*Math.sin(4*mu)+J3*Math.sin(6*mu)+J4*Math.sin(8*mu);
  const e2=e/(1-e);
  const C1=e2*Math.pow(Math.cos(fp),2);
  const T1=Math.pow(Math.tan(fp),2);
  const R1=a*(1-e)/Math.pow(1-e*Math.pow(Math.sin(fp),2),1.5);
  const N1=a/Math.sqrt(1-e*Math.pow(Math.sin(fp),2));
  const D=xAdj/(N1*k0);
  const Q1=N1*Math.tan(fp)/R1;
  const Q2=D*D/2;
  const Q3=(5+3*T1+10*C1-4*C1*C1-9*e2)*Math.pow(D,4)/24;
  const Q4=(61+90*T1+298*C1+45*T1*T1-252*e2-3*C1*C1)*Math.pow(D,6)/720;
  const lat=fp-Q1*(Q2-Q3+Q4);
  const Q5=D;
  const Q6=(1+2*T1+C1)*Math.pow(D,3)/6;
  const Q7=(5-2*C1+28*T1-3*C1*C1+8*e2+24*T1*T1)*Math.pow(D,5)/120;
  const lon=lon0+(Q5-Q6+Q7)/Math.cos(fp);
  return {lon:lon*180/Math.PI,lat:lat*180/Math.PI};
}

export function parseCsvLine(line=''){
  const cells=[];let value='',quoted=false;
  for(let i=0;i<line.length;i+=1){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i+=1}else quoted=!quoted;
    }else if(ch===','&&!quoted){cells.push(value);value=''}else value+=ch;
  }
  cells.push(value);
  return cells.map(v=>v.trim());
}

export function rowObject(headers=[],cells=[]){
  const out={};headers.forEach((h,i)=>{out[String(h||'').replace(/^\uFEFF/,'').trim()]=cells[i]??''});return out;
}

export function coordinateFromDoorplateRow(row={}){
  const x=row['橫座標']??row['X']??row['x']??row['經度']??row['LONGITUDE']??row['longitude'];
  const y=row['縱座標']??row['Y']??row['y']??row['緯度']??row['LATITUDE']??row['latitude'];
  return coordinateToWgs84(x,y);
}
