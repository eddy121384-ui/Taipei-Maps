(()=>{
  const SOURCE_ID='school-catchment';
  const FILL_ID='school-catchment-fill';
  const LINE_ID='school-catchment-line';
  const LABEL_ID='school-catchment-label';
  const EMPTY={type:'FeatureCollection',features:[]};
  const PALETTE=['#8e6bbf','#4f8ecb','#50a987','#d08b48','#c85f71','#798f3f','#4b9ca8','#b56eae','#7c79c5','#be7a52','#5e9a68','#a1794f'];

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

  // Runtime lookup tables are compiled from the canonical dataset so the data module stays plain,
  // serializable assignment data and the renderer owns neighbor-spec parsing/runtime Sets.
  const ELEMENTARY=compileTable(DATASET.levels.elementary);
  const JUNIOR=compileTable(DATASET.levels.junior);

  function cleanDistrict(s){return String(s||'').trim().replace(/市$/,'').replace(/區$/,'');}
  function cleanVillage(s){return String(s||'').trim().replace(/里$/,'');}
  function neighborNo(value){const n=Number(String(value??'').match(/\d+/)?.[0]);return Number.isFinite(n)?n:null;}

  function assignment(level,district,village,neighbor){
    const table=level==='junior'?JUNIOR:ELEMENTARY;
    const entry=table[`${cleanDistrict(district)}|${cleanVillage(village)}`];
    if(!entry)return null;
    if(entry.all)return entry.all;
    if(neighbor==null)return null;
    return entry.rules.find(r=>r.neighbors.has(neighbor))?.school||null;
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

  class SchoolDistrictLayer{
    constructor(map,{onState}={}){
      this.map=map;this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;this.level='elementary';this.abortController=null;this.timer=null;this.lastKey='';
      this.boundMove=()=>this.schedule();
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const before=this.map.getLayer('building')?'building':undefined;
      this.map.addLayer({id:FILL_ID,type:'fill',source:SOURCE_ID,layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':.25}},before);
      this.map.addLayer({id:LINE_ID,type:'line',source:SOURCE_ID,layout:{visibility:'none'},paint:{'line-color':'rgba(36,48,58,.34)','line-width':['interpolate',['linear'],['zoom'],13,.35,16,.9,18,1.25]}},before);
      this.map.addLayer({id:LABEL_ID,type:'symbol',source:SOURCE_ID,minzoom:14.35,filter:['==',['get','showLabel'],true],layout:{visibility:'none','text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],14.35,11,16,12.5,18,13.5],'text-line-height':1.05,'text-max-width':9,'text-padding':22,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#26323c','text-halo-color':'rgba(255,255,255,.94)','text-halo-width':1.35}});
      this.map.on('moveend',this.boundMove);
      this.map.on('click',FILL_ID,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({maxWidth:'290px'}).setLngLat(e.lngLat).setHTML(popupHtml(f.properties||{})).addTo(this.map);});
      this.map.on('mouseenter',FILL_ID,()=>{this.map.getCanvas().style.cursor='pointer';});
      this.map.on('mouseleave',FILL_ID,()=>{this.map.getCanvas().style.cursor='';});
      this.syncVisibility();
    }

    setEnabled(on){this.enabled=!!on;this.syncVisibility();if(this.enabled)this.refresh(true);else this.emit('off','學區 OFF');}
    setLevel(level){if(!['elementary','junior'].includes(level))return;this.level=level;this.lastKey='';if(this.enabled)this.refresh(true);}
    syncVisibility(){for(const id of [FILL_ID,LINE_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');}
    schedule(){if(!this.enabled)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh(false),180);}
    emit(state,message,extra={}){this.onState({state,message,level:this.level,...extra});}

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      if(this.map.getZoom()<13.2){this.clear();this.emit('zoom','再放大一點即可顯示里鄰級學區邊界');return;}
      const b=this.map.getBounds();
      const key=[this.level,b.getWest().toFixed(3),b.getSouth().toFixed(3),b.getEast().toFixed(3),b.getNorth().toFixed(3)].join(':');
      if(!force&&key===this.lastKey)return;this.lastKey=key;
      this.abortController?.abort();this.abortController=new AbortController();
      this.emit('loading',`${this.level==='junior'?'國中':'國小'}學區載入中…`);
      const params=new URLSearchParams({
        where:COVERAGE_WHERE,outFields:'SECT_NAME,LIE_NAME,LI_NO',returnGeometry:'true',
        geometry:`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',
        spatialRel:'esriSpatialRelIntersects',resultRecordCount:'1000',f:'geojson'
      });
      try{
        const response=await fetch(`${TAIPEI_NEIGHBOR_QUERY}?${params}`,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`臺北鄰界 HTTP ${response.status}`);
        const fc=await response.json();
        const features=[];let unmatched=0;
        for(const f of fc.features||[]){
          const p=f.properties||{};const district=cleanDistrict(p.SECT_NAME),village=cleanVillage(p.LIE_NAME),neighbor=neighborNo(p.LI_NO);
          if(!COVERAGE_DISTRICTS.has(district))continue;
          const school=assignment(this.level,district,village,neighbor);
          if(!school){unmatched++;continue;}
          features.push({...f,properties:{...p,district,village,neighbor,school,label:labelFor(school),showLabel:false,level:this.level,color:colorFor(school),key:`${district}|${village}|${neighbor}`}});
        }
        const catchments=chooseLabelAnchors(features);
        const src=this.map.getSource(SOURCE_ID);if(src)src.setData({type:'FeatureCollection',features});
        this.emit('ready',`${this.level==='junior'?'國中':'國小'}學區 · ${catchments} 個學區 · ${features.length} 個鄰界 · ${COVERAGE_LABEL} ${ACADEMIC_YEAR}學年度`,{count:features.length,catchments,unmatched});
      }catch(e){
        if(e?.name==='AbortError')return;console.warn('School district layer failed',e);this.clear();this.emit('error',`學區邊界暫時載入失敗 · ${e?.message||e}`);
      }
    }
    clear(){const src=this.map.getSource(SOURCE_ID);if(src)src.setData(EMPTY);}
  }

  window.TaipeiMapsSchoolDistrictLayer={SchoolDistrictLayer,assignment,ELEMENTARY,JUNIOR,DATASET};
})();
