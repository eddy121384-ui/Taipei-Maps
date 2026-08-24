(()=>{
  const CORE_SCRIPT_URL=document.currentScript?.src||location.href;
  const TRANSIT_MODULE_URL=new URL('./transit-layer.js',CORE_SCRIPT_URL).href;

  const PLACES={
    daan:{center:[121.5434,25.0268],zoom:15.15,pitch:58,bearing:-24},
    songshan:{center:[121.5608,25.0525],zoom:15.15,pitch:58,bearing:18},
    xinyi:{center:[121.5645,25.0340],zoom:15.25,pitch:58,bearing:-26},
    neihu:{center:[121.5777,25.0797],zoom:15.0,pitch:60,bearing:18},
    beitou:{center:[121.5030,25.1324],zoom:15.0,pitch:62,bearing:-16},
    yangmingshan:{center:[121.5485,25.1555],zoom:14.25,pitch:68,bearing:20},
    wenshan:{center:[121.5700,24.9896],zoom:15.0,pitch:62,bearing:14},
    banqiao:{center:[121.4623,25.0123],zoom:15.15,pitch:58,bearing:20},
    shanghai:{center:[121.4737,31.2304],zoom:15.0,pitch:56,bearing:-18},
    tokyo:{center:[139.6986,35.6938],zoom:15.15,pitch:58,bearing:18}
  };

  const OVERTURE_CANDIDATES=[
    {release:'2026-07-22.0',url:'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles'},
    {release:'2026-06-17.0',url:'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-06-17.0/buildings.pmtiles'}
  ];

  const TERRAIN_TILEJSON='https://tiles.mapterhorn.com/tilejson.json';
  const NLSC_PHOTO_TILE='https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}';
  const GSI_PHOTO_TILE='https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
  const GSI_LANDSAT_TILE='https://cyberjapandata.gsi.go.jp/xyz/lndst/{z}/{x}/{y}.png';
  const SKY={
    'sky-color':'#9fd5f6',
    'horizon-color':'#eef7fb',
    'fog-color':'#dfeaf0',
    'sky-horizon-blend':.68,
    'horizon-fog-blend':.64,
    'fog-ground-blend':.56,
    'atmosphere-blend':.92
  };

  const IDS={
    osmSource:'osm',imageryFallbackSource:'gsiLandsat',nlscPhotoSource:'nlscPhoto',gsiPhotoSource:'gsiPhoto',terrainSource:'terrain',overtureSource:'overture',
    osmLayer:'osm',imageryFallbackLayer:'gsi-landsat',nlscPhotoLayer:'nlsc-photo',gsiPhotoLayer:'gsi-photo',hillshadeLayer:'hillshade',buildingLayer:'building',partsLayer:'building-part'
  };
  IDS.photoSource=IDS.nlscPhotoSource;
  IDS.photoLayer=IDS.nlscPhotoLayer;

  const IMAGERY_PROVIDERS=[
    {
      id:'tw-nlsc',label:'台灣 NLSC PHOTO2',sourceId:IDS.nlscPhotoSource,layerId:IDS.nlscPhotoLayer,
      regions:[[118,21.5,123,26.7]]
    },
    {
      id:'jp-gsi',label:'日本 GSI 全国最新写真',sourceId:IDS.gsiPhotoSource,layerId:IDS.gsiPhotoLayer,
      regions:[[129,30,146.5,46.5],[122.5,23,132,31.5],[136,20,143,30]]
    }
  ];

  const height=['case',['>', ['to-number',['get','height'],0],0],['to-number',['get','height'],0],['>', ['to-number',['get','num_floors'],0],0],['*',['to-number',['get','num_floors'],0],3.2],9.6];
  const base=['to-number',['get','min_height'],0];

  async function preflightOverture(){
    for(const candidate of OVERTURE_CANDIDATES){
      try{
        const archive=new pmtiles.PMTiles(candidate.url);
        const [,metadata]=await Promise.all([archive.getHeader(),archive.getMetadata()]);
        const layers=(metadata?.vector_layers||[]).map(x=>x?.id).filter(Boolean);
        if(!layers.includes('building'))continue;
        return {candidate,metadata,hasParts:layers.includes('building_part')};
      }catch(e){console.warn('Overture preflight failed',candidate.release,e);}
    }
    throw new Error('Overture PMTiles preflight failed');
  }

  function ensurePmtilesProtocol(){
    if(window.__taipeiMapsPmtilesProtocol)return window.__taipeiMapsPmtilesProtocol;
    const protocol=new pmtiles.Protocol({metadata:true});
    maplibregl.addProtocol('pmtiles',protocol.tile);
    window.__taipeiMapsPmtilesProtocol=protocol;
    return protocol;
  }

  function coreSources(overtureUrl){
    return {
      [IDS.osmSource]:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors',maxzoom:19},
      // GSI seamless orthophoto is z14-18. GSI's own nationwide Landsat mosaic (z2-13)
      // is the correct low-zoom photographic companion and avoids the brown NASA mismatch.
      [IDS.imageryFallbackSource]:{type:'raster',tiles:[GSI_LANDSAT_TILE],tileSize:256,attribution:'© 国土地理院 GSI / Landsat mosaic',minzoom:2,maxzoom:13,bounds:[122,20,154,47]},
      [IDS.nlscPhotoSource]:{type:'raster',tiles:[NLSC_PHOTO_TILE],tileSize:256,attribution:'© 內政部國土測繪中心 NLSC',maxzoom:19,bounds:[118,21.5,123,26.7]},
      [IDS.gsiPhotoSource]:{type:'raster',tiles:[GSI_PHOTO_TILE],tileSize:256,attribution:'© 国土地理院 GSI',minzoom:14,maxzoom:18,bounds:[122,20,154,47]},
      [IDS.terrainSource]:{type:'raster-dem',url:TERRAIN_TILEJSON},
      [IDS.overtureSource]:{type:'vector',url:`pmtiles://${overtureUrl}`,attribution:'© Overture Maps Foundation / source contributors'}
    };
  }

  function coreLayers(hasParts){
    const building={id:IDS.buildingLayer,type:'fill-extrusion',source:IDS.overtureSource,'source-layer':'building',minzoom:14,paint:{'fill-extrusion-base':base,'fill-extrusion-height':height,'fill-extrusion-color':'#e2e7eb','fill-extrusion-opacity':.88,'fill-extrusion-vertical-gradient':true}};
    if(hasParts)building.filter=['!=',['get','has_parts'],true];
    const layers=[
      {id:IDS.osmLayer,type:'raster',source:IDS.osmSource},
      {id:IDS.imageryFallbackLayer,type:'raster',source:IDS.imageryFallbackSource,layout:{visibility:'none'},paint:{'raster-resampling':'linear','raster-fade-duration':300}},
      {id:IDS.nlscPhotoLayer,type:'raster',source:IDS.nlscPhotoSource,layout:{visibility:'none'}},
      {id:IDS.gsiPhotoLayer,type:'raster',source:IDS.gsiPhotoSource,layout:{visibility:'none'},paint:{'raster-fade-duration':300}},
      {id:IDS.hillshadeLayer,type:'hillshade',source:IDS.terrainSource,paint:{'hillshade-shadow-color':'#665b4e','hillshade-highlight-color':'rgba(255,255,255,.55)','hillshade-exaggeration':.22}},
      building
    ];
    if(hasParts)layers.push({id:IDS.partsLayer,type:'fill-extrusion',source:IDS.overtureSource,'source-layer':'building_part',minzoom:14,paint:{'fill-extrusion-base':base,'fill-extrusion-height':height,'fill-extrusion-color':'#cbd7df','fill-extrusion-opacity':.92,'fill-extrusion-vertical-gradient':true}});
    return layers;
  }

  function pointInRegion(lng,lat,[west,south,east,north]){
    return lng>=west&&lng<=east&&lat>=south&&lat<=north;
  }

  function imageryProviderForLngLat(lngLat){
    const lng=Array.isArray(lngLat)?lngLat[0]:lngLat.lng;
    const lat=Array.isArray(lngLat)?lngLat[1]:lngLat.lat;
    return IMAGERY_PROVIDERS.find(provider=>provider.regions.some(region=>pointInRegion(lng,lat,region)))||null;
  }

  function imageryProviderForMap(map){
    return imageryProviderForLngLat(map.getCenter());
  }

  const vis=(map,id,on)=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',on?'visible':'none');
  const paint=(map,id,p,v)=>map.getLayer(id)&&map.setPaintProperty(id,p,v);

  function syncImageryForViewport(map,photo){
    if(!map.isStyleLoaded())return null;
    vis(map,IDS.imageryFallbackLayer,false);
    for(const provider of IMAGERY_PROVIDERS)vis(map,provider.layerId,false);
    const provider=photo?imageryProviderForMap(map):null;
    if(provider){
      // Only Japan needs a low-zoom companion because GSI seamlessphoto starts at z14.
      // Keep the fallback from the same GSI stack so zoom transitions stay photographic and coherent.
      if(provider.id==='jp-gsi')vis(map,IDS.imageryFallbackLayer,true);
      vis(map,provider.layerId,true);
    }
    map.__taipeiMapsImageryProvider=provider;
    return provider;
  }

  async function bootstrapTransit(map,overtureUrl){
    try{
      if(!window.TaipeiMapsTransitLayer)await import(TRANSIT_MODULE_URL);
      const TransitLayer=window.TaipeiMapsTransitLayer?.TransitLayer;
      if(!TransitLayer)throw new Error('TransitLayer module did not register');
      const transit=new TransitLayer(map,{overtureBuildingUrl:overtureUrl,enabled:true});
      map.__taipeiMapsTransitLayer=transit;
      await transit.init();
    }catch(e){
      console.warn('Taipei-Maps transit overlay bootstrap failed',e);
      map.fire('taipei-maps-transitchange',{state:'error',message:`軌道交通暫時無法載入 · ${e?.message||e}`,enabled:false});
    }
  }

  function createMap({container,view,overtureUrl,hasParts,extraSources={},extraLayers=[],maxZoom=18}){
    ensurePmtilesProtocol();
    const map=new maplibregl.Map({
      container,...view,maxPitch:85,maxZoom,antialias:true,
      style:{version:8,sky:SKY,sources:{...coreSources(overtureUrl),...extraSources},layers:[...coreLayers(hasParts),...extraLayers],terrain:{source:IDS.terrainSource,exaggeration:1}}
    });
    map.on('load',()=>{bootstrapTransit(map,overtureUrl);});
    map.on('moveend',()=>{
      const state=map.__taipeiMapsVisualState;
      if(!state?.photo||!map.isStyleLoaded())return;
      const previous=map.__taipeiMapsImageryProvider?.id||null;
      const provider=syncImageryForViewport(map,true);
      const current=provider?.id||null;
      if(current!==previous)map.fire('taipei-maps-imagerychange',{provider});
    });
    return map;
  }

  function applyCoreVisualState(map,{photo=false,show3d=true,terrain=true,hasParts=false}){
    if(!map.isStyleLoaded())return null;
    map.__taipeiMapsVisualState={photo,show3d,terrain,hasParts};
    const provider=syncImageryForViewport(map,photo);
    vis(map,IDS.buildingLayer,show3d);
    if(hasParts)vis(map,IDS.partsLayer,show3d);
    vis(map,IDS.hillshadeLayer,terrain);
    paint(map,IDS.buildingLayer,'fill-extrusion-opacity',photo?.50:.88);
    if(hasParts)paint(map,IDS.partsLayer,'fill-extrusion-opacity',photo?.55:.92);
    paint(map,IDS.hillshadeLayer,'hillshade-exaggeration',photo?.10:.22);
    return provider;
  }

  function setTerrain(map,on){map.setTerrain(on?{source:IDS.terrainSource,exaggeration:1}:null);}

  window.TaipeiMapsCore={
    PLACES,IDS,SKY,OVERTURE_CANDIDATES,TERRAIN_TILEJSON,NLSC_PHOTO_TILE,GSI_PHOTO_TILE,GSI_LANDSAT_TILE,IMAGERY_PROVIDERS,
    preflightOverture,ensurePmtilesProtocol,createMap,applyCoreVisualState,setTerrain,vis,paint,
    imageryProviderForLngLat,imageryProviderForMap,syncImageryForViewport
  };
})();