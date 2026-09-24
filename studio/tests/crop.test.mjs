import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cropPixels,moveCropRect,resizeCropRect,drawCropRect,cropPrintSize} from '../dist/crop-geometry.mjs';
test('off-centre and mirrored crops select corresponding original pixels',()=>{
 const r={x:.1,y:.2,w:.3,h:.4};
 assert.deepEqual(cropPixels(r,1000,500),{x:100,y:100,w:300,h:200});
 assert.deepEqual(cropPixels(r,1000,500,true),{x:600,y:100,w:300,h:200});
});
test('moving and corner resizing stay in image and retain positive dimensions',()=>{
 const r={x:.2,y:.2,w:.4,h:.5};
 assert.deepEqual(moveCropRect(r,2,-2),{x:.6,y:0,w:.4,h:.5});
 for(const corner of ['nw','ne','sw','se'])for(const delta of [-2,2]){const b=resizeCropRect(r,corner,delta,delta,.01,.01);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=1.00001&&b.y+b.h<=1.00001&&b.w>=.00999&&b.h>=.00999);}
});
test('reverse drawing and tiny selection produce valid source pixels',()=>{
 assert.deepEqual(cropPixels(drawCropRect({x:.8,y:.9},{x:.1,y:.2},.01,.01),100,100),{x:10,y:20,w:70,h:70});
 assert.deepEqual(cropPixels({x:.9999,y:.9999,w:.0001,h:.0001},100,100),{x:99,y:99,w:1,h:1});
});
test('print size changes are explicit and invalid size is rejected',()=>{
 const p={w:200,h:100};assert.deepEqual(cropPrintSize(p,1000,500,30,15,'proportional'),{width:6,height:3});
 assert.deepEqual(cropPrintSize(p,1000,500,30,15,'width'),{width:30,height:15});
 assert.throws(()=>cropPrintSize({w:1,h:1},10000,10000,.1,.1,'proportional'));
});
