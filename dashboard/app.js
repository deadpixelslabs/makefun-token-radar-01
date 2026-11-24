/* Pre-Token Desk interactive frontend (zero external URLs) */
(function(){
'use strict';

var radar=window.__RADAR_DATA__,E=window.RadarEngine;
if(!radar||!E)return;

var qs=new URLSearchParams(window.location.search),iv=qs.get('view')||'board',L=Math.log,M=Math.round;
var state={
  tab:iv==='method'?'method':'board',detailSlug:iv==='detail'?(qs.get('slug')||''):'',
  capitalUsd:10000,dropSharePct:8,holdDays:90,horizonYears:2,dilutionMult:1,tbillAprPct:4.5,
  search:'',category:'ALL',chain:'ALL',filterMode:iv==='farm'?'FARM':'ALL',
  sortKey:iv==='farm'?'netPerHr':'rank',sortDir:iv==='farm'?'desc':'asc',page:1,perPage:iv==='farm'?14:10
};

function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});}
function fUsd(v){if(v==null||!Number.isFinite(v))return'--';var a=Math.abs(v),sg=v<0?'-':'';return sg+'$'+(a>=1e9?(a/1e9).toFixed(2)+'B':a>=1e6?(a/1e6).toFixed(2)+'M':a>=1e3?(a/1e3).toFixed(1)+'K':a.toFixed(0));}
function fAxis(v){return v>=1e9?'$'+(v/1e9)+'B':v>=1e6?'$'+(v/1e6)+'M':'$'+(v/1e3)+'K';}
function fEx(v){return(v==null||!Number.isFinite(v))?'--':(v<0?'-$':'$')+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fPct(v){return(v==null||!Number.isFinite(v))?'--':(v>0?'+':'')+v.toFixed(1)+'%';}
function pnl(t,sub,b){return'<div class="panel"><div class="panel-hd"><h2>'+t+'</h2><span>'+sub+'</span></div>'+b+'</div>';}
function wfRow(l,v,c){return'<div class="wf-row'+(c?' '+c:'')+'"><span>'+l+'</span><span class="num">'+v+'</span></div>';}
function kpi(l,v,s){return'<div class="kpi"><div class="kpi-lbl">'+l+'</div><div class="kpi-val num">'+v+'</div><div class="kpi-sub">'+s+'</div></div>';}
function td(v,c){return'<td'+(c?' class="'+c+'"':'')+'>'+v+'</td>';}
function ntd(v){return td(v,'num');}
function rtd(v,extra){return td(v,'r num'+(extra?' '+extra:''));}
function tbl(cls,ths,body){return'<table class="'+cls+'"><thead><tr>'+ths+'</tr></thead><tbody>'+body+'</tbody></table>';}
function pills(arr,cur,attr,fmt){return arr.map(function(v){var k=Array.isArray(v)?v[0]:v,l=Array.isArray(v)?v[1]:fmt(v);return'<button class="pill-btn'+(cur===k?' active':'')+'" '+attr+'="'+k+'">'+esc(l)+'</button>';}).join('');}

function cumProbFn(a,xT,cat){
  var w=radar.odds_model.weights,z=w[0]+w[1]*L(Math.max(.05,a))+w[2]*(xT-17.5)+w[3]*(radar.odds_model.catLo[cat]||0);
  return 1/(1+Math.exp(Math.max(-20,Math.min(20,-z))));
}

function recomputeRow(r){
  var aYr=r.age_yr||1,cf=radar.value_model.conformal;
  var pL=state.horizonYears===radar.horizon_years?r.launch_prob:E.survivalLaunchOdds(aYr,L(Math.max(1,r.tvl_usd)),r.category,state.horizonYears,{cumProb:cumProbFn});
  var imp=Math.max(1,M(r.val_if_launch_usd*pL));
  var dyn={rank:r.rank,slug:r.slug,name:r.name,category:r.category,chains:r.chains,tvl_usd:r.tvl_usd,change_7d:r.change_7d,listed_at:r.listed_at,age_days:r.age_days,age_yr:aYr,in_watchlist:r.in_watchlist,tier:r.tier,val_if_launch_usd:r.val_if_launch_usd,launch_prob:pL,implied_value_usd:imp,p10_usd:Math.max(1,M(imp*cf.p10)),p25_usd:Math.max(1,M(imp*cf.p25)),p75_usd:Math.max(1,M(imp*cf.p75)),p90_usd:Math.max(1,M(imp*cf.p90)),rank_range:r.rank_range,peers:r.peers};
  dyn.farm=E.evaluateFarmPlan(dyn,state);
  return dyn;
}

function getComputedRows(){
  var out=radar.rows.map(recomputeRow);
  if(state.horizonYears!==radar.horizon_years){out.sort(function(a,b){return b.implied_value_usd-a.implied_value_usd;});out.forEach(function(r,i){r.rank=i+1;});}
  return out;
}

function buildScatterSvg(w,h,showPre){
  var comps=radar.traded.filter(function(t){return t.is_comp&&t.tvl_usd>0&&t.mcap_usd>0;});
  var minX=L(4e6),maxX=L(3.5e10),minY=L(8e4),maxY=L(3e10),pL=44,pR=12,pT=15,pB=22;
  var clpY=function(y){return Math.max(minY,Math.min(maxY,y));};
  var sx=function(x){return pL+((x-minX)/(maxX-minX))*(w-pL-pR);},sy=function(y){return h-pB-((clpY(y)-minY)/(maxY-minY))*(h-pT-pB);};
  var vm=radar.value_model,cf=vm.conformal,x0=L(5e6),x1=L(2e10),y0=vm.alpha+vm.beta*x0,y1=vm.alpha+vm.beta*x1;
  var pts=[sx(x0),sy(y0+L(cf.p75)),sx(x1),sy(y1+L(cf.p75)),sx(x1),sy(y1+L(cf.p25)),sx(x0),sy(y0+L(cf.p25))].map(function(v){return v.toFixed(1);});
  var s=['<svg viewBox="0 0 '+w+' '+h+'"><rect width="'+w+'" height="'+h+'" fill="#faf9f5" rx="4"/>'];
  [1e7,1e8,1e9,1e10].forEach(function(v){var x=sx(L(v)).toFixed(1);s.push('<line class="sg" x1="'+x+'" y1="'+pT+'" x2="'+x+'" y2="'+(h-pB)+'"/><text class="st" x="'+x+'" y="'+(h-7)+'" text-anchor="middle">'+fAxis(v)+'</text>');});
  [1e6,1e7,1e8,1e9,1e10].forEach(function(v){var y=sy(L(v)).toFixed(1);s.push('<line class="sg" x1="'+pL+'" y1="'+y+'" x2="'+(w-pR)+'" y2="'+y+'"/><text class="st" x="'+(pL-5)+'" y="'+(+y+3)+'" text-anchor="end">'+fAxis(v)+'</text>');});
  s.push('<polygon points="'+pts[0]+','+pts[1]+' '+pts[2]+','+pts[3]+' '+pts[4]+','+pts[5]+' '+pts[6]+','+pts[7]+'" fill="#1d4ed8" opacity="0.13"/>');
  s.push('<line x1="'+sx(x0).toFixed(1)+'" y1="'+sy(y0).toFixed(1)+'" x2="'+sx(x1).toFixed(1)+'" y2="'+sy(y1).toFixed(1)+'" stroke="#b91c1c" stroke-width="2"/>');
  comps.forEach(function(c){s.push('<circle cx="'+sx(L(c.tvl_usd)).toFixed(1)+'" cy="'+sy(L(c.mcap_usd)).toFixed(1)+'" r="2.7" fill="#132238" opacity="0.72"/>');});
  if(showPre)radar.rows.slice(0,12).forEach(function(r){s.push('<circle cx="'+sx(L(r.tvl_usd)).toFixed(1)+'" cy="'+sy(L(r.implied_value_usd)).toFixed(1)+'" r="3.8" fill="#0f766e" stroke="#fff"/>');});
  return s.join('')+'<text class="sb" x="'+(w-pR-4)+'" y="'+(pT+9)+'" text-anchor="end"><tspan fill="#132238">● '+vm.n_comps+' Comps</tspan> · <tspan fill="#b91c1c">— OLS</tspan> · <tspan fill="#1d4ed8">■ P25–P75</tspan>'+(showPre?' · <tspan fill="#0f766e">● Top 12 Pre-Token</tspan>':'')+'</text></svg>';
}

function buildOddsChartSvg(w,h){
  var bks=radar.odds_model.ageBuckets,pL=36,pR=16,pT=18,pB=26,bw=(w-pL-pR)/bks.length,haz=[],hp=[];
  var s=['<svg viewBox="0 0 '+w+' '+h+'"><rect width="'+w+'" height="'+h+'" fill="#faf9f5" rx="4"/>'];
  [0,25,50,75,100].forEach(function(pct){var y=(h-pB-(pct/100)*(h-pT-pB)).toFixed(1);s.push('<line class="sg" x1="'+pL+'" y1="'+y+'" x2="'+(w-pR)+'" y2="'+y+'"/><text class="st" x="'+(pL-5)+'" y="'+(+y+3)+'" text-anchor="end">'+pct+'%</text>');});
  bks.forEach(function(b,i){
    var bh=(b.ratePct/100)*(h-pT-pB),x=pL+i*bw+14,y=h-pB-bh,barW=bw-28,cx=(x+barW/2).toFixed(1);
    s.push('<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+bh.toFixed(1)+'" fill="#1d4ed8" opacity="0.88" rx="2"/>');
    s.push('<text x="'+cx+'" y="'+(bh>=24?(h-pB-7):(y-5)).toFixed(1)+'" text-anchor="middle" font-size="9" font-weight="700" fill="'+(bh>=24?'#fff':'#0f1b2d')+'">'+b.ratePct+'% ('+b.tok+'/'+b.n+')</text>');
    s.push('<text class="st" x="'+cx+'" y="'+(h-9)+'" text-anchor="middle">'+b.label+'</text>');
    var p2=E.survivalLaunchOdds([.5,1.5,2.5,3.5][i],18.2,'Other',state.horizonYears,{cumProb:cumProbFn}),hy=(h-pB-p2*(h-pT-pB));
    haz.push(cx+','+hy.toFixed(1));hp.push([cx,hy,(p2*100).toFixed(0)+'%']);
  });
  s.push('<polyline points="'+haz.join(' ')+'" fill="none" stroke="#faf9f5" stroke-width="3.5"/><polyline points="'+haz.join(' ')+'" fill="none" stroke="#b91c1c" stroke-width="2" stroke-dasharray="4 3"/>');
  hp.forEach(function(d){s.push('<circle cx="'+d[0]+'" cy="'+d[1].toFixed(1)+'" r="3.4" fill="#b91c1c" stroke="#faf9f5" stroke-width="1.2"/><text x="'+d[0]+'" y="'+(d[1]-6).toFixed(1)+'" text-anchor="middle" font-size="8.5" font-weight="800" fill="#b91c1c" stroke="#faf9f5" stroke-width="2.4" style="paint-order:stroke">'+d[2]+'</text>');});
  return s.join('')+'<text x="'+(w-pR-4)+'" y="'+(pT+7)+'" text-anchor="end" font-size="9" font-weight="700"><tspan fill="#1d4ed8">■ Cumulative %</tspan> · <tspan fill="#b91c1c">-- Conditional '+state.horizonYears+'y Hazard</tspan></text></svg>';
}

function renderHeader(rows,integ){
  var farmCnt=rows.filter(function(r){return r.farm.verdict==='FARM';}).length;
  var vm=radar.value_model,om=radar.odds_model,kept=vm.ablation.filter(function(a){return a.kept;})[0];
  var tabs=[['board','Ranked Board ('+radar.ranked_count+')'],['traded','Traded Comps ('+radar.traded_count+')'],['excluded','Set Aside ('+radar.excluded_count+')'],['method','Methodology & Calibration']];
  var seal=[[integ.partitionOk,radar.total_protocols+'/'+radar.total_protocols+' Accounted ('+radar.ranked_count+'+'+radar.traded_count+'+'+radar.excluded_count+')'],[integ.watchlistOk,radar.watchlist_count+'/'+radar.watchlist_count+' Watchlist'],[integ.monotonicOk,radar.ranked_count+' Monotonic Ranks'],[integ.sealOk,'Seal '+esc(radar.board_seal)+' = board.json'],[true,'LOO '+kept.loo.medX+'× · WF '+kept.wf.medX+'× ('+vm.n_comps+' Comps)'],[true,'Launch Brier '+om.bestBrier+' (+'+om.bestBssPct+'% BSS)']].map(function(s){return'<span class="seal-pill'+(s[0]?'':' warn')+'">✓ '+s[1]+'</span>';}).join('');
  return'<header class="topbar"><div class="brand"><h1>Pre-Token Desk</h1><span class="brand-sub">DefiLlama '+esc(radar.as_of)+' · $50M Watchlist Floor</span></div><nav class="nav-tabs">'+
    tabs.map(function(t){return'<button class="tab-btn'+(!state.detailSlug&&state.tab===t[0]?' active':'')+'" data-tab="'+t[0]+'">'+esc(t[1])+'</button>';}).join('')+
    '<button class="tab-btn btn-export" id="btn-csv">Export CSV</button></nav></header><div class="seal-strip">'+seal+'</div><section class="kpi-grid">'+
    kpi('Watchlist Floor',radar.watchlist_count+' / '+radar.watchlist_count,'+'+radar.offlist_high_tvl+' off-list & +'+radar.early_count+' early')+
    kpi('Power-Law Beta','TVL^'+vm.beta.toFixed(3),'90% Boot CI ['+vm.beta_ci90[0]+', '+vm.beta_ci90[1]+']')+
    kpi('Held-Out Miss',kept.loo.medX+'× / '+kept.wf.medX+'×','LOO ('+vm.n_comps+') / Walk-Fwd ('+vm.n_wf+')')+
    kpi('Conformal Band',vm.conformal.cov50Pct+'% / '+vm.conformal.cov80Pct+'%','Target 50% (P25-75) / 80% (P10-90)')+
    kpi('Launch Odds Skill','+'+om.bestBssPct+'% BSS','10-CV Brier '+om.bestBrier+' vs '+om.baseBrier)+
    kpi('Actionable FARM',farmCnt+' / '+radar.ranked_count,fUsd(state.capitalUsd)+' · '+state.dropSharePct+'% drop · '+state.holdDays+'d')+'</section>';
}

function renderBoard(allRows){
  var vm=radar.value_model,h='';
  if(state.filterMode==='ALL'&&!state.search&&state.category==='ALL'&&state.chain==='ALL'){
    var ablRows=vm.ablation.slice(0,6).map(function(a){
      return'<tr class="'+(a.kept?'kept':'')+'">'+td(esc(a.label))+ntd(a.loo.medX+'×')+ntd(a.wf.medX+'×')+ntd(a.wf.within2x+'%')+ntd(a.cv10.medX+'×')+td(a.kept?'<span class="tag-kept">KEPT</span>':'<span class="tag-drop">REJECT</span>')+'</tr>';
    }).join('');
    h+='<section class="proof-grid">'+
      pnl('Triple-Split Out-of-Sample Valuation Ablation','Refitted inside every fold ('+vm.n_comps+' LOO · '+vm.n_wf+' WF · 10-CV)',tbl('mini-tbl','<th>Candidate Spec</th><th>LOO Med</th><th>WF Med</th><th>WF ≤2×</th><th>10-CV</th><th>Status</th>',ablRows))+
      pnl('Power-Law Fit &amp; Formula','R² = '+vm.r2.toFixed(3),'<div class="formula-line num">Implied = exp('+vm.alpha.toFixed(3)+')·TVL^'+vm.beta.toFixed(3)+' × P('+state.horizonYears+'y|Age,TVL,Cat)</div><div class="svg-wrap">'+buildScatterSvg(460,118,false)+'</div>')+'</section>';
  }

  var cats={},chs={};allRows.forEach(function(r){cats[r.category]=1;(r.chains||[]).forEach(function(c){chs[c]=1;});});
  h+='<div class="ctrl-bar"><div class="ctrl-group"><span class="ctrl-lbl">Filter</span>'+
    pills([['ALL','All '+allRows.length],['WL','Watchlist '+radar.watchlist_count],['FARM','FARM'],['MARGINAL','MARGINAL'],['SKIP','SKIP']],state.filterMode,'data-fmode')+
    '<input class="inp-sm" id="inp-search" placeholder="Search protocol..." value="'+esc(state.search)+'" /><select class="sel-sm" id="sel-cat"><option value="ALL">All Categories</option>'+
    Object.keys(cats).sort().map(function(c){return'<option value="'+esc(c)+'"'+(state.category===c?' selected':'')+'>'+esc(c)+'</option>';}).join('')+
    '</select><select class="sel-sm" id="sel-chain"><option value="ALL">All Chains</option>'+
    Object.keys(chs).sort().map(function(c){return'<option value="'+esc(c)+'"'+(state.chain===c?' selected':'')+'>'+esc(c)+'</option>';}).join('')+
    '</select></div><div class="ctrl-group"><span class="ctrl-lbl">Cap</span>'+pills([2500,10000,25000],state.capitalUsd,'data-cap',fUsd)+
    '<span class="ctrl-lbl">Drop</span>'+pills([4,8,14],state.dropSharePct,'data-drop',function(d){return d+'%';})+
    '<span class="ctrl-lbl">Hor</span>'+pills([1,2,3],state.horizonYears,'data-hor',function(y){return y+'y';})+'</div></div>';

  var filtered=allRows.filter(function(r){
    if(state.filterMode==='WL'&&!r.in_watchlist)return false;
    if((state.filterMode==='FARM'||state.filterMode==='MARGINAL'||state.filterMode==='SKIP')&&r.farm.verdict!==state.filterMode)return false;
    if(state.category!=='ALL'&&r.category!==state.category)return false;
    if(state.chain!=='ALL'&&(r.chains||[]).indexOf(state.chain)<0)return false;
    if(state.search){var q=state.search.toLowerCase();if(r.name.toLowerCase().indexOf(q)<0&&r.slug.toLowerCase().indexOf(q)<0&&r.category.toLowerCase().indexOf(q)<0)return false;}
    return true;
  }).sort(function(a,b){
    var m={rank:[a.rank,b.rank],tvl:[a.tvl_usd,b.tvl_usd],prob:[a.launch_prob,b.launch_prob],implied:[a.implied_value_usd,b.implied_value_usd],netEv:[a.farm.netEv,b.farm.netEv],netPerHr:[a.farm.netPerHr,b.farm.netPerHr]}[state.sortKey]||[a.rank,b.rank];
    return state.sortDir==='asc'?m[0]-m[1]:m[1]-m[0];
  });

  if(state.filterMode!=='ALL'||state.search||state.category!=='ALL'||state.chain!=='ALL'){
    var tNet=0,tCost=0,tHrs=0;filtered.forEach(function(r){tNet+=r.farm.netEv;tCost+=r.farm.gasCost+r.farm.oppCost;tHrs+=r.farm.totalHours;});
    h+='<div class="book-strip">'+[['Active Selection',filtered.length+' rows'],['Book Capital',fUsd(filtered.length*state.capitalUsd)],['Gas + T-Bill Cost',fEx(tCost)],['Combined Net EV',fEx(tNet)],['Total Est. Time',tHrs.toFixed(1)+' h'],['Blended Net $/Hr',fEx(tHrs>0?tNet/tHrs:0)+'/h']].map(function(kv){return'<div><div class="book-k">'+kv[0]+'</div><div class="book-v num">'+kv[1]+'</div></div>';}).join('')+'</div>';
  }

  var pages=Math.max(1,Math.ceil(filtered.length/state.perPage));if(state.page>pages)state.page=pages;
  var slice=filtered.slice((state.page-1)*state.perPage,state.page*state.perPage);
  function th(k,lbl,cls){return'<th class="'+(cls||'')+'" data-sort="'+k+'">'+esc(lbl)+(state.sortKey===k?(state.sortDir==='asc'?' ▲':' ▼'):'')+'</th>';}

  var rowsHtml=slice.map(function(r){
    var fp=r.farm,ch=(r.chains||[]).slice(0,2).join(', ')+((r.chains||[]).length>2?' +'+(r.chains.length-2):'');
    var g7=r.change_7d==null?'--':'<span class="'+(r.change_7d>=0?'pos':'neg')+'">'+fPct(r.change_7d)+'</span>';
    return'<tr data-slug="'+esc(r.slug)+'">'+ntd('<strong>#'+r.rank+'</strong> <span class="whisker">['+r.rank_range[0]+'–'+r.rank_range[1]+']</span>')+
      td('<div class="proto-name">'+esc(r.name)+(r.in_watchlist?'<span class="badge-wl">WL</span>':'')+'</div><div class="proto-meta">'+esc(r.category)+' · '+esc(ch)+'</div>')+
      rtd('<div>'+fUsd(r.tvl_usd)+'</div><div class="proto-meta">'+g7+'</div>')+
      rtd(r.age_days?r.age_yr.toFixed(2)+'y':'~'+r.age_yr.toFixed(1)+'y*')+
      rtd('<span class="bar-bg"><span class="bar-fg" style="width:'+M(r.launch_prob*100)+'%"></span></span>'+(r.launch_prob*100).toFixed(1)+'%')+
      rtd(fUsd(r.val_if_launch_usd))+rtd('<strong>'+fUsd(r.implied_value_usd)+'</strong><span class="whisker">'+fUsd(r.p25_usd)+'–'+fUsd(r.p75_usd)+'</span>')+
      rtd('<div>$'+fp.gasCost.toFixed(2)+'</div><div class="proto-meta">'+fp.totalHours.toFixed(1)+'h</div>')+
      rtd(fEx(fp.netEv),fp.netEv>=0?'pos':'neg')+rtd(fEx(fp.netPerHr)+'/h',fp.netPerHr>=0?'pos':'neg')+
      td('<span class="verdict v-'+fp.verdict+'">'+fp.verdict+'</span>')+'</tr>';
  }).join('');

  return h+'<div class="tbl-wrap">'+tbl('main-tbl',th('rank','Rank · 90% Range')+'<th>Protocol</th>'+th('tvl','TVL · 7d','r')+
    '<th class="r">Age</th>'+th('prob',state.horizonYears+'y Odds','r')+'<th class="r">Val | Launch</th>'+th('implied','Implied · P25-P75','r')+
    '<th class="r">Gas / Hrs</th>'+th('netEv','Net EV','r')+th('netPerHr','$/Hr','r')+'<th>Verdict</th>',rowsHtml)+
    '<div class="pager"><span>Showing '+slice.length+' of '+filtered.length+' (Click row for waterfall &amp; 7-step plan)</span><div><button class="btn-sm" id="pg-prev">Prev</button> <span class="num">Page '+state.page+'/'+pages+'</span> <button class="btn-sm" id="pg-next">Next</button></div></div></div>';
}

function renderDetail(allRows){
  var row=allRows.filter(function(r){return r.slug===state.detailSlug;})[0]||allRows[0],fp=row.farm,vm=radar.value_model,cf=vm.conformal;
  var p10L=L(row.p10_usd),p90L=L(Math.max(row.p90_usd,row.p10_usd+1));
  var pos=function(v){return Math.max(0,Math.min(100,((L(Math.max(1,v))-p10L)/Math.max(.1,p90L-p10L))*100));};
  var band='<div class="band-box"><div class="flex-sb"><span>P10–P90: <strong class="num">'+fUsd(row.p10_usd)+'–'+fUsd(row.p90_usd)+'</strong></span><span>P25–P75: <strong class="num">'+fUsd(row.p25_usd)+'–'+fUsd(row.p75_usd)+'</strong></span></div>'+
    '<div class="band-track"><div class="band-p25" style="left:'+pos(row.p25_usd).toFixed(1)+'%;width:'+(pos(row.p75_usd)-pos(row.p25_usd)).toFixed(1)+'%;"></div><div class="band-pt" style="left:'+pos(row.implied_value_usd).toFixed(1)+'%;"></div></div></div>';
  var peers=row.peers.map(function(pr){return'<tr>'+td('<strong>'+esc(pr.name)+'</strong> ('+esc(pr.symbol||'')+')')+td(esc(pr.category))+rtd(fUsd(pr.tvl_usd))+rtd(fUsd(pr.mcap_usd))+rtd((pr.mcap_usd/Math.max(1,pr.tvl_usd)).toFixed(2)+'×')+'</tr>';}).join('');
  var sens=tbl('sens-tbl','<th>Drop \\ Cap</th>'+fp.matrixCaps.map(function(c){return'<th>'+fUsd(c)+'</th>';}).join(''),
    fp.matrix.map(function(mr){return'<tr><th>'+mr.dropPct+'% Drop</th>'+mr.cells.map(function(v){return td(fEx(v),'num '+(v>=0?'pos':'neg'));}).join('')+'</tr>';}).join(''));
  var steps='<ul class="step-list">'+fp.steps.map(function(st){var i=st.indexOf(':');return'<li class="step-item"><span class="step-tag">'+esc(st.slice(0,i))+':</span>'+esc(st.slice(i+1))+'</li>';}).join('')+'</ul>';

  return'<div class="detail-head"><div><button class="btn-sm" id="btn-back">← Back</button><strong class="serif detail-title">#'+row.rank+' '+esc(row.name)+'</strong>'+
    (row.in_watchlist?'<span class="badge-wl">WATCHLIST</span>':'')+' <span class="proto-meta">'+esc(row.category)+' · '+esc(row.chains.join(', '))+' · Listed '+esc(row.listed_at||'Unknown')+'</span></div>'+
    '<div class="tr"><div class="num detail-ev">'+fUsd(row.implied_value_usd)+'</div><span class="verdict v-'+fp.verdict+'">'+fp.verdict+' · '+fEx(fp.netEv)+' ('+fEx(fp.netPerHr)+'/h)</span></div></div>'+
    '<div class="detail-grid"><div><div class="mb">'+
    pnl('Valuation Waterfall &amp; Conformal Band','Rank Range ['+row.rank_range[0]+'–'+row.rank_range[1]+']',
      wfRow('1. Snapshot TVL (7d: '+(row.change_7d!=null?fPct(row.change_7d):'--')+')',fUsd(row.tvl_usd))+
      wfRow('2. Power-Law Val|Launch (exp('+vm.alpha.toFixed(3)+')·TVL^'+vm.beta.toFixed(3)+')',fUsd(row.val_if_launch_usd))+
      wfRow('3. Survival Launch Odds ('+state.horizonYears+'y | Age '+row.age_yr+'y)',(row.launch_prob*100).toFixed(1)+'%')+
      wfRow('4. Implied Pre-Token Value (E[Val] × P)',fUsd(row.implied_value_usd),'total')+band)+
    '</div><div class="mb">'+pnl('Nearest Traded Comparables','Category + |Δln(TVL)|',tbl('mini-tbl','<th>Protocol</th><th>Cat</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">Mcap/TVL</th>',peers))+
    '</div>'+pnl('Model Diagnostics &amp; Uncertainty','Bootstrap 200× · Row Seal',
      wfRow('Protocol Universe Tier',esc(row.tier||'Ranked'))+
      wfRow('Bootstrap 90% Rank CI','#'+row.rank_range[0]+'–#'+row.rank_range[1]+' (Point #'+row.rank+')')+
      wfRow('Conformal Error Multipliers','P10 '+cf.p10+'× · P25 '+cf.p25+'× · P75 '+cf.p75+'× · P90 '+cf.p90+'×')+
      '<div class="formula-line" style="margin:6px 0 0;">Use Cap / Drop / Horizon controls on Board to stress-test EV, break-even TVL, and conditional launch hazard live.</div>')+
    '</div><div><div class="mb">'+
    pnl('Economic Farm Verdict · '+esc(fp.bestChain),fp.actions+' txs · '+fp.totalHours+'h',
      wfRow('Position Capital / Active Share',fUsd(state.capitalUsd)+' / '+(fp.activeRatio*100).toFixed(0)+'%')+
      wfRow('Gross Airdrop EV ('+state.dropSharePct+'% pool)',fEx(fp.grossEv))+
      wfRow('Gas &amp; T-Bill Opp Cost ('+state.tbillAprPct+'% · '+state.holdDays+'d)','-'+fEx(fp.gasCost)+' / -'+fEx(fp.oppCost))+
      wfRow('Net EV · $/Hr · Break-Even',fEx(fp.netEv)+' · '+fEx(fp.netPerHr)+'/h · BE '+(fp.breakEvenDeposit?fUsd(fp.breakEvenDeposit):'N/A'),'total')+
      sens+'<div class="caution"><strong>Route:</strong> '+esc(fp.routeCaution)+'</div><div class="caution stop"><strong>Stop Rule:</strong> '+esc(fp.stopRule)+'</div>')+
    '</div>'+pnl('Concrete Farm Plan ('+fp.steps.length+' Steps)','Costed &amp; Timed',steps)+'</div></div>';
}

function renderMethod(){
  var vm=radar.value_model,om=radar.odds_model,kept=vm.ablation.filter(function(a){return a.kept;})[0];
  var abl=vm.ablation.map(function(a){return'<tr class="'+(a.kept?'kept':'')+'">'+td(esc(a.label))+ntd(a.loo.medX+'×')+ntd(a.loo.within2x+'%')+ntd(a.wf.medX+'×')+ntd(a.wf.within2x+'%')+ntd(a.cv10.medX+'×')+td(a.kept?'<span class="tag-kept">KEPT</span>':'<span class="tag-drop">NO</span>')+'</tr>';}).join('');
  var oAbl=om.ablation.map(function(o){return'<tr class="'+(o.kept?'kept':'')+'">'+td(esc(o.label))+ntd(o.brier)+ntd('+'+o.bssPct+'%')+ntd(o.logLoss)+td(o.kept?'<span class="tag-kept">KEPT</span>':'<span class="tag-drop">NO</span>')+'</tr>';}).join('');
  var cRates=om.catRates.slice(0,8).map(function(c){return'<div class="flex-sb"><span>'+esc(c.cat)+' ('+c.tok+'/'+c.n+')</span><strong class="num">'+c.ratePct+'%</strong></div>';}).join('');
  return'<div class="meth-grid">'+
    pnl('Log-Log Valuation Fit ('+vm.n_comps+' Comps + Top 12 Pre-Token)','Teal = Top 12 Pre-Token','<div class="svg-wrap">'+buildScatterSvg(640,214,true)+'</div><div class="formula-line" style="margin:5px 0 0;">Sub-linear β='+vm.beta.toFixed(3)+' (vs β=1) reflects $1B+ vaults pricing at 0.01–0.08× TVL vs 0.5–1.0× at $5–15M; $1B+ curators rate SKIP at $10K after 4.5% T-bill carry.</div>')+
    pnl('Triple-Split Value Model Ablation','Refitted Inside Every Fold',tbl('mini-tbl','<th>Model</th><th>LOO</th><th>≤2×</th><th>WF</th><th>≤2×</th><th>10-CV</th><th>Keep</th>',abl)+'<div class="formula-line" style="margin:6px 0 0;">Kept ln(TVL): lowest chronological Walk-Forward miss ('+kept.wf.medX+'×) &amp; top LOO ≤2× hit rate ('+kept.loo.within2x+'%); extra features overfit noisy 7d/chain swings out-of-time.</div>')+
    '</div><div class="meth-grid">'+
    pnl('Tokenization Rate &amp; Conditional '+state.horizonYears+'y Hazard','N = '+om.nDated+' Dated','<div class="svg-wrap">'+buildOddsChartSvg(640,206)+'</div>')+
    pnl('Launch-Odds Logistic Ablation &amp; Categories','10-Fold CV Brier','<div class="mb">'+tbl('mini-tbl','<th>Features</th><th>Brier</th><th>Skill</th><th>LogLoss</th><th>Keep</th>',oAbl)+'</div><div class="panel-hd"><h2>Category Tokenization Rates (n ≥ 10)</h2><span>Base: '+(om.baseP*100).toFixed(1)+'%</span></div><div class="cat-rates">'+cRates+'</div>')+
    '</div>';
}

function renderTraded(){
  var rows=radar.traded.slice(0,50).map(function(t,i){return'<tr>'+ntd(i+1)+td('<strong>'+esc(t.name)+'</strong> <span class="proto-meta">'+esc(t.symbol||'')+'</span>')+td(esc(t.category))+rtd(fUsd(t.tvl_usd))+rtd(fUsd(t.mcap_usd))+rtd(fUsd(t.pred_mcap_usd))+rtd(t.mcap_usd?(t.mcap_usd/Math.max(1,t.pred_mcap_usd)).toFixed(2)+'×':'--')+td(t.is_comp?'<span class="badge-comp">COMP</span>':'<span class="tag-drop">EXCL</span>')+'</tr>';}).join('');
  return'<div class="tbl-wrap">'+tbl('main-tbl','<th>#</th><th>Traded Protocol</th><th>Category</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">Pred</th><th class="r">Ratio</th><th>Role</th>',rows)+'</div>';
}

function renderExcluded(){
  var badges=Object.keys(radar.reason_counts).map(function(k){return'<span class="tag-drop">'+esc(k)+': <strong>'+radar.reason_counts[k]+'</strong></span>';}).join('');
  var rows=radar.excluded.slice(0,50).map(function(x,i){return'<tr>'+ntd(i+1)+td('<strong>'+esc(x.name)+'</strong>')+td(esc(x.category))+td(esc(x.chains.slice(0,3).join(', ')),'proto-meta')+rtd(fUsd(x.tvl_usd))+td('<span class="tag-drop">'+esc(x.reason)+'</span>')+'</tr>';}).join('');
  return'<div class="seal-strip" style="background:var(--soft);border-color:var(--line)">'+badges+'</div><div class="tbl-wrap">'+tbl('main-tbl','<th>#</th><th>Set-Aside Protocol</th><th>Category</th><th>Chains</th><th class="r">TVL</th><th>Reason</th>',rows)+'</div>';
}

function exportCsv(rows){
  var lines=['rank,slug,name,watchlist,category,tvl_usd,launch_prob,implied_value_usd,net_ev_usd,net_per_hr,verdict'];
  rows.forEach(function(r){lines.push([r.rank,r.slug,'"'+r.name.replace(/"/g,'""')+'"',r.in_watchlist,'"'+r.category+'"',r.tvl_usd,r.launch_prob,r.implied_value_usd,r.farm.netEv,r.farm.netPerHr,r.farm.verdict].join(','));});
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));a.download='token-radar-board.csv';a.click();
}

var appEl=document.getElementById('app'),cachedRows=[];
appEl.addEventListener('click',function(ev){
  var t=ev.target.closest('[data-tab],[data-fmode],[data-cap],[data-drop],[data-hor],[data-sort],tr[data-slug],#btn-csv,#btn-back,#pg-prev,#pg-next');
  if(!t)return;
  if(t.id==='btn-csv')return exportCsv(cachedRows);
  if(t.id==='btn-back'){state.detailSlug='';state.tab='board';return render();}
  if(t.id==='pg-prev'){if(state.page>1){state.page--;render();}return;}
  if(t.id==='pg-next'){state.page++;return render();}
  if(t.hasAttribute('data-tab')){state.detailSlug='';state.tab=t.getAttribute('data-tab');state.page=1;return render();}
  if(t.hasAttribute('data-fmode')){state.filterMode=t.getAttribute('data-fmode');state.perPage=state.filterMode==='ALL'?10:14;state.page=1;return render();}
  if(t.hasAttribute('data-cap')){state.capitalUsd=+t.getAttribute('data-cap');return render();}
  if(t.hasAttribute('data-drop')){state.dropSharePct=+t.getAttribute('data-drop');return render();}
  if(t.hasAttribute('data-hor')){state.horizonYears=+t.getAttribute('data-hor');return render();}
  if(t.hasAttribute('data-sort')){var k=t.getAttribute('data-sort');state.sortDir=state.sortKey===k?(state.sortDir==='asc'?'desc':'asc'):(k==='rank'?'asc':'desc');state.sortKey=k;return render();}
  if(t.hasAttribute('data-slug')){state.detailSlug=t.getAttribute('data-slug');return render();}
});
appEl.addEventListener('input',function(ev){if(ev.target.id==='inp-search'){state.search=ev.target.value;state.page=1;render();}});
appEl.addEventListener('change',function(ev){
  if(ev.target.id==='sel-cat'){state.category=ev.target.value;state.page=1;render();}
  if(ev.target.id==='sel-chain'){state.chain=ev.target.value;state.page=1;render();}
});

function render(){
  cachedRows=getComputedRows();
  var integ=E.verifyBoardIntegrity(radar);
  var body=state.detailSlug?renderDetail(cachedRows):state.tab==='traded'?renderTraded():state.tab==='excluded'?renderExcluded():state.tab==='method'?renderMethod():renderBoard(cachedRows);
  appEl.innerHTML=renderHeader(cachedRows,integ)+body;
}
render();
})();
