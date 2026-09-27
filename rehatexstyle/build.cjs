const fs=require('fs'),path=require('path');
const root=__dirname;
const modules=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const lib=fs.readFileSync(modules?path.join(modules,'jszip/dist/jszip.min.js'):path.join(root,'vendor/jszip.min.js'),'utf8');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const html=read('shell.html').replace('<!--LIBRARY-->',()=>'<script>'+lib+'</script>').replace('/*CORE*/',()=>read('core.js')).replace('/*APP*/',()=>read('sales.js')+'\n'+read('templates.js')+'\n'+read('sketches.js')+'\n'+read('app.js')+'\n'+read('placement.js')+'\n'+read('pricing.js')+'\n'+read('automatic.js')+'\n'+read('commercial.js'));
fs.writeFileSync(path.join(root,'RehaTexstyle_Offline.html'),html);
console.log('Offline-Datei erstellt:',Buffer.byteLength(html),'Bytes');
