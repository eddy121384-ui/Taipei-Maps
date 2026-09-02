import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildDoorplateAddressFromRow,coordinateToWgs84,districtNameFromCode,normalizeDoorplateAddress,parseCsvLine,rowObject} from '../data/taipei_doorplate_core_v01.mjs';
import {geocodeBigFunHomes} from '../../public/bigfun-address-geocode-v01.mjs';

assert.equal(districtNameFromCode('63000030'),'大安區');
assert.equal(districtNameFromCode('63000050'),'中正區');
assert.equal(normalizeDoorplateAddress('臺北市大安區杭州南路一段61巷38號4樓之2'),'大安區杭州南路1段61巷38號');

const row={鄉鎮市區代碼:'63000030',街路段:'杭州南路1段',地區:'',巷:'61',弄:'',號:'38',橫座標:'302000',縱座標:'2770000'};
assert.equal(buildDoorplateAddressFromRow(row),'大安區杭州南路1段61巷38號');
const converted=coordinateToWgs84(row.橫座標,row.縱座標);
assert.ok(converted&&converted.lon>121.3&&converted.lon<121.8&&converted.lat>24.8&&converted.lat<25.3,'TWD97 Taipei coordinate should convert into Taipei WGS84 bounds');

const csv=parseCsvLine('63000030,"杭州南路1段",61,,38,302000,2770000');
assert.equal(csv[1],'杭州南路1段');
const obj=rowObject(['鄉鎮市區代碼','街路段','巷','弄','號','橫座標','縱座標'],csv);
assert.equal(obj['號'],'38');

const mockFetch=async url=>{
  assert.match(String(url),/^\/__buju\/taipei-doorplate\?address=/);
  return {status:200,ok:true,json:async()=>({ok:true,lat:25.0345,lon:121.5234,matched_address:'大安區杭州南路1段61巷38號'})};
};
const result=await geocodeBigFunHomes([{id:'x',address_text:'台北市大安區杭州南路一段61巷38號4樓之2',lat:null,lon:null}],{fetchImpl:mockFetch});
assert.equal(result.located,1);
assert.equal(result.homes[0].location_basis,'taipei-official-doorplate');
assert.equal(result.homes[0].lat,25.0345);

const server=fs.readFileSync('tools/dev/serve_single_engine_core.mjs','utf8');
const builder=fs.readFileSync('tools/data/build_taipei_doorplate_index_v01.mjs','utf8');
for(const token of ['/__buju/taipei-doorplate','taipei-doorplate-index-v01.json','normalizeDoorplateAddress'])assert.ok(server.includes(token),`local server doorplate contract missing: ${token}`);
for(const token of ['臺北市門牌位置數值資料','ce76ca0c-7f94-4935-ab47-1d2a41ca2abb','--if-missing','accepted<10000'])assert.ok(builder.includes(token),`doorplate builder contract missing: ${token}`);

console.log('PASS Taipei official doorplate locator v0.1 · BigFun address → local official index → WGS84 pin');
