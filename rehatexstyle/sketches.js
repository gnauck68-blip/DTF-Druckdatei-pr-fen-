// Original schematic vector drawings, not manufacturer patterns or size charts.
function sketchKind(type){return type==='Hoodie'?'sketch-hoodie':type==='Jacke'?'sketch-jacket':'sketch-shirt';}
function drawingPlacement(p,type){const q=structuredClone(p);if(!q.template?.startsWith('sketch-')&&!q.backgrounds?.[q.side]){q.template=q.template==='0601'?'sketch-hoodie':q.template==='0848'?'sketch-jacket':q.template==='0292'?'sketch-shirt':sketchKind(type);q.calibration=null;q.needsReview=!!q.src;}return q;}
function textileSketch(kind,side){
 const hoodie=kind==='sketch-hoodie',jacket=kind==='sketch-jacket',long=hoodie||jacket,back=side==='Rückseite',sleeve=side.startsWith('Ärmel');
 let drawing='';
 if(sleeve){
  const shape=long?'M99 71 Q164 24 226 78 L205 337 Q165 351 123 335Z':'M100 123 Q165 66 231 130 L215 260 Q166 279 115 258Z';
  drawing=`<g ${side==='Ärmel rechts'?'transform="translate(340 0) scale(-1 1)"':''}><path d="${shape}"/><g fill="none" stroke-width="1.2"><path d="${long?'M123 318Q165 335 207 319 M109 82Q158 57 217 88 M134 96Q150 125 145 157':'M116 244Q166 265 216 246 M111 132Q164 92 220 139 M132 144L137 174'}"/>${jacket?'<path d="M135 127L133 203 166 204 169 128Z M144 134L143 194"/>':''}</g></g>`;
 }else if(long){
  drawing='<path d="M119 67 L88 81 Q70 88 62 109 L22 330 61 342 101 165 97 357 Q170 372 243 357 L239 165 279 342 318 330 278 109 Q270 88 252 81 L221 67Z"/>';
  drawing+='<g fill="none" stroke-width="1.3"><path d="M89 84Q105 105 101 165 M251 84Q235 105 239 165 M98 343Q170 356 242 343 M26 314L65 326 M275 326L314 314"/></g>';
  if(hoodie){drawing+=back?'<path d="M120 67Q119 23 170 20Q221 23 220 67L213 107Q170 146 127 107Z"/><path d="M170 26L170 121" fill="none" stroke-width="1.2"/>':'<path d="M119 67Q119 24 170 20Q221 24 221 67L187 95 170 79 153 95Z"/><path d="M136 58Q170 39 204 58L170 79Z" fill="none" stroke-width="1.3"/><path d="M153 87L149 153M188 88L193 153M132 263L118 315Q170 327 222 315L208 263Z" fill="none" stroke-width="1.4"/>';}
  if(jacket){drawing+='<path d="M122 69L124 38Q170 48 216 38L218 69Q170 87 122 69Z"/>';drawing+=back?'<path d="M111 106Q170 117 229 106" fill="none" stroke-width="1.3"/>':'<g fill="none" stroke-width="1.4"><path d="M168 78L168 364M173 78L173 364M114 235L112 294M226 235L228 294"/><rect x="166" y="101" width="9" height="14" rx="2"/></g>';}
 }else{
  drawing='<path d="M136 61Q119 67 97 73L71 83Q59 89 53 105L21 158Q38 177 66 181L92 140 91 332Q170 344 249 332L248 140 274 181Q302 177 319 158L287 105Q281 89 269 83L243 73Q221 67 204 61Z"/>';
  drawing+=back?'<path d="M136 61Q170 74 204 61L202 69Q170 82 138 69Z"/>':'<path d="M136 61Q170 90 204 61L201 73Q170 102 139 73Z"/>';
  drawing+='<g fill="none" stroke-width="1.2"><path d="M97 74Q81 103 92 140M243 74Q259 103 248 140 M25 149Q40 166 70 171 M270 171Q300 166 315 149 M92 321Q170 333 248 321 M86 115L75 141M254 115L265 141"/></g>';
 }
 if(side==='Andere')return '<rect width="340" height="420" fill="white"/><text x="170" y="205" text-anchor="middle" font-size="13">Für diese Seite eigene Vorlage laden.</text>';
 return `<rect width="340" height="420" fill="white"/><g fill="#fff" stroke="#303b40" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${drawing}</g><text x="170" y="395" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#52636a">${side} · schematisch</text>`;
}
