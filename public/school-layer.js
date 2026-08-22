(()=>{
  const SOURCE_ID='school-poi';
  const LAYERS={elementary:'school-elementary',junior:'school-junior',senior:'school-senior'};
  const TWIN_CITY_BOUNDS={west:121.20,south:24.78,east:121.90,north:25.35};
  const EMPTY={type:'FeatureCollection',features:[]};

  function inTwinCity(lng,lat){
    return lng>=TWIN_CITY_BOUNDS.west&&lng<=TWIN_CITY_BOUNDS.east&&lat>=TWIN_CITY_BOUNDS.south&&lat<=TWIN_CITY_BOUNDS.north;
  }

  function firstValue(obj,keys){
    for(const key of keys){
      if(obj&&obj[key]!==undefined&&obj[key]!==null&&String(obj[key]).trim()!=='')return obj[key];
    }
    return null;
  }

  function classifySchool(name,category=''){
    const text=`${name||''} ${category||''}`.replace(/\s+/g,'');
    if(!text)return null;
    if(/幼兒園|幼稚園|大學|學院|補習|圖書館|博物館|美術館|文化中心|社教館|職訓/.test(text))return null;
    if(/高中|高職|高級中學|高級商業|高級工業|高級家事|商工|工家|家商|護校/.test(text))return 'senior';
    if(/國中|國民中學/.test(text))return 'junior';
    if(/國小|國民小學|小學/.test(text))return 'elementary';
    // Some private secondary schools are named only "○○中學". Keep them visible in the junior layer
    // rather than silently dropping them; v0.2 will normalize against official school directories.
    if(/中學/.test(text))return 'junior';
    return null;
  }

  function normalizeRecord(record,index){
    if(!record||typeof record!=='object')return null;
    const name=String(firstValue(record,['name','NAME','Name','markname','markName','facilityName','設施名稱','名稱'])||'').trim();
    const category=String(firstValue(record,['category','CATEGORY','typeName','typename','class','kind','類別','種類'])||'').trim();
    const level=classifySchool(name,category);
    if(!level)return null;

    const lng=Number(firstValue(record,['lon','lng','longitude','LONGITUDE','x','X','經度']));
    const lat=Number(firstValue(record,['lat','latitude','LATITUDE','y','Y','緯度']));
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||lng<119||lng>123||lat<21||lat>26.5)return null;

    const address=String(firstValue(record,['address','ADDRESS','addr','ADDR','fullAddress','門牌','地址'])||'').trim();
    const id=String(firstValue(record,['id','ID','objectid','OBJECTID','uid','UID'])||`${name}-${lng.toFixed(6)}-${lat.toFixed(6)}-${index}`);
    return {type:'Feature',id,geometry:{type:'Point',coordinates:[lng,lat]},properties:{id,name:name||'未命名學校',level,category,address,source:'NLSC COM_009'}};
  }

  function flattenResponse(payload){
    if(Array.isArray(payload))return payload;
    if(!payload||typeof payload!=='object')return [];
    for(const key of ['features','data','result','results','items','list','rows']){
      if(Array.isArray(payload[key]))return payload[key].map(item=>item?.properties?{...item.properties,...(item.geometry?.coordinates?{lon:item.geometry.coordinates[0],lat:item.geometry.coordinates[1]}:{})}:item);
    }
    const arrays=Object.values(payload).filter(Array.isArray);
    return arrays.length?arrays.flat():[];
  }

  function dedupe(features){
    const seen=new Set();
    const output=[];
    for(const feature of features){
      const p=feature.properties||{};
      const c=feature.geometry?.coordinates||[];
      const key=`${p.name}|${Number(c[0]).toFixed(5)}|${Number(c[1]).toFixed(5)}`;
      if(seen.has(key))continue;
      seen.add(key);output.push(feature);
    }
    return output;
  }

  function popupHtml(p){
    const levelLabel={elementary:'國小',junior:'國中',senior:'高中職'}[p.level]||'學校';
    const safe=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    return `<div style="font:13px/1.45 system-ui,-apple-system,sans-serif;min-width:150px"><strong>${safe(p.name)}</strong><br><span>${levelLabel}</span>${p.address?`<br><span style="color:#66717b">${safe(p.address)}</span>`:''}<br><span style="font-size:11px;color:#7a848d">資料：NLSC 文教設施</span></div>`;
  }

  class SchoolLayer{
    constructor(map,{onState}={}){
      this.map=map;
      this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;
      this.levels={elementary:true,junior:true,senior:true};
      this.abortController=null;
      this.lastKey='';
      this.refreshTimer=null;
      this.features=[];
      this.boundMove=()=>this.scheduleRefresh();
      this.boundClick={};
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const specs=[
        ['elementary','#2e7d32'],
        ['junior','#1565c0'],
        ['senior','#ef6c00']
      ];
      for(const [level,color] of specs){
        const id=LAYERS[level];
        this.map.addLayer({id,type:'circle',source:SOURCE_ID,filter:['==',['get','level'],level],layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],11,4,14,6,17,8],'circle-color':color,'circle-opacity':.9,'circle-stroke-color':'#ffffff','circle-stroke-width':1.5}});
        const click=e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({closeButton:true,maxWidth:'260px'}).setLngLat(f.geometry.coordinates.slice()).setHTML(popupHtml(f.properties||{})).addTo(this.map);};
        this.boundClick[id]=click;
        this.map.on('click',id,click);
        this.map.on('mouseenter',id,()=>{this.map.getCanvas().style.cursor='pointer';});
        this.map.on('mouseleave',id,()=>{this.map.getCanvas().style.cursor='';});
      }
      this.map.on('moveend',this.boundMove);
      this.syncVisibility();
    }

    destroy(){
      clearTimeout(this.refreshTimer);
      this.abortController?.abort();
      this.map.off('moveend',this.boundMove);
      for(const [level,id] of Object.entries(LAYERS)){
        const click=this.boundClick[id];if(click)this.map.off('click',id,click);
        if(this.map.getLayer(id))this.map.removeLayer(id);
      }
      if(this.map.getSource(SOURCE_ID))this.map.removeSource(SOURCE_ID);
    }

    setEnabled(on){
      this.enabled=!!on;
      this.syncVisibility();
      if(this.enabled)this.refresh(true);else this.emit('off','就學圖層 OFF');
    }

    setLevel(level,on){
      if(!(level in this.levels))return;
      this.levels[level]=!!on;
      this.syncVisibility();
      this.emit('ready',this.summary());
    }

    syncVisibility(){
      for(const [level,id] of Object.entries(LAYERS)){
        if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled&&this.levels[level]?'visible':'none');
      }
    }

    scheduleRefresh(){
      if(!this.enabled)return;
      clearTimeout(this.refreshTimer);
      this.refreshTimer=setTimeout(()=>this.refresh(false),220);
    }

    queryRadius(){
      const z=this.map.getZoom();
      if(z>=14)return 3500;
      if(z>=12)return 5000;
      return 5000;
    }

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      const center=this.map.getCenter();
      if(!inTwinCity(center.lng,center.lat)){
        this.features=[];this.updateSource();this.lastKey='';
        this.emit('outside','就學圖層目前先做雙北；移回台北／新北即可載入');
        return;
      }
      if(this.map.getZoom()<11.5){
        this.features=[];this.updateSource();this.lastKey='';
        this.emit('zoom','再放大一點即可載入附近學校');
        return;
      }
      const radius=this.queryRadius();
      const key=`${center.lng.toFixed(3)}:${center.lat.toFixed(3)}:${radius}`;
      if(!force&&key===this.lastKey)return;
      this.lastKey=key;
      this.abortController?.abort();
      this.abortController=new AbortController();
      this.emit('loading','載入附近學校…');
      const url=`https://api.nlsc.gov.tw/other/MarkBufferAnlys/edu/${center.lng.toFixed(6)}/${center.lat.toFixed(6)}/${radius}`;
      try{
        const response=await fetch(url,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`NLSC HTTP ${response.status}`);
        const text=await response.text();
        let payload;
        try{payload=JSON.parse(text);}catch{throw new Error('NLSC 回傳格式不是 JSON');}
        const records=flattenResponse(payload);
        this.features=dedupe(records.map(normalizeRecord).filter(Boolean));
        this.updateSource();
        this.emit('ready',this.summary());
      }catch(e){
        if(e?.name==='AbortError')return;
        console.warn('School layer refresh failed',e);
        this.features=[];this.updateSource();
        this.emit('error',`學校資料暫時載入失敗 · ${e?.message||e}`);
      }
    }

    updateSource(){
      const source=this.map.getSource(SOURCE_ID);
      if(source)source.setData({type:'FeatureCollection',features:this.features});
    }

    summary(){
      const counts={elementary:0,junior:0,senior:0};
      for(const f of this.features)if(f.properties?.level in counts)counts[f.properties.level]++;
      const shown=[];
      if(this.levels.elementary)shown.push(`國小 ${counts.elementary}`);
      if(this.levels.junior)shown.push(`國中 ${counts.junior}`);
      if(this.levels.senior)shown.push(`高中職 ${counts.senior}`);
      return `附近學校 · ${shown.join(' · ')}`;
    }

    emit(state,message){this.onState({state,message,features:this.features,levels:{...this.levels}});}
  }

  window.TaipeiMapsSchoolLayer={SchoolLayer,TWIN_CITY_BOUNDS,LAYERS,classifySchool};
})();
