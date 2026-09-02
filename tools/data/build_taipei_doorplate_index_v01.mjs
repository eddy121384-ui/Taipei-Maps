import fs from 'node:fs';
import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildDoorplateAddressFromRow,coordinateFromDoorplateRow,normalizeDoorplateAddress,parseCsvLine,rowObject} from './taipei_doorplate_core_v01.mjs';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const generatedDir=path.join(repoRoot,'public','generated');
const sourcePath=path.join(generatedDir,'taipei-doorplate-source-v01.csv');
const indexPath=path.join(generatedDir,'taipei-doorplate-index-v01.json');
const SOURCE_URL='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=ce76ca0c-7f94-4935-ab47-1d2a41ca2abb';
const DATASET_URL='https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97';
const force=process.argv.includes('--force');
const ifMissing=process.argv.includes('--if-missing');

async function existsLarge(file,minBytes=1000){try{return (await stat(file)).size>=minBytes}catch{return false}}

async function downloadSource(){
  console.log('[doorplate] downloading Taipei City official doorplate CSV (about 119 MB)...');
  const response=await fetch(SOURCE_URL,{headers:{Accept:'text/csv,*/*'}});
  if(!response.ok||!response.body)throw new Error(`Taipei doorplate download failed: HTTP ${response.status}`);
  const total=Number(response.headers.get('content-length')||0);
  const reader=response.body.getReader();
  const chunks=[];let received=0,lastPct=-1;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.byteLength;if(total){const pct=Math.floor(received/total*100);if(pct>=lastPct+10){lastPct=pct;console.log(`[doorplate] download ${pct}%`);}}}
  const joined=new Uint8Array(received);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength}
  await writeFile(sourcePath,joined);
  console.log(`[doorplate] source saved: ${(received/1024/1024).toFixed(1)} MB`);
}

function decodeCsv(buffer){
  const utf8=new TextDecoder('utf-8').decode(buffer);
  if(/街路段|橫座標|縱座標/.test(utf8.slice(0,2000)))return {text:utf8,encoding:'utf-8'};
  try{
    const big5=new TextDecoder('big5').decode(buffer);
    if(/街路段|橫座標|縱座標/.test(big5.slice(0,2000)))return {text:big5,encoding:'big5'};
  }catch{}
  throw new Error('Unable to identify Taipei doorplate CSV encoding/header');
}

function* lines(text){
  let start=0;
  for(let i=0;i<=text.length;i+=1){
    if(i===text.length||text.charCodeAt(i)===10){let line=text.slice(start,i);if(line.endsWith('\r'))line=line.slice(0,-1);start=i+1;if(line)yield line}
  }
}

async function buildIndex(){
  console.log('[doorplate] building compact address → coordinate index...');
  const buffer=await readFile(sourcePath);
  const decoded=decodeCsv(buffer);
  const iterator=lines(decoded.text);
  const first=iterator.next();if(first.done)throw new Error('Taipei doorplate CSV is empty');
  const headers=parseCsvLine(first.value).map(x=>x.replace(/^\uFEFF/,''));
  console.log(`[doorplate] encoding=${decoded.encoding}; columns=${headers.join(' | ')}`);
  const entries=Object.create(null);let rows=0,accepted=0,missingAddress=0,missingCoordinate=0,duplicates=0;
  for(const line of iterator){
    rows+=1;const cells=parseCsvLine(line);if(cells.length<2)continue;
    const row=rowObject(headers,cells);
    const key=buildDoorplateAddressFromRow(row);
    if(!key){missingAddress+=1;continue}
    const coord=coordinateFromDoorplateRow(row);
    if(!coord){missingCoordinate+=1;continue}
    if(entries[key]){duplicates+=1;continue}
    entries[key]=[Number(coord.lon.toFixed(7)),Number(coord.lat.toFixed(7)),key,coord.basis];accepted+=1;
    if(rows%100000===0)console.log(`[doorplate] parsed ${rows.toLocaleString()} rows; indexed ${accepted.toLocaleString()}`);
  }
  if(accepted<10000)throw new Error(`Doorplate index unexpectedly small (${accepted}); refusing to publish generated index`);
  const payload={schema:'buju.taipei-doorplate-index.v0.1',generated_at:new Date().toISOString(),source:{dataset:'臺北市門牌位置數值資料',dataset_url:DATASET_URL,resource_url:SOURCE_URL,license:'政府資料開放授權條款-第1版'},stats:{rows,accepted,missing_address:missingAddress,missing_coordinate:missingCoordinate,duplicates},entries};
  await writeFile(indexPath,JSON.stringify(payload));
  const size=(await stat(indexPath)).size;
  console.log(`[doorplate] index ready: ${accepted.toLocaleString()} addresses · ${(size/1024/1024).toFixed(1)} MB`);
}

await mkdir(generatedDir,{recursive:true});
if(ifMissing&&!force&&await existsLarge(indexPath,1000000)){
  console.log('[doorplate] existing official Taipei doorplate index found; skip rebuild.');
  process.exit(0);
}
if(force||!(await existsLarge(sourcePath,1000000)))await downloadSource();
await buildIndex();
