const assert=require('node:assert/strict');const {harness}=require('./ui-harness.cjs');
(async()=>{
 const h=harness(),{$}=h;await h.load();await h.change('width','4');
 $('openCrop').onclick();assert.equal($('cropDialog').open,true);assert.equal($('cropWidthPx').value,'40');
 const stage=$('cropStage');stage.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400});
 const pointer=(x,y,target=stage)=>({clientX:x,clientY:y,pointerId:1,pointerType:'touch',target,preventDefault(){}});
 stage.onpointerdown(pointer(100,100));stage.onpointermove(pointer(300,300));stage.onpointerup(pointer(300,300));
 assert.equal($('cropLeftPx').value,'10');assert.equal($('cropWidthPx').value,'20');
 $('cropCancel').onclick();assert.match($('fileInfo').textContent,/40 × 40/);assert.equal(+$('width').value,4);
 $('openCrop').onclick();['cropLeftPx','cropTopPx','cropWidthPx','cropHeightPx'].forEach((id,i)=>$(id).value=[8,8,24,24][i]);$('cropWidthPx').onchange();
 await $('cropApply').onclick();assert.equal($('cropDialog').open,false,$('toast').textContent);assert.match($('fileInfo').textContent,/24 × 24/);assert.equal(+$('width').value,2.4);assert.equal($('exportPng').disabled,true);
 await $('undo').onclick();assert.match($('fileInfo').textContent,/40 × 40/);assert.equal(+$('width').value,4);
 await $('redo').onclick();assert.match($('fileInfo').textContent,/24 × 24/);
 await $('restoreOriginal').onclick();assert.match($('fileInfo').textContent,/40 × 40/);
 // Mirrored left side must crop the right side of the underlying source.
 $('mirror').onclick();await h.idle();$('openCrop').onclick();['cropLeftPx','cropTopPx','cropWidthPx','cropHeightPx'].forEach((id,i)=>$(id).value=[0,0,10,40][i]);$('cropWidthPx').onchange();$('cropSizeMode').value='width';$('cropSizeMode').onchange();await $('cropApply').onclick();
 assert.match($('fileInfo').textContent,/10 × 40/);await $('saveProject').onclick();const project=JSON.parse(await h.downloads.at(-1).blob.text());assert.equal(project.mirrored,true);assert.equal(project.qualityWidth,10);
 const {Image,createCanvas}=require('@napi-rs/canvas');const im=new Image();im.src=project.source;await im.decode();const c=createCanvas(10,40),g=c.getContext('2d');g.drawImage(im,0,0);assert.equal(g.getImageData(0,10,1,1).data[0],0);assert.equal(g.getImageData(9,10,1,1).data[0],255);
 assert.equal(h.network,0);console.log('PASS crop UI: touch selection, cancel, exact source crop, proportional size, undo/redo, restore, mirrored pixel selection, local project export. Not a real Android browser test.');
})().catch(e=>{console.error(e);process.exitCode=1;});
