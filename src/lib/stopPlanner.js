function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function recommendStops(options){
  var airports=Array.isArray(options?.candidateAirports)?options.candidateAirports:[];
  var origin=options?.origin;
  var destination=options?.destination;
  var aircraft=options?.aircraft;
  var greatCircleNm=Number(options?.greatCircleNm||0);
  var adjustedMaxNm=Number(options?.adjustedMaxNm||0);
  var minLeg1Nm=Number(options?.minLeg1Nm||250);
  var maxDetourRatio=Number(options?.maxDetourRatio||0.45);
  var distanceNm=typeof options?.distanceNm==="function"?options.distanceNm:function(){return Number.POSITIVE_INFINITY;};
  var isFuelViableForLeg=typeof options?.isFuelViableForLeg==="function"?options.isFuelViableForLeg:function(){return false;};

  if(!origin||!destination||!aircraft||!Number.isFinite(greatCircleNm)||greatCircleNm<=0)return[];

  var ranked=[];
  for(var i=0;i<airports.length;i++){
    var stop=airports[i];
    if(!stop)continue;
    if(stop.c===origin||stop.c===destination)continue;

    var leg1=distanceNm(origin,stop);
    var leg2=distanceNm(stop,destination);
    if(!Number.isFinite(leg1)||!Number.isFinite(leg2))continue;
    if(leg1<minLeg1Nm)continue;

    var totalVia=leg1+leg2;
    var detourRatio=(totalVia/greatCircleNm)-1;
    if(!Number.isFinite(detourRatio)||detourRatio>maxDetourRatio)continue;

    if(leg1>adjustedMaxNm||leg2>adjustedMaxNm)continue;
    if(!isFuelViableForLeg(leg1)||!isFuelViableForLeg(leg2))continue;

    var balanceScore=Math.abs(leg1-leg2)/Math.max(totalVia,1);
    var detourScore=clamp(detourRatio,0,1.2);
    var score=(detourScore*0.65)+(balanceScore*0.35);
    ranked.push({
      c:stop.c,
      i4:stop.i4,
      i3:stop.i3,
      la:stop.la,
      lo:stop.lo,
      leg1Nm:Math.round(leg1),
      leg2Nm:Math.round(leg2),
      bm1:Math.round(leg1*options.routeFactor/aircraft.kts*60+options.blockMinutes),
      bm2:Math.round(leg2*options.routeFactor/aircraft.kts*60+options.blockMinutes),
      detourRatio:detourRatio,
      balanceScore:balanceScore,
      score:score,
      recommendationReason:""
    });
  }

  ranked.sort(function(a,b){
    if(a.score!==b.score)return a.score-b.score;
    return (a.leg1Nm+a.leg2Nm)-(b.leg1Nm+b.leg2Nm);
  });

  var top=ranked.slice(0,2);
  if(top.length===0)return[];

  var minDetour=Math.min.apply(null,top.map(function(s){return s.detourRatio;}));
  var minBalance=Math.min.apply(null,top.map(function(s){return s.balanceScore;}));
  top.forEach(function(s,idx){
    if(s.detourRatio===minDetour&&idx===0)s.recommendationReason="Menor desvío";
    else if(s.balanceScore===minBalance)s.recommendationReason="Tramos más equilibrados";
    else s.recommendationReason="Más eficiente";
  });
  if(top[0]&&top[0].recommendationReason!="Más eficiente")top[0].recommendationReason="Más eficiente";

  return top;
}
