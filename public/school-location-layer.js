(()=>{
  const SOURCE_ID='school-location';
  const POINT_ID='school-location-point';
  const LABEL_ID='school-location-label';
  const EMPTY={type:'FeatureCollection',features:[]};
  const TWIN_CITY_BOUNDS={west:121.20,south:24.78,east:121.90,north:25.35};

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
    if(!text||/幼兒園|幼稚園|大學|學院|補習|圖書館|博物館|美術館|文化中心|社教館|職訓/.test(text))return null;
    if(/國小|國民小學|小學/.test(text))return 'elementary';
    if(/國中|國民中學/.test(text))return 'junior';
    return null;
  }

  function shortName(name){
    return String(name||'')
      .replace(/^臺北市立/,'').replace(/^台北市立/,'').replace(/^新北市立/,'')
      .replace(/^臺北市/,'').replace(/^台北市/,'').replace(/^新北市/,'')
      .replace(/^(大安|信義|中正|松山|中山|萬華|文山|南港|內湖|士林|北投|大同)區/,'')
      .replace(/國民小學/,'國小').replace(/國民中學/,'國中')
      .trim();
  }

  function normalizeRecord(record,index){
    if(!record||typeof record!=='object')return null;
    const name=String(firstValue(record,['name','NAME','Name','markname','markName','facilityName','設施名稱','名稱'])||'').trim();
    const category=String(firstValue(record,['category','CATEGORY','typeName','typename','class','kind','類別','種類'])||'').trim();
    const level=classifySchool(name,category);
    if(!level)return null;
    const lng=Number(firstValue(record,['lon','lng','longitude','LONGITUDE','x','X','經度']));
    const lat=Number(firstValue(record,['lat','latitude','LATITUDE','y','Y','緯度']));
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||!inTwinCity(lng,lat))return null;
    const address=String(firstValue(record,['address','ADDRESS','addr','ADDR','fullAddress','門牌','地址'])||'').trim();
    const id=String(firstValue(record,['id','ID','objectid','OBJECTID','uid','UID'])||`${name}-${lng.toFixed(6)}-${lat.toFixed(6)}-${index}`);
    return {type:'Feature',id,geometry:{type:'Point',coordinates:[lng,lat]},properties:{id,name:name||'未命名學校',short_name:shortName(name)||name,level,address,source:'NLSC COM_009'}};
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
    const seen=new Set(),out=[];
    for(const f of features){
      const c=f.geometry?.coordinates||[],p=f.properties||{};
      const key=`${p.name}|${Number(c[0]).toFixed(5)}|${Number(c[1]).toFixed(5)}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(f);
    }
    return out;
  }

  function popupHtml(p){
    const safe=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const level=p.level==='junior'?'國中':'國小';
    return `<div style="font:13px/1.5 system-ui,-apple-system,sans-serif;min-width:180px"><strong>${safe(p.name)}</strong><br><span>${level} · 學校位置</span>${p.address?`<br><span style="color:#66717b">${safe(p.address)}</span>`:''}<br><span style="font-size:11px;color:#7a848d">位置資料：NLSC 文教設施</span></div>`;
  }

  class SchoolLocationLayer{
    constructor(map,{onState}={}){
      this.map=map;
      this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;
      this.level='elementary';
      this.abortController=null;
      this.timer=null;
      this.lastKey='';
      this.features=[];
      this.boundMove=()=>this.schedule();
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const before=this.map.getLayer('school-catchment-label')?'school-catchment-label':(this.map.getLayer('building')?'building':undefined);
      this.map.addLayer({
        id:POINT_ID,type:'circle',source:SOURCE_ID,
        filter:['==',['get','level'],this.level],
        layout:{visibility:'none'},
        paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],13,4.5,15,6,17,7.5],
          'circle-color':'#24303a','circle-opacity':.96,
          'circle-stroke-color':'#ffffff','circle-stroke-width':2
        }
      },before);
      this.map.addLayer({
        id:LABEL_ID,type:'symbol',source:SOURCE_ID,minzoom:15.8,
        filter:['==',['get','level'],this.level],
        layout:{visibility:'none','text-field':['get','short_name'],'text-size':11,'text-offset':[0,1.15],'text-anchor':'top','text-max-width':9,'text-allow-overlap':false},
        paint:{'text-color':'#24303a','text-halo-color':'rgba(255,255,255,.96)','text-halo-width':1.3}
      });
      this.map.on('moveend',this.boundMove);
      this.map.on('click',POINT_ID,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({maxWidth:'280px'}).setLngLat(f.geometry.coordinates.slice()).setHTML(popupHtml(f.properties||{})).addTo(this.map);});
      this.map.on('mouseenter',POINT_ID,()=>{this.map.getCanvas().style.cursor='pointer';});
      this.map.on('mouseleave',POINT_ID,()=>{this.map.getCanvas().style.cursor='';});
      this.syncVisibility();
    }

    setEnabled(on){
      this.enabled=!!on;
      this.syncVisibility();
      if(this.enabled)this.refresh(true);else this.emit('off','校點 OFF');
    }

    setLevel(level){
      if(!['elementary','junior'].includes(level))return;
      this.level=level;this.lastKey='';
      for(const id of [POINT_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setFilter(id,['==',['get','level'],this.level]);
      if(this.enabled)this.refresh(true);
    }

    syncVisibility(){
      for(const id of [POINT_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');
    }

    schedule(){if(!this.enabled)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh(false),220);}

    queryRadius(){const z=this.map.getZoom();return z>=15?3200:z>=13?4500:5000;}

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      const c=this.map.getCenter();
      if(!inTwinCity(c.lng,c.lat)){this.clear();this.emit('outside','校點目前只載入雙北');return;}
      if(this.map.getZoom()<12.8){this.clear();this.emit('zoom','再放大一點即可顯示學校位置');return;}
      const radius=this.queryRadius();
      const key=`${this.level}:${c.lng.toFixed(3)}:${c.lat.toFixed(3)}:${radius}`;
      if(!force&&key===this.lastKey)return;this.lastKey=key;
      this.abortController?.abort();this.abortController=new AbortController();
      this.emit('loading',`${this.level==='junior'?'國中':'國小'}校點載入中…`);
      const url=`https://api.nlsc.gov.tw/other/MarkBufferAnlys/edu/${c.lng.toFixed(6)}/${c.lat.toFixed(6)}/${radius}`;
      try{
        const response=await fetch(url,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`NLSC HTTP ${response.status}`);
        const text=await response.text();
        let payload;try{payload=JSON.parse(text);}catch{throw new Error('NLSC 回傳格式不是 JSON');}
        const records=flattenResponse(payload);
        this.features=dedupe(records.map(normalizeRecord).filter(Boolean).filter(f=>f.properties.level===this.level));
        const source=this.map.getSource(SOURCE_ID);if(source)source.setData({type:'FeatureCollection',features:this.features});
        this.emit('ready',`${this.level==='junior'?'國中':'國小'}校點 · ${this.features.length} 所`);
      }catch(e){
        if(e?.name==='AbortError')return;
        console.warn('School location layer failed',e);this.clear();this.emit('error',`校點暫時載入失敗 · ${e?.message||e}`);
      }
    }

    clear(){this.features=[];const source=this.map.getSource(SOURCE_ID);if(source)source.setData(EMPTY);}
    emit(state,message){this.onState({state,message,level:this.level,count:this.features.length});}
  }

  window.TaipeiMapsSchoolLocationLayer={SchoolLocationLayer,TWIN_CITY_BOUNDS};
})();
