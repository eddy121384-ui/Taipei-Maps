import fs from 'node:fs';
import assert from 'node:assert/strict';
import {normalizeDoorplateAddress} from '../data/taipei_doorplate_core_v01.mjs';

const path='public/generated/taipei-doorplate-index-v01.json';
assert.ok(fs.existsSync(path),'generated Taipei official doorplate index is missing');
const index=JSON.parse(fs.readFileSync(path,'utf8'));
assert.equal(index.schema,'buju.taipei-doorplate-index.v0.1');
assert.ok(Number(index?.stats?.accepted)>10000,'official doorplate index unexpectedly small');

const samples=[
  '臺北市大安區杭州南路二段61巷38號4樓之2',
  '台北市中正區汀州路一段306巷5號4樓'
];

for(const address of samples){
  const key=normalizeDoorplateAddress(address);
  const hit=index?.entries?.[key];
  assert.ok(hit,`official doorplate index did not contain ${address} -> ${key}`);
  const [lon,lat,matched,basis]=hit;
  assert.ok(Number(lon)>121.3&&Number(lon)<121.8,`longitude outside Taipei for ${address}`);
  assert.ok(Number(lat)>24.8&&Number(lat)<25.3,`latitude outside Taipei for ${address}`);
  console.log(`LIVE HIT ${address} -> ${matched} @ ${lat},${lon} (${basis})`);
}

console.log(`PASS Taipei live official doorplate index · ${index.stats.accepted.toLocaleString()} normalized addresses · real BigFun sample addresses located`);
