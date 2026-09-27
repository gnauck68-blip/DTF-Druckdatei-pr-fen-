// Browsertest in Chromium (Playwright): Altdaten aus v13 anlegen, mit neuer Version öffnen,
// Bildauslagerung, Gerätenummern, Angebot ohne Motiv, Sicherung/Wiederherstellung, Sperren, Entwurf.
// Aufruf: NODE_PATH=$(npm root -g) node tests/test-browser.cjs [pfad/zur/alten.html]
const fs=require('fs'),path=require('path'),http=require('http'),zlib=require('zlib'),assert=require('assert/strict');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),oldHtml=process.argv[2],newHtml=path.join(root,'RehaTexstyle_Offline.html');
const PASS='Testpasswort-123';

function png(w,h){const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};const chunk=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const raw=require('crypto').randomBytes((w*3+1)*h);for(let y=0;y<h;y++)raw[y*(w*3+1)]=0;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const motif=png(700,600);

const server=http.createServer((req,res)=>{const f={'/old.html':oldHtml,'/new.html':newHtml}[req.url];if(!f){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(f));});

async function main(){
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:fs.existsSync('/opt/pw-browsers/chromium')?undefined:undefined});
const ctx=await browser.newContext({acceptDownloads:true});const page=await ctx.newPage();
let dialogMode='accept';const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());if(dialogMode==='dismiss')return d.dismiss();return d.type()==='prompt'?d.accept(d.defaultValue()):d.accept();});
page.on('pageerror',e=>{console.error('PAGEERROR',e.message);});
const toast=()=>page.locator('#toast').textContent();
const ok=m=>console.log('PASS:',m);
const idbInfo=()=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('RehaTexstylePilot');r.onsuccess=()=>{const d=r.result,names=[...d.objectStoreNames],out={version:d.version,stores:names};if(!names.includes('images')){const t=d.transaction('vault');const g=t.objectStore('vault').get('active');g.onsuccess=()=>{out.vaultBytes=g.result.data.length;d.close();res(out);};return;}const t=d.transaction(['vault','images']);const g=t.objectStore('vault').get('active');const k=t.objectStore('images').getAllKeys();t.oncomplete=()=>{out.vaultBytes=g.result.data.length;out.images=k.result.length;d.close();res(out);};}}));

async function createWorkspaceOld(){
 await page.goto(base+'/old.html');await page.fill('[name=pass]',PASS);await page.fill('[name=repeat]',PASS);await page.click('#gateForm button');await page.waitForSelector('#nav_settings');
 await page.click('#nav_settings');await page.fill('#settingsForm [name=company]','Testbetrieb GmbH');await page.fill('#settingsForm [name=taxid]','12/345/67890');await page.fill('#settingsForm [name=address]','Teststr. 1\n12345 Teststadt');await page.click('#settingsForm button.primary');
 await page.click('#nav_customers');await page.click('#newCustomer');await page.fill('#customerForm [name=name]','Kunde Alt');await page.fill('#customerForm [name=address]','Altweg 2\n54321 Altstadt');await page.click('#customerForm button.primary');
 await page.click('#nav_orders');await page.click('#newOrder');await page.selectOption('#orderForm [name=customerId]',{label:'Kunde Alt'});await page.click('#orderForm button.primary');
 await page.click('#addFreeLine');await page.fill('#lineForm [name=description]','Shirt');await page.fill('#lineForm [name=qty]','11');await page.fill('#lineForm [name=ek]','3.00');await page.fill('#lineForm [name=vk]','12.00');await page.selectOption('#lineForm [name=tax]','7');await page.click('#lineForm button.primary');
 await page.click('#addPlacement');await page.setInputFiles('#motifFile',{name:'motiv.png',mimeType:'image/png',buffer:motif});await page.waitForFunction(()=>document.querySelector('#uploadStatus').textContent.startsWith('Geladen'));await page.click('#placementForm button.primary');await page.waitForSelector('[data-placement]');
 await page.click('[data-doc="Angebot"]');await page.click('#freezeDoc');await page.waitForSelector('#documentPreview');
}

// 1. Altdaten mit v13
await createWorkspaceOld();const before=await idbInfo();assert.equal(before.version,1);
const oldNumber=await page.evaluate(()=>state.docs[0].number);assert.match(oldNumber,/^RT-AN-2026-00001$/);
await page.click('#closeModal');await page.evaluate(()=>{delete window.showSaveFilePicker;});const [dlOld]=await Promise.all([page.waitForEvent('download'),page.click('#backup')]);const v1Path=path.join(require('os').tmpdir(),'rtx-v1-'+process.pid+'.rtx');await dlOld.saveAs(v1Path);
ok(`v13-Stand angelegt: verschlüsselter Arbeitsstand ${(before.vaultBytes/1e6).toFixed(2)} MB, Motiv ${(motif.length/1e6).toFixed(2)} MB, Angebot ${oldNumber}`);

// 2. Neue Version öffnen: Migration + Gerätekennung
await page.goto(base+'/new.html');await page.fill('[name=pass]',PASS);await page.click('#gateForm button');
await page.waitForSelector('#deviceForm');await page.fill('#deviceForm [name=code]','pc1');await page.click('#deviceForm button.primary');await page.waitForFunction(()=>!document.querySelector('#modal').open);
const after=await idbInfo();assert.equal(after.version,2);assert.equal(after.images,1);
assert.ok(after.vaultBytes<before.vaultBytes/10,`Arbeitsstand nicht verkleinert: ${after.vaultBytes}`);
const refs=await page.evaluate(()=>{const o=state.orders[0];return {p:o.placements[0].src,j:o.transferJobs[0].motifId,d:state.docs[0].order.placements[0].src,json:JSON.stringify(state).includes('data:image/')};});
assert.match(refs.p,/^img:[0-9a-f]{64}$/);assert.equal(refs.p,refs.j);assert.equal(refs.p,refs.d);assert.equal(refs.json,false);
ok(`Migration: 1 Bild im Bildspeicher, Arbeitsstand ${(before.vaultBytes/1e6).toFixed(2)} MB auf ${(after.vaultBytes/1e3).toFixed(1)} KB, Platzierung/Transferjob/Dokument zeigen auf dieselbe Referenz`);
await page.click('[data-order]');const src=await page.locator('#placements img').getAttribute('src');assert.match(src,/^blob:/);
assert.ok(await page.locator('#placements img').evaluate(i=>i.decode().then(()=>i.naturalWidth)),'Bild nicht darstellbar');
ok('Motiv wird nach Migration aus dem verschlüsselten Bildspeicher angezeigt (blob-URL)');
await page.click('#nav_documents');await page.click('[data-open-doc]');const docImgs=await page.locator('#documentPreview svg image').count();assert.ok(docImgs>=1);
const docHref=await page.locator('#documentPreview svg image').last().getAttribute('href');assert.match(docHref,/^blob:/);await page.click('#closeModal');
ok('Gespeichertes Altangebot zeigt das Motiv weiterhin');

// 3. Nummern je Gerät, Angebot ohne Motiv
await page.click('#nav_orders');await page.click('#backOrders');await page.click('#newOrder');await page.waitForSelector('#orderForm');const orderNo=await page.locator('#app h1').textContent();assert.match(orderNo,/^RT-PC1-A-2026-00001$/);
await page.selectOption('#orderForm [name=customerId]',{label:'Kunde Alt'});await page.click('#orderForm button.primary');
await page.click('#addFreeLine');await page.fill('#lineForm [name=description]','Polo ohne Motiv');await page.fill('#lineForm [name=qty]','5');await page.fill('#lineForm [name=transfersPerItem]','1');await page.fill('#lineForm [name=ek]','4.00');await page.fill('#lineForm [name=vk]','15.00');await page.selectOption('#lineForm [name=tax]','7');await page.click('#lineForm button.primary');
dialogs.length=0;await page.click('[data-doc="Angebot"]');await page.waitForSelector('#documentPreview');assert.ok(dialogs.some(m=>m.includes('noch kein Motiv')));
assert.ok((await page.locator('#documentPreview').textContent()).includes('Transferdruck noch offen'));
await page.click('#freezeDoc');await page.waitForFunction(()=>state.docs.length===2);const an=await page.evaluate(()=>state.docs[1].number);assert.equal(an,'RT-PC1-AN-2026-00001');await page.click('#closeModal');
ok(`Auftrag ${orderNo}, Angebot ohne Motiv nach Rückfrage erstellt und gespeichert als ${an}, Hinweis „Transferdruck noch offen“ im Dokument`);

// 4. Keine Nummernlücke bei abgebrochener Prüfung, Hochwasser des Geräts
const gap=await page.evaluate(async()=>{state.docs.push({number:'RT-PC1-AN-2026-00002',type:'Angebot'});const n1=nextNumber('Angebot').number;state.docs.pop();const n2=nextNumber('Angebot').number;state.deviceCounters.PC1.Angebot=0;const n3=nextNumber('Angebot').number;state.deviceCounters.PC1.Angebot=1;return [n1,n2,n3];});
assert.deepEqual(gap,['RT-PC1-AN-2026-00002','RT-PC1-AN-2026-00002','RT-PC1-AN-2026-00002']);
ok('Nummer wird erst nach bestandener Prüfung verbraucht; Gerätezähler schützt auch nach Import eines Stands mit niedrigerem Zähler');

// 5. Ein fehlerhafter Auftrag blockiert das Speichern nicht
const saved=await page.evaluate(async()=>{const o=state.orders[0];o.transferJobs.push({id:'ghost',placementId:null,lineId:'gibt-es-nicht',perItem:1,width:100,height:50,motifId:'x',name:'Geist'});const rev=state.rev;await save();const err=o.syncError;o.transferJobs=o.transferJobs.filter(j=>j.id!=='ghost');await save();return {rev,after:state.rev,err,cleared:!o.syncError};});
assert.ok(saved.after>saved.rev);assert.match(saved.err,/gelöschtes Textil/);assert.equal(saved.cleared,true);
ok('Fehlerhafte Kalkulation eines Auftrags wird am Auftrag vermerkt, Speichern läuft weiter');

// 6. Sicherung inkl. Bild, Wiederherstellung auf frischem Gerät, falsches Passwort
await page.evaluate(()=>{delete window.showSaveFilePicker;});
const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#backup')]);const backupPath=path.join(require('os').tmpdir(),'rtx-test-'+process.pid+'.rtx');await dl.saveAs(backupPath);
const backupJson=JSON.parse(fs.readFileSync(backupPath,'utf8'));assert.equal(backupJson.format,'RehaTexstyleBackup');assert.equal(Object.keys(backupJson.images).length,1);assert.ok(!fs.readFileSync(backupPath,'utf8').includes('data:image'));
ok(`Sicherung v2: ${(fs.statSync(backupPath).size/1e6).toFixed(2)} MB, Bild einmal enthalten und verschlüsselt`);
const ctx2=await browser.newContext();const p2=await ctx2.newPage();p2.on('dialog',d=>d.accept());p2.on('pageerror',e=>console.error('PAGEERROR2',e.message));
await p2.goto(base+'/new.html');await p2.waitForSelector('#restoreGate');await p2.setInputFiles('#restoreGate',backupPath);
await p2.waitForSelector('#passDialog[open] input[type=password]');await p2.fill('#passDialog input','falsch-falsch-falsch');await p2.click('#passDialog button.primary');
await p2.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Passwort falsch'));
await p2.setInputFiles('#restoreGate',[]);await p2.setInputFiles('#restoreGate',backupPath);await p2.waitForSelector('#passDialog[open]');await p2.fill('#passDialog input',PASS);await p2.click('#passDialog button.primary');
await p2.waitForSelector('#deviceForm');await p2.fill('#deviceForm [name=code]','TAB2');await p2.click('#deviceForm button.primary');
await p2.click('[data-order]>>nth=-1');const src2=await p2.locator('#placements img').getAttribute('src');assert.match(src2,/^blob:/);
const o2=await p2.evaluate(async()=>{selected=null;view='orders';render();document.querySelector('#newOrder').click();await new Promise(r=>setTimeout(r,300));return order().number;});assert.equal(o2,'RT-TAB2-A-2026-00001');
ok('Wiederherstellung auf zweitem Gerät: falsches Passwort abgewiesen, Passwort verdeckt eingegeben, Motiv vorhanden, Nummern mit TAB2');
await ctx2.close();

// 6b. Alte Sicherung (v13, Bilder als data:-URL) auf frischem Gerät öffnen
const ctx3=await browser.newContext();const p3=await ctx3.newPage();p3.on('dialog',d=>d.accept());
await p3.goto(base+'/new.html');await p3.setInputFiles('#restoreGate',v1Path);await p3.waitForSelector('#passDialog[open]');await p3.fill('#passDialog input',PASS);await p3.click('#passDialog button.primary');
await p3.waitForSelector('#deviceForm');await p3.fill('#deviceForm [name=code]','PC9');await p3.click('#deviceForm button.primary');
const v1=await p3.evaluate(()=>({data:JSON.stringify(state).includes('data:image/'),ref:state.orders[0].placements[0].src,url:imgUrl(state.orders[0].placements[0].src)}));
assert.equal(v1.data,false);assert.match(v1.ref,/^img:/);assert.match(v1.url,/^blob:/);await ctx3.close();fs.unlinkSync(v1Path);
ok('Alte v13-Sicherung lässt sich öffnen, Bilder werden dabei ausgelagert');

// 7. Sperren bei Speicherfehler fragt nach, statt still zu scheitern
dialogMode='dismiss';dialogs.length=0;await page.evaluate(()=>{storageError=true;});await page.click('#lock');await page.waitForTimeout(300);
assert.ok(dialogs.some(m=>m.includes('nicht gespeichert')));assert.equal(await page.evaluate(()=>!!state),true);
dialogMode='accept';await page.evaluate(()=>{storageError=false;});
ok('Sperren bei Speicherfehler: Rückfrage erscheint, Abbrechen lässt die Daten offen');

// 8. Automatische Sperre mit halb erfasstem Kunden
await page.click('#nav_customers');await page.click('#newCustomer');await page.fill('#customerForm [name=name]','Neukunde Telefon');await page.fill('#customerForm [name=phone]','0123 4567');
await page.evaluate(()=>{lastActivity=Date.now()-601000;});await page.waitForSelector('#gateForm',{timeout:20000});
assert.equal(await page.evaluate(()=>state),null);
await page.fill('[name=pass]',PASS);await page.click('#gateForm button');await page.waitForSelector('#restoreDraft0');
assert.ok((await page.locator('#modal').textContent()).includes('Neukunde Telefon'));await page.click('#restoreDraft0');
await page.waitForSelector('#customerForm');assert.equal(await page.inputValue('#customerForm [name=name]'),'Neukunde Telefon');assert.equal(await page.inputValue('#customerForm [name=phone]'),'0123 4567');
await page.click('#customerForm button.primary');await page.waitForFunction(()=>state.customers.some(c=>c.name==='Neukunde Telefon'));
const draftLeft=await page.evaluate(()=>idbGet('vault','draft'));assert.equal(draftLeft,undefined);
ok('Automatische Sperre: Kundenentwurf verschlüsselt aufbewahrt, nach Entsperren wieder geöffnet und gespeichert');

fs.unlinkSync(backupPath);await browser.close();server.close();console.log('ALLE BROWSERTESTS BESTANDEN');
}
main().catch(e=>{console.error(e);process.exit(1);});
