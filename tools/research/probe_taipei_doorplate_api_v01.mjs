const RID='ce76ca0c-7f94-4935-ab47-1d2a41ca2abb';
const queries=['杭州南路一段61巷38號','汀州路一段306巷5號'];
const endpoints=q=>[
  `https://data.taipei/api/v1/dataset/${RID}?scope=resourceAquire&q=${encodeURIComponent(q)}&limit=5`,
  `https://data.taipei/opendata/datalist/apiAccess?scope=resourceAquire&rid=${RID}&q=${encodeURIComponent(q)}&limit=5`
];
for(const q of queries){
  console.log(`QUERY ${q}`);
  for(const url of endpoints(q)){
    try{
      const r=await fetch(url,{headers:{Accept:'application/json'}});
      const text=await r.text();
      console.log('URL',url);
      console.log('STATUS',r.status,r.headers.get('content-type'));
      console.log('BODY',text.slice(0,1200).replace(/\s+/g,' '));
    }catch(e){console.log('ERROR',url,String(e?.message||e))}
  }
}
