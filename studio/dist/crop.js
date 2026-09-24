// Local crop editor. Geometry helpers precede this module in studio.js.
let cropSession=null;
const cropFields=['cropLeftPx','cropTopPx','cropWidthPx','cropHeightPx'];
const cropStage=$('cropStage'),cropFrame=$('cropFrame'),cropDialog=$('cropDialog');
const openCropButton=document.createElement('button');openCropButton.id='openCrop';openCropButton.className='wide';openCropButton.textContent='Bildausschnitt wählen';
$('trim').before(openCropButton);
const cropIntro=document.createElement('p');cropIntro.className='hint';cropIntro.textContent='Wähle mit einem Rahmen nur die Person oder den Motivteil aus, den du brauchst.';openCropButton.after(cropIntro);
const percentHelp=document.createElement('p');percentHelp.id='cropPercentHelp';percentHelp.className='hint';percentHelp.textContent='Prozentbeschnitt entfernt auf beiden Seiten gleich viel: 10 % links und 10 % rechts lassen 80 % der Bildbreite übrig. Oben und unten gilt das entsprechend. Für einen frei platzierten Teilausschnitt nutze „Bildausschnitt wählen“.';
$('crop').before(percentHelp);advancedNodes.push(percentHelp);$('advanced').onchange();
$('cropX').setAttribute('aria-describedby','cropPercentHelp');$('cropY').setAttribute('aria-describedby','cropPercentHelp');
function cropSelection(){return cropPixels(cropSession.rect,source.width,source.height);}
function cropSetDraw(value){if(!cropSession)return;cropSession.drawNew=value;$('cropDraw').setAttribute('aria-pressed',String(value));cropStage.classList.toggle('drawing',value);}
function cropFeedback(){
 if(!cropSession)return;
 const p=cropSelection();
 try{const size=cropPrintSize(p,source.width,source.height,+$('width').value,+$('height').value,$('cropSizeMode').value);
   $('cropSizeInfo').textContent=`Auswahl: ${p.w} × ${p.h} Pixel · Druckgröße danach: ${numberDE(size.width)} × ${numberDE(size.height)} cm${mirrored?' · gespiegelt':''}.`;
   $('cropApply').disabled=false;$('cropStatus').textContent='';
 }catch(e){$('cropApply').disabled=true;$('cropStatus').textContent=e.message;}
}
function paintCrop(){
 if(!cropSession)return;
 const r=cropSession.rect;cropFrame.style.left=r.x*100+'%';cropFrame.style.top=r.y*100+'%';cropFrame.style.width=r.w*100+'%';cropFrame.style.height=r.h*100+'%';
 const c=$('cropCanvas'),g=ctx(c),x=r.x*c.width,y=r.y*c.height,w=r.w*c.width,h=r.h*c.height;
 g.clearRect(0,0,c.width,c.height);g.drawImage(cropSession.base,0,0);g.fillStyle='rgba(0,0,0,.55)';g.fillRect(0,0,c.width,y);g.fillRect(0,y+h,c.width,c.height-y-h);g.fillRect(0,y,x,h);g.fillRect(x+w,y,c.width-x-w,h);
 const p=cropSelection();[p.x,p.y,p.w,p.h].forEach((v,i)=>$(cropFields[i]).value=v);cropFeedback();
}
function clearCrop(){if(cropSession?.base)cropSession.base.width=cropSession.base.height=1;cropSession=null;$('cropCanvas').width=$('cropCanvas').height=1;}
function cancelCrop(){cropDialog.close();clearCrop();}
function openCrop(){
 requireSource();clearTimeout(debouncer);trackEdit();
 cropSession={snapshot:snapshot(),rect:{x:0,y:0,w:1,h:1},drawNew:true,drag:null};
 const c=$('cropCanvas'),factor=Math.min(1,1400/Math.max(source.width,source.height));c.width=Math.max(1,Math.round(source.width*factor));c.height=Math.max(1,Math.round(source.height*factor));
 cropSession.base=canvas(c.width,c.height);const g=ctx(cropSession.base);if(mirrored){g.translate(c.width,0);g.scale(-1,1);}g.drawImage(source,0,0,c.width,c.height);g.setTransform(1,0,0,1,0,0);
 cropStage.style.width=`min(100%, ${46*source.width/source.height}dvh)`;
 $('cropSizeMode').value='proportional';cropSetDraw(true);paintCrop();cropDialog.showModal();
}
openCropButton.onclick=()=>{if(busy)return;try{openCrop();}catch(e){toast(e.message);}};
$('cropCancel').onclick=cancelCrop;cropDialog.addEventListener('close',clearCrop);
$('cropDraw').onclick=()=>cropSetDraw(true);
$('cropFull').onclick=()=>{if(!cropSession)return;cropSession.rect={x:0,y:0,w:1,h:1};cropSetDraw(true);paintCrop();};
$('cropSizeMode').onchange=cropFeedback;
function cropPoint(e){const b=cropStage.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};}
cropStage.onpointerdown=e=>{
 if(!cropSession||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;
 e.preventDefault();const p=cropPoint(e),r=cropSession.rect,corner=e.target.dataset?.cropHandle;
 const inside=p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
 cropSession.drag={id:e.pointerId,start:p,rect:{...r},mode:corner||(!cropSession.drawNew&&inside?'move':'draw')};
 cropStage.setPointerCapture(e.pointerId);
};
cropStage.onpointermove=e=>{
 const drag=cropSession?.drag;if(!drag||drag.id!==e.pointerId)return;e.preventDefault();
 const p=cropPoint(e),dx=p.x-drag.start.x,dy=p.y-drag.start.y,minW=1/source.width,minH=1/source.height;
 cropSession.rect=drag.mode==='move'?moveCropRect(drag.rect,dx,dy):drag.mode==='draw'?drawCropRect(drag.start,p,minW,minH):resizeCropRect(drag.rect,drag.mode,dx,dy,minW,minH);
 paintCrop();
};
cropStage.onpointerup=e=>{if(cropSession?.drag?.id!==e.pointerId)return;cropSession.drag=null;cropSetDraw(false);cropFeedback();};
cropStage.onpointercancel=e=>{if(cropSession?.drag?.id!==e.pointerId)return;cropSession.rect=cropSession.drag.rect;cropSession.drag=null;paintCrop();};
cropStage.onlostpointercapture=()=>{if(cropSession)cropSession.drag=null;};
cropFrame.onkeydown=e=>{
 if(!cropSession||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
 const step=e.shiftKey?10:1,dx=(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)/source.width,dy=(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)/source.height;
 const corner=e.target.dataset?.cropHandle;
 cropSession.rect=corner?resizeCropRect(cropSession.rect,corner,dx,dy,1/source.width,1/source.height):moveCropRect(cropSession.rect,dx,dy);cropSetDraw(false);paintCrop();
};
function readCropFields(paint=true){
 if(!cropSession)return false;
 const values=cropFields.map(id=>$(id).value.trim()===''?NaN:Number($(id).value)),[x,y,w,h]=values;
 if(!values.every(Number.isInteger)||x<0||y<0||w<1||h<1||x+w>source.width||y+h>source.height){$('cropApply').disabled=true;$('cropStatus').textContent=`Die Auswahl muss im Bild liegen (${source.width} × ${source.height} Pixel). Ganze Pixelwerte eingeben.`;return false;}
 cropSession.rect={x:x/source.width,y:y/source.height,w:w/source.width,h:h/source.height};cropSetDraw(false);if(paint)paintCrop();else cropFeedback();return true;
}
cropFields.forEach(id=>{$(id).oninput=()=>readCropFields(false);$(id).onchange=()=>readCropFields();});
$('cropApply').onclick=()=>run(()=>{
 requireSource();if(!cropSession||!sameState(cropSession.snapshot,snapshot()))throw Error('Das Motiv wurde verändert. Bitte den Zuschnitt erneut öffnen.');
 if(!readCropFields())throw Error('Bitte zuerst die Auswahlwerte korrigieren.');
 const p=cropPixels(cropSession.rect,source.width,source.height,mirrored),size=cropPrintSize(p,source.width,source.height,+$('width').value,+$('height').value,$('cropSizeMode').value);
 if(p.x===0&&p.y===0&&p.w===source.width&&p.h===source.height){cancelCrop();toast('Das ganze Bild bleibt erhalten.');return;}
 // Reuse lossless source-pixel crop, retaining quality counts, effects and undo history.
 cancelCrop();cropSource(p.x,p.y,p.w,p.h,size);view='result';setStep('size',false);
});
syncUX();
