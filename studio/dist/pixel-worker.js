import {processPixels,makeBase} from './engine.mjs';
import {lanczosResize} from './resample.mjs';
self.onmessage=({data:m})=>{try{const pixels=lanczosResize(new Uint8ClampedArray(m.buffer),m.sw,m.sh,m.w,m.h);let d=processPixels(pixels,m.w,m.h,m.s,m.w/(m.s.width/2.54));if(m.base)d=makeBase(d,m.w,m.h,m.s.baseChoke);self.postMessage({buffer:d.buffer},[d.buffer]);}catch(e){self.postMessage({error:e.message});}};
