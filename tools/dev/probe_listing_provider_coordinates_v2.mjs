const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const DISTRICTS={
  zhongzheng:{name:'中正',zip:'100',yungching:'中正區'},datong:{name:'大同',zip:'103',yungching:'大同區'},zhongshan:{name:'中山',zip:'104',yungching:'中山區'},songshan:{name:'松山',zip:'105',yungching:'松山區'},daan:{name:'大安',zip:'106',yungching:'大安區'},wanhua:{name:'萬華',zip:'108',yungching:'萬華區'},xinyi:{name:'信義',zip:'110',yungching:'信義區'},shilin:{name:'士林',zip:'111',yungching:'士林區'},beitou:{name:'北投',zip:'112',yungching:'北投區'},neihu:{name:'內湖',zip:'114',yungching:'內湖區'},nangang:{name:'南港',zip:'115',yungching:'南港區'},wenshan:{name:'文山',zip:'116',yungching:'文山區'}
};
const raw=(process.argv[2]||'daan').toLowerCase();
const meta=DISTRICTS[raw]||Object.values(DISTRICTS).find(v=>v.name===process.argv[2]?.replace(/區$/,''));
if(!meta){console.error(`[ERROR] Unknown district alias: ${process.argv[2]||raw}`);process.exit(1);}

async function getText(url){const c=new AbortController();const t=setTimeout(()=>c.abort(),25000);try{const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8','accept-language':'zh-TW,zh;q=0.9,en;q=0.7'},redirect:'follow',signal:c.signal});return {status:r.status,url:r.url,text:await r.text(),headers:Object.fromEntries(r.headers.entries())};}finally{clearTimeout(t);}}
function uniq(arr){return [...new Set(arr.filter(Boolean))];}
function pairs(text){const out=[];const re1=/["']?(?:lat|latitude)["']?\s*[:=]\s*["']?(2[4-6]\.\d+)["']?[^\n\r<>]{0,220}?["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(12[0-2]\.\d+)["']?/gi;const re2=/["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(12[0-2]\.\d+)["']?[^\n\r<>]{0,220}?["']?(?:lat|latitude)["']?\s*[:=]\s*["']?(2[4-6]\.\d+)["']?/gi;for(const m of text.matchAll(re1))out.push(`${m[1]},${m[2]}`);for(const m of text.matchAll(re2))out.push(`${m[2]},${m[1]}`);return uniq(out).slice(0,30);}
function windows(text,needle,radius=2200,limit=12){const out=[];let from=0;while(out.length<limit){const i=text.indexOf(needle,from);if(i<0)break;out.push(text.slice(Math.max(0,i-radius),Math.min(text.length,i+needle.length+radius)));from=i+needle.length;}return out;}
function urls(text,re,mapper){const out=[];for(const m of text.matchAll(re)){out.push(mapper(m));if(out.length>=30)break;}return uniq(out);}
function stripTags(s){return s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
function addressCandidates(text){return uniq([...text.matchAll(/台北市.{0,3}區[^<>"'\n\r]{2,45}(?:路|街|巷|弄|號)/g)].map(m=>m[0].replace(/\\u[0-9a-f]{4}/gi,''))).slice(0,20);}
function endpointHints(text){return uniq([...text.matchAll(/(?:https?:\\?\/\\?\/[^"'<>\s]+|\/[A-Za-z0-9_./-]*(?:api|graphql|map|house|case)[A-Za-z0-9_?&=./%-]*)/gi)].map(m=>m[0].replaceAll('\\/','/')).filter(x=>x.length<260)).slice(0,40);}

async function sProbe(){
 const list=await getText(`https://www.sinyi.com.tw/buy/list/Taipei-city/${meta.zip}-zip`);
 const houses=urls(list.text,/(?:https?:\/\/www\.sinyi\.com\.tw)?\/buy\/house\/([A-Za-z0-9_-]+)/g,m=>m[1]);
 const code=houses[0]||null;const row={provider:'sinyi',district:meta.name,list_status:list.status,list_bytes:Buffer.byteLength(list.text),house_codes_found:houses.length,first_house_code:code};
 if(!code)return row;
 const listWins=windows(list.text,code);row.list_code_occurrences=listWins.length;row.list_pairs_near_code=uniq(listWins.flatMap(pairs));
 const detail=await getText(`https://www.sinyi.com.tw/buy/house/${code}`);const detailWins=windows(detail.text,code);row.detail_status=detail.status;row.detail_bytes=Buffer.byteLength(detail.text);row.detail_code_occurrences=detailWins.length;row.detail_pairs_near_code=uniq(detailWins.flatMap(pairs));row.detail_address_candidates=addressCandidates(stripTags(detail.text));
 const allDetailPairs=pairs(detail.text);row.detail_all_pairs_count=allDetailPairs.length;row.correlation_verdict=row.detail_pairs_near_code.length===1?'STRONG_SINGLE_PAIR_NEAR_LISTING_ID':row.detail_pairs_near_code.length>1?'AMBIGUOUS_MULTIPLE_PAIRS_NEAR_LISTING_ID':'NO_PAIR_NEAR_LISTING_ID';
 return row;
}

async function yProbe(){
 const cityDistrict=encodeURIComponent(`台北市-${meta.yungching}`);const list=await getText(`https://buy.yungching.com.tw/list/${cityDistrict}_c`);
 const houseUrls=urls(list.text,/(?:https?:\/\/buy\.yungching\.com\.tw)?\/?house\/([A-Za-z0-9_-]+)/g,m=>`https://buy.yungching.com.tw/house/${m[1]}`);const detailUrl=houseUrls[0]||null;const row={provider:'yungching',district:meta.name,list_status:list.status,list_bytes:Buffer.byteLength(list.text),house_links_found:houseUrls.length,first_house_url:detailUrl,list_pairs:pairs(list.text)};
 if(!detailUrl)return row;
 const id=detailUrl.split('/').pop();const detail=await getText(detailUrl);const wins=windows(detail.text,id);row.detail_status=detail.status;row.detail_bytes=Buffer.byteLength(detail.text);row.detail_pairs=pairs(detail.text);row.detail_pairs_near_id=uniq(wins.flatMap(pairs));row.detail_address_candidates=addressCandidates(stripTags(detail.text));row.endpoint_hints=endpointHints(detail.text);row.script_srcs=urls(detail.text,/<script[^>]+src=["']([^"']+)["']/gi,m=>m[1]).slice(0,20);row.correlation_verdict=row.detail_pairs_near_id.length?'PAIR_NEAR_LISTING_ID':'NO_RAW_COORDINATE_PAIR';
 return row;
}

console.log('==========================================================');console.log(' Taipei-Maps provider probe V2 - LISTING-SPECIFIC');console.log(` District: ${meta.name}`);console.log(' Low-frequency research: one list + one detail GET/provider.');console.log(' No login, no anti-bot bypass, no persistence.');console.log('==========================================================\n');
for(const fn of [sProbe,yProbe]){try{const r=await fn();console.log(JSON.stringify(r,null,2));}catch(e){console.error(JSON.stringify({provider:fn===sProbe?'sinyi':'yungching',error:String(e?.message||e)},null,2));}console.log('');}
console.log('--- interpretation ---');console.log('Sinyi: only STRONG_SINGLE_PAIR_NEAR_LISTING_ID is enough to wire exact source coordinates.');console.log('Yungching: raw coordinate absence is not failure; address/API hints tell us the next probe path.');
