// Actual local app/worker operations in a DOM/Canvas adapter, not an OS test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness}=require('./ui-harness.cjs');
(async()=>{
 const h=harness(),{$}=h;await h.load();await h.change('width','0.5');await h.change('remove',true);
 for(const [format,id]of [['png','exportPng'],['pdf','exportPdf'],['svg','vectorExport']]){await h.check(format);h.approve();await $(id).onclick();}
 await $('saveProject').onclick();assert.equal(h.downloads.length,4,$('toast').textContent);
 const output='/tmp/texstyle-offline-tests';fs.mkdirSync(output,{recursive:true});
 for(const d of h.downloads)fs.writeFileSync(path.join(output,d.name),Buffer.from(await d.blob.arrayBuffer()));
 assert.match(await h.downloads[2].blob.text(),/<path/);assert.doesNotMatch(await h.downloads[2].blob.text(),/<image/);
 const pdf=Buffer.from(await h.downloads[1].blob.arrayBuffer()).toString('latin1');assert.match(pdf,/%PDF-1.4/);assert.match(pdf,/\/SMask/);
 const project=h.downloads[3];$('projectFile').onchange({target:{files:[project.blob],value:'project'}});await h.idle();assert.equal(+$('width').value,.5);assert.equal($('remove').checked,true);
 await h.check('png');h.approve();await $('exportPng').onclick();assert.equal(h.downloads.length,5);assert.equal(h.network,0);
 console.log('PASS checked PNG/PDF/SVG exports and project roundtrip through local worker, zero app fetch calls. Fixtures: '+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
