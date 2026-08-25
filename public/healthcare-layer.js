(()=>{
  const TAIPEI_BOUNDS={west:121.40,south:24.90,east:121.75,north:25.25};
  const SOURCE_ID='taipei-healthcare';
  const GEOJSON_URL='/generated/taipei_healthcare_facilities.geojson';
  const COLORS={hospital:'#c62828',clinic:'#00838f'};
  const LAYERS={hospital:'healthcare-hospital',hospitalLabel:'healthcare-hospital-label',clinic:'healthcare-clinic',clinicLabel:'healthcare-clinic-label'};
  const ALL_LAYER_IDS=Object.values(LAYERS);

  function centerInsideTaipei(map){const c=map.getCenter();return c.lng>=TAIPEI_BOUNDS.west&&c.lng<=TAIPEI_BOUNDS.east&&c.lat>=TAIPEI_BOUNDS.south&&c.lat<=TAIPEI_BOUNDS.north;}
  function validateHealthcare(data){
    if(data?.type!=='FeatureCollection')throw new Error(`Taipei healthcare dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(f=>f?.geometry?.type==='Point');
    const hospital=features.filter(f=>f?.properties?.facility_type==='hospital').length;
    const clinic=features.filter(f=>f?.properties?.facility_type==='clinic').length;
    if(hospital<30)throw new Error(`Taipei healthcare hospital count unexpectedly small: ${hospital}`);
    if(clinic<1700)throw new Error(`Taipei healthcare clinic count unexpectedly small: ${clinic}`);
    for(const feature of features){
      const [lng,lat]=feature.geometry.coordinates||[];
      if(!Number.isFinite(Number(lng))||!Number.isFinite(Number(lat)))throw new Error('Taipei healthcare feature has invalid coordinates');
      if(!String(feature?.properties?.facility_name||'').trim())throw new Error('Taipei healthcare feature has missing facility_name');
    }
    return {type:'FeatureCollection',features};
  }
  function pointLayer(id,type,{minzoom,radius,color}){
    return {id,type:'circle',source:SOURCE_ID,minzoom,filter:['==',['get','facility_type'],type],layout:{visibility:'none'},paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],minzoom,radius,15,radius+1.2,18,radius+2],
      'circle-color':color,'circle-opacity':.94,'circle-stroke-color':'rgba(255,255,255,.98)','circle-stroke-width':['interpolate',['linear'],['zoom'],minzoom,1.2,15,1.7,18,2.0]
    }};
  }
  function labelLayer(id,type,{minzoom,color}){
    return {id,type:'symbol',source:SOURCE_ID,minzoom,filter:['==',['get','facility_type'],type],layout:{visibility:'none',
      'text-field':['get','facility_name'],'text-size':['interpolate',['linear'],['zoom'],minzoom,10.5,15,11.5,18,13],
      'text-offset':[0,1.0],'text-anchor':'top','text-max-width':9,'text-allow-overlap':false,'text-ignore-placement':false
    },paint:{'text-color':color,'text-halo-color':'rgba(255,255,255,.98)','text-halo-width':1.45,'text-halo-blur':.25}};
  }
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

  class HealthcareToggleControl{
    constructor(layer){this.layer=layer;this.container=null;this.button=null;}
    onAdd(){
      const container=document.createElement('div');container.className='maplibregl-ctrl maplibregl-ctrl-group';
      const button=document.createElement('button');button.type='button';button.textContent='✚';button.style.fontSize='17px';button.style.fontWeight='900';button.style.lineHeight='1';button.style.color='#c62828';button.setAttribute('aria-label','切換醫院與診所');
      button.onclick=()=>this.layer.setEnabled(!this.layer.enabled);container.appendChild(button);this.container=container;this.button=button;this.update();return container;
    }
    onRemove(){this.container?.remove();this.container=null;this.button=null;}
    update({inTaipei=centerInsideTaipei(this.layer.map)}={}){if(!this.button)return;this.button.style.opacity=inTaipei?'1':'.55';this.button.style.background=this.layer.enabled&&inTaipei?'#fdecec':'';this.button.title=this.layer.enabled?(inTaipei?'醫療 ON · 醫院 / 診所':'醫療 ON · 臺北市資料層'):'醫療 OFF · 醫院 / 診所';this.button.setAttribute('aria-pressed',this.layer.enabled?'true':'false');}
  }

  class HealthcareLayer{
    constructor(map,{enabled=true,onState=null}={}){this.map=map;this.enabled=Boolean(enabled);this.onState=typeof onState==='function'?onState:()=>{};this.initialized=false;this.control=null;this.popup=null;this.counts=null;this._moveHandler=()=>this.sync();this._clickHandler=e=>this.openPopup(e);this._enterHandler=()=>{this.map.getCanvas().style.cursor='pointer';};this._leaveHandler=()=>{this.map.getCanvas().style.cursor='';};}
    emit(state,message,extra={}){this.onState({state,message,...extra});this.map.fire('taipei-maps-healthcarechange',{state,message,enabled:this.enabled,...extra});}
    async init(){
      if(this.initialized)return true;
      try{
        this.emit('loading','臺北醫療院所資料載入中…');
        const response=await fetch(GEOJSON_URL,{cache:'no-store'});
        if(!response.ok)throw new Error(`Healthcare cache HTTP ${response.status}; run start-healthcare-layer-smoke.bat to build it`);
        const data=validateHealthcare(await response.json());
        const hospitals=data.features.filter(f=>f.properties.facility_type==='hospital').length;
        const clinics=data.features.filter(f=>f.properties.facility_type==='clinic').length;
        this.counts={hospital:hospitals,clinic:clinics,total:data.features.length};
        if(!this.map.getSource(SOURCE_ID))this.map.addSource(SOURCE_ID,{type:'geojson',data,attribution:'© 臺北市政府衛生局'});
        const beforeId=this.map.getLayer('building')?'building':undefined;
        const layers=[
          pointLayer(LAYERS.hospital,'hospital',{minzoom:10.0,radius:4.0,color:COLORS.hospital}),
          labelLayer(LAYERS.hospitalLabel,'hospital',{minzoom:11.2,color:'#8e0000'}),
          pointLayer(LAYERS.clinic,'clinic',{minzoom:12.2,radius:2.8,color:COLORS.clinic}),
          labelLayer(LAYERS.clinicLabel,'clinic',{minzoom:13.7,color:'#005662'})
        ];
        for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);
        for(const id of [LAYERS.hospital,LAYERS.clinic]){
          this.map.on('click',id,this._clickHandler);this.map.on('mouseenter',id,this._enterHandler);this.map.on('mouseleave',id,this._leaveHandler);
        }
        this.map.on('moveend',this._moveHandler);
        this.control=new HealthcareToggleControl(this);this.map.addControl(this.control,'top-right');
        this.initialized=true;this.sync();
        console.info(`Taipei healthcare ready: ${hospitals} hospital(s), ${clinics} clinic(s)`);
        return true;
      }catch(error){console.warn('Taipei healthcare overlay unavailable',error);this.emit('error',`醫療院所暫時無法載入 · ${error?.message||error}`);return false;}
    }
    openPopup(event){
      const feature=event?.features?.[0];if(!feature)return;
      const p=feature.properties||{};const [lng,lat]=feature.geometry.coordinates;
      const type=p.facility_type_zh|| (p.facility_type==='hospital'?'醫院':'診所');
      const district=p.district?`<div style="margin-top:4px;color:#455a64">${escapeHtml(p.district)}</div>`:'';
      const address=p.address?`<div style="margin-top:2px;color:#455a64">${escapeHtml(p.address)}</div>`:'';
      const html=`<div style="min-width:190px"><div style="font-size:11px;font-weight:800;color:${p.facility_type==='hospital'?COLORS.hospital:COLORS.clinic}">${escapeHtml(type)}</div><div style="font-size:14px;font-weight:800;margin-top:2px">${escapeHtml(p.facility_name)}</div>${district}${address}<div style="font-size:10px;color:#78909c;margin-top:7px">資料：臺北市政府衛生局</div></div>`;
      this.popup?.remove();this.popup=new maplibregl.Popup({offset:10,maxWidth:'320px'}).setLngLat([lng,lat]).setHTML(html).addTo(this.map);
    }
    sync(){
      if(!this.initialized||!this.map.isStyleLoaded())return;
      const inTaipei=centerInsideTaipei(this.map);const show=this.enabled&&inTaipei;
      for(const id of ALL_LAYER_IDS)if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',show?'visible':'none');
      this.control?.update({inTaipei});
      if(!this.enabled)this.emit('off','醫療 OFF',{inTaipei,counts:this.counts});
      else if(inTaipei)this.emit('ready',`醫療 ON · ${this.counts?.hospital||0} 醫院 / ${this.counts?.clinic||0} 診所`,{inTaipei,counts:this.counts});
      else this.emit('outside','醫療資料目前涵蓋臺北市',{inTaipei,counts:this.counts});
    }
    setEnabled(enabled){this.enabled=Boolean(enabled);this.sync();}
    destroy(){
      this.map.off('moveend',this._moveHandler);
      for(const id of [LAYERS.hospital,LAYERS.clinic])if(this.map.getLayer(id)){this.map.off('click',id,this._clickHandler);this.map.off('mouseenter',id,this._enterHandler);this.map.off('mouseleave',id,this._leaveHandler);}
      this.popup?.remove();this.popup=null;if(this.control){try{this.map.removeControl(this.control);}catch{}this.control=null;}
      for(const id of [...ALL_LAYER_IDS].reverse())if(this.map.getLayer(id))this.map.removeLayer(id);if(this.map.getSource(SOURCE_ID))this.map.removeSource(SOURCE_ID);this.initialized=false;
    }
  }

  window.TaipeiMapsHealthcareLayer={HealthcareLayer,TAIPEI_BOUNDS,SOURCE_ID,GEOJSON_URL,COLORS,LAYERS,ALL_LAYER_IDS,validateHealthcare};
})();
