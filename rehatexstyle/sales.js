'use strict';
const Sales=(()=>{
const prices={S:[250,120,80,50],M:[350,200,150,120],L:[600,450,350,300],XL:[950,750,650,550]},press=[400,350,325,300];
function band(q){Core.qty(q);return q<=10?0:q<=50?1:q<=100?2:q<=200?3:null;}
function size(w,h){if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Gültige Motivmaße erforderlich.');const area=Math.round(w*10)*Math.round(h*10)/10000;return area<=50?'S':area<=150?'M':area<=625?'L':area<=1250?'XL':null;}
function printPrice(w,h,q){const s=size(w,h),b=band(q);return s&&b!==null?prices[s][b]:null;}
function pressPrice(q){const b=band(q);return b===null?null:press[b];}
function gross(l){return l.vk==null?null:l.priceBasis==='gross'?l.vk:Math.round(l.vk*(100+l.tax)/100);}
function lineGross(l){return l.vk==null?null:l.priceBasis==='gross'?Math.round(l.vk*l.qty):Math.round(l.vk*l.qty*(100+l.tax)/100);}
function total(lines){const netOld={7:0,19:0},grossNew={7:0,19:0};let ek=0;for(const l of lines){if(l.unit==='lfm'){if(!Number.isFinite(l.qty)||l.qty<2||l.qty>100000)throw Error('Meterware mindestens 2 lfm.');}else Core.qty(l.qty);if(![7,19].includes(l.tax)||l.vk==null||!Number.isSafeInteger(l.vk)||l.vk<0)throw Error('Preis auf Anfrage: Verkaufspreis und MwSt. bestätigen.');if(!Number.isSafeInteger(l.ek)||l.ek<0)throw Error('EK prüfen.');(l.priceBasis==='gross'?grossNew:netOld)[l.tax]+=Math.round(l.qty*l.vk);ek+=Math.round(l.qty*l.ek);}const groups={},taxes={};for(const t of [7,19]){groups[t]=netOld[t]+Math.round(grossNew[t]*100/(100+t));taxes[t]=Math.round(netOld[t]*t/100)+grossNew[t]-Math.round(grossNew[t]*100/(100+t));}const net=groups[7]+groups[19],tax=taxes[7]+taxes[19];return {groups,taxes,net,tax,gross:net+tax,ek};}
// Transfer jobs share motifId + physical size; textile variants never enter this key.
function key(j){return JSON.stringify([j.motifId,Math.round(j.width*10),Math.round(j.height*10)]);}
function calculate(o){const jobs=o.transferJobs||[],lines=[];let applied=0,surcharge=0;const tax=o.salesTax??7;
const add=(id,description,qty,vk,kind,extra={})=>{lines.push({id,description,qty,vk,kind,tax,ek:0,maker:'',model:'',color:'',size:'',priceBasis:'gross',salesGenerated:true,manualEk:true,...extra});};
const counted=jobs.map(j=>{const count=j.lineId?o.lines.find(l=>l.id===j.lineId)?.qty:null;const q=j.lineId?(count||0)*j.perItem:j.qty;if(!q&&j.lineId)throw Error('Transferauftrag verweist auf gelöschtes Textil. Zuordnung korrigieren.');if(q)Core.qty(q);return {job:j,qty:q};});
const totals=new Map();for(const {job:j,qty} of counted)totals.set(key(j),(totals.get(key(j))||0)+qty);
const printRows=new Map();for(const {job:j,qty:q} of counted){if(!q)continue;const cls=size(j.width,j.height),automatic=printPrice(j.width,j.height,totals.get(key(j)));const price=j.manualPrice==null?automatic:j.manualPrice;const grouping=JSON.stringify([key(j),price]);let row=printRows.get(grouping);if(!row){row={id:'print-'+j.id,description:`Transferdruck ${j.name} · ${j.width} × ${j.height} mm · ${cls||'Sonderformat'}`,qty:0,vk:price,jobIds:[]};printRows.set(grouping,row);}row.qty+=q;row.jobIds.push(j.id);if(j.apply){applied+=q;if(j.doublePress){if(cls!=='XL')throw Error('Zwei-Pressvorgänge-Zuschlag nur bei XL.');surcharge+=q;}}}
for(const row of printRows.values()){Core.qty(row.qty);add(row.id,row.description,row.qty,row.vk,'transfer-print',{jobId:row.jobIds[0],jobIds:row.jobIds});}
for(const l of o.lines.filter(l=>!l.salesGenerated&&l.kind!=='application')){if(jobs.some(j=>j.lineId===l.id))continue;const each=Number(l.transfersPerItem??0);if(each>0)applied+=l.qty*each;}
for(const m of o.meterJobs||[]){if(!Number.isFinite(m.qty)||m.qty<2)throw Error('Meterware mindestens 2 lfm.');add('meter-'+m.id,'DTF-Meterware · Rollenbreite 46 cm',m.qty,m.manualPrice??1100,'transfer-meter',{unit:'lfm'});}
if(applied)add('sales-press','Transfers aufbringen',applied,o.pressManualPrice??pressPrice(applied),'application');
if(surcharge)add('sales-double','XL-Zuschlag: zweiter Pressvorgang',surcharge,50,'press-extra');
const products=lines.filter(l=>['transfer-print','transfer-meter'].includes(l.kind));const pending=products.some(l=>l.vk==null);const value=products.reduce((n,l)=>n+Math.round(l.qty*(l.vk||0)),0);if(products.length&&!pending&&value<5000)add('sales-fee','Auftragspauschale: Transferwarenwert unter 50 €',1,1000,'order-fee');
return {lines,pending,value};}
return {band,size,printPrice,pressPrice,gross,lineGross,total,key,calculate};
})();
if(typeof module!=='undefined')module.exports=Sales;
