(()=>{
 const button=document.getElementById('installApp'),dialog=document.getElementById('installDialog'),nativeButton=document.getElementById('nativeInstall'),note=document.getElementById('installNote');let deferred=null;
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
 const sync=()=>{button.hidden=standalone();nativeButton.hidden=!deferred;};
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferred=event;sync();});
 window.addEventListener('appinstalled',()=>{deferred=null;note.textContent='Die App wurde installiert. Du findest sie auf deinem Gerät unter „DTF Studio“.';button.hidden=true;nativeButton.hidden=true;});
 async function install(){if(!deferred){dialog.showModal();return;}const prompt=deferred;deferred=null;nativeButton.disabled=true;try{await prompt.prompt();const choice=await prompt.userChoice;note.textContent=choice.outcome==='accepted'?'Installation angefragt. Bestätige gegebenenfalls die weiteren Schritte deines Browsers.':'Installation abgebrochen. Du kannst sie später über das Browsermenü erneut starten.';}catch{note.textContent='Bitte die Installation über das Browsermenü starten.';}finally{nativeButton.disabled=false;sync();}}
 button.addEventListener('click',()=>{dialog.showModal();sync();});nativeButton.addEventListener('click',install);document.getElementById('closeInstall').addEventListener('click',()=>dialog.close());
 document.getElementById('copyInstallLink').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/offline.html');note.textContent='Link kopiert. Öffne ihn in Chrome auf dem Gerät, auf dem du die App installieren möchtest.';}catch{note.textContent='Kopieren nicht möglich. Halte das Adressfeld gedrückt und kopiere den Link.';document.getElementById('installUrl').select();}});
 document.getElementById('installUrl').value=window.location.origin+'/offline.html';sync();
})();
