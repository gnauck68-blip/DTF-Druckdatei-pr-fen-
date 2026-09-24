import {readFileSync,writeFileSync} from 'node:fs';
const engine=readFileSync(new URL('../dist/engine.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const resample=readFileSync(new URL('../dist/resample.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace("new URL('./pixel-worker.js',import.meta.url),{type:'module'}","new URL('./worker-bundle.js?v=6',document.baseURI)");
const ux=readFileSync(new URL('../dist/ux.js',import.meta.url),'utf8');
const cropGeometry=readFileSync(new URL('../dist/crop-geometry.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
const crop=readFileSync(new URL('../dist/crop.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../dist/pixel-worker.js',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'');
writeFileSync(new URL('../dist/studio.js',import.meta.url),'(()=>{\n'+engine+'\n'+resample+'\n'+app+'\n'+ux+'\n'+cropGeometry+'\n'+crop+'\n})();\n');
writeFileSync(new URL('../dist/worker-bundle.js',import.meta.url),engine+'\n'+resample+'\n'+worker);
// Both entrypoints use the same reviewed UI and versioned assets.
let html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').replace('style.css?v=7','style.css?v=8').replace(/studio\.js\?v=\d+/g,'studio.js?v=10');
html=html.replace(/workflow\.css\?v=\d+/g,'workflow.css?v=5');
if(!html.includes('workflow.css?v=5'))html=html.replace('</head>','<link rel="stylesheet" href="workflow.css?v=5"></head>');
writeFileSync(new URL('../dist/index.html',import.meta.url),html);
writeFileSync(new URL('../dist/offline.html',import.meta.url),html);
