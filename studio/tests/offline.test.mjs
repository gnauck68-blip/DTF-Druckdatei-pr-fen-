import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const dir=new URL('../dist/',import.meta.url), origin='https://app.test/';
const code=fs.readFileSync(new URL('sw.js',dir),'utf8');
const version=code.match(/const VERSION = '([^']+)'/)[1], cacheName='texstyle-app-'+version, nextVersion='offline-'+(Number(version.split('-')[1])+1);
function cacheStore(){const stores=new Map();return {stores,async keys(){return [...stores.keys()];},async delete(k){return stores.delete(k);},async open(k){if(!stores.has(k))stores.set(k,new Map());const m=stores.get(k);return {async put(u,r){m.set(typeof u==='string'?u:u.url,r.clone());},async match(u){return m.get(typeof u==='string'?u:u.url)?.clone();}};}};}
function harness(caches=cacheStore(),source=code){
 const handlers={},calls=[];let offline=false,override=null,claimed=false,skipped=false;
 const fetch=async request=>{const url=typeof request==='string'?request:request.url;calls.push(url);if(offline)throw Error('Disconnected');if(override){const result=await override(url);if(result)return result;}
 const raw=new URL(url).pathname.slice(1),p=['offline','offline-guide'].includes(raw)?raw+'.html':raw,b=fs.readFileSync(new URL(p,dir));
 const mime=p.endsWith('.html')?'text/html':p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.webmanifest')?'application/manifest+json':p.endsWith('.svg')?'image/svg+xml':'image/png';
 const response=new Response(b,{headers:{'Content-Type':mime}});Object.defineProperty(response,'url',{value:url});return response;};
 const self={location:{href:origin+'sw.js'},addEventListener:(k,v)=>handlers[k]=v,clients:{claim:async()=>{claimed=true;}},skipWaiting:async()=>{skipped=true;}};
 vm.runInNewContext(source,{self,caches,fetch,Request,Response,URL,console});
 return {caches,calls,setOffline(v){offline=v;},setOverride(f){override=f;},get claimed(){return claimed;},get skipped(){return skipped;},
 async event(k,data={}){let p;handlers[k]({...data,waitUntil(v){p=v;}});await p;},
 async request(path,options={}){let p;handlers.fetch({request:{url:new URL(path,origin).href,method:'GET',mode:'cors',...options},respondWith(v){p=v;}});return p?await p:null;},
 async status(){let result;await this.event('message',{data:{type:'OFFLINE_STATUS'},ports:[{postMessage(v){result=v;}}]});return result;}};
}
test('cold restart with disconnected network serves complete shell, processing worker and guide',async()=>{
 const first=harness();await first.event('install');await first.event('activate');assert.equal(first.claimed,true);assert.equal(first.skipped,false);
 const cache=first.caches.stores.get(cacheName);assert.equal(cache.size,13);
 const restart=harness(first.caches);restart.setOffline(true);
 for(const url of cache.keys()){const r=await restart.request(url);assert.equal(r.status,200,url);}
 assert.match(await (await restart.request('/offline',{mode:'navigate'})).text(),/id="exportPdf"/);assert.match(await (await restart.request('/offline-guide',{mode:'navigate'})).text(),/Ohne Internet/);assert.equal(restart.calls.length,0);assert.equal((await restart.status()).ready,true);
 assert.match(await (await restart.request('/',{mode:'navigate'})).text(),/id="exportPdf"/);
 assert.equal(restart.calls.length,1);
});
test('customer files, query data, auth paths, remote services and POST never enter offline cache',async()=>{
 const h=harness();await h.event('install');const n=h.caches.stores.get(cacheName).size;
 for(const url of ['/customer.png','/job.texdtf','/offline.html?customer=Smith','/_sites/auth/callback','https://remote.test/upload'])assert.equal(await h.request(url),null);
 assert.equal(await h.request('/offline.html',{method:'POST'}),null);assert.equal(h.caches.stores.get(cacheName).size,n);
});
test('online 403 and login redirects are never replaced with cached app',async()=>{
 const h=harness();await h.event('install');h.setOverride(()=>new Response('Denied',{status:403}));assert.equal((await h.request('/',{mode:'navigate'})).status,403);
 h.setOverride(()=>Response.redirect('https://auth.test/login'));assert.equal((await h.request('/',{mode:'navigate'})).status,302);
});
test('incomplete download and disguised login HTML reject installation without partial cache',async()=>{
 for(const type of ['error','login']){const h=harness();h.setOverride(url=>{
   if(url.includes('worker-bundle')){if(type==='error')throw Error('Network lost');const r=new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r;}
 });await assert.rejects(h.event('install'));assert.equal(h.caches.stores.size,0);}
 const h=harness();h.setOverride(url=>{if(url.endsWith('/offline')){const r=new Response('<html>Sign in</html>',{headers:{'Content-Type':'text/html'}});Object.defineProperty(r,'url',{value:url});return r;}});await assert.rejects(h.event('install'));assert.equal(h.caches.stores.size,0);
});
test('cache eviction reports not ready and does not silently fetch mixed-version assets',async()=>{
 const h=harness();await h.event('install');h.caches.stores.get(cacheName).delete(origin+'worker-bundle.js?v=6');
 assert.equal((await h.status()).ready,false);const n=h.calls.length;assert.equal((await h.request('/worker-bundle.js?v=6')).status,503);assert.equal(h.calls.length,n);
});
test('failed update preserves old offline version; activation deletes only own prior cache',async()=>{
 const h=harness();await h.event('install');await h.caches.open('unrelated-cache');
 const next=harness(h.caches,code.replace("'"+version+"'","'"+nextVersion+"'"));next.setOffline(true);await assert.rejects(next.event('install'));assert.equal(h.caches.stores.has(cacheName),true);
 next.setOffline(false);await next.event('install');assert.equal(next.skipped,false);assert.equal(h.caches.stores.has(cacheName),true);
 await next.event('message',{data:{type:'ACTIVATE_UPDATE'}});assert.equal(next.skipped,true);await next.event('activate');assert.deepEqual(await h.caches.keys(),['unrelated-cache','texstyle-app-'+nextVersion]);
});
test('all HTML entrypoints reference local existing assets and expose offline privacy instructions',()=>{
 const main=fs.readFileSync(new URL('index.html',dir),'utf8'),offline=fs.readFileSync(new URL('offline.html',dir),'utf8');assert.equal(main,offline);
 for(const html of [main,fs.readFileSync(new URL('offline-guide.html',dir),'utf8')]){
   const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
   for(const [,url]of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(/^(?:https?:|mailto:|#)/.test(url))continue;const path=url.split('?')[0];if(path==='./')continue;assert.ok(fs.existsSync(new URL(path,dir)),path);}
 }
 assert.match(offline,/Offline erfolgt keine erneute Kontoprüfung/);assert.match(offline,/private Cloudspeicher sind nicht zulässig/);
});
