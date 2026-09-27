// Rectangles are normalized in displayed (possibly mirrored) source coordinates.
const cropClamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function moveCropRect(r,dx,dy){return {...r,x:cropClamp(r.x+dx,0,1-r.w),y:cropClamp(r.y+dy,0,1-r.h)};}
export function resizeCropRect(r,corner,dx,dy,minW,minH){
 let l=r.x,t=r.y,right=l+r.w,bottom=t+r.h;
 if(corner.includes('w'))l=cropClamp(l+dx,0,right-minW);else right=cropClamp(right+dx,l+minW,1);
 if(corner.includes('n'))t=cropClamp(t+dy,0,bottom-minH);else bottom=cropClamp(bottom+dy,t+minH,1);
 return {x:l,y:t,w:right-l,h:bottom-t};
}
export function drawCropRect(a,b,minW,minH){
 const l=cropClamp(Math.min(a.x,b.x),0,1-minW),t=cropClamp(Math.min(a.y,b.y),0,1-minH);
 return {x:l,y:t,w:Math.min(1-l,Math.max(minW,Math.abs(b.x-a.x))),h:Math.min(1-t,Math.max(minH,Math.abs(b.y-a.y)))};
}
export function cropPixels(r,width,height,mirror=false){
 if(![r.x,r.y,r.w,r.h,width,height].every(Number.isFinite)||width<1||height<1||r.w<=0||r.h<=0)throw Error('Bitte einen gültigen Ausschnitt wählen.');
 const left=cropClamp(Math.round(r.x*width),0,width-1),top=cropClamp(Math.round(r.y*height),0,height-1);
 const right=cropClamp(Math.round((r.x+r.w)*width),left+1,width),bottom=cropClamp(Math.round((r.y+r.h)*height),top+1,height);
 return {x:mirror?width-right:left,y:top,w:right-left,h:bottom-top};
}
export function cropPrintSize(pixel,width,height,cmWidth,cmHeight,mode){
 let w=cmWidth*pixel.w/width,h=cmHeight*pixel.h/height;
 if(mode==='width'){w=cmWidth;h=cmWidth*pixel.h/pixel.w;}
 w=Number(w.toFixed(2));h=Number(h.toFixed(2));
 if(![w,h].every(Number.isFinite)||w<.1||h<.1||w>200||h>200)throw Error('Druckmaß außerhalb von 0,1 bis 200 cm. Wähle einen größeren Ausschnitt oder passe die Druckbreite an.');
 return {width:w,height:h};
}
