import { filterRows, seasonalData, disasterHierarchy } from './data.js';
const d3 = window.d3;
const $ = id => document.getElementById(id);
const monthName = month => d3.utcFormat('%b')(new Date(Date.UTC(2000, month - 1, 1)));
const widthOf = id => Math.max(320, $(id).clientWidth - 36);
function empty(svg, width, message) { svg.append('text').attr('class', 'chart-empty').attr('x', width / 2).attr('y', 100).text(message); }

export function renderExtraCharts(ctx) {
  renderSeason(ctx); renderStream(ctx); renderTree(ctx);
}
function renderSeason({ rows, state, metadata, showTip, hideTip }) {
  const selected = filterRows(rows, state);
  const data = seasonalData(selected, state.start, state.end, metadata.partial_year);
  const svg = d3.select('#seasonal'); svg.selectAll('*').remove();
  const width = widthOf('seasonal'); svg.attr('viewBox', `0 0 ${width} 230`);
  const x = d3.scaleBand().domain(d3.range(1,13)).range([48,width-16]).padding(.25);
  const y = d3.scaleLinear().domain([0,d3.max(data.months,d=>d.value)||1]).nice().range([185,20]);
  svg.append('g').attr('class','axis').attr('transform','translate(0,185)').call(d3.axisBottom(x).tickFormat(monthName));
  svg.append('g').attr('class','axis').attr('transform','translate(48,0)').call(d3.axisLeft(y).ticks(4));
  const bars = svg.selectAll('.season-bar').data(data.months.filter(d=>d.value!==null)).join('rect').attr('class','season-bar')
    .attr('x',d=>x(d.month)).attr('y',d=>y(d.value)).attr('width',x.bandwidth()).attr('height',d=>185-y(d.value)).attr('fill','#228580')
    .attr('tabindex',0).attr('role','img').attr('aria-label',d=>`${monthName(d.month)}: ${d3.format('.2f')(d.value)} average recorded disasters`);
  // Include a hover target for recorded-zero months as well.
  const targets = svg.selectAll('.season-hit').data(data.months).join('rect').attr('class','season-hit').attr('x',d=>x(d.month)).attr('y',20).attr('width',x.bandwidth()).attr('height',165).attr('fill','transparent');
  const tip = (e,d)=>showTip(e,monthName(d.month),d.value===null?'Insufficient dated records or no complete years':`${d3.format('.2f')(d.value)} average recorded disasters`,`${data.years.length} selected complete calendar years in denominator; zero means no dated records, not verified absence.`);
  bars.on('focus',tip).on('blur',hideTip); targets.on('pointermove',tip).on('pointerleave',hideTip);
  if (!data.known) empty(svg,width,'No dated records in the selected complete years.');
  $('season-note').textContent = `Sum of start-month records ÷ ${data.years.length} selected complete calendar years. ${metadata.partial_year} is excluded entirely because reporting is partial. ${data.known.toLocaleString()}/${data.eligible.toLocaleString()} eligible records have valid months; ${data.excluded} excluded. Calendar completeness does not establish reporting completeness. Zero bins mean no dated records; missing dates can understate any month. This view always uses record counts.`;
}
function renderStream({ rows, state, defaults, typeColor, showTip, hideTip, accessibleClick, render }) {
  const context = filterRows(rows,state,{ignoreYears:true,ignoreType:true});
  const keys = typeColor.domain();
  const years = d3.range(defaults.start,defaults.end+1);
  const counts = d3.rollup(context,v=>v.length,r=>r.year,r=>r.type);
  const data = years.map(year=>Object.fromEntries([['year',year],...keys.map(key=>[key,counts.get(year)?.get(key)||0])]));
  const stack = d3.stack().keys(keys).order(d3.stackOrderNone).offset(d3.stackOffsetWiggle)(data);
  const svg = d3.select('#streamgraph'); svg.selectAll('*').remove();
  const width = widthOf('streamgraph'); svg.attr('viewBox',`0 0 ${width} 290`).attr('data-start',defaults.start).attr('data-end',defaults.end);
  const x = d3.scaleLinear().domain([defaults.start-.5,defaults.end+.5]).range([20,width-20]);
  const y = d3.scaleLinear().domain([d3.min(stack,l=>d3.min(l,d=>d[0]))||0,d3.max(stack,l=>d3.max(l,d=>d[1]))||1]).range([245,20]);
  const area = d3.area().x(d=>x(d.data.year)).y0(d=>y(d[0])).y1(d=>y(d[1])).curve(d3.curveMonotoneX);
  const layers = svg.selectAll('.stream-layer').data(stack,d=>d.key).join('path').attr('class','stream-layer').attr('data-type',d=>d.key).attr('fill',d=>typeColor(d.key)).attr('d',area);
  function emphasize(key) { layers.attr('opacity',d=>key ? (d.key===key?1:.22) : (state.type && d.key!==state.type ? .28 : 1)); }
  emphasize(null);
  const toggle = (_,d)=>{state.type=state.type===d.key?'':d.key;hideTip();render();};
  accessibleClick(layers,toggle); layers.attr('aria-label',d=>`${d.key}: select disaster type`).attr('aria-pressed',d=>d.key===state.type);
  // Translucent masks preserve the full axis and all layers while marking the scope.
  for (const [a,b] of [[defaults.start-.5,state.start-.5],[state.end+.5,defaults.end+.5]]) svg.append('rect').attr('x',x(a)).attr('y',15).attr('width',Math.max(0,x(b)-x(a))).attr('height',235).attr('fill','#fff').attr('opacity',.64).attr('pointer-events','none');
  svg.append('rect').attr('class','stream-interval').attr('x',x(state.start-.5)).attr('y',15).attr('width',x(state.end+.5)-x(state.start-.5)).attr('height',235).attr('fill','none').attr('stroke','#228580').attr('pointer-events','none');
  svg.append('g').attr('class','axis').attr('transform','translate(0,250)').call(d3.axisBottom(x).ticks(Math.max(3,Math.floor(width/85))).tickFormat(d3.format('d')));
  const guide = svg.append('line').attr('class','stream-guide').attr('y1',15).attr('y2',250).attr('visibility','hidden');
  layers.on('pointermove',(event,d)=>{
    emphasize(d.key);
    const year=Math.max(defaults.start,Math.min(defaults.end,Math.round(x.invert(d3.pointer(event,svg.node())[0]))));
    guide.attr('x1',x(year)).attr('x2',x(year)).attr('visibility','visible');
    showTip(event,d.key,`${year}: ${(counts.get(year)?.get(d.key)||0).toLocaleString()} country-disaster records`,year===2026?'Partial year':'Click to toggle the shared disaster-type filter');
  }).on('pointerleave',()=>{emphasize(null);guide.attr('visibility','hidden');hideTip();});
  const legend=d3.select('#stream-legend').selectAll('button').data(keys).join('button');
  legend.attr('aria-pressed',d=>d===state.type).on('click',(_,key)=>toggle(null,{key})).on('pointerenter',(_,key)=>emphasize(key)).on('pointerleave',()=>emphasize(null)).on('focus',(_,key)=>emphasize(key)).on('blur',()=>emphasize(null));
  legend.each(function(key){const item=d3.select(this);item.selectAll('*').remove();item.append('i').style('background',typeColor(key));item.append('span').text(key);});
  $('stream-note').textContent=`${state.start}–${state.end} outlined · Layer thickness represents annual country-disaster records, regardless of the impact measure. Vertical position is a flowing baseline, not an absolute total. Select a layer or legend item to toggle a type.`;
  if(!context.length) empty(svg,width,'No records for the selected geography.');
}
function renderTree({ rows,state,countryNames,showTip,hideTip,accessibleClick,render }) {
  const selected=filterRows(rows,state);
  const svg=d3.select('#treemap');
  const width=widthOf('treemap'),height=width<500?540:480;
  svg.attr('viewBox',`0 0 ${width} ${height}`);
  const regions=[...new Set(rows.map(r=>r.region))].sort();
  const regionColor=d3.scaleOrdinal(regions,['#478e80','#6085b3','#bd9157','#9776a9','#af717b']);
  const byRegion=d3.group(rows,r=>r.region);
  const colors=new Map();
  for(const [region,records] of byRegion){
    const codes=[...new Set(records.map(r=>r.iso))].sort();
    codes.forEach((iso,i)=>colors.set(iso,d3.interpolateRgb(regionColor(region),'#e4eee9')(.08+.42*i/Math.max(1,codes.length-1))));
  }
  const root=d3.hierarchy(disasterHierarchy(selected)).sum(d=>d.value||0).sort((a,b)=>b.value-a.value||a.data.name.localeCompare(b.data.name));
  // Adapted from lab6.js: squarify, depth-aware spacing and labels that fit.
  d3.treemap().tile(d3.treemapSquarify).size([width,height]).round(false)
    .paddingInner(d=>d.depth===0?4:d.depth===1?2:0).paddingOuter(1)
    .paddingTop(d=>d.depth===1?19:d.depth===2 && d.value/root.value>.015?17:0)(root);
  svg.selectAll('.chart-empty').remove();
  const nodes=root.descendants().filter(d=>d.depth>0);
  const id=d=>d.ancestors().reverse().map(n=>n.data.name).join('/');
  const cells=svg.selectAll('.tree-cell').data(nodes,id).join(enter=>{const g=enter.append('g').attr('class','tree-cell');g.append('rect');g.append('text');return g;},update=>update,exit=>exit.remove()).order();
  cells.attr('data-depth',d=>d.depth).attr('data-iso',d=>d.data.iso||'').attr('data-type',d=>d.data.type||'').attr('data-value',d=>d.value);
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:220;
  cells.interrupt().transition().duration(duration).attr('transform',d=>`translate(${d.x0},${d.y0})`);
  cells.select('rect').interrupt().transition().duration(duration).attr('width',d=>Math.max(0,d.x1-d.x0)).attr('height',d=>Math.max(0,d.y1-d.y0))
    .attr('fill',d=>d.depth===1?d3.interpolateRgb(regionColor(d.data.region),'white')(.8):d.depth===2?colors.get(d.data.iso):d3.interpolateRgb(colors.get(d.data.iso),'white')((d.parent.children.indexOf(d)%5)*.055));
  cells.select('text').attr('x',4).attr('y',d=>d.depth===3?14:13).attr('font-size',d=>d.depth===1?12:10).attr('fill','#173640').attr('font-weight',d=>d.depth<3?650:400).text(d=>{
    const label=d.data.name, w=d.x1-d.x0,h=d.y1-d.y0;
    const hasHeader=d.depth!==2 || d.value/root.value>.015;
    return hasHeader && h>18 && label.length*(d.depth===1?6.6:5.5)+8<w?label:'';
  });
  cells.selectAll('.tree-value').remove();
  cells.filter(d=>d.depth===3 && d.x1-d.x0>90 && d.y1-d.y0>65).append('text').attr('class','tree-value').attr('x',6).attr('y',45).attr('font-size',24).attr('fill','#173640').text(d=>d.value.toLocaleString());
  const tip=(e,d)=>{
    const name=d.depth===1?d.data.name:d.depth===2?d.data.name:d.data.country;
    showTip(e,name,`${d.data.region}${d.data.type?' · '+d.data.type:''} · ${d.value.toLocaleString()} country-disaster records`,`${d3.format('.1%')(d.value/d.parent.value)} of ${d.parent.data.name} · ${state.start}–${state.end}`);
  };
  cells.on('pointermove',tip).on('pointerleave',hideTip).on('focus',tip).on('blur',hideTip);
  accessibleClick(cells,(e,d)=>{
    if(d.depth===1)return;
    if(state.country===d.data.iso && d.depth===3)state.type=state.type===d.data.type?'':d.data.type;
    else state.country=d.data.iso;
    hideTip();render();
  });
  cells.attr('aria-label',d=>`${d.data.name}: ${d.value} records, ${state.start}–${state.end}${d.depth>1?'. Select to explore.':''}`);
  cells.filter(d=>d.depth===1).attr('tabindex',null).attr('role',null);
  const legend=d3.select('#tree-legend').selectAll('.region-legend-item').data(regions).join('span').attr('class','region-legend-item');
  legend.each(function(region){const item=d3.select(this);item.selectAll('*').remove();item.append('i').style('background',regionColor(region));item.append('span').text(region);});
  $('tree-note').textContent=`World${state.region?' / '+state.region:''}${state.country?' / '+countryNames.get(state.country):''} · ${state.start}–${state.end} · ${selected.length.toLocaleString()} country-disaster records${state.type?' · '+state.type:''}`;
  $('tree-back').hidden=!state.country&&!state.region;
  if(!selected.length)empty(svg,width,'No records match these filters.');
}
