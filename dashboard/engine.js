/* Econometric & farm-economics engine (Node 22 + Browser) */
(function(root){
'use strict';
var L=Math.log,E=Math.exp,Abs=Math.abs,M=Math.round;
var EXCL={Bridge:1,'Canonical Bridge':1,'Cross Chain Bridge':1,'Liquid Staking':1,'Liquid Restaking':1,'Restaked BTC':1,CEX:1};
var EXCH=['Binance','Coinbase','Bybit','Kraken','Bitget','OKX','Bitfinex','Gemini'];
var VER_RE=/\s+(?:v\d+(?:\.\d+)*|\d+\.\d+)$/i,WORD_RE=/\b(?:wrapped|staked|staking)\b/i;
var CHAIN_GAS={
  Solana:.01,Sui:.02,Aptos:.02,Hyperliquid:.04,'Hyperliquid L1':.04,Berachain:.04,Sei:.03,Sonic:.03,
  Near:.02,Stellar:.01,Starknet:.05,Arbitrum:.08,Base:.07,Optimism:.08,'OP Mainnet':.08,Polygon:.06,
  Blast:.08,Scroll:.08,Linea:.08,Mantle:.05,Mode:.06,'zkSync Era':.08,Avalanche:.1,BSC:.12,Binance:.12,
  'BNB Chain':.12,Gnosis:.04,Fantom:.05,Bitcoin:2.8,Lightning:.02,Bittensor:.05,TON:.03,Tron:.35,
  Ethereum:4.2,Monad:.03,Plasma:.04,'Robinhood Chain':.04,Unichain:.04,Flare:.02,'Plume Mainnet':.04,
  Arc:.04,Katana:.04,Hemi:.05,Ink:.04,TAC:.04,CORE:.02,Pharos:.04,Tempo:.04,BOB:.06,Celo:.02,
  Ripple:.01,Provenance:.04,Stable:.03,'World Chain':.04,RSK:.08,Mezo:.05,Citrea:.06,Etherlink:.03,Canton:.04,Fluent:.03,RISE:.02,Stacks:.05
};
var RAW_CATS=[
  ['Lending',9,25,90,.21,'Supply collateral at 35-45% util in active pools','Claim rewards bi-weekly and rotate top pools','Keep health >1.75x; cap pool share'],
  ['Dexs',14,20,115,.19,'Add tight LP on top pairs and route weekly swaps','Rebalance ticks weekly across fee epochs','Skip thin pairs; hedge IL when 7d vol >15%'],
  ['RWA',7,35,75,.25,'Mint yield-bearing treasury or credit receipt asset','Verify attestations monthly; compound yield','Audit redemption SLA before 90d lock'],
  ['Risk Curators',6,25,70,.26,'Deposit into flagship curated points vaults','Check curator rebalances bi-weekly; skip dust','Verify borrower caps and exit buffers'],
  ['Basis Trading',10,30,100,.2,'Stake delta-neutral tranche in epoch pool','Track funding weekly and roll tranches','Exit if insurance dips or funding turns negative'],
  ['CDP',8,25,85,.22,'Open >220% CDP and stake debt in stability pool','Maintain buffer on 10% dips; claim rewards','Monitor peg >50 bps and redemption queue'],
  ['Yield',8,20,80,.22,'Deposit in core yield vault or YT/PT split','Compound monthly and roll expired terms','Cap YT principal risk; verify timelock'],
  ['Derivatives',16,25,130,.18,'Post USDC margin and run hedged maker quotes','Maintain steady weekly OI on liquid pairs','Cap leverage <3x with stops; hedge delta'],
  ['Onchain Capital Allocator',6,25,70,.25,'Deposit in flagship strategy multiplier vault','Audit strategy weights every 14d','Check multisig guardrails; cap venue >40%'],
  ['Payments',10,30,95,.2,'Provide corridor liquidity across active routes','Keep monthly routing volume across snapshots','Cap hot-channel exposure; track fees weekly'],
  ['Default',9,25,90,.21,'Deploy capital in flagship TVL points pool','Execute organic bi-weekly txs across snapshots','Verify audits, timelock, and instant exit']
],CATP={};
RAW_CATS.forEach(function(c){CATP[c[0]]={n:c[1],setM:c[2],cadM:c[3],act:c[4],core:c[5],loop:c[6],risk:c[7]};});

function sortN(a){return a.slice().sort(function(x,y){return x-y;});}
function quantile(a,q){if(!a.length)return 0;var s=sortN(a),p=q*(s.length-1),l=Math.floor(p);return s[l]+(p-l)*(s[Math.min(s.length-1,l+1)]-s[l]);}
function median(a){return quantile(a,.5);}
function clamp(v,lo,hi){return v<lo?lo:v>hi?hi:v;}
function posI(v){return Math.max(1,M(v));}
function parseAgeDays(dt,ms){if(!dt)return null;var t=Date.parse(dt+'T00:00:00Z');return Number.isFinite(t)?Math.max(1,M((ms-t)/864e5)):null;}
function sigm(z){return 1/(1+E(-clamp(z,-20,20)));}
function dot(w,x){var s=0;for(var i=0;i<w.length;i++)s+=w[i]*x[i];return s;}

function exclusionReason(p){
  if(p.category&&EXCL[p.category])return p.category;
  if(VER_RE.test(p.name))return 'Versioned';
  if(WORD_RE.test(p.name))return 'Wrapped/Staked';
  for(var i=0;i<EXCH.length;i++)if(p.name.indexOf(EXCH[i])===0)return 'Exchange';
  return null;
}
function solveLinear(A,b){
  var n=b.length,Mtx=A.map(function(r,i){return r.concat([b[i]]);});
  for(var c=0;c<n;c++){
    var piv=c,r,j;
    for(r=c+1;r<n;r++)if(Abs(Mtx[r][c])>Abs(Mtx[piv][c]))piv=r;
    var t=Mtx[c];Mtx[c]=Mtx[piv];Mtx[piv]=t;
    if(Abs(Mtx[c][c])<1e-12)return new Array(n).fill(0);
    for(j=c+1;j<=n;j++)Mtx[c][j]/=Mtx[c][c];Mtx[c][c]=1;
    for(var r2=0;r2<n;r2++)if(r2!==c){var f=Mtx[r2][c];for(var j2=c;j2<=n;j2++)Mtx[r2][j2]-=f*Mtx[c][j2];}
  }
  return Mtx.map(function(r){return r[n];});
}
function fitOLS(rows,fFn){
  var X=rows.map(fFn),k=X[0].length,Am=[],b=new Array(k).fill(0),i,a,c;
  for(i=0;i<k;i++)Am.push(new Array(k).fill(0));
  rows.forEach(function(row,n){var xi=X[n],yi=row.y;for(a=0;a<k;a++){b[a]+=xi[a]*yi;for(c=0;c<k;c++)Am[a][c]+=xi[a]*xi[c];}});
  return solveLinear(Am,b);
}

function partitionUniverse(snap){
  var ms=Date.parse(snap.as_of+'T00:00:00Z'),wl=Object.create(null);
  snap.watchlist.forEach(function(s){wl[s]=true;});
  var ranked=[],traded=[],excluded=[],reasons=Object.create(null);
  snap.protocols.forEach(function(p){
    var hasTok=p.gecko_id!==null||p.symbol!==null,inWl=!!wl[p.slug],ex=exclusionReason(p),ch=p.chains||[];
    var rec={
      slug:p.slug,name:p.name,cat:p.category||'Other',chains:ch,tvl_usd:p.tvl_usd,change_7d:p.change_7d,
      mcap_usd:p.mcap_usd,listed_at:p.listed_at,symbol:p.symbol,hasToken:hasTok,inWl:inWl,exclReason:ex,
      ageDays:parseAgeDays(p.listed_at,ms),xTvl:L(Math.max(1,p.tvl_usd)),
      y:(p.mcap_usd&&p.mcap_usd>0)?L(p.mcap_usd):null,g7:p.change_7d!==null?clamp(p.change_7d,-60,120):0,lChains:L(Math.max(1,ch.length))
    };
    if(hasTok){rec.isFittedComp=!ex&&p.mcap_usd>0&&p.tvl_usd>0;traded.push(rec);}
    else if(inWl||!ex){rec.tier=inWl?'Watchlist':(p.tvl_usd>=snap.floor_usd?'Off-list >=$50M':'Early <$50M');ranked.push(rec);}
    else{excluded.push(rec);reasons[ex]=(reasons[ex]||0)+1;}
  });
  return{asOf:snap.as_of,floorUsd:snap.floor_usd,totalCount:snap.protocols.length,watchlistCount:snap.watchlist.length,rankedPreToken:ranked,tradedAll:traded,fittedComps:traded.filter(function(r){return r.isFittedComp;}),excludedNoToken:excluded,reasonCounts:reasons,cleanAll:traded.filter(function(r){return!r.exclReason;}).concat(ranked)};
}

function fitPowerLawOLS(comps){
  var w=fitOLS(comps,function(r){return[1,r.xTvl];}),n=comps.length,my=0,tot=0,res=0;
  comps.forEach(function(r){my+=r.y;});my/=n;
  comps.forEach(function(r){tot+=Math.pow(r.y-my,2);res+=Math.pow(r.y-w[0]-w[1]*r.xTvl,2);});
  return{alpha:w[0],beta:w[1],r2:tot>0?1-res/tot:0,n:n};
}
function evalSplitStats(errs){
  var absE=errs.map(Abs),ln2=L(2),w2=0,sq=0;
  errs.forEach(function(e,i){if(absE[i]<=ln2)w2++;sq+=e*e;});
  return{medX:+E(median(absE)).toFixed(2),within2x:+(100*w2/errs.length).toFixed(1),rmse:+Math.sqrt(sq/errs.length).toFixed(3)};
}

function runValueAblation(comps){
  var dated=comps.filter(function(r){return r.listed_at!==null;}).sort(function(a,b){return a.listed_at<b.listed_at?-1:a.listed_at>b.listed_at?1:(a.slug<b.slug?-1:1);});
  var ordered=comps.slice().sort(function(a,b){return a.slug<b.slug?-1:1;});
  function olsSpec(fFn){return function(tr){var w=fitOLS(tr,fFn);return function(r){return dot(w,fFn(r));};};}
  var specs=[
    ['starter','Starter linear (0.25x TVL x g x age)',false,function(){return function(r){return L(Math.max(1,r.tvl_usd*.25*(1+r.g7/200)*(.6+Math.min(r.ageDays||365,1095)/1095*.4)));};}],
    ['ratio','Constant Mcap/TVL ratio (beta = 1)',false,function(tr){var m=median(tr.map(function(r){return r.y-r.xTvl;}));return function(r){return r.xTvl+m;};}],
    ['power_tvl','Power-law: ln(TVL)',true,olsSpec(function(r){return[1,r.xTvl];})],
    ['tvl_cat','Power-law + EB Category (k=6)',false,function(tr){var w=fitOLS(tr,function(r){return[1,r.xTvl];}),s={},c={};tr.forEach(function(r){s[r.cat]=(s[r.cat]||0)+(r.y-w[0]-w[1]*r.xTvl);c[r.cat]=(c[r.cat]||0)+1;});return function(r){return w[0]+w[1]*r.xTvl+(c[r.cat]?s[r.cat]/(c[r.cat]+6):0);};}],
    ['tvl_age','Power-law + ln(Age)',false,function(tr){var ma=median(tr.filter(function(r){return r.ageDays;}).map(function(r){return r.ageDays;}))||365;return olsSpec(function(r){return[1,r.xTvl,L((r.ageDays||ma)/365.25)];})(tr);}],
    ['tvl_g7','Power-law + 7d TVL Growth',false,olsSpec(function(r){return[1,r.xTvl,r.g7/100];})],
    ['tvl_chains','Power-law + ln(Chains)',false,olsSpec(function(r){return[1,r.xTvl,r.lChains];})]
  ];
  var rows=specs.map(function(sp){
    var loo=comps.map(function(r,i){return r.y-sp[3](comps.slice(0,i).concat(comps.slice(i+1)))(r);});
    var wf=[];for(var j=30;j<dated.length;j++)wf.push(dated[j].y-sp[3](dated.slice(0,j))(dated[j]));
    var cv=[];for(var f=0;f<10;f++){var fn=sp[3](ordered.filter(function(_,q){return q%10!==f;}));ordered.filter(function(_,q){return q%10===f;}).forEach(function(r){cv.push(r.y-fn(r));});}
    return{id:sp[0],label:sp[1],kept:sp[2],loo:evalSplitStats(loo),wf:evalSplitStats(wf),cv10:evalSplitStats(cv),looErrs:sp[2]?loo:null};
  });
  return{rows:rows,nLoo:comps.length,nWf:Math.max(0,dated.length-30)};
}

function fitLogitCore(tr,opt){
  var catK=6,l2=1,pos=0,cp={},cc={};
  tr.forEach(function(r){if(r.hasToken){pos++;cp[r.cat]=(cp[r.cat]||0)+1;}cc[r.cat]=(cc[r.cat]||0)+1;});
  var bp=pos/tr.length,bLo=L(clamp(bp,1e-4,1-1e-4)/(1-clamp(bp,1e-4,1-1e-4))),cLo={};
  Object.keys(cc).forEach(function(c){var ps=((cp[c]||0)+catK*bp)/(cc[c]+catK);cLo[c]=L(ps/(1-ps))-bLo;});
  function feat(aYr,xTvl,cat,lCh){var v=[1,L(Math.max(.05,aYr))];if(opt.tvl)v.push(xTvl-17.5);if(opt.cat)v.push(cLo[cat]||0);if(opt.chains)v.push(lCh||0);return v;}
  var X=tr.map(function(r){return feat(r.ageDays/365.25,r.xTvl,r.cat,r.lChains);}),k=X[0].length,w=new Array(k).fill(0);
  for(var s=0;s<30;s++){
    var g=new Array(k).fill(0),H=[];for(var i=0;i<k;i++)H.push(new Array(k).fill(0));
    for(var n=0;n<tr.length;n++){
      var xi=X[n],p=sigm(dot(w,xi)),er=p-(tr[n].hasToken?1:0),wt=p*(1-p);
      for(var a=0;a<k;a++){g[a]+=er*xi[a];for(var b=0;b<k;b++)H[a][b]+=wt*xi[a]*xi[b];}
    }
    for(var d=1;d<k;d++){g[d]+=l2*w[d];H[d][d]+=l2;}
    var dw=solveLinear(H,g);for(var d2=0;d2<k;d2++)w[d2]-=dw[d2];
  }
  return{w:w,baseP:bp,catLo:cLo,feat:feat,cumProb:function(aYr,xTvl,cat){return sigm(dot(w,feat(aYr,xTvl,cat)));}};
}

function runLaunchOddsAblation(cleanAll){
  var dated=cleanAll.filter(function(r){return r.ageDays!==null;}).sort(function(a,b){return a.slug<b.slug?-1:1;});
  var bp=dated.filter(function(r){return r.hasToken;}).length/dated.length,baseBrier=0;
  dated.forEach(function(r){var y=r.hasToken?1:0;baseBrier+=(y-bp)*(y-bp);});baseBrier/=dated.length;
  var cfgs=[
    ['age','Age only: ln(Age)',{tvl:false,cat:false,chains:false},false],
    ['age_tvl','ln(Age) + ln(TVL)',{tvl:true,cat:false,chains:false},false],
    ['age_cat','ln(Age) + EB Category',{tvl:false,cat:true,chains:false},false],
    ['age_tvl_cat','ln(Age) + ln(TVL) + EB Category',{tvl:true,cat:true,chains:false},true],
    ['full_ch','Full + ln(Chains)',{tvl:true,cat:true,chains:true},false]
  ];
  var abl=cfgs.map(function(c){
    var bs=0,ll=0,opt=c[2];
    for(var f=0;f<10;f++){
      var m=fitLogitCore(dated.filter(function(_,i){return i%10!==f;}),opt);
      dated.filter(function(_,i){return i%10===f;}).forEach(function(r){
        var y=r.hasToken?1:0,p=sigm(dot(m.w,m.feat(r.ageDays/365.25,r.xTvl,r.cat,r.lChains)));
        bs+=(y-p)*(y-p);ll-=y*L(Math.max(1e-6,p))+(1-y)*L(Math.max(1e-6,1-p));
      });
    }
    var cvB=bs/dated.length;
    return{id:c[0],label:c[1],kept:c[3],brier:+cvB.toFixed(4),bssPct:+(100*(1-cvB/baseBrier)).toFixed(1),logLoss:+(ll/dated.length).toFixed(4)};
  });
  var ageBuckets=[['0-1y',0,365],['1-2y',365,730],['2-3y',730,1095],['3y+',1095,99999]].map(function(b){
    var sub=dated.filter(function(r){return r.ageDays>=b[1]&&r.ageDays<b[2];}),tok=sub.filter(function(r){return r.hasToken;}).length;
    return{label:b[0],n:sub.length,tok:tok,ratePct:sub.length?+(100*tok/sub.length).toFixed(1):0};
  });
  var byC={};cleanAll.forEach(function(r){if(!byC[r.cat])byC[r.cat]={cat:r.cat,n:0,tok:0};byC[r.cat].n++;if(r.hasToken)byC[r.cat].tok++;});
  var catRates=Object.keys(byC).map(function(k){var o=byC[k];return{cat:o.cat,n:o.n,tok:o.tok,ratePct:+(100*o.tok/o.n).toFixed(1)};}).filter(function(o){return o.n>=10;}).sort(function(a,b){return b.ratePct-a.ratePct;});
  return{model:fitLogitCore(dated,{tvl:true,cat:true,chains:false}),baseBrier:+baseBrier.toFixed(4),bestBrier:abl[3].brier,bestBssPct:abl[3].bssPct,ablation:abl,ageBuckets:ageBuckets,catRates:catRates,nDated:dated.length};
}

function survivalLaunchOdds(ageYr,xTvl,cat,horYr,oddsModel){
  var f0=oddsModel.cumProb(ageYr,xTvl,cat),f1=oddsModel.cumProb(ageYr+horYr,xTvl,cat);
  return clamp((f1-f0)/Math.max(.05,1-f0),.02,.95);
}

function computeConformalAndBootstrap(comps,pretoken,valModel,oddsModel,looErrs,medPreAge,horYr){
  var q10=quantile(looErrs,.1),q25=quantile(looErrs,.25),q75=quantile(looErrs,.75),q90=quantile(looErrs,.9);
  var in50=looErrs.filter(function(e){return e>=q25&&e<=q75;}).length,in80=looErrs.filter(function(e){return e>=q10&&e<=q90;}).length;
  var mults={p10:+E(q10).toFixed(3),p25:+E(q25).toFixed(3),p75:+E(q75).toFixed(3),p90:+E(q90).toFixed(3),cov50Pct:+(100*in50/looErrs.length).toFixed(1),cov80Pct:+(100*in80/looErrs.length).toFixed(1)};
  var B=200,n=comps.length,seed=20261114;
  function rnd(){seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;}
  var rowOdds=pretoken.map(function(r){return survivalLaunchOdds((r.ageDays||medPreAge)/365.25,r.xTvl,r.cat,horYr,oddsModel);});
  var betas=new Array(B),ranks=pretoken.map(function(){return new Array(B);});
  for(var b=0;b<B;b++){
    var sx=0,sy=0,sxx=0,sxy=0;
    for(var s=0;s<n;s++){var c=comps[Math.floor(rnd()*n)];sx+=c.xTvl;sy+=c.y;sxx+=c.xTvl*c.xTvl;sxy+=c.xTvl*c.y;}
    var mx=sx/n,my=sy/n,bb=(sxy-n*mx*my)/Math.max(1e-9,sxx-n*mx*mx),aa=my-bb*mx;betas[b]=bb;
    pretoken.map(function(r,p){return{i:p,v:E(aa+bb*r.xTvl)*rowOdds[p]};}).sort(function(u,v){return v.v-u.v;}).forEach(function(o,rk){ranks[o.i][b]=rk+1;});
  }
  return{mults:mults,betaLo:+quantile(betas,.05).toFixed(3),betaHi:+quantile(betas,.95).toFixed(3),rankRanges:ranks.map(function(a){return[M(quantile(a,.05)),M(quantile(a,.95))];})};
}

function findNearestPeers(proto,comps,k){
  return comps.map(function(c){return{slug:c.slug,name:c.name,symbol:c.symbol,category:c.cat,tvl_usd:c.tvl_usd,mcap_usd:c.mcap_usd,dist:Abs(c.xTvl-proto.xTvl)+(c.cat===proto.cat?0:1.35)};}).sort(function(a,b){return a.dist-b.dist;}).slice(0,k||4);
}

function evaluateFarmPlan(row,params){
  var p=params||{},cap=p.capitalUsd||10000,dropPct=p.dropSharePct||8,holdDays=p.holdDays||90,dil=p.dilutionMult||1,apr=p.tbillAprPct||4.5;
  var prof=CATP[row.category]||CATP.Default,chains=row.chains&&row.chains.length?row.chains:['Ethereum'],bestChain=chains[0],bestGas=CHAIN_GAS[bestChain]||.25;
  for(var i=1;i<chains.length;i++){var g=CHAIN_GAS[chains[i]]||.25;if(g<bestGas){bestGas=g;bestChain=chains[i];}}
  var hasEthAlt=bestChain!=='Ethereum'&&chains.indexOf('Ethereum')>=0,gas=+(bestGas*prof.n).toFixed(2),hrs=+((prof.setM+prof.cadM*(holdDays/90))/60).toFixed(2);
  var actTvl=Math.max(1e6,row.tvl_usd)*(1+clamp(row.change_7d||0,-30,80)/200)*prof.act*dil;
  function calc(c,d){var gross=(c/actTvl)*(row.implied_value_usd*(d/100)),opp=c*(apr/100)*(holdDays/365),net=gross-gas-opp;return{grossEv:+gross.toFixed(2),oppCost:+opp.toFixed(2),netEv:+net.toFixed(2),netPerHr:+(net/Math.max(.25,hrs)).toFixed(2)};}
  var base=calc(cap,dropPct),netRate=(row.implied_value_usd*(dropPct/100)/actTvl)-(apr/100)*(holdDays/365),be=netRate>0?M(gas/netRate):null;
  var verdict=(base.netEv>0&&base.netPerHr>=45)?'FARM':(base.netEv>0?'MARGINAL':'SKIP'),caps=[2500,10000,25000],drops=[4,8,14];
  var matrix=drops.map(function(dp){return{dropPct:dp,cells:caps.map(function(cp){return calc(cp,dp).netEv;})};});
  var routeCaution=hasEthAlt?'Use '+bestChain+' (~$'+bestGas.toFixed(2)+'/tx) vs Ethereum (~$4.20/tx) to save ~$'+((4.2-bestGas)*prof.n).toFixed(2)+'.':'Run on '+bestChain+' (~$'+bestGas.toFixed(2)+'/tx) via clean wallet.';
  var tvlNote=(row.change_7d!==null&&row.change_7d>20)?'+'+row.change_7d.toFixed(1)+'% 7d TVL spike dilutes points; ladder entry.':'Track 7d TVL and points share weekly.';
  var stopRule='Exit if '+row.name+' TVL jumps >2.5x without drop boost, exploit fires, or net/hr <$20/h.';
  var fundStep=verdict==='SKIP'?'FUND: SKIP at $'+cap.toLocaleString('en-US')+' on '+bestChain+' (net EV '+(base.netEv<0?'-$'+Abs(base.netEv).toFixed(2):'$'+base.netEv.toFixed(2))+' vs '+apr+'% T-bill; BE '+(be?'$'+be.toLocaleString('en-US'):'negative carry')+'). [$0.00, 5m]':'FUND: Stage $'+cap.toLocaleString('en-US')+' on '+bestChain+' (BE '+(be?'$'+be.toLocaleString('en-US'):'N/A')+'). [$'+(bestGas*2).toFixed(2)+', 15m]';
  var steps=[
    'SETUP: '+routeCaution+' [$'+(bestGas*2).toFixed(2)+', 15m]',
    'VERIFY: Audit '+row.name+' contracts, timelock, and live points rules. [$0.00, 10m]',
    fundStep,
    'CORE: '+prof.core+' on '+row.name+'. [$'+(bestGas*2).toFixed(2)+', 25m]',
    'CADENCE: '+prof.loop+' over '+holdDays+'d. [$'+(bestGas*Math.max(1,prof.n-7)).toFixed(2)+', '+M(prof.cadM*(holdDays/90))+'m]',
    'RISK: '+prof.risk+'; '+tvlNote+' [$0.00, 10m]',
    'EXIT: '+stopRule+' [$'+bestGas.toFixed(2)+', 15m]'
  ];
  return{bestChain:bestChain,bestGas:bestGas,hasEthAlt:hasEthAlt,actions:prof.n,gasCost:gas,oppCost:base.oppCost,grossEv:base.grossEv,netEv:base.netEv,totalHours:hrs,netPerHr:base.netPerHr,breakEvenDeposit:be,verdict:verdict,activeRatio:prof.act,matrix:matrix,matrixCaps:caps,routeCaution:routeCaution,stopRule:stopRule,steps:steps};
}

function computeBoardSeal(rows){
  var h=2166136261;
  for(var i=0;i<rows.length;i++){var s=rows[i].rank+':'+rows[i].slug+':'+rows[i].implied_value_usd+';';for(var j=0;j<s.length;j++){h^=s.charCodeAt(j);h=Math.imul(h,16777619);}}
  return('00000000'+(h>>>0).toString(16)).slice(-8);
}
function verifyBoardIntegrity(radar){
  var rows=radar.rows,wl=0,mono=true,badS=0,pos=true;
  for(var i=0;i<rows.length;i++){var r=rows[i];if(r.in_watchlist)wl++;if(r.rank!==i+1||r.implied_value_usd<=0)pos=false;if(i>0&&r.implied_value_usd>rows[i-1].implied_value_usd)mono=false;if(!r.farm_steps||r.farm_steps.length<3||r.farm_steps.length>12)badS++;}
  var sumP=rows.length+radar.traded_count+radar.excluded_count,sealNow=computeBoardSeal(rows);
  return{partitionOk:sumP===radar.total_protocols,watchlistOk:wl===radar.watchlist_count,monotonicOk:mono&&pos,sealOk:sealNow===radar.board_seal,stepsOk:badS===0,allOk:sumP===radar.total_protocols&&wl===radar.watchlist_count&&mono&&pos&&sealNow===radar.board_seal&&badS===0};
}

function buildAll(snapshot,horizonYears){
  var H=horizonYears||2,part=partitionUniverse(snapshot),valModel=fitPowerLawOLS(part.fittedComps);
  var valAbl=runValueAblation(part.fittedComps),keptRow=valAbl.rows.filter(function(r){return r.kept;})[0],oddsInfo=runLaunchOddsAblation(part.cleanAll);
  var medPreAge=median(part.rankedPreToken.filter(function(r){return r.ageDays!==null;}).map(function(r){return r.ageDays;}))||365;
  var scored=part.rankedPreToken.map(function(r){
    var aYr=(r.ageDays!==null?r.ageDays:medPreAge)/365.25,valL=E(valModel.alpha+valModel.beta*r.xTvl),pL=survivalLaunchOdds(aYr,r.xTvl,r.cat,H,oddsInfo.model);
    return{raw:r,aYr:+aYr.toFixed(2),valIfLaunch:M(valL),pLaunch:+pL.toFixed(4),implied:posI(valL*pL)};
  }).sort(function(a,b){return b.implied-a.implied||b.raw.tvl_usd-a.raw.tvl_usd||(a.raw.slug<b.raw.slug?-1:1);});

  var conf=computeConformalAndBootstrap(part.fittedComps,part.rankedPreToken,valModel,oddsInfo.model,keptRow.looErrs,medPreAge,H),rrBySlug=Object.create(null);
  part.rankedPreToken.forEach(function(r,i){rrBySlug[r.slug]=conf.rankRanges[i];});
  var defP={capitalUsd:10000,dropSharePct:8,holdDays:90,dilutionMult:1,tbillAprPct:4.5},board=[],rows=[];
  scored.forEach(function(s,idx){
    var p=s.raw,imp=s.implied,m=conf.mults;
    var ro={rank:idx+1,slug:p.slug,name:p.name,category:p.cat,chains:p.chains,tvl_usd:p.tvl_usd,change_7d:p.change_7d,listed_at:p.listed_at,age_days:p.ageDays,age_yr:s.aYr,in_watchlist:p.inWl,tier:p.tier,val_if_launch_usd:s.valIfLaunch,launch_prob:s.pLaunch,implied_value_usd:imp,p10_usd:posI(imp*m.p10),p25_usd:posI(imp*m.p25),p75_usd:posI(imp*m.p75),p90_usd:posI(imp*m.p90),rank_range:rrBySlug[p.slug]||[idx+1,idx+1],peers:findNearestPeers(p,part.fittedComps,4)};
    var fp=evaluateFarmPlan(ro,defP);ro.farm_steps=fp.steps;rows.push(ro);
    board.push({rank:ro.rank,slug:ro.slug,name:ro.name,category:ro.category,chains:ro.chains,tvl_usd:ro.tvl_usd,change_7d:ro.change_7d,listed_at:ro.listed_at,in_watchlist:ro.in_watchlist,val_if_launch_usd:ro.val_if_launch_usd,launch_prob:ro.launch_prob,implied_value_usd:ro.implied_value_usd,p25_usd:ro.p25_usd,p75_usd:ro.p75_usd,farm_verdict:fp.verdict,net_ev_usd:fp.netEv,net_per_hr:fp.netPerHr,farm_steps:fp.steps});
  });
  var tradedView=part.tradedAll.slice().sort(function(a,b){return(b.mcap_usd||0)-(a.mcap_usd||0)||b.tvl_usd-a.tvl_usd;}).map(function(r){return{slug:r.slug,name:r.name,symbol:r.symbol,category:r.cat,chains:r.chains,tvl_usd:r.tvl_usd,mcap_usd:r.mcap_usd,listed_at:r.listed_at,is_comp:!!r.isFittedComp,pred_mcap_usd:M(E(valModel.alpha+valModel.beta*r.xTvl))};});
  var excludedView=part.excludedNoToken.slice().sort(function(a,b){return b.tvl_usd-a.tvl_usd;}).map(function(r){return{slug:r.slug,name:r.name,category:r.cat,chains:r.chains,tvl_usd:r.tvl_usd,listed_at:r.listed_at,reason:r.exclReason};});
  return{
    board:board,
    radar:{
      as_of:snapshot.as_of,floor_usd:snapshot.floor_usd,horizon_years:H,total_protocols:part.totalCount,watchlist_count:part.watchlistCount,ranked_count:rows.length,
      offlist_high_tvl:part.rankedPreToken.filter(function(r){return!r.inWl&&r.tvl_usd>=snapshot.floor_usd;}).length,
      early_count:part.rankedPreToken.filter(function(r){return r.tvl_usd<snapshot.floor_usd;}).length,traded_count:tradedView.length,fitted_comp_count:part.fittedComps.length,excluded_count:excludedView.length,
      reason_counts:part.reasonCounts,board_seal:computeBoardSeal(rows),
      value_model:{alpha:+valModel.alpha.toFixed(4),beta:+valModel.beta.toFixed(4),beta_ci90:[conf.betaLo,conf.betaHi],r2:+valModel.r2.toFixed(4),n_comps:valModel.n,n_wf:valAbl.nWf,conformal:conf.mults,ablation:valAbl.rows.map(function(r){return{id:r.id,label:r.label,kept:r.kept,loo:r.loo,wf:r.wf,cv10:r.cv10};})},
      odds_model:{weights:oddsInfo.model.w.map(function(x){return+x.toFixed(4);}),baseP:+oddsInfo.model.baseP.toFixed(4),catLo:oddsInfo.model.catLo,baseBrier:oddsInfo.baseBrier,bestBrier:oddsInfo.bestBrier,bestBssPct:oddsInfo.bestBssPct,nDated:oddsInfo.nDated,ablation:oddsInfo.ablation,ageBuckets:oddsInfo.ageBuckets,catRates:oddsInfo.catRates},
      rows:rows,traded:tradedView,excluded:excludedView
    }
  };
}

root.RadarEngine={CHAIN_GAS:CHAIN_GAS,partitionUniverse:partitionUniverse,fitPowerLawOLS:fitPowerLawOLS,runValueAblation:runValueAblation,runLaunchOddsAblation:runLaunchOddsAblation,survivalLaunchOdds:survivalLaunchOdds,computeConformalAndBootstrap:computeConformalAndBootstrap,findNearestPeers:findNearestPeers,evaluateFarmPlan:evaluateFarmPlan,computeBoardSeal:computeBoardSeal,verifyBoardIntegrity:verifyBoardIntegrity,buildAll:buildAll};
})(typeof globalThis!=='undefined'?globalThis:this);
