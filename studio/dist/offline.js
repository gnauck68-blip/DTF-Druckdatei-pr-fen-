(()=>{
 'use strict';
 const $=id=>document.getElementById(id), sw=navigator.serviceWorker;
 const badge=$('offlineBadge'), note=$('offlineNote'), prepare=$('prepareOffline'), update=$('updateOffline'), remove=$('removeOffline');
 const base=new URL('./',location.href);let registration=null,reloading=false;
 const say=(message,ready=false)=>{note.textContent=message;badge.textContent=ready?'Offline bereit':'Offline einrichten';badge.dataset.ready=String(ready);};
 const supported=!!sw&&window.isSecureContext;
 const status=worker=>new Promise(resolve=>{
   if(!worker){resolve({ready:false});return;}
   const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve({ready:false});},4000);
   channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};
   worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
 });
 async function refresh(){
   if(!supported){say('Offline-Speicherung ist hier nicht verfügbar. Bitte Chrome oder Edge auf einem freigegebenen Gerät über HTTPS verwenden.');prepare.disabled=true;return;}
   registration=await sw.getRegistration(base.href);
   if(!registration){say('Einmal online auf „Offline einrichten“ tippen. Dabei werden nur Programmdateien gespeichert.');update.hidden=remove.hidden=true;return;}
   const result=await status(registration.active);
   say(result.ready?'Programmdateien sind gespeichert. Öffne die Offline-App und prüfe den Neustart ohne Internet. Kundendateien werden nicht automatisch gespeichert.':'Offline-Speicherung ist noch nicht vollständig. Bitte online erneut einrichten.',result.ready);
   update.hidden=remove.hidden=false;
   $('openOffline').hidden=!result.ready;
   prepare.textContent=result.ready?'Offline-Speicherung prüfen':'Offline einrichten';
   if(registration.waiting)update.textContent='Update übernehmen';
 }
 function installed(reg){return new Promise((resolve,reject)=>{
   const worker=reg.installing||reg.waiting;
   if(!worker){resolve();return;}
   const timer=setTimeout(()=>reject(Error('Das Speichern dauert zu lange. Bitte Verbindung prüfen und erneut versuchen.')),60000);
   const check=()=>{if(['installed','activated'].includes(worker.state)){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Offline-Dateien konnten nicht vollständig gespeichert werden. Bitte online anmelden und erneut versuchen.'));}};
   worker.addEventListener('statechange',check);check();
 });}
 prepare.addEventListener('click',async()=>{
   if(!supported)return;
   prepare.disabled=true;say('Programmdateien werden für dieses Gerät gespeichert …');
   try{
     registration=await sw.register(new URL('sw.js',base).href,{scope:base.href,updateViaCache:'none'});
     await installed(registration);
     if(!registration.active)await Promise.race([sw.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Offline-Modus wurde nicht aktiviert. Bitte Seite erneut öffnen.')),12000))]);
     const result=await status(registration.active);
     if(!result.ready)throw Error('Offline-Speicher ist unvollständig. Bitte Offline-Kopie entfernen, alle App-Fenster schließen und online neu einrichten.');
     await refresh();
     // A request, not a guarantee: browsers may still clear site data.
     if(navigator.storage?.persist){try{await navigator.storage.persist();}catch{}}
   }catch(e){say(e.message||'Offline-Speicherung fehlgeschlagen. Bitte online erneut versuchen.');}
   finally{prepare.disabled=false;}
 });
 update.addEventListener('click',async()=>{
   if(!registration)return;
   if(!confirm('Bitte zuerst offene Projekte speichern und andere App-Fenster schließen. Das Update lädt diese App neu. Fortfahren?'))return;
   update.disabled=true;
   try{
     await registration.update();await installed(registration);
     if(registration.waiting){reloading=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
     else{await refresh();note.textContent='Keine neue Offline-Version verfügbar. Die vorhandene Version bleibt nutzbar.';}
   }catch{note.textContent='Update nicht erreichbar. Die gespeicherte Offline-Version bleibt erhalten. Bitte später online erneut prüfen.';}
   finally{update.disabled=false;}
 });
 remove.addEventListener('click',async()=>{
   if(!confirm('Offline-Programmdateien von diesem Browser entfernen? Heruntergeladene Kundendateien bleiben erhalten.'))return;
   try{
     if(registration)await registration.unregister();
     for(const name of await caches.keys())if(name.startsWith('texstyle-app-'))await caches.delete(name);
     $('openOffline').hidden=true;update.hidden=remove.hidden=true;
     say('Offline-Kopie entfernt. Bitte alle Fenster dieser App schließen. Downloads separat nach dem Löschkonzept löschen.');
   }catch{say('Entfernen fehlgeschlagen. Die IT kann die Website-Daten dieses Browsers löschen. Downloads separat prüfen.');}
 });
 $('offlineBadge').addEventListener('click',()=>$('installDialog').showModal());
 $('privacy').addEventListener('click',()=>$('privacyDialog').showModal());
 $('closePrivacy').addEventListener('click',()=>$('privacyDialog').close());
 $('openOffline').href=new URL('offline.html',base).href;
 if(sw)sw.addEventListener('controllerchange',()=>{if(reloading)location.reload();else refresh().catch(()=>{});});
 refresh().catch(()=>say('Offline-Status nicht lesbar. Bitte Offline-Speicherung prüfen.'));
})();
