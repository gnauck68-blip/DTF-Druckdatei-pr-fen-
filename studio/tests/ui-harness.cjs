// Minimal HTML/event adapter for actual app + Canvas execution, not browser layout QA.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createCanvas,Image,ImageData}=require('@napi-rs/canvas');
const root=path.resolve(__dirname,'../dist');
function harness(options={}){
 const downloads=[],blobs=new Map();let work=false,network=0;
 const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 function matches(el,s){if(el.nodeType!==1)return false;const attr=s.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);if(attr&&(!(attr[1] in el.attrs)||(attr[2]&&el.attrs[attr[1]]!==attr[2])))return false;s=s.replace(/\[[^\]]+\]/g,'');const id=s.match(/#([\w-]+)/);if(id&&el.id!==id[1])return false;for(const c of s.matchAll(/\.([\w-]+)/g))if(!el.classList.contains(c[1]))return false;const tag=s.match(/^[\w-]+/);return !tag||el.tagName===tag[0].toUpperCase();}
 function select(el,s){const groups=s.split(',').map(s=>s.trim().split(/\s+/)),all=[];const walk=n=>{for(const c of n.childNodes||[]){if(c.nodeType===1){all.push(c);walk(c);}}};walk(el);return all.filter(n=>groups.some(parts=>{if(!matches(n,parts.at(-1)))return false;let p=n.parentNode;for(let i=parts.length-2;i>=0;i--){while(p&&!matches(p,parts[i]))p=p.parentNode;if(!p)return false;p=p.parentNode;}return true;}));}
 function node(tag,text=''){
   const c=tag==='canvas'?createCanvas(300,150):{};
   Object.assign(c,{nodeType:tag==='#text'?3:1,tagName:tag.toUpperCase(),attrs:{},childNodes:[],parentNode:null,style:{},dataset:{},listeners:{},_text:text,_value:null,checked:false,disabled:false,hidden:false,open:false,complete:true,naturalWidth:100,
     append(...nodes){for(let n of nodes){if(typeof n==='string')n=node('#text',n);n.remove();n.parentNode=this;this.childNodes.push(n);}},
     remove(){if(this.parentNode){const a=this.parentNode.childNodes;a.splice(a.indexOf(this),1);this.parentNode=null;}},
     replaceChildren(...nodes){for(const n of [...this.childNodes])n.remove();this.append(...nodes);},
     insertBefore(n,ref){if(!ref){this.append(n);return;}n.remove();n.parentNode=this;this.childNodes.splice(this.childNodes.indexOf(ref),0,n);},
     before(n){this.parentNode.insertBefore(n,this);},after(n){this.parentNode.insertBefore(n,this.nextSibling);},
     setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')return;if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=String(v);if(k==='aria-busy')work=true;},
     getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];if(k==='aria-busy')work=false;},
     querySelectorAll(s){return select(this,s);},querySelector(s){return select(this,s)[0]||null;},closest(s){let n=this;while(n){if(matches(n,s))return n;n=n.parentNode;}return null;},
     addEventListener(k,f){(this.listeners[k]??=[]).push(f);},dispatchEvent(e){e.target??=this;e.currentTarget=this;for(const fn of this.listeners[e.type]||[])fn(e);const handler=this['on'+e.type];if(handler)handler(e);if(e.bubbles&&this.parentNode)this.parentNode.dispatchEvent(e);return true;},
     click(){if(this.tagName==='A'){downloads.push({name:this.download,blob:blobs.get(this.href)});return;}return this.onclick?.({target:this});},
     showModal(){this.open=true;if(this.id==='saveDialog'&&options.autoSave!==false)setTimeout(()=>document.getElementById('saveForm').onsubmit({preventDefault(){},submitter:document.getElementById('saveDownload')}),0);},close(){this.open=false;},scrollIntoView(){},focus(){},select(){},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:this.width||300,height:this.height||300};}});
   Object.defineProperties(c,{
     id:{get(){return this.attrs.id||'';},set(v){this.attrs.id=v;}},className:{get(){return this.attrs.class||'';},set(v){this.attrs.class=v;}},
     firstChild:{get(){return this.childNodes[0]||null;}},children:{get(){return this.childNodes.filter(n=>n.nodeType===1);}},
     nextSibling:{get(){return this.parentNode?.childNodes[this.parentNode.childNodes.indexOf(this)+1]||null;}},nextElementSibling:{get(){let n=this.nextSibling;while(n?.nodeType===3)n=n.nextSibling;return n;}},
     textContent:{get(){return this.nodeType===3?this._text:this.childNodes.map(n=>n.textContent).join('');},set(v){this.replaceChildren();if(this.nodeType===3)this._text=String(v);else this.append(node('#text',String(v)));}},
     value:{get(){if(this._value!==null)return this._value;if(this.tagName==='SELECT')return this.options.find(o=>o.attrs.selected!==undefined)?.value||this.options[0]?.value||'';return this.attrs.value||'';},set(v){this._value=String(v);}},
     options:{get(){return this.querySelectorAll('option');}},type:{get(){return this.attrs.type||'';}},min:{get(){return this.attrs.min||'';}},max:{get(){return this.attrs.max||'';}}
   });
   c.classList={contains:v=>c.className.split(/\s+/).includes(v),add(v){c.className=[...new Set([...c.className.split(/\s+/),v])].join(' ');},remove(v){c.className=c.className.split(/\s+/).filter(x=>x!==v).join(' ');},toggle(v,on){on=on??!this.contains(v);on?this.add(v):this.remove(v);return on;}};
   if(tag==='canvas')c.toBlob=cb=>cb(new Blob([c.toBuffer('image/png')],{type:'image/png'}));
   return c;
 }
 const document=node('document'),stack=[document];document.baseURI='https://app.test/offline.html';
 const html=fs.readFileSync(path.join(root,'offline.html'),'utf8');
 for(const t of html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g)){
   if(t.startsWith('<!'))continue;
   if(t.startsWith('</')){const tag=t.slice(2,-1).trim().toUpperCase();while(stack.length>1){if(stack.pop().tagName===tag)break;}continue;}
   if(t.startsWith('<')){const tag=t.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const el=node(tag);for(const a of t.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)){el.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));if(['checked','disabled','hidden','open'].includes(a[1]))el[a[1]]=true;}stack.at(-1).append(el);if(!['input','img','meta','link','br','hr','source'].includes(tag))stack.push(el);
   }else stack.at(-1).append(node('#text',decode(t)));
 }
 document.body=document.querySelector('body');document.getElementById=id=>document.querySelector('#'+id);document.createElement=node;document.createTextNode=t=>node('#text',t);
 class LocalURL extends URL {static createObjectURL(b){const u='blob:local-'+blobs.size+'-'+Math.random();blobs.set(u,b);return u;}static revokeObjectURL(u){blobs.delete(u);}}
 class Reader{async readAsDataURL(b){this.result='data:'+b.type+';base64,'+Buffer.from(await b.arrayBuffer()).toString('base64');this.onload();}}
 class Worker{constructor(){const self={postMessage:data=>setImmediate(()=>this.onmessage({data}))};this.self=self;vm.runInNewContext(fs.readFileSync(path.join(root,'worker-bundle.js'),'utf8'),{self,Uint8ClampedArray,Uint8Array,Uint32Array,Int32Array,DataView,TextEncoder,Blob,Response,CompressionStream});}postMessage(data){this.self.onmessage({data});}terminate(){}}
 const context={document,window:options.window??{},Image,ImageData,FileReader:Reader,Worker,Blob,URL:LocalURL,Uint8Array,Uint8ClampedArray,Uint32Array,Int32Array,DataView,TextEncoder,Response,CompressionStream,console,confirm:()=>true,setTimeout:(f,ms)=>ms>10000?0:setTimeout(f,ms),clearTimeout,localStorage:{getItem(){return null;},setItem(){}},fetch(){network++;throw Error('Offline');}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'studio.js'),'utf8'),context);
 const $=id=>document.getElementById(id);
 const idle=async()=>{for(let i=0;i<500;i++){await new Promise(r=>setTimeout(r,10));if(!work)return;}throw Error('Timed out');};
 const change=async(id,value)=>{const el=$(id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent({type:'input',bubbles:true});el.dispatchEvent({type:'change',bubbles:true});await new Promise(r=>setTimeout(r,150));await idle();};
 const load=async()=>{const c=createCanvas(40,40),g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,40,40);g.fillStyle='black';g.fillRect(8,8,24,24);g.fillStyle='white';g.fillRect(15,15,10,10);const file=new Blob([c.toBuffer('image/png')],{type:'image/png'});file.name='ring-white-detail.png';$('file').onchange({target:{files:[file],value:'fixture'}});await idle();};
 const check=async format=>{if(format){$('exportFormat').value=format;$('exportFormat').onchange();}await $('checkFile').onclick();};
 const approve=()=>{$('visualCheck').checked=true;$('sizeCheck').checked=true;$('sizeCheck').onchange();};
 return {$,document,downloads,change,load,check,approve,idle,get network(){return network;}};
}
module.exports={harness};
