(()=>{
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
    osmSource:'osm',photoSource:'nlscPhoto',terrainSource:'terrain',overtureSource:'overture',
    osmLayer:'osm',photoLayer:'nlsc-photo',hillshadeLayer:'hillshade',buildingLayer:'building',partsLayer:'building-part'
  };

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
      [IDS.photoSource]:{type:'raster',tiles:[NLSC_PHOTO_TILE],tileSize:256,attribution:'© 內政部國土測繪中心 NLSC',maxzoom:19,bounds:[118,21.5,122.5,26.5]},
      [IDS.terrainSource]:{type:'raster-dem',url:TERRAIN_TILEJSON},
      [IDS.overtureSource]:{type:'vector',url:`pmtiles://${overtureUrl}`,attribution:'© Overture Maps Foundation / source contributors'}
    };
  }

  function coreLayers(hasParts){
    const building={id:IDS.buildingLayer,type:'fill-extrusion',source:IDS.overtureSource,'source-layer':'building',minzoom:14,paint:{'fill-extrusion-base':base,'fill-extrusion-height':height,'fill-extrusion-color':'#e2e7eb','fill-extrusion-opacity':.88,'fill-extrusion-vertical-gradient':true}};
    if(hasParts)building.filter=['!=',['get','has_parts'],true];
    const layers=[
      {id:IDS.osmLayer,type:'raster',source:IDS.osmSource},
      {id:IDS.photoLayer,type:'raster',source:IDS.photoSource,layout:{visibility:'none'}},
      {id:IDS.hillshadeLayer,type:'hillshade',source:IDS.terrainSource,paint:{'hillshade-shadow-color':'#665b4e','hillshade-highlight-color':'rgba(255,255,255,.55)','hillshade-exaggeration':.22}},
      building
    ];
    if(hasParts)layers.push({id:IDS.partsLayer,type:'fill-extrusion',source:IDS.overtureSource,'source-layer':'building_part',minzoom:14,paint:{'fill-extrusion-base':base,'fill-extrusion-height':height,'fill-extrusion-color':'#cbd7df','fill-extrusion-opacity':.92,'fill-extrusion-vertical-gradient':true}});
    return layers;
  }

  function createMap({container,view,overtureUrl,hasParts,extraSources={},extraLayers=[],maxZoom=18}){
    ensurePmtilesProtocol();
    return new maplibregl.Map({
      container,...view,maxPitch:85,maxZoom,antialias:true,
      style:{version:8,sky:SKY,sources:{...coreSources(overtureUrl),...extraSources},layers:[...coreLayers(hasParts),...extraLayers],terrain:{source:IDS.terrainSource,exaggeration:1}}
    });
  }

  const vis=(map,id,on)=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility',on?'visible':'none');
  const paint=(map,id,p,v)=>map.getLayer(id)&&map.setPaintProperty(id,p,v);

  function applyCoreVisualState(map,{photo=false,show3d=true,terrain=true,hasParts=false}){
    if(!map.isStyleLoaded())return;
    vis(map,IDS.photoLayer,photo);
    vis(map,IDS.buildingLayer,show3d);
    if(hasParts)vis(map,IDS.partsLayer,show3d);
    vis(map,IDS.hillshadeLayer,terrain);
    paint(map,IDS.buildingLayer,'fill-extrusion-opacity',photo?.50:.88);
    if(hasParts)paint(map,IDS.partsLayer,'fill-extrusion-opacity',photo?.55:.92);
    paint(map,IDS.hillshadeLayer,'hillshade-exaggeration',photo?.10:.22);
  }

  function setTerrain(map,on){map.setTerrain(on?{source:IDS.terrainSource,exaggeration:1}:null);}

  window.TaipeiMapsCore={PLACES,IDS,SKY,OVERTURE_CANDIDATES,TERRAIN_TILEJSON,NLSC_PHOTO_TILE,preflightOverture,ensurePmtilesProtocol,createMap,applyCoreVisualState,setTerrain,vis,paint};
})();
