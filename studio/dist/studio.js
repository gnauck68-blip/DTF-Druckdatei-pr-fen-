(()=>{
const MAX_PIXELS=24000000;
function dimensions(w,h,dpi){if(![w,h,dpi].every(Number.isFinite)||w<=0||h<=0||dpi<300)throw Error('Bitte gültige Druckmaße und mindestens 300 dpi einstellen.');const width=Math.ceil(w/2.54*dpi-1e-9),height=Math.ceil(h/2.54*dpi-1e-9);if(!width||!height||width*height>MAX_PIXELS||width>30000||height>30000)throw Error('Diese Ausgabe ist zu groß. Bitte Druckmaße oder Auflösung verringern (max. 24 Millionen Pixel).');return {width,height};}
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
const clamp=(x,a=0,b=255)=>Math.min(b,Math.max(a,x));
function erodeAlpha(data,w,h,r){if(!r)return;const a=new Uint8ClampedArray(w*h);for(let i=0;i<a.length;i++)a[i]=data[i*4+3];for(let y=0;y<h;y++)for(let x=0;x<w;x++){let min=255;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){let xx=x+dx,yy=y+dy;min=Math.min(min,xx<0||yy<0||xx>=w||yy>=h?0:a[yy*w+xx]);}data[(y*w+x)*4+3]=min;}}
function processPixels(input,w,h,s,effectiveDpi=300){const d=new Uint8ClampedArray(input),n=w*h,bg=rgb(s.bg),shirt=rgb(s.shirt);if(!s.remove&&!s.knock&&!s.dehalo&&!s.choke&&!s.halftone&&s.black===0&&s.white===255&&s.gamma===1&&s.hue===0&&s.sat===0&&s.light===0)return d;let connected;
 const dist=(i,c)=>Math.sqrt(((input[i]-c[0])**2+(input[i+1]-c[1])**2+(input[i+2]-c[2])**2)/3);
 if(s.remove&&s.removeMode==='edge'){connected=new Uint8Array(n);const q=new Int32Array(n);let head=0,tail=0;const put=p=>{if(!connected[p]&&(input[p*4+3]===0||dist(p*4,bg)<=s.tol+s.soft)){connected[p]=1;q[tail++]=p;}};for(let x=0;x<w;x++){put(x);put((h-1)*w+x);}for(let y=0;y<h;y++){put(y*w);put(y*w+w-1);}while(head<tail){const p=q[head++],x=p%w;if(x)put(p-1);if(x<w-1)put(p+1);if(p>=w)put(p-w);if(p<n-w)put(p+w);}}
 const softA=v=>s.soft?clamp((v-s.tol)/s.soft,0,1):(v>s.tol?1:0);
 const hasHsl=s.hue!==0||s.sat!==0||s.light!==0;const textMode=s.remove&&s.removeMode==='text',ink=rgb(s.textInk||'#000000'),direction=ink.map((v,k)=>v-bg[k]),den=direction.reduce((n,v)=>n+v*v,0);if(textMode&&den<900)throw Error('Schrift- und Hintergrundfarbe sind zu ähnlich. Bitte deutlich unterschiedliche Farben wählen.');
 for(let p=0;p<n;p++){const i=p*4;let a=input[i+3]/255,removed=false;if(s.remove&&!textMode&&(!connected||connected[p])){let f=softA(dist(i,bg));a*=f;removed=f<1;}if(s.knock)a*=softA(dist(i,shirt));let c=[input[i],input[i+1],input[i+2]];if(textMode){const noise=(s.textNoise??4)/100,t=clamp((c.reduce((sum,v,k)=>sum+(v-bg[k])*direction[k],0)/den-noise)/(1-2*noise),0,1),strength=(s.textContrast??20)/100;const coverage=t*(1-strength)+t*t*(3-2*t)*strength;a*=coverage;c=ink.slice();}if(!textMode&&s.dehalo&&a>0&&a<1){const matte=s.knock&&!removed?shirt:bg;c=c.map((v,k)=>clamp((v-matte[k]*(1-a))/a));}c=c.map(v=>255*Math.pow(clamp((v-s.black)/Math.max(1,s.white-s.black),0,1),1/s.gamma));if(hasHsl)c=adjustHsl(c,s.hue,s.sat,s.light);d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=a*255;}
 erodeAlpha(d,w,h,Math.round(s.choke));
 if(s.halftone){const period=Math.max(2,effectiveDpi/s.lpi),rad=s.angle*Math.PI/180,co=Math.cos(rad),si=Math.sin(rad);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=d[i+3]/255;if(a<=0||a>=1)continue;const u=((x*co+y*si)/period%1+1)%1-.5,v=((-x*si+y*co)/period%1+1)%1-.5;let rank;switch(s.shape){case 'square':rank=(2*Math.max(Math.abs(u),Math.abs(v)))**2;break;case 'diamond':{let z=Math.abs(u)+Math.abs(v);rank=z<=.5?2*z*z:1-2*(1-z)**2;break;}case 'line':rank=2*Math.abs(v);break;case 'ellipse':rank=Math.min(1,Math.PI*(u*u*.65+v*v/ .65));break;default:rank=Math.min(1,Math.PI*(u*u+v*v));}d[i+3]=a>=rank?255:0;}}
 return d;}
function adjustHsl(c,shift,sat,light){let [r,g,b]=c.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min,l=(max+min)/2,h=0,s=0;if(delta){s=delta/(1-Math.abs(2*l-1));h=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;h/=6;}h=((h+shift/360)%1+1)%1;s=clamp(s*(1+sat/100),0,1);l=clamp(l+light/100,0,1);const a=s*Math.min(l,1-l);return [0,8,4].map(n=>{const k=(n+h*12)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));});}
function makeBase(data,w,h,choke){const d=new Uint8ClampedArray(data);erodeAlpha(d,w,h,choke);for(let i=0;i<d.length;i+=4)d[i]=d[i+1]=d[i+2]=255;return d;}
function traceSvg(data,w,h,threshold,color,widthCm,heightCm){const on=new Uint8Array(w*h);for(let p=0;p<on.length;p++){const i=p*4;on[p]=data[i+3]>127&&(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])<=threshold?1:0;}const edges=new Map();let count=0;const add=(x1,y1,x2,y2)=>{const a=y1*(w+1)+x1,b=y2*(w+1)+x2;if(!edges.has(a))edges.set(a,[]);edges.get(a).push(b);if(++count>600000)throw Error('Das Motiv ist zu komplex für Konturen. Bitte ein einfacheres Logo verwenden.');};for(let y=0;y<h;y++)for(let x=0;x<w;x++){let p=y*w+x;if(!on[p])continue;if(y===0||!on[p-w])add(x,y,x+1,y);if(x===w-1||!on[p+1])add(x+1,y,x+1,y+1);if(y===h-1||!on[p+w])add(x+1,y+1,x,y+1);if(x===0||!on[p-1])add(x,y+1,x,y);}let paths=[];while(edges.size){const start=edges.keys().next().value;let curr=start,pts=[],guard=0;do{pts.push([curr%(w+1),Math.floor(curr/(w+1))]);const arr=edges.get(curr);if(!arr)break;curr=arr.pop();if(!arr.length)edges.delete(pts.at(-1)[1]*(w+1)+pts.at(-1)[0]);if(++guard>600001)throw Error('Kontur zu komplex.');}while(curr!==start);if(pts.length>2){let clean=pts.filter((p,i)=>{const a=pts[(i+pts.length-1)%pts.length],b=pts[(i+1)%pts.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});paths.push('M'+clean.map(p=>p.join(' ')).join('L')+'Z');}}
 if(!paths.length)throw Error('Keine Konturen gefunden. Helligkeitsgrenze erhöhen oder ein dunkleres Motiv verwenden.');return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthCm}cm" height="${heightCm}cm" viewBox="0 0 ${w} ${h}"><path fill="${color}" fill-rule="evenodd" d="${paths.join('')}"/></svg>`;}
function pack(items,sheetWidth,gap,allowRotate){if(!Number.isFinite(sheetWidth)||sheetWidth<=0||!Number.isFinite(gap)||gap<0)throw Error('Ungültige Bogenmaße.');let x=gap,y=gap,rowH=0,placed=[];for(let idx=0;idx<items.length;idx++){const it=items[idx];if(!Number.isFinite(it.width)||it.width<=0||!Number.isInteger(it.qty)||it.qty<1||it.qty>100)throw Error('Bitte Breite und Menge (1–100) prüfen.');for(let k=0;k<it.qty;k++){let w=it.width,h=w/it.ratio,rotated=false;if(w+2*gap>sheetWidth&&allowRotate&&h+2*gap<=sheetWidth){[w,h]=[h,w];rotated=true;}if(w+2*gap>sheetWidth)throw Error('Ein Motiv ist breiter als der Bogen.');if(x+w+gap>sheetWidth){if(allowRotate&&!rotated&&x+h+gap<=sheetWidth){[w,h]=[h,w];rotated=true;}else{x=gap;y+=rowH+gap;rowH=0;}}placed.push({idx,x,y,w,h,rotated});x+=w+gap;rowH=Math.max(rowH,h);}}return {placed,width:sheetWidth,height:y+rowH+gap};}
function validateSheet(sheet){for(let i=0;i<sheet.placed.length;i++){const a=sheet.placed[i];if(a.x<0||a.y<0||a.x+a.w>sheet.width+.0001||a.y+a.h>sheet.height+.0001)throw Error('Ein Motiv liegt außerhalb des Bogens. Bitte neu anordnen.');for(let j=i+1;j<sheet.placed.length;j++){const b=sheet.placed[j];if(a.x<b.x+b.w-.001&&a.x+a.w>b.x+.001&&a.y<b.y+b.h-.001&&a.y+a.h>b.y+.001)throw Error('Motive überlappen sich. Bitte verschieben oder automatisch anordnen.');}}}
function crc32(b){let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function pngDpi(buffer,dpi){const bytes=new Uint8Array(buffer),parts=[bytes.slice(0,8)];let offset=8,inserted=false;while(offset<bytes.length){const dv=new DataView(bytes.buffer,bytes.byteOffset+offset),len=dv.getUint32(0),type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type!=='pHYs')parts.push(bytes.slice(offset,offset+12+len));if(type==='IHDR'&&!inserted){const chunk=new Uint8Array(21),v=new DataView(chunk.buffer);v.setUint32(0,9);chunk.set([112,72,89,115],4);v.setUint32(8,Math.round(dpi/0.0254));v.setUint32(12,Math.round(dpi/0.0254));chunk[16]=1;v.setUint32(17,crc32(chunk.slice(4,17)));parts.push(chunk);inserted=true;}offset+=len+12;}return new Blob(parts,{type:'image/png'});}
async function deflate(data){if(typeof CompressionStream==='undefined')return {data,filter:''};let stream=new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));return {data:new Uint8Array(await new Response(stream).arrayBuffer()),filter:'/Filter /FlateDecode '};}
async function pdfImage(rgba,w,h,cmW,cmH){const enc=new TextEncoder(),ascii=s=>enc.encode(s),rgbData=new Uint8Array(w*h*3),alpha=new Uint8Array(w*h);for(let p=0;p<w*h;p++){rgbData.set(rgba.subarray(p*4,p*4+3),p*3);alpha[p]=rgba[p*4+3];}const color=await deflate(rgbData),mask=await deflate(alpha),pw=cmW/2.54*72,ph=cmH/2.54*72;let chunks=[ascii('%PDF-1.4\n%Texstyle\n')],length=chunks[0].length,offsets=[0];const add=(n,parts)=>{offsets[n]=length;const all=[ascii(`${n} 0 obj\n`),...parts,ascii('\nendobj\n')];for(const c of all){chunks.push(c);length+=c.length;}};
 add(1,[ascii('<< /Type /Catalog /Pages 2 0 R >>')]);add(2,[ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);add(3,[ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw.toFixed(5)} ${ph.toFixed(5)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 6 0 R >>`)]);add(4,[ascii(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 5 0 R ${color.filter}/Length ${color.data.length} >>\nstream\n`),color.data,ascii('\nendstream')]);add(5,[ascii(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8 ${mask.filter}/Length ${mask.data.length} >>\nstream\n`),mask.data,ascii('\nendstream')]);let content=ascii(`q\n${pw.toFixed(5)} 0 0 ${ph.toFixed(5)} 0 0 cm\n/Im0 Do\nQ\n`);add(6,[ascii(`<< /Length ${content.length} >>\nstream\n`),content,ascii('endstream')]);const xref=length;chunks.push(ascii('xref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));return new Blob(chunks,{type:'application/pdf'});}

function resolutionPlan(sourceWidth,sourceHeight,cmWidth,cmHeight,dpi=300){const target=dimensions(cmWidth,cmHeight,dpi);if(![sourceWidth,sourceHeight].every(n=>Number.isFinite(n)&&n>0))throw Error('Quellauflösung fehlt.');const factorX=target.width/sourceWidth,factorY=target.height/sourceHeight,factor=Math.max(1,factorX,factorY);return {...target,factorX,factorY,factor,upscale:factorX>1||factorY>1,warn:factor>=2};}

// Lanczos-3, separable with premultiplied alpha. Only rows needed for the
// current output row are retained, avoiding a full float-image intermediate.
function lanczosKernel(x){x=Math.abs(x);if(x<1e-12)return 1;if(x>=3)return 0;const p=Math.PI*x;return Math.sin(p)/p*Math.sin(p/3)/(p/3);}
function axisWeights(inputSize,outputSize){const scale=inputSize/outputSize,filterScale=Math.max(1,scale),radius=3*filterScale,rows=[];for(let out=0;out<outputSize;out++){const center=(out+.5)*scale-.5,start=Math.max(0,Math.ceil(center-radius)),end=Math.min(inputSize-1,Math.floor(center+radius));const weights=new Float64Array(end-start+1);let sum=0;for(let i=start;i<=end;i++){const value=lanczosKernel((i-center)/filterScale);weights[i-start]=value;sum+=value;}for(let i=0;i<weights.length;i++)weights[i]/=sum;rows.push({start,weights});}return rows;}
function lanczosResize(rgba,sw,sh,dw,dh){if(![sw,sh,dw,dh].every(n=>Number.isInteger(n)&&n>0)||rgba.length!==sw*sh*4||dw*dh>24000000)throw Error('Ungültige oder zu große Bildmaße für Lanczos.');if(sw===dw&&sh===dh)return new Uint8ClampedArray(rgba);if(dw*Math.min(sh,Math.ceil(6*Math.max(1,sh/dh))+2)*16>96000000)throw Error('Das Seitenverhältnis benötigt zu viel Arbeitsspeicher. Bitte Seitenverhältnis beibehalten oder Zielmaße reduzieren.');const xAxis=axisWeights(sw,dw),yAxis=axisWeights(sh,dh),output=new Uint8ClampedArray(dw*dh*4),cache=new Map();
function horizontal(y){if(cache.has(y))return cache.get(y);const row=new Float32Array(dw*4);for(let x=0;x<dw;x++){const {start,weights}=xAxis[x],offset=x*4;for(let k=0;k<weights.length;k++){const p=(y*sw+start+k)*4,a=rgba[p+3]/255,weight=weights[k];row[offset]+=rgba[p]*a*weight;row[offset+1]+=rgba[p+1]*a*weight;row[offset+2]+=rgba[p+2]*a*weight;row[offset+3]+=a*weight;}}cache.set(y,row);return row;}
for(let y=0;y<dh;y++){const {start,weights}=yAxis[y];for(const key of cache.keys())if(key<start||key>=start+weights.length)cache.delete(key);const rows=Array.from(weights,(_,k)=>horizontal(start+k));for(let x=0;x<dw;x++){let r=0,g=0,b=0,a=0;const col=x*4;for(let k=0;k<weights.length;k++){const row=rows[k],weight=weights[k];r+=row[col]*weight;g+=row[col+1]*weight;b+=row[col+2]*weight;a+=row[col+3]*weight;}const p=(y*dw+x)*4,alpha=Math.max(0,Math.min(1,a));output[p+3]=Math.round(alpha*255);if(output[p+3]>0&&a>1e-7){output[p]=r/a;output[p+1]=g/a;output[p+2]=b/a;}}}return output;}

const $=id=>document.getElementById(id),canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h}),ctx=c=>c.getContext('2d',{willReadFrequently:true});
const defaults={width:30,height:30,dpi:300,artType:'mixed',remove:false,bg:'#ffffff',removeMode:'edge',textInk:'#000000',textNoise:4,textContrast:20,tol:30,soft:10,choke:0,dehalo:false,knock:false,shirt:'#172126',black:0,white:255,gamma:1,hue:0,sat:0,light:0,halftone:false,lpi:35,angle:22.5,shape:'circle',baseChoke:1};
let source=null,originalSource=null,qualityWidth=0,qualityHeight=0,name='motiv',view='result',mirrored=false,picking=false,timer,busy=false,gang=[],sheet=null,drag=null;
function settings(){let s={};for(const k in defaults){const el=$(k);s[k]=typeof defaults[k]==='boolean'?el.checked:typeof defaults[k]==='number'?Number(el.value):el.value;}return s;}
function setSettings(s){for(const k in defaults){const el=$(k),v=s[k]??defaults[k];if(typeof defaults[k]==='boolean')el.checked=!!v;else el.value=v;}syncOutputs();}
function toast(msg){$('toast').textContent=msg;$('toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('toast').style.display='none',6500);}
async function run(fn){if(busy){toast('Eine Berechnung läuft noch. Bitte kurz warten.');return;}busy=true;setBusyUX(true);document.body.setAttribute('aria-busy','true');try{await new Promise(r=>setTimeout(r,30));await fn();}catch(e){toast(e.message||'Das hat nicht geklappt. Bitte erneut versuchen.');}finally{busy=false;document.body.removeAttribute('aria-busy');setBusyUX(false);}}
function requireSource(){if(!source)throw Error('Bitte zuerst ein Motiv laden.');}
function safeName(s){return s.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g,'-').slice(0,60)||'motiv';}
function fileNameForSave(value,extension){
 let base=String(value).trim();
 if(base.toLowerCase().endsWith('.'+extension))base=base.slice(0,-extension.length-1).trim();
 base=base.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'-').replace(/[. ]+$/g,'').slice(0,100).trim();
 if(!base||/^\.{1,2}$/.test(base))throw Error('Bitte einen Dateinamen eingeben.');
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base))throw Error('Dieser Dateiname ist nicht erlaubt. Bitte einen anderen Namen eingeben.');
 return base+'.'+extension;
}
function chooseSave(blob,suggestedName){
 return new Promise(resolve=>{
  const dialog=$('saveDialog'),input=$('saveName'),note=$('saveNote');
  const extension=suggestedName.split('.').at(-1).toLowerCase();
  input.value=suggestedName.slice(0,-extension.length-1);$('saveExtension').textContent='.'+extension;
  const folderSupported=typeof window!=='undefined'&&typeof window.showSaveFilePicker==='function';
  $('saveToFolder').hidden=!folderSupported;$('saveToFolder').disabled=!folderSupported;
  note.textContent=folderSupported?'„Ordner wählen“ öffnet den Speicherdialog. Für „Download“ bestimmt dein Browser den Speicherort.':'Dieser Browser bietet keine Ordnerauswahl an. „Download“ speichert im Downloadordner des Browsers. Verschiebe die Datei danach mit „Dateien“ in den freigegebenen Arbeitsordner.';
  $('saveError').textContent='';let settled=false;
  const finish=success=>{if(settled)return;settled=true;dialog.close();resolve(success);};
  $('cancelSave').onclick=()=>finish(false);
  dialog.oncancel=e=>{e.preventDefault();finish(false);};
  $('saveForm').onsubmit=async e=>{
   e.preventDefault();if(settled)return;
   let filename;try{filename=fileNameForSave(input.value,extension);}catch(error){$('saveError').textContent=error.message;input.focus();return;}
   $('saveError').textContent='';
   if(e.submitter?.id==='saveToFolder'&&folderSupported){
    try{
     // The picker must open in the submit gesture, before any asynchronous work.
     const handle=await window.showSaveFilePicker({suggestedName:filename,id:'texstyle-output',types:[{description:extension.toUpperCase()+'-Datei',accept:{[blob.type||'application/octet-stream']:['.'+extension]}}]});
     const writable=await handle.createWritable();await writable.write(blob);await writable.close();
     toast('Datei im gewählten Ordner gespeichert.');finish(true);
    }catch(error){if(error.name!=='AbortError')$('saveError').textContent='Speichern im gewählten Ordner fehlgeschlagen: '+(error.message||'Bitte erneut versuchen oder „Download“ wählen.');}
    return;
   }
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('Download gestartet. Prüfe den Speicherort im Browser.');finish(true);
  };
  dialog.showModal();input.focus();input.select();
 });
}
async function download(blob,filename){return chooseSave(blob,filename);}
function imageFrom(url){return new Promise((resolve,reject)=>{const im=new Image(),timeout=setTimeout(()=>{im.onload=im.onerror=null;reject(Error('Das Laden des Bildes dauert zu lange. Bitte die Datei lokal speichern und erneut auswählen.'));},20000);im.onload=()=>{clearTimeout(timeout);resolve(im);};im.onerror=()=>{clearTimeout(timeout);reject(Error('Die Bilddatei konnte nicht gelesen werden. Bitte als PNG oder JPG speichern und erneut laden.'));};im.src=url;});}
function readDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Die ausgewählte Datei ist nicht lesbar. Bitte zuerst auf dem Gerät speichern.'));reader.onabort=()=>reject(Error('Das Einlesen wurde abgebrochen.'));reader.readAsDataURL(file);});}
function loadStatus(message,error=false){$('loadStatus').textContent=message;$('loadStatus').hidden=!message;$('loadStatus').classList.toggle('error',error);}

async function decode(file){if(file.size>40*1024*1024)throw Error('Die Datei ist größer als 40 MB. Bitte eine kleinere Datei verwenden.');const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());const mime=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;if(!mime)throw Error('Dieses Dateiformat wird nicht unterstützt. Bitte PNG, JPG oder WebP laden.');const url=await readDataUrl(file.type===mime?file:new Blob([file],{type:mime}));{const im=await imageFrom(url);if(im.width*im.height>MAX_PIXELS||im.width>16000||im.height>16000)throw Error('Das Bild ist zu groß (max. 24 Millionen Pixel und 16.000 Pixel pro Seite).');const c=canvas(im.width,im.height);ctx(c).drawImage(im,0,0);return c;}}
async function loadFile(file){if(!file)return;loadStatus('Motiv wird eingelesen …');try{const loaded=await decode(file);source=loaded;originalSource=source;qualityWidth=source.width;qualityHeight=source.height;name=safeName(file.name||'motiv');mirrored=false;view='result';setSettings(defaults);$('height').value=(30*source.height/source.width).toFixed(2);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));const original=$('sourcePreview');original.src=source.toDataURL('image/png');original.hidden=false;$('empty').hidden=true;$('preview').hidden=true;loadStatus('Original geladen. Vorschau wird berechnet …');await new Promise(resolve=>setTimeout(resolve,50));autoBackground();render();loadStatus('');toast('Motiv in der Vorschau geladen.');}catch(e){loadStatus(e.message||'Das Motiv konnte nicht angezeigt werden.',true);throw e;}}
function autoBackground(){const d=ctx(source).getImageData(0,0,1,1).data;$('bg').value='#'+Array.from(d.slice(0,3)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function syncOutputs(){$('textControls').hidden=$('removeMode').value!=='text';for(const k in defaults)if($(k+'Out'))$(k+'Out').textContent=$(k).value;}
function updateInfo(){if(!source)return;const s=settings();$('fileInfo').textContent=`${name} · ${source.width.toLocaleString('de-DE')} × ${source.height.toLocaleString('de-DE')} px`;$('mirror').setAttribute('aria-pressed',String(mirrored));$('mirror').style.background=mirrored?'var(--accent)':'';try{const p=resolutionPlan(qualityWidth,qualityHeight,s.width,s.height,s.dpi),factor=p.factor.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}),effective=Math.min(qualityWidth/(s.width/2.54),qualityHeight/(s.height/2.54));$('resolution').textContent=`Ziel: ${p.width.toLocaleString('de-DE')} × ${p.height.toLocaleString('de-DE')} px (${s.width} ÷ 2,54 × ${s.dpi}, aufgerundet). Quelle: ${Math.round(effective)} ppi bei dieser Größe.`;$('resolution').classList.toggle('warning',p.upscale);$('scaleInfo').textContent=p.upscale?`Hochrechnungsfaktor: ${factor}× · Lanczos-3. Das Original bleibt unverändert.`:'Genügend Quellpixel · keine Hochrechnung. Beim Ändern der Maße bleibt das Original unverändert.';$('scaleWarning').hidden=!p.warn;$('vectorSuggestion').hidden=!p.upscale&&$('artType').value!=='logo';$('exportInfo').textContent=`${s.width} × ${s.height} cm · ${s.dpi} dpi · ${p.width} × ${p.height} px${p.upscale?' · Lanczos '+factor+'×':''}`;}catch(e){$('resolution').textContent=e.message;$('resolution').classList.add('warning');$('scaleInfo').textContent='';$('scaleWarning').hidden=true;$('vectorSuggestion').hidden=true;}}
let textCache=null;
function prepareText(src,s){if(!s.remove||s.removeMode!=='text')return {src,s};const key=JSON.stringify([s.bg,s.textInk,s.textNoise,s.textContrast]);if(!textCache||textCache.src!==src||textCache.key!==key){const c=canvas(src.width,src.height),g=ctx(c);g.drawImage(src,0,0);const input=g.getImageData(0,0,c.width,c.height);input.data.set(processPixels(input.data,c.width,c.height,{...defaults,remove:true,removeMode:'text',bg:s.bg,textInk:s.textInk,textNoise:s.textNoise,textContrast:s.textContrast}));g.putImageData(input,0,0);textCache={src,key,result:c};}return {src:textCache.result,s:{...s,remove:false,dehalo:false}};}
function processed(w,h,s=settings(),base=false,src=source,mirror=mirrored){({src,s}=prepareText(src,s));const c=canvas(w,h),g=ctx(c);g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';if(mirror){g.translate(w,0);g.scale(-1,1);}g.drawImage(src,0,0,w,h);g.setTransform(1,0,0,1,0,0);const input=g.getImageData(0,0,w,h),d=processPixels(input.data,w,h,s,w/(s.width/2.54));input.data.set(base?makeBase(d,w,h,s.baseChoke):d);g.putImageData(input,0,0);return c;}
function render(){syncOutputs();updateInfo();if(!source)return;const s=settings(),ratio=s.width>0&&s.height>0?s.width/s.height:source.width/source.height;let w=Math.min(1050,Math.round(1050*Math.min(1,ratio))),h=Math.round(w/ratio);if(!Number.isFinite(ratio)||ratio<=0)throw Error('Bitte gültige Druckmaße eingeben.');w=Math.max(1,w);h=Math.max(1,h);const p=processed(w,h,s,view==='mask'),dest=$('preview');dest.width=w;dest.height=h;const g=ctx(dest);if(view==='original'||view==='split'){if(mirrored){g.translate(w,0);g.scale(-1,1);}g.drawImage(source,0,0,w,h);g.setTransform(1,0,0,1,0,0);if(view==='split'){g.clearRect(w/2,0,w/2,h);g.drawImage(p,w/2,0,w/2,h,w/2,0,w/2,h);g.strokeStyle='#bbef76';g.lineWidth=2;g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();}}else g.drawImage(p,0,0);dest.hidden=false;$('sourcePreview').hidden=true;$('empty').hidden=true;$('viewLabel').hidden=false;$('viewLabel').textContent=({result:'ERGEBNIS',original:'ORIGINAL',split:'ORIGINAL | ERGEBNIS',mask:'WEISSMASKE'})[view];$('dropzone').style.backgroundColor=$('transparent').checked?'var(--stage)':s.shirt;$('dropzone').style.backgroundImage=$('transparent').checked?'':'none';histogram();}
function histogram(){if(!source)return;const c=canvas(128,128);ctx(c).drawImage(source,0,0,128,128);const d=ctx(c).getImageData(0,0,128,128).data,bins=new Uint32Array(256);for(let i=0;i<d.length;i+=4)if(d[i+3])bins[Math.round(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])]++;const g=ctx($('histogram'));g.clearRect(0,0,256,64);g.fillStyle='#508982';const max=Math.max(...bins);bins.forEach((n,x)=>g.fillRect(x,64-n/max*59,1,n/max*59));}
async function pngBlob(c,dpi){const b=await new Promise((resolve,reject)=>c.toBlob(v=>v?resolve(v):reject(Error('PNG konnte nicht erzeugt werden. Bitte Ausgabe verkleinern.')),'image/png'));return pngDpi(await b.arrayBuffer(),dpi);}
async function exportCanvas(w,h,s,base=false,src=source,mirror=mirrored){
 ({src,s}=prepareText(src,s));const sw=src.width,sh=src.height,input=ctx(src).getImageData(0,0,sw,sh);let output;
 if(typeof Worker==='undefined'){const pixels=lanczosResize(input.data,sw,sh,w,h);output=processPixels(pixels,w,h,s,w/(s.width/2.54));if(base)output=makeBase(output,w,h,s.baseChoke);}else{
 const worker=new Worker(new URL('./worker-bundle.js?v=6',document.baseURI));
 try{const buffer=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>data.error?reject(Error(data.error)):resolve(data.buffer);worker.onerror=()=>reject(Error('Die Bildverarbeitung konnte nicht gestartet werden. Bitte Seite neu laden.'));worker.postMessage({buffer:input.data.buffer,sw,sh,w,h,s,base},[input.data.buffer]);});output=new Uint8ClampedArray(buffer);}finally{worker.terminate();}}
 const c=canvas(w,h),g=ctx(c);g.putImageData(new ImageData(output,w,h),0,0);if(!mirror)return c;const mirroredCanvas=canvas(w,h),mg=ctx(mirroredCanvas);mg.translate(w,0);mg.scale(-1,1);mg.drawImage(c,0,0);c.width=1;c.height=1;return mirroredCanvas;
}
async function exportImage(format,base=false){requireSource();const s=settings(),d=dimensions(s.width,s.height,s.dpi);toast('Druckdatei wird berechnet …');const c=await exportCanvas(d.width,d.height,s,base);const b=format==='png'?await pngBlob(c,s.dpi):await pdfImage(ctx(c).getImageData(0,0,c.width,c.height).data,c.width,c.height,s.width,s.height);await download(b,`${name}${base?'-weissmaske':''}-${s.width}x${s.height}cm-${s.dpi}dpi.${format}`);}
for(const id of ['upload','emptyUpload'])$(id).onclick=()=>$('file').click();
for(const id of ['deviceUpload','emptyDeviceUpload'])$(id).onclick=()=>$('deviceFile').click();
for(const id of ['file','deviceFile'])$(id).onchange=e=>{const file=e.target.files?.[0];e.target.value='';if(file)run(()=>loadFile(file));};
$('dropzone').ondragover=e=>{e.preventDefault();$('dropzone').classList.add('drag');};$('dropzone').ondragleave=()=>$('dropzone').classList.remove('drag');$('dropzone').ondrop=e=>{e.preventDefault();$('dropzone').classList.remove('drag');const file=e.dataTransfer.files?.[0];if(file)run(()=>loadFile(file));};
let debouncer;
function validSizeInput(id){const el=$(id);return el.value!==''&&!el.validity?.badInput&&Number.isFinite(Number(el.value))&&Number(el.value)>0;}
for(const k in defaults){$(k).addEventListener('input',()=>{
 clearTimeout(debouncer);
 if((k==='width'||k==='height')&&!validSizeInput(k)){$('resolution').textContent='Gewünschtes Maß eingeben …';return;}
 if(source&&$('lock').checked&&(k==='width'||k==='height')){if(k==='width')$('height').value=(+$('width').value*source.height/source.width).toFixed(2);else $('width').value=(+$('height').value*source.width/source.height).toFixed(2);}
 if(k==='black'&&+$('black').value>=+$('white').value)$('white').value=+$('black').value+1;
 if(k==='white'&&+$('white').value<=+$('black').value)$('black').value=+$('white').value-1;
 syncOutputs();
 // A synchronous preview must not use run(): disabling the focused input
 // dismisses Android's keyboard after each digit. Keep the field and focus intact.
 debouncer=setTimeout(()=>{if(busy||!validSizeInput('width')||!validSizeInput('height'))return;try{render();}catch(e){toast(e.message||'Vorschau konnte nicht aktualisiert werden.');}},120);
});}
$('transparent').onchange=render;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));run(render);});document.querySelectorAll('[data-shirt]').forEach(b=>b.onclick=()=>{$('shirt').value=b.dataset.shirt;$('transparent').checked=false;run(render);});$('mirror').onclick=()=>{mirrored=!mirrored;run(render);};$('reset').onclick=()=>run(()=>{setSettings(defaults);if(source){$('height').value=(30*source.height/source.width).toFixed(2);autoBackground();}mirrored=false;render();});
function startPick(mode){if(!source){toast('Bitte zuerst ein Motiv laden.');return;}picking=mode;view='original';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));render();$('preview').style.cursor='crosshair';toast(mode==='bg'?'Tippe auf die zu entfernende Hintergrundfarbe.':'Tippe auf den gewünschten Tonwert im Motiv.');} $('pick').onclick=()=>startPick('bg');$('pickBlack').onclick=()=>startPick('black');$('pickWhite').onclick=()=>startPick('white');$('preview').onclick=e=>{if(!picking)return;const r=e.currentTarget.getBoundingClientRect();let x=Math.floor((e.clientX-r.left)/r.width*source.width),y=Math.floor((e.clientY-r.top)/r.height*source.height);if(mirrored)x=source.width-1-x;const d=ctx(source).getImageData(Math.max(0,Math.min(source.width-1,x)),Math.max(0,Math.min(source.height-1,y)),1,1).data;if(picking==='bg'){$('bg').value='#'+Array.from(d.slice(0,3)).map(v=>v.toString(16).padStart(2,'0')).join('');$('remove').checked=true;}else {const tone=Math.round(.2126*d[0]+.7152*d[1]+.0722*d[2]);if(picking==='black')$('black').value=Math.min(tone,+$('white').value-1);else $('white').value=Math.max(tone,+$('black').value+1);}picking=false;$('preview').style.cursor='';view='result';document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));run(render);};
$('textPreset').onclick=()=>run(()=>{requireSource();$('remove').checked=true;$('removeMode').value='text';$('choke').value=0;$('halftone').checked=false;$('textNoise').value=4;$('textContrast').value=20;render();toast('Schriftmodus aktiv. Hintergrund- und Schriftfarbe prüfen.');});
$('trim').onclick=()=>run(()=>{requireSource();const c=processed(source.width,source.height,{...settings(),halftone:false},false,source,false),d=ctx(c).getImageData(0,0,c.width,c.height).data;let left=c.width,top=c.height,right=-1,bottom=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>1){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(right<left)throw Error('Das Motiv ist vollständig transparent. Freistellung prüfen.');cropSource(left,top,right-left+1,bottom-top+1);});
function cropSource(x,y,w,h,printSize){const oldWidth=source.width,oldHeight=source.height;if(![x,y,w,h].every(Number.isInteger)||x<0||y<0||w<1||h<1||x+w>oldWidth||y+h>oldHeight)throw Error('Der Ausschnitt muss innerhalb des Bildes liegen.');const c=canvas(w,h);ctx(c).drawImage(source,x,y,w,h,0,0,w,h);qualityWidth*=w/oldWidth;qualityHeight*=h/oldHeight;source=c;$('width').value=printSize?printSize.width:(+$('width').value*w/oldWidth).toFixed(2);$('height').value=printSize?printSize.height:(+$('height').value*h/oldHeight).toFixed(2);view='result';render();toast('Ausschnitt übernommen. Bitte die neue Druckgröße prüfen. Rückgängig ist möglich.');}
$('crop').onclick=()=>run(()=>{requireSource();const a=+$('cropX').value,b=+$('cropY').value;if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>45||b<0||b>45)throw Error('Beschnitt zwischen 0 und 45 % wählen.');const x=Math.round(source.width*a/100),y=Math.round(source.height*b/100);cropSource(x,y,source.width-2*x,source.height-2*y);$('cropX').value=0;$('cropY').value=0;});
$('restoreOriginal').onclick=()=>run(()=>{if(!originalSource)throw Error('Bitte zuerst ein Motiv laden.');source=originalSource;qualityWidth=source.width;qualityHeight=source.height;$('height').value=(+$('width').value*source.height/source.width).toFixed(2);render();toast('Geladenes Original wiederhergestellt.');});
$('upscale').onclick=()=>run(async()=>{requireSource();const d=dimensions(+$('width').value,+$('height').value,+$('dpi').value);$('detailTitle').textContent='100-%-Prüfung der Druckdatei';$('detailCanvas').width=1;$('detailCanvas').height=1;$('detailNote').textContent='Wird berechnet …';$('detailDialog').showModal();let c;try{c=await exportCanvas(d.width,d.height,settings());}catch(e){$('detailNote').textContent=e.message;throw e;}const target=$('detailCanvas');target.width=c.width;target.height=c.height;ctx(target).drawImage(c,0,0);$('detailNote').textContent=`${d.width} × ${d.height} Pixel · 1 Bildpixel = 1 CSS-Pixel. Zum Prüfen seitlich und nach unten scrollen. Bildschirmzoom kann die Darstellung verändern.`;});
$('closeDetail').onclick=()=>{$('detailDialog').close();$('detailCanvas').width=1;$('detailCanvas').height=1;};$('artType').onchange=updateInfo;$('goVector').onclick=()=>{$('vectorSection').open=true;$('vectorSection').scrollIntoView({behavior:'smooth',block:'start'});};
$('exportPng').onclick=()=>run(()=>exportImage('png'));$('exportPdf').onclick=()=>run(()=>exportImage('pdf'));$('baseExport').onclick=()=>run(()=>exportImage('png',true));$('vectorExport').onclick=()=>run(async()=>{requireSource();const s=settings(),factor=Math.min(1,1000/Math.max(source.width,source.height)),c=processed(Math.max(1,Math.round(source.width*factor)),Math.max(1,Math.round(source.height*factor)));const svg=traceSvg(ctx(c).getImageData(0,0,c.width,c.height).data,c.width,c.height,+$('vectorThreshold').value,$('vectorColor').value,s.width,s.height);await download(new Blob([svg],{type:'image/svg+xml'}),name+'-konturen.svg');});
$('saveProject').onclick=()=>run(async()=>{requireSource();await download(new Blob([JSON.stringify({type:'texstyle-dtf',version:1,name,qualityWidth,qualityHeight,source:source.toDataURL('image/png'),settings:settings(),mirrored,gang:gang.map(({src,...rest})=>({...rest,source:src.toDataURL('image/png')})),sheet})],{type:'application/json'}),name+'.texdtf');});$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;run(async()=>{if(f.size>100*1024*1024)throw Error('Projektdatei ist zu groß (max. 100 MB).');const p=JSON.parse(await f.text());if(p.type!=='texstyle-dtf'||p.version!==1||!p.source?.startsWith('data:image/png;base64,'))throw Error('Keine gültige Texstyle-Projektdatei.');const validated=validateSettings(p.settings),src=await dataCanvas(p.source);const nextGang=[];if(!Array.isArray(p.gang)||p.gang.length>20)throw Error('Ungültige Sammelbogen-Daten.');for(const it of p.gang){const gs=validateSettings(it.settings);if(!Number.isFinite(it.width)||it.width<=0||!Number.isInteger(it.qty)||it.qty<1||it.qty>100)throw Error('Ungültige Sammelbogen-Daten.');const gc=await dataCanvas(it.source);if(nextGang.reduce((n,it)=>n+it.src.width*it.src.height,0)+gc.width*gc.height>32000000)throw Error('Zu viele Bilddaten im Sammelbogen.');nextGang.push({name:String(it.name).slice(0,60),src:gc,settings:gs,mirrored:!!it.mirrored,width:it.width,qty:it.qty,ratio:gs.width/gs.height});}source=src;originalSource=source;qualityWidth=Number.isFinite(p.qualityWidth)&&p.qualityWidth>0?Math.min(p.qualityWidth,source.width):source.width;qualityHeight=Number.isFinite(p.qualityHeight)&&p.qualityHeight>0?Math.min(p.qualityHeight,source.height):source.height;name=safeName(String(p.name||'motiv'));setSettings(validated);mirrored=!!p.mirrored;gang=nextGang;sheet=null;renderGangItems();if(p.sheet){const sh=p.sheet;if(!Number.isFinite(sh.width)||!Number.isFinite(sh.height)||sh.width<=0||sh.height<=0||!Array.isArray(sh.placed)||sh.placed.length>2000)throw Error('Ungültige Bogenanordnung.');for(const a of sh.placed){if(!Number.isInteger(a.idx)||a.idx<0||a.idx>=gang.length||!['x','y','w','h'].every(k=>Number.isFinite(a[k]))||a.w<=0||a.h<=0)throw Error('Ungültiges Motiv im Bogen.');}validateSheet(sh);sheet=sh;$('sheetWidth').value=sh.width;drawGang();}render();toast('Projekt mit Einstellungen und Bogenanordnung geöffnet.');});};
function validateSettings(s){if(!s||typeof s!=='object')throw Error('Projekteinstellungen fehlen.');let out={...defaults};for(const k in defaults){const v=s[k];if(v===undefined)continue;if(typeof v!==typeof defaults[k]||(typeof v==='number'&&!Number.isFinite(v)))throw Error('Ungültige Projekteinstellungen.');const el=$(k);if(el.type==='number'||el.type==='range'){if((el.min!==''&&v<+el.min)||(el.max!==''&&v>+el.max))throw Error('Einstellung außerhalb des zulässigen Bereichs.');}if(el.type==='color'&&!/^#[0-9a-fA-F]{6}$/.test(v))throw Error('Ungültige Farbe.');if(el.tagName==='SELECT'&&![...el.options].some(x=>x.value===String(v)))throw Error('Unbekannte Einstellung.');out[k]=v;}if(out.black>=out.white)throw Error('Schwarzpunkt muss kleiner als Weißpunkt sein.');return out;}
async function dataCanvas(data){if(typeof data!=='string'||!data.startsWith('data:image/png;base64,'))throw Error('Ungültige Bilddaten im Projekt.');const im=await imageFrom(data);if(im.width*im.height>MAX_PIXELS||im.width>16000||im.height>16000)throw Error('Bild im Projekt überschreitet die Größengrenze.');const c=canvas(im.width,im.height);ctx(c).drawImage(im,0,0);return c;}
$('addGang').onclick=()=>run(()=>{requireSource();if(gang.length>=20)throw Error('Maximal 20 verschiedene Motive pro Bogen.');const s=settings();dimensions(s.width,s.height,s.dpi);if(gang.reduce((n,it)=>n+it.src.width*it.src.height,0)+source.width*source.height>32000000)throw Error('Die Motive überschreiten zusammen 32 Millionen Pixel. Bitte kleinere Bilder verwenden oder Motive entfernen.');const src=canvas(source.width,source.height);ctx(src).drawImage(source,0,0);gang.push({name,src,settings:s,mirrored,width:s.width,qty:1,ratio:s.width/s.height});sheet=null;renderGangItems();toast('Motiv zum Sammelbogen hinzugefügt.');});
function renderGangItems(){$('gangItems').replaceChildren();gang.forEach((it,i)=>{const row=document.createElement('div');row.className='gang-item';const img=document.createElement('img'),thumb=processed(64,Math.max(1,Math.round(64/it.ratio)),it.settings,false,it.src,it.mirrored);img.src=thumb.toDataURL();img.alt='';const title=document.createElement('span');title.textContent=it.name;const wl=document.createElement('label');wl.textContent='Breite cm';const wi=document.createElement('input');wi.type='number';wi.min='.1';wi.max='120';wi.step='.1';wi.value=it.width;wi.onchange=()=>{it.width=+wi.value;sheet=null;$('gangPreview').hidden=true;};wl.append(wi);const ql=document.createElement('label');ql.textContent='Menge';const qi=document.createElement('input');qi.type='number';qi.min='1';qi.max='100';qi.value=it.qty;qi.onchange=()=>{it.qty=+qi.value;sheet=null;$('gangPreview').hidden=true;};ql.append(qi);const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label',it.name+' entfernen');del.onclick=()=>{gang.splice(i,1);sheet=null;renderGangItems();};row.append(img,title,wl,ql,del);$('gangItems').append(row);});$('gangPreview').hidden=true;$('gangInfo').textContent=gang.length?'Anordnung nach Änderungen neu berechnen.':'';}
function buildGang(){if(!gang.length)throw Error('Bitte zuerst ein Motiv zum Bogen hinzufügen.');sheet=pack(gang,+$('sheetWidth').value,+$('gap').value/10,$('rotateGang').checked);drawGang();}
function drawGang(){if(!sheet)return;const c=$('gangPreview'),scale=Math.min(850/sheet.width,1500/sheet.height);c.width=Math.max(1,Math.round(sheet.width*scale));c.height=Math.max(1,Math.round(sheet.height*scale));paintSheet(c,scale,false);c.hidden=false;$('gangInfo').textContent=`${sheet.width.toFixed(1)} × ${sheet.height.toFixed(1)} cm · ${sheet.placed.length} Motive · ${$('dpi').value} dpi`;}
function paintSheet(c,scale,high){const g=ctx(c);g.clearRect(0,0,c.width,c.height);const cache=new Map();for(const p of sheet.placed){const it=gang[p.idx];let key=p.idx+':'+p.w+':'+p.h;let img=cache.get(key);if(!img){const w=Math.max(1,Math.round((p.rotated?p.h:p.w)*scale)),h=Math.max(1,Math.round((p.rotated?p.w:p.h)*scale));img=processed(w,h,{...it.settings,width:it.width,height:it.width/it.ratio},false,it.src,it.mirrored);cache.set(key,img);}g.save();g.translate(p.x*scale,p.y*scale);if(p.rotated){g.translate(p.w*scale,0);g.rotate(Math.PI/2);}g.drawImage(img,0,0);g.restore();if(!high){g.strokeStyle='#52766a77';g.lineWidth=1;g.strokeRect(p.x*scale,p.y*scale,p.w*scale,p.h*scale);}}}
$('buildGang').onclick=()=>run(buildGang);for(const k of ['sheetWidth','gap','rotateGang'])$(k).onchange=()=>{sheet=null;$('gangPreview').hidden=true;$('gangInfo').textContent='Bitte neu anordnen.';};async function exportGang(format){if(!sheet)buildGang();validateSheet(sheet);const dpi=+$('dpi').value,d=dimensions(sheet.width,sheet.height,dpi);toast('Sammelbogen wird berechnet …');const c=canvas(d.width,d.height),g=ctx(c),scale=d.width/sheet.width;for(let pi=0;pi<sheet.placed.length;pi++){const p=sheet.placed[pi],it=gang[p.idx];toast('Sammelbogen: Motiv '+(pi+1)+' von '+sheet.placed.length+' …');const iw=Math.max(1,Math.round((p.rotated?p.h:p.w)*scale)),ih=Math.max(1,Math.round((p.rotated?p.w:p.h)*scale));const im=await exportCanvas(iw,ih,{...it.settings,width:it.width,height:it.width/it.ratio},false,it.src,it.mirrored);g.save();g.translate(p.x*scale,p.y*scale);if(p.rotated){g.translate(p.w*scale,0);g.rotate(Math.PI/2);}g.drawImage(im,0,0);g.restore();im.width=1;im.height=1;}const b=format==='png'?await pngBlob(c,dpi):await pdfImage(ctx(c).getImageData(0,0,c.width,c.height).data,c.width,c.height,sheet.width,sheet.height);await download(b,`sammelbogen-${dpi}dpi.${format}`);}$('gangPng').onclick=()=>run(()=>exportGang('png'));$('gangPdf').onclick=()=>run(()=>exportGang('pdf'));
const gp=$('gangPreview');gp.onpointerdown=e=>{if(!sheet)return;const r=gp.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*sheet.width,y=(e.clientY-r.top)/r.height*sheet.height;for(let i=sheet.placed.length-1;i>=0;i--){const p=sheet.placed[i];if(x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h){drag={i,dx:x-p.x,dy:y-p.y};gp.setPointerCapture(e.pointerId);break;}}};gp.onpointermove=e=>{if(!drag||!sheet)return;const r=gp.getBoundingClientRect(),p=sheet.placed[drag.i];p.x=Math.max(0,Math.min(sheet.width-p.w,(e.clientX-r.left)/r.width*sheet.width-drag.dx));p.y=Math.max(0,Math.min(sheet.height-p.h,(e.clientY-r.top)/r.height*sheet.height-drag.dy));drawGang();};gp.onpointerup=()=>{drag=null;if(!sheet)return;try{validateSheet(sheet);}catch(e){toast(e.message);}};gp.onpointercancel=()=>drag=null;
$('demo').onclick=()=>run(()=>{const c=canvas(1000,1000),g=ctx(c);g.fillStyle='#ffffff';g.fillRect(0,0,1000,1000);g.fillStyle='#183f48';g.font='bold 170px Arial';g.textAlign='center';g.fillText('PRINT',500,395);g.fillText('LOCAL.',500,575);g.fillStyle='#679632';g.fillRect(170,640,660,12);g.font='34px Arial';g.fillStyle='#183f48';g.fillText('TESTMOTIV · 30 × 30 CM',500,735);source=c;originalSource=source;qualityWidth=source.width;qualityHeight=source.height;name='testmotiv';setSettings({...defaults,remove:true});mirrored=false;render();toast('Testmotiv geladen. Es hat 1.000 × 1.000 Pixel.');});
$('help').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();$('theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('texstyle-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}};try{if(localStorage.getItem('texstyle-theme')==='dark')document.body.classList.add('dark');}catch{}syncOutputs();

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

// Rectangles are normalized in displayed (possibly mirrored) source coordinates.
const cropClamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function moveCropRect(r,dx,dy){return {...r,x:cropClamp(r.x+dx,0,1-r.w),y:cropClamp(r.y+dy,0,1-r.h)};}
function resizeCropRect(r,corner,dx,dy,minW,minH){
 let l=r.x,t=r.y,right=l+r.w,bottom=t+r.h;
 if(corner.includes('w'))l=cropClamp(l+dx,0,right-minW);else right=cropClamp(right+dx,l+minW,1);
 if(corner.includes('n'))t=cropClamp(t+dy,0,bottom-minH);else bottom=cropClamp(bottom+dy,t+minH,1);
 return {x:l,y:t,w:right-l,h:bottom-t};
}
function drawCropRect(a,b,minW,minH){
 const l=cropClamp(Math.min(a.x,b.x),0,1-minW),t=cropClamp(Math.min(a.y,b.y),0,1-minH);
 return {x:l,y:t,w:Math.min(1-l,Math.max(minW,Math.abs(b.x-a.x))),h:Math.min(1-t,Math.max(minH,Math.abs(b.y-a.y)))};
}
function cropPixels(r,width,height,mirror=false){
 if(![r.x,r.y,r.w,r.h,width,height].every(Number.isFinite)||width<1||height<1||r.w<=0||r.h<=0)throw Error('Bitte einen gültigen Ausschnitt wählen.');
 const left=cropClamp(Math.round(r.x*width),0,width-1),top=cropClamp(Math.round(r.y*height),0,height-1);
 const right=cropClamp(Math.round((r.x+r.w)*width),left+1,width),bottom=cropClamp(Math.round((r.y+r.h)*height),top+1,height);
 return {x:mirror?width-right:left,y:top,w:right-left,h:bottom-top};
}
function cropPrintSize(pixel,width,height,cmWidth,cmHeight,mode){
 let w=cmWidth*pixel.w/width,h=cmHeight*pixel.h/height;
 if(mode==='width'){w=cmWidth;h=cmWidth*pixel.h/pixel.w;}
 w=Number(w.toFixed(2));h=Number(h.toFixed(2));
 if(![w,h].every(Number.isFinite)||w<.1||h<.1||w>200||h>200)throw Error('Druckmaß außerhalb von 0,1 bis 200 cm. Wähle einen größeren Ausschnitt oder passe die Druckbreite an.');
 return {width:w,height:h};
}

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

})();
