const assert=require('node:assert/strict');
const {harness}=require('./ui-harness.cjs');

async function waitUntil(predicate){for(let i=0;i<250;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Speicherdialog nicht geöffnet');}
async function submit($,id){return $('saveForm').onsubmit({preventDefault(){},submitter:$(id)});}

(async()=>{
 const writes=[],chosen=[];
 const h=harness({autoSave:false,window:{showSaveFilePicker:async opts=>{chosen.push(opts);return {createWritable:async()=>({write:async blob=>writes.push(blob),close:async()=>{}})};}}});
 const {$}=h;
 await h.load();
 const first=$('saveProject').onclick();await waitUntil(()=>$('saveDialog').open);
 assert.equal($('saveExtension').textContent,'.texdtf');
 $('saveName').value='Auftrag 123.texdtf';await submit($,'saveDownload');await first;
 assert.equal(h.downloads.at(-1).name,'Auftrag 123.texdtf');
 const cancelled=$('saveProject').onclick();await waitUntil(()=>$('saveDialog').open);$('cancelSave').onclick();await cancelled;
 assert.equal(h.downloads.length,1,'Abbrechen darf keinen Download auslösen');
 const folder=$('saveProject').onclick();await waitUntil(()=>$('saveDialog').open);
 $('saveName').value='Kunde / Motiv';await submit($,'saveToFolder');await folder;
 assert.equal(chosen[0].suggestedName,'Kunde - Motiv.texdtf');
 assert.equal(writes.length,1);assert.equal(h.downloads.length,1,'Ordnerauswahl darf keinen zusätzlichen Download auslösen');
 assert.match(await writes[0].text(),/"type":"texstyle-dtf"/);
 assert.equal(h.network,0);
 console.log('PASS save dialog: name, extension, cancel, chosen folder, local file content and no network.');
})().catch(error=>{console.error(error);process.exitCode=1;});
