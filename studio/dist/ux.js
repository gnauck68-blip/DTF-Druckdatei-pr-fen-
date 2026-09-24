// Workflow and proofing use the existing local image engine. No customer data is persisted.
let undoStack=[],redoStack=[],lastState=null,historyOriginal=null,restoring=false;
let proof=null,disabledDuringWork=[],activeStep='load',miniOpen=true;
const editKeys=[...Object.keys(defaults),'vectorThreshold','vectorColor'];
const exportIds=['exportPng','exportPdf','vectorExport'];
const numberDE=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:2});
function snapshot(){return {source,qualityWidth,qualityHeight,mirrored,settings:settings(),vectorThreshold:$('vectorThreshold').value,vectorColor:$('vectorColor').value};}
function stateKey(s){return JSON.stringify([s.qualityWidth,s.qualityHeight,s.mirrored,s.settings,s.vectorThreshold,s.vectorColor]);}
function sameState(a,b){return !!a&&!!b&&a.source===b.source&&stateKey(a)===stateKey(b);}
function releaseProof(){
 if(proof?.canvas){proof.canvas.width=1;proof.canvas.height=1;}
 if(proof?.url)URL.revokeObjectURL(proof.url);
 proof=null;$('proofArea').hidden=true;$('checkFacts').hidden=true;$('checkWarning').hidden=true;
 $('visualCheck').checked=$('sizeCheck').checked=false;
 $('proofPreview').width=$('proofPreview').height=1;
 $('vectorProof').removeAttribute('src');
 $('checkStatus').textContent=source?'Noch nicht geprüft oder seit der Prüfung verändert. Bitte erneut prüfen.':'Noch keine Datei geprüft.';
 syncUX();
}
function capHistory(){
 // Snapshots share immutable canvases. Bound retained crop buffers as well as count.
 const pixels=()=>new Set([...undoStack,...redoStack].map(s=>s.source));
 const total=()=>[...pixels()].reduce((n,c)=>n+(c===source||c===originalSource?0:c.width*c.height),0);
 while(undoStack.length>16||total()>24000000){if(undoStack.length)undoStack.shift();else if(redoStack.length)redoStack.shift();else break;}
}
function trackEdit(){
 if(!source)return;
 const now=snapshot();
 if(historyOriginal!==originalSource){historyOriginal=originalSource;undoStack=[];redoStack=[];lastState=now;releaseProof();}
 else if(!sameState(lastState,now)){
   if(!restoring&&lastState){undoStack.push(lastState);redoStack=[];}
   lastState=now;capHistory();releaseProof();
 }
}
function restoreSnapshot(s){
 restoring=true;source=s.source;qualityWidth=s.qualityWidth;qualityHeight=s.qualityHeight;mirrored=s.mirrored;
 setSettings(s.settings);$('vectorThreshold').value=s.vectorThreshold;$('vectorColor').value=s.vectorColor;
 view='result';lastState=s;releaseProof();render();restoring=false;
}
function moveHistory(from,to){if(!from.length||!source)return;clearTimeout(debouncer);to.push(snapshot());restoreSnapshot(from.pop());capHistory();syncUX();}
function syncUX(){
 const loaded=!!source,valid=proof&&sameState(proof.state,snapshot())&&proof.format===$('exportFormat').value;
 $('undo').disabled=$('miniUndo').disabled=busy||!undoStack.length;
 $('redo').disabled=busy||!redoStack.length;
 $('checkFile').disabled=busy||!loaded;
 $('saveProject').disabled=busy||!loaded;
 $('mobilePreview').hidden=!loaded;
 $('prepareVector').disabled=busy||!loaded;
 if($('openCrop'))$('openCrop').disabled=busy||!loaded;
 const ready=valid&&!proof.empty&&$('visualCheck').checked&&$('sizeCheck').checked;
 exportIds.forEach((id,i)=>{$(id).hidden=$('exportFormat').value!==['png','pdf','svg'][i];$(id).disabled=busy||!ready;});
 document.querySelectorAll('[data-step]').forEach(b=>{b.disabled=busy||(b.dataset.step!=='load'&&!loaded);if(b.dataset.step===activeStep)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
 document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.view===view));b.classList.toggle('active',b.dataset.view===view);});
}
function setBusyUX(value){
 if(value){disabledDuringWork=[...document.querySelectorAll('main button, main input, main select')].map(el=>[el,el.disabled]);disabledDuringWork.forEach(([el])=>el.disabled=true);}
 else{disabledDuringWork.forEach(([el,disabled])=>el.disabled=disabled);disabledDuringWork=[];syncUX();}
}
function setStep(step,scroll=true){
 activeStep=step;
 const words={load:'1 · Motiv auswählen oder Projekt öffnen.',size:'2 · Gewünschte Druckgröße in Zentimetern einstellen.',edit:'3 · Motiv bei Bedarf bearbeiten. Du kannst diesen Schritt überspringen.',check:'4 · Datei berechnen und das Ergebnis kontrollieren.',save:'5 · Geprüfte Datei herunterladen und im Arbeitsordner ablegen.'};
 $('workflowStatus').textContent=words[step];
 const format=document.querySelector('.controls details'),background=$('remove').closest('details');
 const target={load:$('dropzone'),size:format,edit:background,check:$('preflight'),save:$('preflight')}[step];
 if(target?.tagName==='DETAILS')target.open=true;
 if(scroll){target?.scrollIntoView({behavior:'smooth',block:'start'});if(step==='check'||step==='save')$('preflight').focus({preventScroll:true});}
 syncUX();
}
function refreshMini(){
 if(!source)return;
 const dest=$('miniCanvas'),src=$('preview'),ratio=src.width/src.height;
 dest.width=Math.max(1,Math.round(260*Math.min(1,ratio)));dest.height=Math.max(1,Math.round(dest.width/ratio));
 ctx(dest).drawImage(src,0,0,dest.width,dest.height);
 $('miniLabel').textContent=({result:'Ergebnis',original:'Original',split:'Links Original · rechts Ergebnis',mask:'Weißmaske'})[view]+' · verkleinert';
 $('miniCompare').textContent=view==='original'?'Ergebnis ansehen':'Original ansehen';
 const mode=$('removeMode').value;
 $('removeExplanation').textContent=mode==='edge'?'Entfernt die gewählte Farbe nur vom Bildrand aus. Geschlossene Buchstabeninnenräume bleiben erhalten und müssen geprüft werden.':mode==='all'?'Achtung: Entfernt diese Farbe überall – auch in Buchstaben und gewollten Motivdetails. Prüfe weiße Flächen im Original und im Ergebnis.':'Ersetzt alle Motivfarben durch die gewählte Schriftfarbe. Nur für einfarbige Schrift auf gleichmäßigem Hintergrund.';
 $('removeExplanation').classList.toggle('warning',mode!=='edge');
 $('removeExplanation').hidden=!$('remove').checked;
}
const originalRender=render;
render=function(){trackEdit();originalRender();refreshMini();syncUX();};

function countAlpha(c){const d=ctx(c).getImageData(0,0,c.width,c.height).data;let clear=0,partial=0,visible=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)clear++;else {visible++;if(d[i]<255)partial++;}}return {clear,partial,visible,total:c.width*c.height};}
async function prepareProof(){
 requireSource();clearTimeout(debouncer);trackEdit();releaseProof();
 const state=snapshot(),s=state.settings,format=$('exportFormat').value;
 $('checkStatus').textContent='Datei wird in der gewählten Druckgröße berechnet …';
 let result;
 try{
   const d=dimensions(s.width,s.height,s.dpi),plan=resolutionPlan(qualityWidth,qualityHeight,s.width,s.height,s.dpi);
   if(format==='svg'){
     const factor=Math.min(1,1000/Math.max(source.width,source.height));
     const c=processed(Math.max(1,Math.round(source.width*factor)),Math.max(1,Math.round(source.height*factor)));
     const svg=traceSvg(ctx(c).getImageData(0,0,c.width,c.height).data,c.width,c.height,+$('vectorThreshold').value,$('vectorColor').value,s.width,s.height);
     const empty=!/<path\b[^>]*\bd="M/.test(svg),blob=new Blob([svg],{type:'image/svg+xml'});
     result={state,format,svg,blob,url:URL.createObjectURL(blob),empty};c.width=c.height=1;
   }else{
     const c=await exportCanvas(d.width,d.height,s),alpha=countAlpha(c);
     result={state,format,canvas:c,alpha,empty:alpha.visible===0};
   }
   proof=result;
   $('checkSize').textContent=`${numberDE(s.width)} × ${numberDE(s.height)} cm`;
   $('checkPixels').textContent=format==='svg'?'Vektorpfade; keine feste Pixelauflösung':`${numberDE(d.width)} × ${numberDE(d.height)} Pixel · ${s.dpi} ppi`;
   $('checkScale').textContent=format==='svg'?'Einfarbig nachgezeichnet aus einer Vorlage mit maximal 1.000 Pixeln je Seite.':plan.upscale?`${numberDE(plan.factor)}-fach hochgerechnet (Lanczos). Zusätzliche Pixel belegen keine zusätzlichen Details.`:'Genügend Quellpixel. Überschüssige Pixel werden beim Export reduziert.';
   $('checkAlpha').textContent=format==='svg'?'Keine Hintergrundfläche angelegt. Innenräume und Motivdetails in der SVG-Vorschau prüfen.':result.empty?'Kein sichtbares Motiv – Speichern gesperrt.':result.alpha.clear?`${numberDE(result.alpha.clear)} vollständig transparente Pixel; ${numberDE(result.alpha.partial)} teilweise transparente Pixel. Das bestätigt keine korrekte Freistellung.`:result.alpha.partial?'Nur teilweise transparente Pixel; keine vollständig transparenten Flächen. Hintergrund prüfen.':'Keine transparenten Pixel. Die Datei hat einen deckenden Hintergrund oder ein deckendes Motiv.';
   $('checkMirror').textContent=mirrored?'Gespiegelt – mit Auftrag und RIP-Einstellung abgleichen.':'Nicht gespiegelt – mit Auftrag und RIP-Einstellung abgleichen.';
   const warnings=[];
   if(result.empty)warnings.push('Kein sichtbares Motiv erkannt. Bearbeitung korrigieren und erneut prüfen.');
   if(format!=='svg'&&plan.upscale)warnings.push('Das Motiv wird vergrößert. Kontrolliere die berechneten Kanten in der Detailansicht.');
   if(format!=='svg'&&!result.alpha.clear)warnings.push('Kein vollständig transparenter Hintergrund erkannt. Ist das laut Auftrag beabsichtigt?');
   if(s.remove&&s.removeMode==='all')warnings.push('„Überall entfernen“ ist aktiv. Gewollte weiße bzw. gleichfarbige Motivteile mit dem Original vergleichen.');
   if(s.remove&&s.removeMode==='edge')warnings.push('„Nur Außenhintergrund“ ist aktiv. Geschlossene Buchstabeninnenräume wurden nicht automatisch entfernt.');
   if(format==='svg')warnings.push('SVG enthält einfarbige Konturen. Farben und Verläufe werden nicht erhalten. Das Ergebnis kann von PNG/PDF abweichen.');
   $('checkWarning').textContent=warnings.join(' ');$('checkWarning').hidden=!warnings.length;
   $('checkFacts').hidden=false;$('proofArea').hidden=false;
   $('vectorProof').hidden=format!=='svg';$('proofPreview').hidden=format==='svg';
   if(format==='svg')$('vectorProof').src=result.url;
   else{const preview=$('proofPreview'),ratio=d.width/d.height;preview.width=Math.max(1,Math.round(600*Math.min(1,ratio)));preview.height=Math.max(1,Math.round(preview.width/ratio));ctx(preview).drawImage(result.canvas,0,0,preview.width,preview.height);}
   $('checkStatus').textContent=result.empty?'Prüfung gestoppt: Das Ergebnis ist leer.':'Datei berechnet. Jetzt auf hellem und dunklem Hintergrund prüfen und beide Angaben bestätigen.';
   setStep('check',false);
 }catch(e){releaseProof();$('checkStatus').textContent='Prüfung fehlgeschlagen: '+e.message;throw e;}
}
async function downloadProof(format){
 if(!proof||proof.format!==format||!sameState(proof.state,snapshot())||proof.empty||!$('visualCheck').checked||!$('sizeCheck').checked)throw Error('Bitte die aktuelle Datei prüfen und beide Angaben bestätigen.');
 const s=proof.state.settings;
 const blob=format==='svg'?proof.blob:format==='png'?await pngBlob(proof.canvas,s.dpi):await pdfImage(ctx(proof.canvas).getImageData(0,0,proof.canvas.width,proof.canvas.height).data,proof.canvas.width,proof.canvas.height,s.width,s.height);
 const saved=await download(blob,`${name}${format==='svg'?'-konturen':''}-${s.width}x${s.height}cm${format==='svg'?'':'-'+s.dpi+'dpi'}.${format}`);
 if(saved){setStep('save',false);$('checkStatus').textContent='Speichern gestartet. Prüfe den gewählten Ordner oder den Downloadordner und lege die Datei im freigegebenen Arbeitsordner ab.';}
}

// Keep established controls, move vector work before proofing, simplify default view.
const preflight=$('preflight'),vector=$('vectorSection');preflight.before(vector);
const formatSection=document.querySelector('.controls details');
formatSection.id='formatSection';$('remove').closest('details').id='backgroundSection';
function replaceLabel(id,text){const el=$(id),label=el.closest('label');if(label){for(const node of [...label.childNodes])if(node.nodeType===3)node.remove();const words=document.createTextNode(text+' ');if(el.type==='checkbox')el.after(words);else label.insertBefore(words,label.firstChild);}}
replaceLabel('dehalo','Farbränder entfernen');replaceLabel('knock','Textilfarbe transparent machen');
replaceLabel('tol','Ähnliche Farben mit entfernen');replaceLabel('soft','Kanten weicher machen');
replaceLabel('transparent','Transparenzraster anzeigen');
// This label begins with its checkbox, so replace the text node after it explicitly.
const transparencyLabel=$('transparent').closest('label');transparencyLabel.replaceChildren($('transparent'),document.createTextNode('Transparenzraster anzeigen'));
const mode=$('removeMode');mode.options[0].textContent='Überall (auch innen)';mode.options[1].textContent='Nur Außenhintergrund';mode.options[2].textContent='Einfarbige Schrift';mode.value='edge';
const explanation=document.createElement('p');explanation.id='removeExplanation';explanation.className='hint';explanation.setAttribute('role','status');mode.closest('label').after(explanation);
const existingWarning=$('textControls').nextElementSibling;if(existingWarning?.tagName==='P')existingWarning.hidden=true;
const basicNote=document.createElement('p');basicNote.className='hint basic-note';basicNote.textContent='Weitere Einstellungen findest du unter „Erweiterte Werkzeuge“. Bereits eingestellte Werte bleiben beim Zuklappen wirksam.';document.querySelector('.controls').append(basicNote);
const advancedNodes=[];
for(const id of ['cropX','cropY','soft','choke','dehalo','knock']){const label=$(id).closest('label');if(label)advancedNodes.push(label);}
for(const id of ['crop','trim'])advancedNodes.push($(id));
for(const id of ['black','halftone'])advancedNodes.push($(id).closest('details'));
const technicalNote=$('upscale').nextElementSibling;if(technicalNote)advancedNodes.push(technicalNote);
$('advanced').onchange=()=>advancedNodes.forEach(el=>el.hidden=!$('advanced').checked);$('advanced').onchange();
$('restoreOriginal').textContent='Zuschnitt auf Original zurücksetzen';
$('crop').textContent='Links/rechts und oben/unten zuschneiden';
replaceLabel('cropX','Je Seite links / rechts · %');replaceLabel('cropY','Je Seite oben / unten · %');
$('upscale').textContent='Details der Druckdatei ansehen';
document.querySelector('#empty h2').textContent='Wähle dein Druckmotiv';
document.querySelector('#empty p').textContent='PNG, JPG oder WebP vom Gerät auswählen.';
document.querySelector('#empty .hint').textContent='Mit „Aus Dateien / Downloads wählen“ kannst du auch einen betrieblich freigegebenen Speicherort öffnen. PNG, JPG und WebP sind möglich.';
$('upload').hidden=true;
$('deviceUpload').hidden=true;
$('demo').textContent='Mit Testmotiv üben';
const startPicker=startPick;startPick=function(mode){startPicker(mode);if(source)$('dropzone').scrollIntoView({behavior:'smooth',block:'center'});};
const originalReset=$('reset').onclick;$('reset').onclick=()=>{if(source&&confirm('Alle Bearbeitungseinstellungen zurücksetzen? Der Zuschnitt bleibt erhalten. Du kannst die Änderung rückgängig machen.'))return originalReset();};
$('undo').onclick=$('miniUndo').onclick=()=>run(()=>moveHistory(undoStack,redoStack));
$('redo').onclick=()=>run(()=>moveHistory(redoStack,undoStack));
$('toggleMini').onclick=()=>{miniOpen=!miniOpen;$('miniCanvas').hidden=$('miniLabel').hidden=!miniOpen;$('toggleMini').setAttribute('aria-expanded',String(miniOpen));$('toggleMini').textContent=miniOpen?'Vorschau einklappen':'Vorschau anzeigen';};
$('miniCompare').onclick=()=>run(()=>{view=view==='original'?'result':'original';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));render();});
$('checkFile').onclick=()=>run(prepareProof);
exportIds.forEach((id,i)=>$(id).onclick=()=>run(()=>downloadProof(['png','pdf','svg'][i])));
$('exportFormat').onchange=()=>{releaseProof();if($('exportFormat').value==='svg')vector.open=true;};
$('prepareVector').onclick=()=>{$('exportFormat').value='svg';releaseProof();setStep('check');return run(prepareProof);};
$('visualCheck').onchange=$('sizeCheck').onchange=syncUX;
$('inspectProof').onclick=()=>run(()=>{
 if(!proof)throw Error('Bitte zuerst die Datei prüfen.');
 const target=$('detailCanvas');target.width=target.height=1;
 if(proof.format==='svg'){
   $('detailTitle').textContent='SVG-Konturen prüfen';$('detailNote').textContent='Die einfarbige SVG-Datei wird vergrößert dargestellt. Weiße Konturen auf dunklem Hintergrund prüfen.';
   const img=$('vectorProof');const scale=1600/Math.max(proof.state.settings.width,proof.state.settings.height);target.width=Math.max(1,Math.round(proof.state.settings.width*scale));target.height=Math.max(1,Math.round(proof.state.settings.height*scale));if(!img.complete||!img.naturalWidth)throw Error('SVG-Vorschau lädt noch. Bitte erneut versuchen.');ctx(target).drawImage(img,0,0,target.width,target.height);
 }else{target.width=proof.canvas.width;target.height=proof.canvas.height;ctx(target).drawImage(proof.canvas,0,0);$('detailTitle').textContent='Berechnete Druckdatei · 100 %';$('detailNote').textContent='1 Bildpixel = 1 CSS-Pixel. Zum Prüfen scrollen; der Bildschirmzoom kann die Darstellung verändern.';}
 $('detailScroll').style.background=$('proofSurface').style.background||'';$('detailDialog').showModal();
});
document.querySelectorAll('[data-proof-bg]').forEach(b=>b.onclick=()=>{const backgrounds={light:'#fff',dark:'#172126',grid:''};$('proofSurface').style.background=backgrounds[b.dataset.proofBg];document.querySelectorAll('[data-proof-bg]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>setStep(b.dataset.step));
document.addEventListener('input',e=>{if(editKeys.includes(e.target.id)){releaseProof();if(e.target.id==='vectorThreshold'||e.target.id==='vectorColor')trackEdit();setStep(['width','height','dpi'].includes(e.target.id)?'size':'edit',false);}});
document.addEventListener('change',e=>{if(editKeys.includes(e.target.id))trackEdit();});
const oldLoad=loadFile;loadFile=async function(file){await oldLoad(file);if(source){$('upload').hidden=false;$('deviceUpload').hidden=false;setStep('size',false);}};
const oldDemo=$('demo').onclick;$('demo').onclick=async()=>{await oldDemo();$('upload').hidden=false;$('deviceUpload').hidden=false;setStep('size',false);};
const oldProject=$('projectFile').onchange;$('projectFile').onchange=e=>{oldProject(e);$('upload').hidden=false;$('deviceUpload').hidden=false;};
setSettings(defaults);syncUX();
