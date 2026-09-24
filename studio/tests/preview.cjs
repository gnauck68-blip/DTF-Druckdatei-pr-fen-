const assert=require('node:assert/strict');
const {harness}=require('./ui-harness.cjs');
(async()=>{const h=harness(),{$}=h;await h.load();assert.equal($('preview').hidden,false,$('toast').textContent);await h.change('width','0.5');await $('upscale').onclick();assert.equal($('detailCanvas').width,60);assert.equal($('detailCanvas').height,60);assert.equal($('detailDialog').open,true);console.log('PASS local Canvas preview and 60 × 60 pixel detail proof. Browser layout not tested.');})().catch(e=>{console.error(e);process.exitCode=1;});
