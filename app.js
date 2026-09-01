const DB_NAME='ToolVaultFullDB', STORE='tools', SETTINGS='settings', DB_VERSION=2;
let db, editingTool=null, pendingToolPhotos=[], pendingReceiptPhotos=[], scanStream=null, scanTimer=null;
const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

const UPC_LOOKUP_BASE='https://api.upcitemdb.com/prod/trial';

function looksLikeBarcode(q){return /^[0-9]{8,14}$/.test(q.replace(/\s+/g,''))}
function priceFromItem(item){
  const vals=[
    item.lowest_recorded_price,
    item.highest_recorded_price,
    ...(item.offers||[]).map(o=>o.price)
  ].map(Number).filter(n=>Number.isFinite(n)&&n>0);
  if(!vals.length) return 0;
  // Prefer the lowest currently listed price as a conservative replacement-price estimate.
  return Math.min(...vals);
}
function normalizeLookupItem(item){
  const title=item.title||'Unknown Tool';
  const brand=item.brand||'';
  let model=item.model||'';
  if(!model){
    // Some catalog entries put model numbers in the title instead of the model field.
    const m=title.match(/\b[A-Z0-9]{2,}(?:-[A-Z0-9]{2,})+\b/i);
    if(m) model=m[0];
  }
  return {
    title,
    brand,
    model,
    barcode:item.upc||item.ean||item.gtin||'',
    category:item.category||'',
    price:priceFromItem(item),
    image:(item.images&&item.images[0])||'',
    sourceTitle:item.title||'',
    lookupDate:new Date().toISOString()
  };
}
async function searchOnlineTools(query){
  const q=query.trim();
  if(!q) return [];
  const endpoint=looksLikeBarcode(q)
    ? `${UPC_LOOKUP_BASE}/lookup?upc=${encodeURIComponent(q.replace(/\s+/g,''))}`
    : `${UPC_LOOKUP_BASE}/search?s=${encodeURIComponent(q)}&match_mode=0&type=product`;
  const response=await fetch(endpoint,{headers:{'Accept':'application/json'}});
  if(response.status===429) throw new Error('The free lookup limit was reached. Try again later.');
  if(!response.ok) throw new Error('The online product search did not respond.');
  const data=await response.json();
  return (data.items||[]).map(normalizeLookupItem);
}
function productResultHTML(x,i,buttonText='Use This Tool'){
  return `<article class="finder-result">
    ${x.image?`<img src="${esc(x.image)}" alt="">`:`<div class="no-img">No image</div>`}
    <div>
      <h4>${esc(x.title)}</h4>
      <div class="model-line">${x.brand?`Brand: ${esc(x.brand)}`:''}${x.model?` • Model: ${esc(x.model)}`:' • Model not listed'}</div>
      <div class="price-line">${x.price?`Current price: ${money(x.price)}`:'Current price not listed'}</div>
    </div>
    <button type="button" class="primary" data-finder-index="${i}">${buttonText}</button>
  </article>`;
}
function renderFinderResults(container,items,applyFn){
  if(!items.length){
    container.innerHTML='<div class="muted">No close matches found. Try adding the brand, voltage, size, or exact tool type.</div>';
    return;
  }
  container.innerHTML=items.slice(0,10).map((x,i)=>productResultHTML(x,i)).join('');
  container.querySelectorAll('[data-finder-index]').forEach(btn=>{
    btn.onclick=()=>applyFn(items[+btn.dataset.finderIndex]);
  });
}
async function applyFinderItemToOpenForm(item){
  $('name').value=item.title||'';
  $('brand').value=item.brand||'';
  $('model').value=item.model||'';
  $('barcode').value=item.barcode||'';
  if(item.category) $('category').value=item.category;
  // Online/current price is a replacement value, not proof of original purchase price.
  if(item.price) $('replacementValue').value=item.price;
  editingTool={
    ...(editingTool||{}),
    onlineImage:item.image||editingTool?.onlineImage||'',
    onlinePrice:item.price||0,
    onlineLookupDate:item.lookupDate||new Date().toISOString()
  };
  $('toolFinderStatus').textContent=`Selected${item.model?` model ${item.model}`:''}${item.price?` at ${money(item.price)}`:''}. Add your serial number, receipt, and your own photos if available.`;
  $('toolFinderResults').innerHTML='';
}
async function runToolFinder(){
  const q=$('toolFinderInput').value.trim();
  if(!q){$('toolFinderStatus').textContent='Type a brand and tool name first.';return}
  $('toolFinderStatus').textContent='Searching for matching tools and prices…';
  $('toolFinderResults').innerHTML='';
  try{
    const items=await searchOnlineTools(q);
    $('toolFinderStatus').textContent=items.length
      ? `Found ${items.length} possible match${items.length===1?'':'es'}. Choose the correct tool below.`
      : 'No automatic match found. Use Web or a retailer button below to keep searching.';
    renderFinderResults($('toolFinderResults'),items,applyFinderItemToOpenForm);
  }catch(err){
    $('toolFinderStatus').textContent=err.message||'Tool search failed.';
  }
}
async function runOnlineLookup(){
  const q=$('onlineLookupInput').value.trim();
  if(!q){$('onlineLookupStatus').textContent='Type a brand and tool name, model number, or barcode.';return}
  $('onlineLookupStatus').textContent='Searching for matching tools and prices…';
  $('onlineLookupResults').innerHTML='';
  try{
    const items=await searchOnlineTools(q);
    $('onlineLookupStatus').textContent=`Found ${items.length} possible match${items.length===1?'':'es'}.`;
    $('onlineLookupResults').innerHTML=items.slice(0,10).map((x,i)=>productResultHTML(x,i,'Add to Inventory')).join('');
    $('onlineLookupResults').querySelectorAll('[data-finder-index]').forEach(btn=>{
      btn.onclick=async()=>{
        const item=items[+btn.dataset.finderIndex];
        switchView('inventoryView');
        await openAdd();
        await applyFinderItemToOpenForm(item);
      };
    });
  }catch(err){
    $('onlineLookupStatus').textContent=err.message||'Tool search failed.';
  }
}


function cleanSearchQuery(q){return String(q||'').trim()}
function openSearchUrl(url){
  const w=window.open(url,'_blank','noopener,noreferrer');
  if(!w) alert('Allow pop-ups for ToolVault to open online searches.');
}
function searchWebForTool(query){
  const q=cleanSearchQuery(query);
  if(!q) return alert('Type a tool name first.');
  openSearchUrl(`https://www.google.com/search?q=${encodeURIComponent(q+' tool model MSRP price')}`);
}
function searchRetailerForTool(retailer,query){
  const q=cleanSearchQuery(query);
  if(!q) return alert('Type a tool name first.');
  const sites={
    homedepot:'homedepot.com',
    harborfreight:'harborfreight.com',
    snapon:'snapon.com',
    lowes:'lowes.com',
    acme:'acmetools.com',
    amazon:'amazon.com'
  };
  const site=sites[retailer];
  if(!site) return;
  // A site-restricted web search is more reliable than depending on each retailer's changing internal search URL.
  openSearchUrl(`https://www.google.com/search?q=${encodeURIComponent('site:'+site+' '+q+' price model')}`);
}

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});if(!d.objectStoreNames.contains(SETTINGS))d.createObjectStore(SETTINGS,{keyPath:'key'})};req.onsuccess=e=>resolve(e.target.result);req.onerror=e=>reject(e.target.error)})}
function store(name=STORE,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function getAll(){return new Promise((res,rej)=>{const r=store().getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putTool(t){return new Promise((res,rej)=>{const r=store(STORE,'readwrite').put(t);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function deleteTool(id){return new Promise((res,rej)=>{const r=store(STORE,'readwrite').delete(id);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function clearTools(){return new Promise((res,rej)=>{const r=store(STORE,'readwrite').clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function getSetting(key){return new Promise((res,rej)=>{const r=store(SETTINGS).get(key);r.onsuccess=()=>res(r.result?.value||'');r.onerror=()=>rej(r.error)})}
function setSetting(key,value){return new Promise((res,rej)=>{const r=store(SETTINGS,'readwrite').put({key,value});r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

async function fileToDataURL(file,max=1600,quality=.82){const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});return new Promise(resolve=>{const img=new Image();img.onload=()=>{let{width,height}=img;const scale=Math.min(1,max/Math.max(width,height));width=Math.round(width*scale);height=Math.round(height*scale);const c=document.createElement('canvas');c.width=width;c.height=height;c.getContext('2d').drawImage(img,0,0,width,height);resolve(c.toDataURL('image/jpeg',quality))};img.src=data})}
async function filesToData(files){const out=[];for(const f of files)out.push(await fileToDataURL(f));return out}

function renderPreviews(){const draw=(el,arr,type)=>{el.innerHTML=arr.map((src,i)=>`<div class="preview-item"><img src="${src}"><button type="button" data-type="${type}" data-index="${i}">×</button></div>`).join('')};draw($('toolPhotoPreview'),pendingToolPhotos,'tool');draw($('receiptPhotoPreview'),pendingReceiptPhotos,'receipt')}
document.addEventListener('click',e=>{if(e.target.matches('.preview-item button')){const i=+e.target.dataset.index;(e.target.dataset.type==='tool'?pendingToolPhotos:pendingReceiptPhotos).splice(i,1);renderPreviews()}});

async function renderAll(){const all=await getAll();renderInventory(all);renderCategories(all);renderReceipts(all)}
function renderInventory(all){
  const q=$('searchInput').value.toLowerCase().trim(),cat=$('categoryFilter').value,stat=$('statusFilter').value,sort=$('sortFilter').value;
  let filtered=all.filter(t=>{const hay=[t.name,t.brand,t.category,t.model,t.serial,t.barcode,t.store,t.location,t.notes].join(' ').toLowerCase();return(!q||hay.includes(q))&&(!cat||t.category===cat)&&(!stat||t.status===stat)});
  if(sort==='name')filtered.sort((a,b)=>(a.name||'').localeCompare(b.name||''));else if(sort==='valueHigh')filtered.sort((a,b)=>Number(b.replacementValue||b.purchasePrice||0)-Number(a.replacementValue||a.purchasePrice||0));else if(sort==='valueLow')filtered.sort((a,b)=>Number(a.replacementValue||a.purchasePrice||0)-Number(b.replacementValue||b.purchasePrice||0));else filtered.sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));
  $('toolCount').textContent=all.length;$('purchaseTotal').textContent=money(all.reduce((s,t)=>s+Number(t.purchasePrice||0),0));$('replacementTotal').textContent=money(all.reduce((s,t)=>s+Number(t.replacementValue||0),0));$('receiptCount').textContent=all.reduce((s,t)=>s+(t.receiptPhotos?.length||0),0);$('resultCount').textContent=`${filtered.length} item${filtered.length===1?'':'s'}`;
  const cats=[...new Set(all.map(t=>t.category).filter(Boolean))].sort(),prev=$('categoryFilter').value;$('categoryFilter').innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option ${c===prev?'selected':''}>${esc(c)}</option>`).join('');
  $('emptyState').style.display=all.length?'none':'block';
  $('toolGrid').innerHTML=filtered.map(t=>`<article class="card"><div class="thumb">${t.toolPhotos?.[0]?`<img src="${t.toolPhotos[0]}" alt="">`:t.onlineImage?`<img src="${esc(t.onlineImage)}" alt="">`:'No photo'}</div><div class="card-body"><h3>${esc(t.name)}</h3><div class="muted">${esc([t.brand,t.model].filter(Boolean).join(' • '))}</div><div class="tool-meta"><span class="pill">${esc(t.condition||'Good')}</span><span class="pill gray">${esc(t.category||'Uncategorized')}</span><span class="pill gray">${esc(t.status||'Active')}</span></div><div class="row"><span class="muted">${t.serial?'S/N '+esc(t.serial):esc(t.location||'')}</span><span class="price">${money(t.replacementValue||t.purchasePrice)}</span></div><div class="card-actions"><button onclick="showDetail('${t.id}')">View</button><button onclick="editTool('${t.id}')">Edit</button><button class="danger" onclick="removeTool('${t.id}')">Delete</button></div></div></article>`).join('');
}
function renderCategories(all){const groups={};for(const t of all){const c=t.category||'Uncategorized';groups[c]??={count:0,value:0};groups[c].count++;groups[c].value+=Number(t.replacementValue||t.purchasePrice||0)}const total=Math.max(1,...Object.values(groups).map(g=>g.value));$('categoryCards').innerHTML=Object.entries(groups).sort((a,b)=>b[1].value-a[1].value).map(([c,g])=>`<article class="category-card"><h3>${esc(c)}</h3><strong>${g.count} tool${g.count===1?'':'s'}</strong><p>${money(g.value)} replacement value</p><div class="category-bar"><span style="width:${Math.max(4,g.value/total*100)}%"></span></div></article>`).join('')||'<div class="empty"><p>No categories yet.</p></div>'}
function renderReceipts(all){const cards=[];for(const t of all){for(const img of (t.receiptPhotos||[]))cards.push(`<article class="receipt-card"><h3>${esc(t.name)}</h3><p class="muted">${esc(t.store||'Receipt')}</p><img src="${img}" alt="Receipt for ${esc(t.name)}"></article>`)}$('receiptGrid').innerHTML=cards.join('')||'<div class="empty"><p>No receipt photos yet.</p></div>'}

function resetForm(){ $('toolForm').reset();$('toolId').value='';editingTool=null;pendingToolPhotos=[];pendingReceiptPhotos=[];renderPreviews();$('formTitle').textContent='Add Tool';$('status').value='Active';$('condition').value='Good' }
async function openAdd(){resetForm();$('location').value=await getSetting('location');$('toolDialog').showModal()}
async function editTool(id){const t=(await getAll()).find(x=>x.id===id);if(!t)return;editingTool=t;for(const key of ['name','brand','category','model','serial','barcode','purchasePrice','replacementValue','purchaseDate','store','location','status','condition','notes'])$(key).value=t[key]??'';$('toolId').value=t.id;pendingToolPhotos=[...(t.toolPhotos||[])];pendingReceiptPhotos=[...(t.receiptPhotos||[])];renderPreviews();$('formTitle').textContent='Edit Tool';$('toolDialog').showModal()}
async function removeTool(id){if(confirm('Delete this tool from ToolVault?')){await deleteTool(id);renderAll()}}
async function showDetail(id){const t=(await getAll()).find(x=>x.id===id);if(!t)return;const field=(l,v)=>v?`<div class="detail-item"><small>${l}</small><strong>${esc(v)}</strong></div>`:'';$('detailContent').innerHTML=`<div class="dialog-head"><div><h2>${esc(t.name)}</h2><div class="muted">${esc(t.brand||'')} ${esc(t.model||'')}</div></div><button onclick="$('detailDialog').close()" class="icon-btn">✕</button></div><div class="detail-list">${field('Category',t.category)}${field('Condition',t.condition)}${field('Status',t.status)}${field('Serial number',t.serial)}${field('Barcode',t.barcode)}${field('Purchase price',money(t.purchasePrice))}${field('Replacement value',money(t.replacementValue))}${field('Purchase date',t.purchaseDate)}${field('Purchased from',t.store)}${field('Storage location',t.location)}</div>${t.notes?`<h3>Notes</h3><p>${esc(t.notes)}</p>`:''}${t.toolPhotos?.length?`<h3>Tool Photos</h3><div class="gallery">${t.toolPhotos.map(x=>`<img src="${x}">`).join('')}</div>`:t.onlineImage?`<h3>Online Product Image</h3><div class="gallery"><img src="${esc(t.onlineImage)}"></div>`:''}${t.receiptPhotos?.length?`<h3>Receipt Photos</h3><div class="gallery">${t.receiptPhotos.map(x=>`<img src="${x}">`).join('')}</div>`:''}`;$('detailDialog').showModal()}

$('toolForm').addEventListener('submit',async e=>{e.preventDefault();const now=new Date().toISOString();const t={id:$('toolId').value||crypto.randomUUID(),name:$('name').value.trim(),brand:$('brand').value.trim(),category:$('category').value.trim(),model:$('model').value.trim(),serial:$('serial').value.trim(),barcode:$('barcode').value.trim(),purchasePrice:Number($('purchasePrice').value||0),replacementValue:Number($('replacementValue').value||0),purchaseDate:$('purchaseDate').value,store:$('store').value.trim(),location:$('location').value.trim(),status:$('status').value,condition:$('condition').value,notes:$('notes').value.trim(),toolPhotos:pendingToolPhotos,receiptPhotos:pendingReceiptPhotos,onlineImage:editingTool?.onlineImage||'',onlinePrice:editingTool?.onlinePrice||0,onlineLookupDate:editingTool?.onlineLookupDate||'',priceEditable:true,createdAt:editingTool?.createdAt||now,updatedAt:now};await putTool(t);$('toolDialog').close();resetForm();renderAll()});
$('toolPhotos').addEventListener('change',async e=>{pendingToolPhotos.push(...await filesToData([...e.target.files]));e.target.value='';renderPreviews()});
$('receiptPhotos').addEventListener('change',async e=>{pendingReceiptPhotos.push(...await filesToData([...e.target.files]));e.target.value='';renderPreviews()});

function switchView(id){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===id));document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'})}
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));

async function startScan(){stopScan();$('scanDialog').showModal();$('scanStatus').textContent='Starting camera…';try{scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});$('scanVideo').srcObject=scanStream;await $('scanVideo').play();if('BarcodeDetector'in window){const formats=await BarcodeDetector.getSupportedFormats();const detector=new BarcodeDetector({formats:formats.filter(x=>['ean_13','ean_8','upc_a','upc_e','code_128','code_39'].includes(x))});$('scanStatus').textContent='Point the camera at a barcode.';scanTimer=setInterval(async()=>{try{const codes=await detector.detect($('scanVideo'));if(codes.length){const code=codes[0].rawValue;stopScan();$('scanDialog').close();switchView('inventoryView');$('searchInput').value=code;renderAll();if(!confirm(`Barcode ${code} found. Search inventory for it? Press Cancel to add a new tool with this barcode.`)){await openAdd();$('barcode').value=code}}}catch{}},500)}else{$('scanStatus').textContent='Automatic scanning is not supported in this browser. Use manual entry.'}}catch(e){$('scanStatus').textContent='Camera access was not available. Use manual entry.'}}
function stopScan(){if(scanTimer){clearInterval(scanTimer);scanTimer=null}if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null}}
$('closeScanBtn').onclick=()=>{stopScan();$('scanDialog').close()};$('scanDialog').addEventListener('close',stopScan);
$('scanFallbackBtn').onclick=async()=>{const code=prompt('Enter barcode / UPC');if(code){stopScan();$('scanDialog').close();await openAdd();$('barcode').value=code}};

async function createReport(){const all=await getAll();if(!all.length){alert('Add at least one tool first.');return}const owner=$('reportName').value.trim()||await getSetting('owner'),company=$('reportCompany').value.trim()||await getSetting('company'),include=$('includeReceipts').checked;const totalPurchase=all.reduce((s,t)=>s+Number(t.purchasePrice||0),0),totalReplacement=all.reduce((s,t)=>s+Number(t.replacementValue||0),0);const w=window.open('','_blank');if(!w){alert('Allow pop-ups for ToolVault to create the PDF report.');return}const cards=all.map(t=>`<article class="report-tool">${t.toolPhotos?.[0]?`<img src="${t.toolPhotos[0]}">`:t.onlineImage?`<img src="${esc(t.onlineImage)}">`:''}<div><h3>${esc(t.name)}</h3><p><b>Brand:</b> ${esc(t.brand||'—')} &nbsp; <b>Model:</b> ${esc(t.model||'—')}</p><p><b>Serial:</b> ${esc(t.serial||'—')} &nbsp; <b>Barcode:</b> ${esc(t.barcode||'—')}</p><p><b>Purchase:</b> ${money(t.purchasePrice)} &nbsp; <b>Replacement:</b> ${money(t.replacementValue)}</p><p><b>Location:</b> ${esc(t.location||'—')} &nbsp; <b>Status:</b> ${esc(t.status||'Active')}</p></div></article>`).join('');const receipts=include?all.flatMap(t=>(t.receiptPhotos||[]).map(img=>`<section class="receipt-page"><h2>Receipt — ${esc(t.name)}</h2><img src="${img}"></section>`)).join(''):'';w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>ToolVault Inventory Report</title><style>body{font-family:Arial,sans-serif;color:#000;background:#fff;margin:28px}h1,h2,h3,p{margin-top:0}.summary{border:2px solid #000;padding:14px;margin:18px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.report-tool{border:1px solid #000;padding:10px;margin-bottom:10px;display:grid;grid-template-columns:140px 1fr;gap:12px;break-inside:avoid}.report-tool img{width:140px;height:110px;object-fit:cover;border:1px solid #000}.report-tool p{font-size:12px;margin:5px 0}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:55px}.line{border-top:1px solid #000;padding-top:5px}.receipt-page{page-break-before:always}.receipt-page img{max-width:100%;max-height:900px;display:block;margin:auto}@media print{button{display:none}}</style></head><body><h1>Personal Tool Inventory</h1><p><b>Owner:</b> ${esc(owner||'—')}<br><b>Company:</b> ${esc(company||'—')}<br><b>Date generated:</b> ${new Date().toLocaleDateString()}</p><section class="summary"><div><b>Total tools</b><br>${all.length}</div><div><b>Purchase value</b><br>${money(totalPurchase)}</div><div><b>Replacement value</b><br>${money(totalReplacement)}</div></section>${cards}<section class="signatures"><div class="line">Tool Owner Signature / Date</div><div class="line">Company Representative / Date</div></section>${receipts}<script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script></body></html>`);w.document.close()}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('csvBtn').onclick=async()=>{const all=await getAll(),cols=['name','brand','category','model','serial','barcode','purchasePrice','replacementValue','purchaseDate','store','location','status','condition','notes'];const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;downloadBlob(new Blob([[cols.join(','),...all.map(t=>cols.map(c=>cell(t[c])).join(','))].join('\n')],{type:'text/csv'}),'toolvault-inventory.csv')};
$('backupBtn').onclick=async()=>{const all=await getAll();downloadBlob(new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),tools:all},null,2)],{type:'application/json'}),'toolvault-backup.json')};
$('restoreInput').onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data.tools))throw Error();if(!confirm(`Restore ${data.tools.length} tools? This replaces the current inventory.`))return;await clearTools();for(const t of data.tools)await putTool(t);await renderAll();alert('Backup restored.')}catch{alert('That backup file could not be restored.')}finally{e.target.value=''}};
$('saveSettingsBtn').onclick=async()=>{await setSetting('owner',$('ownerNameSetting').value.trim());await setSetting('company',$('companySetting').value.trim());await setSetting('location',$('locationSetting').value.trim());$('reportName').value=$('ownerNameSetting').value.trim();$('reportCompany').value=$('companySetting').value.trim();alert('Settings saved.')};

document.querySelectorAll('[data-finder-retailer]').forEach(btn=>btn.onclick=()=>{
  const q=$('toolFinderInput').value;
  if(btn.dataset.finderRetailer==='web') searchWebForTool(q);
  else searchRetailerForTool(btn.dataset.finderRetailer,q);
});
$('toolFinderBtn').onclick=runToolFinder;
$('toolFinderInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runToolFinder()}});
$('onlineLookupBtn').onclick=runOnlineLookup;
$('onlineLookupInput').addEventListener('keydown',e=>{if(e.key==='Enter')runOnlineLookup()});
$('headerAddBtn').onclick=$('inventoryAddBtn').onclick=$('emptyAddBtn').onclick=openAdd;$('closeDialog').onclick=()=>$('toolDialog').close();$('cancelBtn').onclick=()=>$('toolDialog').close();$('scanBtn').onclick=startScan;$('createReportBtn').onclick=createReport;
['searchInput','categoryFilter','statusFilter','sortFilter'].forEach(id=>$(id).addEventListener(id==='searchInput'?'input':'change',renderAll));
window.editTool=editTool;window.removeTool=removeTool;window.showDetail=showDetail;window.$=$;

(async()=>{db=await openDB();const owner=await getSetting('owner'),company=await getSetting('company'),loc=await getSetting('location');$('ownerNameSetting').value=owner;$('companySetting').value=company;$('locationSetting').value=loc;$('reportName').value=owner;$('reportCompany').value=company;await renderAll();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{})})();
