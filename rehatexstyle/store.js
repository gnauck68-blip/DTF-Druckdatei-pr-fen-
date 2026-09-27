'use strict';
// Bildspeicher: jedes Bild liegt genau einmal verschlüsselt in IndexedDB (Store "images"),
// Schlüssel ist der SHA-256 der Bilddatei. Im Arbeitsstand steht nur noch "img:<hash>".
// Gerätedaten (Store "device"): Gerätekennung und höchste vergebene Nummern dieses Geräts.
// Sie gehören zum Gerät, nicht zum übertragbaren Arbeitsbereich.
const imageCache=new Map(); // hash -> blob-URL (entschlüsselt, nur im Arbeitsspeicher)
let deviceInfo={code:'',high:{}},storagePersisted=null;
const IMAGE_MIMES=['image/png','image/jpeg','image/webp'];
const docPrefixes={order:'A',Angebot:'AN',Lieferschein:'LS',Rechnung:'RE',Storno:'ST',Werkstattzettel:'WS','Bestellübersicht':'BE'};

function hex(buf){return Array.from(new Uint8Array(buf),b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(bytes){return hex(await crypto.subtle.digest('SHA-256',bytes));}
function isImageRef(v){return typeof v==='string'&&/^img:[0-9a-f]{64}$/.test(v);}
function imgUrl(v){return isImageRef(v)?imageCache.get(v.slice(4))||'':v||'';}

function idb(store,mode,fn){return new Promise((resolve,reject)=>{const t=db.transaction(store,mode),r=fn(t.objectStore(store));let result;if(r)r.onsuccess=()=>{result=r.result;};t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('Datenbankvorgang abgebrochen'));});}
const idbGet=(store,k)=>idb(store,'readonly',s=>s.get(k));
const idbPut=(store,k,v)=>idb(store,'readwrite',s=>s.put(v,k));
const idbDelete=(store,k)=>idb(store,'readwrite',s=>s.delete(k));

function imageAad(hash,mime){return new TextEncoder().encode(hash+'|'+mime);}
async function encryptImage(hash,mime,bytes,k=key){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:imageAad(hash,mime)},k,bytes);return {mime,iv,data:new Uint8Array(data)};}
async function decryptImage(hash,rec,k=key){if(!IMAGE_MIMES.includes(rec?.mime))throw Error('Unzulässiges Bildformat.');let raw;try{raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:rec.iv,additionalData:imageAad(hash,rec.mime)},k,rec.data);}catch{throw Error('Bild kann nicht entschlüsselt werden.');}if(await sha256(raw)!==hash)throw Error('Bilddaten beschädigt.');return new Uint8Array(raw);}
function cacheImage(hash,mime,bytes){if(!imageCache.has(hash))imageCache.set(hash,URL.createObjectURL(new Blob([bytes],{type:mime})));}
function clearImageCache(){for(const u of imageCache.values())URL.revokeObjectURL(u);imageCache.clear();}

// Speichert Bildbytes verschlüsselt und liefert die Referenz "img:<hash>".
async function storeImageBytes(bytes,mime){if(!IMAGE_MIMES.includes(mime))throw Error('Unzulässiges Bildformat.');const hash=await sha256(bytes);if(!imageCache.has(hash)||!await idbGet('images',hash))await idbPut('images',hash,await encryptImage(hash,mime,bytes));cacheImage(hash,mime,bytes);return 'img:'+hash;}

function walkStrings(value,visit){if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(typeof value[i]==='string')value[i]=visit(value[i]);else walkStrings(value[i],visit);}}else if(value&&typeof value==='object'){for(const k of Object.keys(value)){if(typeof value[k]==='string')value[k]=visit(value[k]);else walkStrings(value[k],visit);}}}
function collectImageRefs(s=state){const refs=new Set();walkStrings(s,v=>{if(isImageRef(v))refs.add(v.slice(4));return v;});return refs;}

// Ältere Stände enthalten Bilder als data:-URL, teils mehrfach (Platzierung, Transferjob, jedes Dokument).
async function migrateImages(s=state){const found=new Map();walkStrings(s,v=>{if(/^data:image\/(png|jpeg|webp);base64,/.test(v))found.set(v,null);return v;});for(const url of found.keys()){const mime=url.slice(5,url.indexOf(';'));found.set(url,await storeImageBytes(un64(url.slice(url.indexOf(',')+1)),mime));}if(found.size)walkStrings(s,v=>found.get(v)||v);return found.size;}

async function loadImages(){let missing=0;for(const hash of collectImageRefs()){if(imageCache.has(hash))continue;try{const rec=await idbGet('images',hash);if(!rec)throw Error('fehlt');cacheImage(hash,rec.mime,await decryptImage(hash,rec));}catch{missing++;}}if(missing)toast(`${missing} Bild(er) fehlen oder sind beschädigt. Betroffene Motive neu laden.`);return missing;}
async function collectGarbageImages(){const refs=collectImageRefs(),keys=await idb('images','readonly',s=>s.getAllKeys());let removed=0;for(const k of keys)if(!refs.has(k)){await idbDelete('images',k);const u=imageCache.get(k);if(u)URL.revokeObjectURL(u);imageCache.delete(k);removed++;}return removed;}
async function clearImageStore(){await idb('images','readwrite',s=>s.clear());clearImageCache();}

async function backupImages(){const images={};let missing=0;for(const hash of collectImageRefs()){const rec=await idbGet('images',hash);if(!rec){missing++;continue;}images[hash]={mime:rec.mime,iv:b64(rec.iv),data:b64(rec.data)};}return {images,missing};}
// Prüft alle Bilder einer Sicherungsdatei mit deren Schlüssel, bevor etwas ersetzt wird.
async function readBackupImages(images,k){const out=[];for(const [hash,r] of Object.entries(images||{})){if(!/^[0-9a-f]{64}$/.test(hash)||!IMAGE_MIMES.includes(r?.mime))throw Error('Sicherung enthält ungültige Bilddaten.');const rec={mime:r.mime,iv:un64(r.iv),data:un64(r.data)};if(rec.iv.length!==12)throw Error('Sicherung enthält ungültige Bilddaten.');await decryptImage(hash,rec,k);out.push([hash,rec]);}return out;}

async function loadDevice(){deviceInfo={code:'',high:{},...await idbGet('device','info')};}
async function saveDevice(){await idbPut('device','info',deviceInfo);}
function validDeviceCode(v){return /^[A-Z0-9]{1,6}$/.test(v);}

// Nummern je Gerät: RT-PC1-RE-2026-00001. Der Zähler berücksichtigt den Arbeitsbereich und
// die höchste auf diesem Gerät je vergebene Nummer, auch wenn ein anderer Stand importiert wurde.
// Erst commit() verbraucht die Nummer; Prüfungen davor lassen keine Lücke.
function nextNumber(type,day=date()){const code=deviceInfo.code;if(!code)throw Error('Zuerst unter Einstellungen die Gerätekennung festlegen (z. B. PC1 oder TAB2). Jedes Gerät braucht eine eigene.');const prefix=docPrefixes[type];if(!prefix)throw Error('Unbekannter Dokumenttyp.');state.deviceCounters||={};const counters=state.deviceCounters[code]||={},hk=code+'|'+type,n=Math.max(counters[type]||0,deviceInfo.high[hk]||0)+1;return {n,number:`${state.settings.prefix}-${code}-${prefix}-${day.slice(0,4)}-${String(n).padStart(5,'0')}`,commit:async()=>{counters[type]=n;deviceInfo.high[hk]=Math.max(deviceInfo.high[hk]||0,n);await saveDevice();}};}

async function requestPersistentStorage(){try{if(!navigator.storage?.persist)return storagePersisted=null;storagePersisted=await navigator.storage.persisted()||await navigator.storage.persist();}catch{storagePersisted=null;}return storagePersisted;}
if(typeof module!=='undefined')module.exports={isImageRef,imgUrl,walkStrings,collectImageRefs,nextNumber};
