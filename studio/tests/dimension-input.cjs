const assert=require('node:assert/strict');const {harness}=require('./ui-harness.cjs');
(async()=>{
 const h=harness(),{$}=h;await h.load();const width=$('width'),height=$('height');let disabled=0;
 for(const el of [width,height]){let state=el.disabled;Object.defineProperty(el,'disabled',{get:()=>state,set:v=>{state=v;if(v)disabled++;}});}
 for(const value of ['1','10','10.5']){await h.change('width',value);assert.equal(width.value,value);assert.equal(+$('height').value,+value);assert.equal(disabled,0,'Preview must never disable the focused size field');assert.equal($('width'),width);}
 await h.change('width','');assert.equal(width.value,'');assert.equal(+height.value,10.5,'Clearing the edited field must not zero the other dimension');assert.match($('resolution').textContent,/Maß eingeben/);
 await h.change('width','22.5');assert.equal(+height.value,22.5);assert.match($('resolution').textContent,/Ziel:/);assert.equal($('exportPng').disabled,true);
 await h.change('height','12.5');assert.equal(+width.value,12.5);assert.equal(disabled,0);
 console.log('PASS size input: consecutive digits and decimals, empty interim input, retained input node, linked size, export invalidation; no transient disabling during preview. Actual Android keyboard not simulated.');
})().catch(e=>{console.error(e);process.exitCode=1;});
