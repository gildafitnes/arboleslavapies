import {
  aliasExists, createPendingIdentity, getLocalIdentity, login, logout,
  registrationPayload, renameRejectedIdentity, syncLocalIdentity
} from './auth.js';

const cfg = window.APP_CONFIG;
const map = L.map('map', {zoomControl:false}).setView(cfg.center, cfg.zoom);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom:20,
  attribution:'&copy; OpenStreetMap contributors'
}).addTo(map);

const treeLayer = L.layerGroup().addTo(map);
const communityLayer = L.layerGroup().addTo(map);
let trees = [];
let events = [];
let pinMode = false;
let pendingLatLng = null;
let pendingMarker = null;
let showingNeeds = false;
let lastNominatimAt = 0;
const addressCache = new Map();

const $ = s => document.querySelector(s);
const drawer = $('#drawer');
const drawerContent = $('#drawerContent');
const identityDialog = $('#identityDialog');
const secretDialog = $('#secretDialog');
const addDialog = $('#addDialog');

function showStatus(text, ms=3200){
  const el=$('#status'); el.textContent=text; el.classList.remove('hidden');
  clearTimeout(showStatus.t); showStatus.t=setTimeout(()=>el.classList.add('hidden'),ms);
}

function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function idLabel(props){return props.community_id || `MAD-${props.assetnum || props.ASSETNUM || '?'}`;}
function currentEventsFor(id){return events.filter(e=>e.place_id===id || e.tree_id===id).sort((a,b)=>String(b.date).localeCompare(String(a.date)));}
function eventLabel(type){return ({watering:'Riego',commitment:'Compromiso',comment:'Comentario',issue:'Incidencia'})[type] || type;}
function wateringState(id){
  const last = currentEventsFor(id).find(e=>e.type==='watering');
  if(!last) return {name:'Sin datos vecinales',cls:'unknown'};
  const days=(Date.now()-new Date(last.date).getTime())/86400000;
  if(days<=3) return {name:'Atendido recientemente',cls:'ok'};
  if(days<=6) return {name:'Conviene revisar',cls:'warn'};
  return {name:'Sin riego reciente registrado',cls:'danger'};
}
function markerIcon(cls){
  return L.divIcon({className:'tree-marker',html:`<div class="tree-dot ${cls==='ok'?'':cls}"></div>`,iconSize:[16,16],iconAnchor:[8,8]});
}
function submissionId(){
  if(crypto.randomUUID) return `s_${crypto.randomUUID()}`;
  const b=new Uint32Array(4); crypto.getRandomValues(b); return `s_${Date.now()}_${[...b].join('')}`;
}
function ensureSubmissionMeta(payload){
  if(!payload.submission_id) payload.submission_id=submissionId();
  return payload;
}

function downloadSubmission(payload,name='solicitud'){
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${name}-${Date.now()}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function deliverSubmission(payload,name='solicitud'){
  payload=ensureSubmissionMeta(payload);
  if(cfg.projectEmail){
    const subject=`[Lavapiés Riega] ${payload.type} · ${payload.alias || 'Anónimo'}`;
    const body=[
      'Aportación para Lavapiés Riega.',
      'No hace falta modificar el bloque siguiente:',
      '',
      '---LAVAPIES_RIEGA_JSON---',
      JSON.stringify(payload,null,2),
      '---FIN_LAVAPIES_RIEGA_JSON---'
    ].join('\n');
    window.location.href=`mailto:${encodeURIComponent(cfg.projectEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    showStatus('Se ha abierto tu correo. Pulsa Enviar para terminar.',5500);
  }else{
    downloadSubmission(payload,name);
    showStatus('Solicitud guardada como JSON. Falta configurar el email del proyecto.',5000);
  }
}

async function nominatimFetch(url){
  const wait=Math.max(0,1100-(Date.now()-lastNominatimAt));
  if(wait) await new Promise(r=>setTimeout(r,wait));
  lastNominatimAt=Date.now();
  const r=await fetch(url,{headers:{'Accept-Language':'es'}});
  if(!r.ok) throw new Error('nominatim');
  return r.json();
}

async function nearestAddress(feature){
  const p=feature.properties||{};
  if(p.near_address) return p.near_address;
  const id=idLabel(p);
  if(addressCache.has(id)) return addressCache.get(id);
  const [lon,lat]=feature.geometry.coordinates;
  try{
    const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r=await nominatimFetch(url);
    const a=r.address||{};
    const street=a.road||a.pedestrian||a.residential||a.footway||a.square||a.neighbourhood;
    const label=street ? `${street}${a.house_number?` ${a.house_number}`:''} · ubicación aproximada` : 'Embajadores · ubicación aproximada';
    addressCache.set(id,label); return label;
  }catch{
    return p.barrio || 'Embajadores';
  }
}

function openTree(feature){
  const p=feature.properties||{}; const id=idLabel(p); const state=wateringState(id); const ev=currentEventsFor(id).slice(0,8);
  drawerContent.innerHTML=`
    <div class="eyebrow">${esc(p.source==='community'?'Alta vecinal':'Inventario municipal')}</div>
    <h1 class="tree-title">${esc(id)}</h1>
    <p class="tree-meta"><span id="treeAddress">${esc(p.near_address || p.barrio || 'Buscando ubicación cercana…')}</span><br>${esc(p.species || p.ESPECIE || 'Especie sin identificar')}</p>
    <span class="pill">${esc(state.name)}</span>
    ${p.height?`<span class="pill">${esc(p.height)} m</span>`:''}
    <div class="action-grid">
      <button data-action="watering">💧 He regado</button>
      <button data-action="commitment">📅 Me encargo</button>
      <button data-action="comment">💬 Comentar</button>
      <button data-action="issue">⚠ Incidencia</button>
    </div>
    <section class="timeline"><div class="eyebrow">Actividad reciente</div>
      ${ev.length?ev.map(e=>`<div class="event"><strong>${esc(eventLabel(e.type))}</strong><small>${esc(e.alias||'Anónimo')} · ${esc(e.date||'')}</small>${e.note?`<div>${esc(e.note)}</div>`:''}</div>`).join(''):'<p class="muted">Todavía no hay actividad vecinal registrada.</p>'}
    </section>
    <section class="timeline"><div class="eyebrow">Archivo</div><p class="muted">Aquí irán comentarios, respuestas y el archivo fotográfico del árbol.</p></section>`;
  drawer.classList.add('open');
  drawerContent.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>prepareAction(id,btn.dataset.action));
  nearestAddress(feature).then(address=>{const el=$('#treeAddress'); if(el) el.textContent=address;});
}

async function prepareAction(id,type){
  const identity=await syncLocalIdentity();
  if(identity?.state==='rejected'){
    showStatus('Tu alias necesita cambiarse antes de publicar como identidad.',4500);
    refreshIdentityDialog(); identityDialog.showModal(); return;
  }
  const labels={watering:'Riego',commitment:'Compromiso',comment:'Comentario',issue:'Incidencia'};
  const note=prompt(`${labels[type]} para ${id}\nNota opcional:`,'');
  if(note===null) return;
  const payload={type,place_id:id,date:new Date().toISOString(),note,alias:identity?.alias||'Anónimo'};
  if(identity?.secret) payload.identity_code=identity.secret;
  deliverSubmission(payload, `${type}-${id}`);
}

async function loadData(){
  try{
    const [tr,er,pr]=await Promise.all([
      fetch('./data/trees.geojson').then(r=>r.json()),
      fetch('./data/events.json').then(r=>r.json()),
      fetch('./data/places.geojson').then(r=>r.json())
    ]);
    trees=tr.features||[]; events=er||[];
    renderTrees(trees); renderCommunity(pr.features||[]);
    showStatus(trees.length?`${trees.length.toLocaleString('es-ES')} árboles cargados`:'Mapa listo. Falta importar el arbolado de Embajadores.',4200);
  }catch(e){showStatus('No se pudieron cargar los datos.'); console.error(e);}
}
function renderTrees(features){
  treeLayer.clearLayers();
  for(const f of features){
    if(!f.geometry || f.geometry.type!=='Point') continue;
    const [lon,lat]=f.geometry.coordinates; const id=idLabel(f.properties||{}); const st=wateringState(id);
    L.marker([lat,lon],{icon:markerIcon(st.cls),title:id}).on('click',()=>openTree(f)).addTo(treeLayer);
  }
}
function renderCommunity(features){
  communityLayer.clearLayers();
  for(const f of features){
    if(!f.geometry) continue;
    const [lon,lat]=f.geometry.coordinates;
    L.circleMarker([lat,lon],{radius:7,weight:2,fillOpacity:.8}).on('click',()=>openTree(f)).addTo(communityLayer);
  }
}

async function geocode(query){
  const q=query.includes('Madrid')?query:`${query}, ${cfg.defaultSearchSuffix}`;
  const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&q=${encodeURIComponent(q)}`;
  return nominatimFetch(url);
}
async function doSearch(){
  const q=$('#searchInput').value.trim(); if(!q)return;
  const local=trees.find(f=>idLabel(f.properties||{}).toLowerCase()===q.toLowerCase());
  if(local){const [lon,lat]=local.geometry.coordinates; map.flyTo([lat,lon],19); openTree(local); return;}
  showStatus('Buscando…',5000);
  try{const rs=await geocode(q); if(!rs.length) return showStatus('No encuentro esa dirección.'); map.flyTo([+rs[0].lat,+rs[0].lon],18); showStatus(rs[0].display_name);}
  catch{showStatus('La búsqueda de direcciones no está disponible ahora.');}
}

$('#searchBtn').onclick=doSearch; $('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch();});
$('#nearBtn').onclick=()=>navigator.geolocation?.getCurrentPosition(pos=>{map.flyTo([pos.coords.latitude,pos.coords.longitude],18);showStatus('Mostrando tu zona aproximada.');},()=>showStatus('No se pudo acceder a tu ubicación.'));
$('#drawerClose').onclick=()=>drawer.classList.remove('open');
$('#profileBtn').onclick=async()=>{await refreshIdentityDialog();identityDialog.showModal();};
$('#addPlaceBtn').onclick=()=>addDialog.showModal();
$('#aboutBtn').onclick=()=>{drawerContent.innerHTML='<div class="eyebrow">Proyecto</div><h1 class="tree-title">Lavapiés Riega</h1><p>Mapa vecinal abierto para coordinar cuidados, documentar el arbolado y construir una memoria vegetal del barrio.</p><p class="muted">Las aportaciones no sustituyen el mantenimiento municipal. Los cambios importantes del mapa pasan por revisión.</p><p class="muted">Inventario base: Datos Abiertos del Ayuntamiento de Madrid (CC BY 4.0), actualización 27/07/2026.</p>';drawer.classList.add('open');};
$('#needsBtn').onclick=()=>{
  showingNeeds=!showingNeeds;
  if(showingNeeds){const needy=trees.filter(f=>['danger','unknown'].includes(wateringState(idLabel(f.properties||{})).cls));renderTrees(needy);showStatus(`${needy.length} árboles sin riego reciente registrado o sin datos.`);$('#needsBtn').textContent='Mostrar todos';}
  else{renderTrees(trees);showStatus('Mostrando todos los árboles.');$('#needsBtn').textContent='Necesitan agua';}
};

async function refreshIdentityDialog(){
  const box=$('#identityCurrent'),create=$('#identityCreate');
  const id=await syncLocalIdentity();
  if(!id){box.classList.add('hidden');create.classList.remove('hidden');return;}
  box.classList.remove('hidden');create.classList.add('hidden');

  if(id.state==='rejected' && id.rejection_reason==='alias_taken'){
    box.innerHTML=`
      <div class="identity-warning">
        <div class="eyebrow">Actualización diaria</div>
        <h3>Necesitamos cambiar tu nombre</h3>
        <p>Lo sentimos: mientras tu identidad esperaba la actualización, otra persona registró <strong>${esc(id.alias)}</strong> antes. Tu código sigue siendo válido; sólo tienes que elegir otro alias.</p>
      </div>
      <label>Nuevo alias
        <input id="renameAlias" maxlength="28" placeholder="${esc(id.alias)}_2" />
      </label>
      <button id="renameBtn" type="button" class="primary full">Usar este nombre</button>
      <button id="logoutBtn" type="button" class="full">Crear una identidad distinta</button>`;
    $('#renameBtn').onclick=async()=>{
      try{
        const updated=await renameRejectedIdentity($('#renameAlias').value);
        deliverSubmission(registrationPayload(updated),`registro-${updated.alias}`);
        await refreshIdentityDialog();
      }catch(e){showStatus(e.message,4500);}
    };
    $('#logoutBtn').onclick=()=>{logout();refreshIdentityDialog();};
    return;
  }

  const stateText=id.state==='pending'
    ? 'Pendiente de la próxima actualización. Tu código ya está guardado en este navegador.'
    : 'Identidad publicada y reconocida.';
  box.innerHTML=`<strong>${esc(id.alias)}</strong><p class="muted">${stateText}</p><button id="logoutBtn" type="button" class="full">Salir de esta identidad</button>`;
  $('#logoutBtn').onclick=()=>{logout();refreshIdentityDialog();};
}

$('#createIdentityBtn').onclick=async()=>{
  const alias=$('#aliasInput').value.trim();
  try{
    if(await aliasExists(alias)) throw new Error('Ese alias ya está publicado. Elige otro.');
    const id=await createPendingIdentity(alias);
    $('#secretAlias').textContent=id.alias; $('#secretCode').textContent=id.secret; identityDialog.close(); secretDialog.showModal();
    deliverSubmission(registrationPayload(id), `registro-${id.alias}`);
  }catch(e){showStatus(e.message,4500);}
};
$('#loginBtn').onclick=async()=>{try{await login($('#loginAlias').value,$('#loginCode').value);identityDialog.close();showStatus(`Has entrado como ${getLocalIdentity().alias}`);}catch(e){showStatus(e.message,4000);}};
$('#copySecretBtn').onclick=async()=>{await navigator.clipboard.writeText($('#secretCode').textContent);showStatus('Código copiado.');};
$('#secretDoneBtn').onclick=()=>{secretDialog.close();refreshIdentityDialog();showStatus('Identidad guardada en este navegador.');};

$('#startPinBtn').onclick=()=>{addDialog.close();pinMode=true;showStatus('Toca el mapa donde está el lugar.',5000);};
map.on('click',e=>{if(!pinMode)return; pinMode=false; pendingLatLng=e.latlng; if(pendingMarker)pendingMarker.remove(); pendingMarker=L.marker(e.latlng,{draggable:true}).addTo(map); pendingMarker.on('dragend',ev=>{pendingLatLng=ev.target.getLatLng();updateCoords();});updateCoords();addDialog.showModal();});
function updateCoords(){
  $('#placeCoords').textContent=pendingLatLng?`${pendingLatLng.lat.toFixed(6)}, ${pendingLatLng.lng.toFixed(6)}`:'Sin ubicación todavía';
  $('#preparePlaceBtn').disabled=!pendingLatLng;
}
$('#preparePlaceBtn').onclick=async()=>{
  if(!pendingLatLng)return; const id=await syncLocalIdentity();
  if(id?.state==='rejected'){addDialog.close();await refreshIdentityDialog();identityDialog.showModal();return;}
  const payload={type:'new_place',place_type:$('#placeType').value,lat:pendingLatLng.lat,lon:pendingLatLng.lng,note:$('#placeNote').value.trim(),date:new Date().toISOString(),alias:id?.alias||'Anónimo'};
  if(id?.secret)payload.identity_code=id.secret;
  deliverSubmission(payload,'nuevo-lugar'); addDialog.close(); showStatus('Alta preparada. Queda pendiente de revisión.');
};

syncLocalIdentity().finally(loadData);
