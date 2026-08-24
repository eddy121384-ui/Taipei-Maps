(()=>{
  const TAIWAN_BOUNDS={west:118.0,south:21.5,east:123.8,north:26.7};
  const SOURCE_ID='overture-transportation';
  const SOURCE_LAYER='segment';
  const LAYERS={
    mrtCasing:'transit-mrt-casing',mrt:'transit-mrt',
    traCasing:'transit-tra-casing',tra:'transit-tra',
    thsrCasing:'transit-thsr-casing',thsr:'transit-thsr'
  };
  const ALL_LAYER_IDS=Object.values(LAYERS);

  function transportationUrl(buildingUrl,release){
    if(buildingUrl&&/\/buildings\.pmtiles(?:\?.*)?$/.test(buildingUrl)){
      return buildingUrl.replace(/\/buildings\.pmtiles(?:\?.*)?$/, '/transportation.pmtiles');
    }
    if(release){
      return `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/transportation.pmtiles`;
    }
    throw new Error('Overture building URL or release is required for transit overlay');
  }

  function centerInsideTaiwan(map){
    const c=map.getCenter();
    return c.lng>=TAIWAN_BOUNDS.west&&c.lng<=TAIWAN_BOUNDS.east&&c.lat>=TAIWAN_BOUNDS.south&&c.lat<=TAIWAN_BOUNDS.north;
  }

  const width=['interpolate',['linear'],['zoom'],8,1.35,11,2.0,14,3.0,17,4.8];
  const casingWidth=['interpolate',['linear'],['zoom'],8,2.8,11,3.7,14,5.2,17,7.2];

  function railFilter(classes){
    return ['all',
      ['==',['get','subtype'],'rail'],
      ['in',['get','class'],['literal',classes]]
    ];
  }

  function lineLayer(id,filter,color,isCasing=false){
    return {
      id,type:'line',source:SOURCE_ID,'source-layer':SOURCE_LAYER,minzoom:8,
      filter,
      layout:{visibility:'none','line-cap':'round','line-join':'round'},
      paint:{
        'line-color':color,
        'line-width':isCasing?casingWidth:width,
        'line-opacity':isCasing?.88:.96
      }
    };
  }

  class TransitToggleControl{
    constructor(layer){this.layer=layer;this.container=null;this.button=null;}
    onAdd(){
      const container=document.createElement('div');
      container.className='maplibregl-ctrl maplibregl-ctrl-group';
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('aria-label','切換捷運、台鐵與高鐵路線');
      button.textContent='🚇';
      button.style.fontSize='16px';
      button.style.lineHeight='1';
      button.onclick=()=>this.layer.setEnabled(!this.layer.enabled);
      container.appendChild(button);
      this.container=container;this.button=button;
      this.update();
      return container;
    }
    onRemove(){this.container?.remove();this.container=null;this.button=null;}
    update({inTaiwan=centerInsideTaiwan(this.layer.map)}={}){
      if(!this.button)return;
      this.button.style.opacity=inTaiwan?'1':'.42';
      this.button.style.background=this.layer.enabled&&inTaiwan?'#e8f1f8':'';
      this.button.title=!inTaiwan?'軌道路線僅在台灣顯示':`軌道 ${this.layer.enabled?'ON':'OFF'} · 捷運 / 台鐵 / 高鐵`;
      this.button.setAttribute('aria-pressed',this.layer.enabled&&inTaiwan?'true':'false');
    }
  }

  class TransitLayer{
    constructor(map,{overtureBuildingUrl=null,release=null,enabled=true,onState=null}={}){
      this.map=map;
      this.enabled=Boolean(enabled);
      this.onState=typeof onState==='function'?onState:()=>{};
      this.url=transportationUrl(overtureBuildingUrl,release);
      this.initialized=false;
      this.control=null;
      this._moveHandler=()=>this.sync();
    }

    emit(state,message,extra={}){
      this.onState({state,message,...extra});
      this.map.fire('taipei-maps-transitchange',{state,message,enabled:this.enabled,...extra});
    }

    async init(){
      if(this.initialized)return true;
      if(!window.pmtiles)throw new Error('PMTiles runtime is unavailable');
      try{
        this.emit('loading','軌道交通資料載入中…');
        const archive=new pmtiles.PMTiles(this.url);
        const [,metadata]=await Promise.all([archive.getHeader(),archive.getMetadata()]);
        const sourceLayers=(metadata?.vector_layers||[]).map(row=>row?.id).filter(Boolean);
        if(!sourceLayers.includes(SOURCE_LAYER)){
          throw new Error(`Overture transportation PMTiles missing ${SOURCE_LAYER} source-layer`);
        }

        if(!this.map.getSource(SOURCE_ID)){
          this.map.addSource(SOURCE_ID,{type:'vector',url:`pmtiles://${this.url}`,attribution:'© Overture Maps Foundation / source contributors'});
        }

        const mrtFilter=railFilter(['subway','monorail','light_rail']);
        const traFilter=railFilter(['narrow_gauge']);
        const thsrFilter=railFilter(['standard_gauge']);
        const layers=[
          lineLayer(LAYERS.mrtCasing,mrtFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.mrt,mrtFilter,'#1976d2'),
          lineLayer(LAYERS.traCasing,traFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.tra,traFilter,'#2e7d32'),
          lineLayer(LAYERS.thsrCasing,thsrFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.thsr,thsrFilter,'#f57c00')
        ];
        const beforeId=this.map.getLayer('building')?'building':undefined;
        for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);

        this.initialized=true;
        this.map.on('moveend',this._moveHandler);
        this.control=new TransitToggleControl(this);
        this.map.addControl(this.control,'top-right');
        this.sync();
        return true;
      }catch(error){
        console.warn('Transit overlay unavailable',error);
        this.emit('error',`軌道交通暫時無法載入 · ${error?.message||error}`);
        return false;
      }
    }

    sync(){
      if(!this.initialized||!this.map.isStyleLoaded())return;
      const inTaiwan=centerInsideTaiwan(this.map);
      const visible=this.enabled&&inTaiwan;
      for(const id of ALL_LAYER_IDS){
        if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',visible?'visible':'none');
      }
      this.control?.update({inTaiwan});
      if(!this.enabled)this.emit('off','軌道 OFF',{inTaiwan});
      else if(!inTaiwan)this.emit('outside','軌道僅在台灣顯示',{inTaiwan});
      else this.emit('ready','軌道 ON · 捷運 / 台鐵 / 高鐵',{inTaiwan});
    }

    setEnabled(enabled){
      this.enabled=Boolean(enabled);
      this.sync();
    }

    destroy(){
      this.map.off('moveend',this._moveHandler);
      if(this.control){try{this.map.removeControl(this.control);}catch{}this.control=null;}
      for(const id of [...ALL_LAYER_IDS].reverse())if(this.map.getLayer(id))this.map.removeLayer(id);
      if(this.map.getSource(SOURCE_ID))this.map.removeSource(SOURCE_ID);
      this.initialized=false;
    }
  }

  window.TaipeiMapsTransitLayer={TransitLayer,TAIWAN_BOUNDS,SOURCE_ID,SOURCE_LAYER,LAYERS};
})();