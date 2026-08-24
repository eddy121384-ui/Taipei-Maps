(()=>{
  const SOURCE_ID='school-catchment';
  const FILL_ID='school-catchment-fill';
  const LINE_ID='school-catchment-line';
  const LABEL_ID='school-catchment-label';
  const EMPTY={type:'FeatureCollection',features:[]};
  const PALETTE=['#8e6bbf','#4f8ecb','#50a987','#d08b48','#c85f71','#798f3f','#4b9ca8','#b56eae','#7c79c5','#be7a52','#5e9a68','#a1794f'];
  const GEOMETRY_PAGE_SIZE=1000;
  const GEOMETRY_CACHE_LIMIT=6;
  const GEOMETRY_CACHE_PADDING=.32;
  const GEOMETRY_CACHE_MIN_PAD=.012;
  const TAIPEI_FETCH_BOUNDS={west:121.42,south:24.93,east:121.70,north:25.23};

  const DATASET=window.TaipeiMapsSchoolDistrictData115;
  if(!DATASET?.levels?.elementary||!DATASET?.levels?.junior||!DATASET?.sources?.geometry?.endpoint){
    console.error('Taipei-Maps school district dataset is missing or malformed. Load taipei-school-districts-115.js before school-district-layer.js.');
    return;
  }

  const ACADEMIC_YEAR=DATASET.academicYear;
  const TAIPEI_NEIGHBOR_QUERY=DATASET.sources.geometry.endpoint;
  const COVERAGE_DISTRICTS=new Set(DATASET.coverage?.districts||[]);
  const COVERAGE_LABEL=[...COVERAGE_DISTRICTS].join('/');
  const COVERAGE_WHERE=`SECT_NAME IN (${[...COVERAGE_DISTRICTS].map(d=>`'${d}區'`).join(',')})`;

  function parseSpec(spec){
    const out=new Set();
    for(const token of String(spec||'').replace(/、/g,',').split(',').map(s=>s.trim()).filter(Boolean)){
      const m=token.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){for(let n=Number(m[1]);n<=Number(m[2]);n++)out.add(n);}
      else if(/^\d+$/.test(token))out.add(Number(token));
    }
    return out;
  }

  function compileTable(source){
    const out={};
    for(const [key,entry] of Object.entries(source||{})){
      if(entry?.all){out[key]={all:entry.all};continue;}
      out[key]={rules:(entry?.rules||[]).map(rule=>({...rule,neighbors:parseSpec(rule.spec)}))};
    }
    return out;
  }

  const ELEMENTARY=compileTable(DATASET.levels.elementary);
  const JUNIOR=compileTable(DATASET.levels.junior);

  function cleanDistrict(s){return String(s||'').trim().replace(/市$/,'').replace(/區$/,'');}
  function cleanVillage(s){return String(s||'').trim().replace(/里$/,'');}
  function canonicalVillage(properties){
    const sdf=String(properties?.SDFNAME||'').trim();
    const fromSdf=sdf.match(/^(.+?)里\s*\d/);
    return cleanVillage(fromSdf?.[1]||properties?.LIE_NAME);
  }
  function neighborNos(value){return [...new Set((String(value??'').match(/\d+/g)||[]).map(Number).filter(Number.isFinite))];}

  function assignment(level,district,village,neighbor){
    const table=level==='junior'?JUNIOR:ELEMENTARY;
    const entry=table[`${cleanDistrict(district)}|${cleanVillage(village)}`];
    if(!entry)return null;
    if(entry.all)return entry.all;
    if(neighbor==null)return null;
    return entry.rules.find(r=>r.neighbors.has(neighbor))?.school||null;
  }

  function assignmentForNeighbors(level,district,village,neighbors){
    if(!Array.isArray(neighbors)||!neighbors.length)return null;
    const schools=neighbors.map(neighbor=>assignment(level,district,village,neighbor));
    if(schools.some(school=>!school))return null;
    const unique=[...new Set(schools)];
    return unique.length===1?unique[0]:null;
  }

  function colorFor(label){
    let hash=0;for(const ch of String(label||''))hash=((hash<<5)-hash)+ch.charCodeAt(0)|0;
    return PALETTE[Math.abs(hash)%PALETTE.length];
  }

  function labelFor(school){
    const raw=String(school||'').trim();
    if(!raw.includes('共同學區'))return raw;
    const schools=raw.replace(/共同學區.*$/,'').replace(/[、，,]+$/,'').replace(/、/g,'・');
    return `${schools}\n共同學區`;
  }

  function roughCenter(feature){
    let minLng=Infinity,maxLng=-Infinity,minLat=Infinity,maxLat=-Infinity;
    const walk=node=>{
      if(!Array.isArray(node))return;
      if(node.length>=2&&Number.isFinite(Number(node[0]))&&Number.isFinite(Number(node[1]))){
        const lng=Number(node[0]),lat=Number(node[1]);
        minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);return;
      }
      for(const child of node)walk(child);
    };
    walk(feature?.geometry?.coordinates);
    return Number.isFinite(minLng)?[(minLng+maxLng)/2,(minLat+maxLat)/2]:null;
  }

  function chooseLabelAnchors(features){
    const groups=new Map();
    for(const feature of features){
      const school=feature.properties?.school||'';
      const center=roughCenter(feature);
      if(!center)continue;
      if(!groups.has(school))groups.set(school,[]);
      groups.get(school).push({feature,center});
    }
    for(const items of groups.values()){
      const target=items.reduce((a,item)=>[a[0]+item.center[0],a[1]+item.center[1]],[0,0]).map(v=>v/items.length);
      let best=items[0],bestD=Infinity;
      for(const item of items){
        const dx=item.center[0]-target[0],dy=item.center[1]-target[1],d=dx*dx+dy*dy;
        if(d<bestD){best=item;bestD=d;}
      }
      best.feature.properties.showLabel=true;
    }
    return groups.size;
  }

  function popupHtml(p){
    const safe=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const level=p.level==='junior'?'國中':'國小';
    const shared=String(p.school).includes('共同學區');
    const location=`${safe(p.district)}區・${safe(p.village)}里・第${safe(p.neighbor)}鄰`;
    return `<div style="font:13px/1.5 system-ui,-apple-system,sans-serif;min-width:210px;max-width:260px"><div style="font-size:15px;font-weight:800;color:#24303a">${safe(p.school)}</div><div style="display:inline-block;margin:5px 0 7px;padding:2px 7px;border-radius:999px;background:#edf3f7;color:#384955;font-size:11px;font-weight:700">${level}學區</div><div style="color:#5f6b75">${location}</div>${shared?'<div style="margin-top:7px;padding:6px 8px;border-radius:8px;background:#fff6df;color:#7b591d">共同學區：可對應多校，請再依當年度入學規定確認。</div>':''}<div style="margin-top:7px;font-size:10.5px;color:#7a848d">${safe(ACADEMIC_YEAR)}學年度・${safe(DATASET.sources.assignment.authority)}里鄰學區＋${safe(DATASET.sources.geometry.authority)}鄰界</div></div>`;
  }

  function plainBounds(bounds){
    if(!bounds)return null;
    const west=Number(typeof bounds.getWest==='function'?bounds.getWest():bounds.west);
    const south=Number(typeof bounds.getSouth==='function'?bounds.getSouth():bounds.south);
    const east=Number(typeof bounds.getEast==='function'?bounds.getEast():bounds.east);
    const north=Number(typeof bounds.getNorth==='function'?bounds.getNorth():bounds.north);
    return [west,south,east,north].every(Number.isFinite)?{west,south,east,north}:null;
  }

  function boundsContain(outer,inner){
    const a=plainBounds(outer),b=plainBounds(inner);
    return !!a&&!!b&&a.west<=b.west&&a.south<=b.south&&a.east>=b.east&&a.north>=b.north;
  }

  function boundsIntersect(a,b){
    const x=plainBounds(a),y=plainBounds(b);
    return !!x&&!!y&&x.west<=y.east&&x.east>=y.west&&x.south<=y.north&&x.north>=y.south;
  }

  function paddedBounds(bounds){
    const b=plainBounds(bounds);if(!b)return null;
    const dx=Math.max((b.east-b.west)*GEOMETRY_CACHE_PADDING,GEOMETRY_CACHE_MIN_PAD);
    const dy=Math.max((b.north-b.south)*GEOMETRY_CACHE_PADDING,GEOMETRY_CACHE_MIN_PAD);
    return {west:b.west-dx,south:b.south-dy,east:b.east+dx,north:b.north+dy};
  }

  function geometryIdentity(feature,index){
    const p=feature?.properties||feature?.attributes||{};
    if(p.f_id!=null)return `f:${p.f_id}`;
    if(p.SDFKEY)return `s:${p.SDFKEY}`;
    return `i:${index}:${p.SECT_NAME||''}:${p.LIE_NAME||''}:${p.LI_NO||''}`;
  }

  function dedupeGeometryFeatures(features){
    const seen=new Set(),out=[];
    for(let i=0;i<(features||[]).length;i++){
      const feature=features[i],key=geometryIdentity(feature,i);
      if(seen.has(key))continue;
      seen.add(key);out.push(feature);
    }
    return out;
  }

  class SchoolDistrictLayer{
    constructor(map,{onState}={}){
      this.map=map;this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;this.level='elementary';this.abortController=null;this.timer=null;
      this.geometryRegions=[];this.regionSerial=0;this.activeRegionId=null;this.renderedLevel=null;this.sourceHasData=false;
      this.boundMove=()=>this.schedule();
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const before=this.map.getLayer('building')?'building':undefined;
      this.map.addLayer({id:FILL_ID,type:'fill',source:SOURCE_ID,layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':.25}},before);
      this.map.addLayer({id:LINE_ID,type:'line',source:SOURCE_ID,minzoom:16.2,layout:{visibility:'none'},paint:{'line-color':'rgba(36,48,58,.20)','line-width':['interpolate',['linear'],['zoom'],16.2,.18,17,.34,18,.58,19,.85]}},before);
      this.map.addLayer({id:LABEL_ID,type:'symbol',source:SOURCE_ID,minzoom:14.35,filter:['==',['get','showLabel'],true],layout:{visibility:'none','text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],14.35,11,16,12.5,18,13.5],'text-line-height':1.05,'text-max-width':9,'text-padding':22,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#26323c','text-halo-color':'rgba(255,255,255,.94)','text-halo-width':1.35}});
      this.map.on('moveend',this.boundMove);
      this.map.on('click',FILL_ID,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({maxWidth:'290px'}).setLngLat(e.lngLat).setHTML(popupHtml(f.properties||{})).addTo(this.map);});
      this.map.on('mouseenter',FILL_ID,()=>{this.map.getCanvas().style.cursor='pointer';});
      this.map.on('mouseleave',FILL_ID,()=>{this.map.getCanvas().style.cursor='';});
      this.syncVisibility();
    }

    setEnabled(on){this.enabled=!!on;this.syncVisibility();if(this.enabled)this.refresh(true);else this.emit('off','學區 OFF');}
    setLevel(level){if(!['elementary','junior'].includes(level))return;this.level=level;if(this.enabled)this.refresh(true);}
    syncVisibility(){for(const id of [FILL_ID,LINE_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');}
    schedule(){if(!this.enabled)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh(false),180);}
    emit(state,message,extra={}){this.onState({state,message,level:this.level,...extra});}

    findCachedRegion(viewBounds){
      const index=this.geometryRegions.findIndex(region=>boundsContain(region.bounds,viewBounds));
      if(index<0)return null;
      const [region]=this.geometryRegions.splice(index,1);this.geometryRegions.push(region);
      return region;
    }

    storeRegion(region){
      this.geometryRegions.push(region);
      while(this.geometryRegions.length>GEOMETRY_CACHE_LIMIT)this.geometryRegions.shift();
    }

    async fetchGeometry(queryBounds){
      const features=[];let offset=0,pages=0;
      while(true){
        const params=new URLSearchParams({
          where:COVERAGE_WHERE,
          outFields:'f_id,SECT_NAME,LIE_NAME,LIE_CODE,LI_NO,SDFKEY,SDFNAME',
          orderByFields:'f_id ASC',
          returnGeometry:'true',
          geometry:`${queryBounds.west},${queryBounds.south},${queryBounds.east},${queryBounds.north}`,
          geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',
          resultOffset:String(offset),resultRecordCount:String(GEOMETRY_PAGE_SIZE),f:'geojson'
        });
        const response=await fetch(`${TAIPEI_NEIGHBOR_QUERY}?${params}`,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`臺北鄰界 HTTP ${response.status}`);
        const payload=await response.json();
        if(payload?.error)throw new Error(`臺北鄰界 API ${JSON.stringify(payload.error)}`);
        const page=Array.isArray(payload?.features)?payload.features:[];
        features.push(...page);pages++;
        offset+=page.length;
        if(!page.length||(!payload.exceededTransferLimit&&page.length<GEOMETRY_PAGE_SIZE))break;
        if(pages>=20)throw new Error('臺北鄰界分頁超過 20 頁，已停止以避免無限迴圈');
      }
      return {features:dedupeGeometryFeatures(features),pages};
    }

    renderRegion(region,{cacheHit=false}={}){
      const features=[];let unmatched=0,multiNeighbor=0;
      for(const f of region.features||[]){
        const p=f.properties||{};
        const district=cleanDistrict(p.SECT_NAME),village=canonicalVillage(p),neighbors=neighborNos(p.LI_NO);
        if(!COVERAGE_DISTRICTS.has(district)||!neighbors.length)continue;
        const school=assignmentForNeighbors(this.level,district,village,neighbors);
        if(!school){unmatched++;continue;}
        if(neighbors.length>1)multiNeighbor++;
        const neighbor=neighbors.join('、');
        features.push({...f,properties:{...p,district,village,neighbor,neighbor_numbers:neighbors.join(','),school,label:labelFor(school),showLabel:false,level:this.level,color:colorFor(school),key:`${district}|${village}|${neighbor}`}});
      }
      const catchments=chooseLabelAnchors(features);
      const src=this.map.getSource(SOURCE_ID);if(src)src.setData({type:'FeatureCollection',features});
      this.activeRegionId=region.id;this.renderedLevel=this.level;this.sourceHasData=true;
      const provenance=cacheHit?'快取':`${region.pages} 頁`;
      this.emit('ready',`${this.level==='junior'?'國中':'國小'}學區 · ${catchments} 個學區 · ${features.length} 個鄰界 · ${provenance} · ${COVERAGE_LABEL} ${ACADEMIC_YEAR}學年度`,{count:features.length,catchments,unmatched,multiNeighbor,cacheHit,pages:region.pages});
    }

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      if(this.map.getZoom()<13.2){this.clear();this.emit('zoom','再放大一點即可顯示里鄰級學區邊界');return;}
      const viewBounds=plainBounds(this.map.getBounds());
      if(!boundsIntersect(viewBounds,TAIPEI_FETCH_BOUNDS)){this.clear();this.emit('outside','學區目前只載入臺北市');return;}

      const cached=this.findCachedRegion(viewBounds);
      if(cached){
        if(!force&&this.sourceHasData&&this.activeRegionId===cached.id&&this.renderedLevel===this.level)return;
        this.renderRegion(cached,{cacheHit:true});return;
      }

      this.abortController?.abort();this.abortController=new AbortController();
      const queryBounds=paddedBounds(viewBounds);
      this.emit('loading',`${this.level==='junior'?'國中':'國小'}學區載入中…`);
      try{
        const result=await this.fetchGeometry(queryBounds);
        const region={id:++this.regionSerial,bounds:queryBounds,features:result.features,pages:result.pages};
        this.storeRegion(region);this.renderRegion(region,{cacheHit:false});
      }catch(e){
        if(e?.name==='AbortError')return;console.warn('School district layer failed',e);this.clear();this.emit('error',`學區邊界暫時載入失敗 · ${e?.message||e}`);
      }
    }

    clear(){this.sourceHasData=false;this.activeRegionId=null;const src=this.map.getSource(SOURCE_ID);if(src)src.setData(EMPTY);}
  }

  window.TaipeiMapsSchoolDistrictLayer={
    SchoolDistrictLayer,assignment,assignmentForNeighbors,canonicalVillage,neighborNos,ELEMENTARY,JUNIOR,DATASET,
    plainBounds,boundsContain,boundsIntersect,paddedBounds,dedupeGeometryFeatures,GEOMETRY_PAGE_SIZE
  };
})();