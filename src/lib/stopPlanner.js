function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

const HANDLING_SCORES={basic:0.45,good:0.72,premium:1};
const AIRPORT_META_OVERRIDES={
  MMMD:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:11483,is_international_entry:true},
  MMUN:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:11483,is_international_entry:true},
  MMCZ:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:9843,is_international_entry:true},
  KMIA:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:13016,is_international_entry:true},
  KOPF:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:8002,is_international_entry:true},
  KFXE:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:6000,is_international_entry:true},
  KHOU:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:7602,is_international_entry:true},
  MYNN:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:11000,is_international_entry:true},
  MKJP:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:8911,is_international_entry:true},
  MBPV:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:9200,is_international_entry:true},
  MZBZ:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:7100,is_international_entry:true},
  MGGT:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:9772,is_international_entry:true},
  KSAT:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:8505,is_international_entry:true},
  MMMY:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:11500,is_international_entry:true},
  MPTO:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:10000,is_international_entry:true},
  MDPC:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:10171,is_international_entry:true},
  KTPA:{has_customs:true,has_handling:true,handling_quality:"good",has_jet_a:true,is_exec_friendly:true,runway_length_ft:11002,is_international_entry:true},
  KFLL:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:9000,is_international_entry:true},
  MMGL:{has_customs:true,has_handling:true,handling_quality:"premium",has_jet_a:true,is_exec_friendly:true,runway_length_ft:13123,is_international_entry:true}
};

function normalizeMeta(stop){
  var fromData={
    has_customs:stop?.has_customs,
    has_handling:stop?.has_handling,
    handling_quality:stop?.handling_quality,
    has_jet_a:stop?.has_jet_a,
    is_exec_friendly:stop?.is_exec_friendly,
    runway_length_ft:stop?.runway_length_ft,
    country_code:stop?.country_code||stop?.co,
    is_international_entry:stop?.is_international_entry,
    operational_notes:stop?.operational_notes||"",
  };
  var ov=AIRPORT_META_OVERRIDES[String(stop?.i4||"").toUpperCase()]||{};
  var merged=Object.assign({},fromData,ov,fromData);
  var quality=String(merged.handling_quality||"basic").toLowerCase();
  if(!HANDLING_SCORES[quality])quality="basic";
  return {
    has_customs:Boolean(merged.has_customs),
    has_handling:Boolean(merged.has_handling),
    handling_quality:quality,
    has_jet_a:Boolean(merged.has_jet_a),
    is_exec_friendly:Boolean(merged.is_exec_friendly),
    runway_length_ft:Number(merged.runway_length_ft||0),
    country_code:String(merged.country_code||stop?.co||"").toUpperCase(),
    is_international_entry:Boolean(merged.is_international_entry),
    operational_notes:String(merged.operational_notes||"")
  };
}

function avg(arr){if(!arr.length)return 0;return arr.reduce(function(a,b){return a+b;},0)/arr.length;}

function buildReason(route,isInternational){
  if(route.stopCount===1&&isInternational&&route.customsScore>=0.8&&route.handlingScore>=0.72)return"Mejor opción por aduana y handling";
  if(isInternational&&route.speedScore>=0.7&&route.customsScore>=0.7)return"Más rápida con entrada internacional";
  if(route.detourScore>=0.75&&route.handlingScore>=0.6)return"Menor desvío con operación ejecutiva razonable";
  if(route.stopCount===2)return"Única opción realista con dos escalas";
  if(route.stopCount===3)return"Más sólida operacionalmente con tres escalas";
  return"Alternativa balanceada";
}

function scoreRoute(route,context){
  var weights=context.isInternational
    ?{customs:0.35,handling:0.25,speed:0.2,detour:0.1,balance:0.1}
    :{customs:0.15,handling:0.35,speed:0.25,detour:0.15,balance:0.1};
  var base=(route.customsScore*weights.customs)
    +(route.handlingScore*weights.handling)
    +(route.speedScore*weights.speed)
    +(route.detourScore*weights.detour)
    +(route.balanceScore*weights.balance);
  var score=base-route.stopPenalty-route.tightLegPenalty-route.countryPenalty;
  return clamp(score,0,1);
}

function getTopNodes(nodes,limit){return nodes.sort(function(a,b){return b.seedScore-a.seedScore;}).slice(0,limit);}

export function recommendStops(options){
  var airports=Array.isArray(options?.candidateAirports)?options.candidateAirports:[];
  var origin=options?.origin;
  var destination=options?.destination;
  var greatCircleNm=Number(options?.greatCircleNm||0);
  var adjustedMaxNm=Number(options?.adjustedMaxNm||0);
  var routeFactor=Number(options?.routeFactor||1.18);
  var blockMinutes=Number(options?.blockMinutes||20);
  var minLegNm=Number(options?.minLegNm||220);
  var maxStops=Number(options?.maxStops||3);
  var distanceNm=typeof options?.distanceNm==="function"?options.distanceNm:function(){return Number.POSITIVE_INFINITY;};
  var isFuelViableForLeg=typeof options?.isFuelViableForLeg==="function"?options.isFuelViableForLeg:function(){return false;};
  var aircraft=options?.aircraft;
  if(!origin||!destination||!aircraft||!Number.isFinite(greatCircleNm)||greatCircleNm<=0)return{recommendations:[],isInternational:false};

  var originCountry=String(options?.originCountry||"").toUpperCase();
  var destinationCountry=String(options?.destinationCountry||"").toUpperCase();
  var isInternational=originCountry&&destinationCountry?originCountry!==destinationCountry:false;
  var airportByCode={};
  airports.forEach(function(ap){if(ap&&ap.c)airportByCode[ap.c]=ap;});

  var maxDetourByStops={1:0.45,2:0.72,3:0.95};
  var allCandidates=[];
  for(var stopCount=1;stopCount<=maxStops;stopCount++){
    var beam=[{stops:[],countries:[originCountry],nm:0,seedScore:1,currentCode:origin}];
    for(var depth=0;depth<stopCount;depth++){
      var next=[];
      for(var b=0;b<beam.length;b++){
        var state=beam[b];
        var currentAp=state.currentCode===origin?options.originAirport:airportByCode[state.currentCode];
        if(!currentAp)continue;
        for(var i=0;i<airports.length;i++){
          var cand=airports[i];
          if(!cand||!cand.c)continue;
          if(cand.c===origin||cand.c===destination)continue;
          if(state.stops.some(function(s){return s.c===cand.c;}))continue;

          var legNm=distanceNm(currentAp,cand);
          if(!Number.isFinite(legNm)||legNm<minLegNm)continue;
          if(legNm>adjustedMaxNm||!isFuelViableForLeg(legNm))continue;

          var remainNm=distanceNm(cand,options.destinationAirport);
          if(!Number.isFinite(remainNm))continue;
          if(remainNm>(adjustedMaxNm*(stopCount-depth)))continue;

          var rawDetour=((state.nm+legNm+remainNm)/greatCircleNm)-1;
          if(rawDetour>maxDetourByStops[stopCount])continue;

          var meta=normalizeMeta(cand);
          var handlingBase=(meta.has_handling?0.45:0.15)+(HANDLING_SCORES[meta.handling_quality]*0.35)+(meta.is_exec_friendly?0.12:0)+(meta.has_jet_a?0.08:0)+(meta.runway_length_ft>=5200?0.1:0);
          var customsBase=(meta.has_customs?0.6:0)+(meta.is_international_entry?0.25:0)+(meta.country_code&&meta.country_code!==originCountry?0.15:0);
          var seed=(isInternational?(customsBase*0.55+handlingBase*0.45):(handlingBase*0.8+customsBase*0.2));
          next.push({
            stops:state.stops.concat([Object.assign({},cand,{meta:meta})]),
            countries:state.countries.concat([meta.country_code]),
            nm:state.nm+legNm,
            seedScore:state.seedScore*clamp(seed,0.1,1),
            currentCode:cand.c,
          });
        }
      }
      if(!next.length){beam=[];break;}
      beam=getTopNodes(next,28);
    }

    if(!beam.length)continue;

    for(var k=0;k<beam.length;k++){
      var state=beam[k];
      var routePoints=[options.originAirport].concat(state.stops).concat([options.destinationAirport]);
      var legs=[];
      var viable=true;
      var totalNm=0;
      var tightCount=0;
      for(var l=0;l<routePoints.length-1;l++){
        var from=routePoints[l],to=routePoints[l+1];
        var leg=distanceNm(from,to);
        if(!Number.isFinite(leg)||leg<minLegNm||leg>adjustedMaxNm||!isFuelViableForLeg(leg)){viable=false;break;}
        totalNm+=leg;
        if(leg>adjustedMaxNm*0.92)tightCount++;
        legs.push({
          fromCode:from.c,
          fromI4:from.i4,
          toCode:to.c,
          toI4:to.i4,
          nm:Math.round(leg),
          enrouteMinutes:Math.round((leg*routeFactor/aircraft.kts)*60),
          blockMinutes:Math.round((leg*routeFactor/aircraft.kts)*60)+blockMinutes,
        });
      }
      if(!viable)continue;

      var detourRatio=(totalNm/greatCircleNm)-1;
      if(detourRatio>maxDetourByStops[stopCount])continue;

      var stopMeta=state.stops.map(function(s){return s.meta;});
      var firstBorderStop=state.stops.find(function(s){return s.meta.country_code&&s.meta.country_code!==originCountry;});
      var customsScore=isInternational
        ?avg(stopMeta.map(function(m){return (m.has_customs?0.7:0)+(m.is_international_entry?0.3:0);}))+((firstBorderStop&&firstBorderStop.meta.has_customs)?0.12:0)
        :avg(stopMeta.map(function(m){return (m.has_customs?0.55:0.4)+(m.is_international_entry?0.1:0);}));
      customsScore=clamp(customsScore,0,1);

      var handlingScore=avg(stopMeta.map(function(m){
        return (m.has_handling?0.4:0.15)+(HANDLING_SCORES[m.handling_quality]*0.32)+(m.is_exec_friendly?0.16:0)+(m.has_jet_a?0.07:0)+(m.runway_length_ft>=5200?0.05:0);
      }));
      handlingScore=clamp(handlingScore,0,1);

      var enrouteMinutes=legs.reduce(function(sum,leg){return sum+leg.enrouteMinutes;},0);
      var blockTotalMinutes=legs.reduce(function(sum,leg){return sum+leg.blockMinutes;},0);
      var speedScore=clamp((greatCircleNm/Math.max(totalNm,1))*0.7 + (1/(1+(blockTotalMinutes/900)))*0.3,0,1);
      var detourScore=clamp(1-detourRatio,0,1);

      var legNmValues=legs.map(function(leg){return leg.nm;});
      var longest=Math.max.apply(null,legNmValues);
      var shortest=Math.min.apply(null,legNmValues);
      var balanceScore=clamp(1-((longest-shortest)/Math.max(totalNm,1))*1.8,0,1);

      var uniqueCountries=new Set(state.stops.map(function(s){return s.meta.country_code||"";}).filter(Boolean));
      var countryPenalty=(isInternational&&uniqueCountries.size===1&&uniqueCountries.has(originCountry))?0.06:0;
      var stopPenalty=(stopCount-1)*0.06;
      var tightLegPenalty=tightCount*0.035;

      var route={
        stopCount:stopCount,
        stops:state.stops.map(function(s){return {
          c:s.c,i4:s.i4,i3:s.i3,
          customs:s.meta.has_customs,
          handlingQuality:s.meta.handling_quality,
          hasHandling:s.meta.has_handling,
          isExecFriendly:s.meta.is_exec_friendly,
          hasJetA:s.meta.has_jet_a,
          runwayLengthFt:s.meta.runway_length_ft,
          countryCode:s.meta.country_code,
          isInternationalEntry:s.meta.is_international_entry,
          operationalNotes:s.meta.operational_notes,
        };}),
        routeCodes:[origin].concat(state.stops.map(function(s){return s.c;})).concat([destination]),
        routeIcao:[options.originAirport.i4].concat(state.stops.map(function(s){return s.i4;})).concat([options.destinationAirport.i4]),
        legs:legs,
        totalNm:Math.round(totalNm),
        detourRatio:detourRatio,
        enrouteMinutes:enrouteMinutes,
        blockMinutes:blockTotalMinutes,
        customsScore:customsScore,
        handlingScore:handlingScore,
        speedScore:speedScore,
        detourScore:detourScore,
        balanceScore:balanceScore,
        stopPenalty:stopPenalty,
        countryPenalty:countryPenalty,
        tightLegPenalty:tightLegPenalty,
      };
      route.score=scoreRoute(route,{isInternational:isInternational});
      route.reason=buildReason(route,isInternational);
      allCandidates.push(route);
    }
  }

  allCandidates.sort(function(a,b){
    if(b.score!==a.score)return b.score-a.score;
    if(a.stopCount!==b.stopCount)return a.stopCount-b.stopCount;
    return a.blockMinutes-b.blockMinutes;
  });

  var oneStopBest=allCandidates.find(function(r){return r.stopCount===1;});
  var top=allCandidates.slice(0,6);
  if(oneStopBest&&top[0]&&top[0].stopCount>1&&oneStopBest.score>=top[0].score-0.12){
    top=[oneStopBest].concat(top.filter(function(r){return r!==oneStopBest;}));
  }

  var picked=[];
  for(var m=0;m<top.length;m++){
    var cand=top[m];
    if(!picked.length){picked.push(cand);continue;}
    var sameRoute=picked.some(function(p){return p.routeCodes.join("-")===cand.routeCodes.join("-");});
    if(sameRoute)continue;
    picked.push(cand);
    if(picked.length>=2)break;
  }

  if(picked.length===2&&picked[0].reason===picked[1].reason)picked[1].reason="Alternativa balanceada";

  return{recommendations:picked,isInternational:isInternational};
}
