import { getOperationalTodayISO } from "../ai/operationalDate.js";
import { supabase } from "../supabase.js";
import { AC, BLK, FSTOPS, JA, MN, PW, RF, WK } from "./data.js";
import { recommendStops } from "../lib/stopPlanner.js";
import {
  airportTimezoneFromAirport,
  findAirport,
  formatUtcLabel,
  localDateTimeToUtcMs,
  normalizeDateIso,
  parseTimeToMinutes,
  resolveAirportTimezone,
  utcMsToLocalTime,
} from "../lib/timezones.js";

export function tds(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
export function fdt(d){var n=normalizeDateIso(d);var x=new Date((n||d)+"T12:00:00");return WK[x.getDay()]+" "+x.getDate()+" "+MN[x.getMonth()];}
export function ftm(t){if(!t||t==="STBY")return"STBY";var mins=parseTimeToMinutes(t);if(!Number.isFinite(mins))return String(t);var h=Math.floor(mins/60),m=String(mins%60).padStart(2,"0"),ap=h>=12?"PM":"AM";if(h>12)h-=12;if(h===0)h=12;return h+":"+m+" "+ap;}
export function findAP(v){return findAirport(v);}
function hv(a,b,c,d){var R=3440.065,pi=Math.PI,dx=(c-a)*pi/180,dy=(d-b)*pi/180,sa=Math.sin(dx/2),sb=Math.sin(dy/2);return R*2*Math.atan2(Math.sqrt(sa*sa+Math.cos(a*pi/180)*Math.cos(c*pi/180)*sb*sb),Math.sqrt(1-sa*sa-Math.cos(a*pi/180)*Math.cos(c*pi/180)*sb*sb));}
export function gmd(y,m){var f=new Date(y,m,1),l=new Date(y,m+1,0),ds=[],sp=(f.getDay()+6)%7;for(var i=sp-1;i>=0;i--)ds.push({d:new Date(y,m,-i),o:1});for(var j=1;j<=l.getDate();j++)ds.push({d:new Date(y,m,j),o:0});while(ds.length%7)ds.push({d:new Date(y,m+1,ds.length-l.getDate()-sp+1),o:1});return ds;}

export function calcR(orig,dest,id,px,bg){
  var a=AC[id],oa=findAP(orig),da=findAP(dest);if(!oa||!da)return null;
  px=px||{};bg=bg||0;
  var gc=hv(oa.la,oa.lo,da.la,da.lo),aw=Math.round(gc*RF),em=Math.round(aw/a.kts*60),bm=em+BLK;
  var trip=aw/a.kts*a.gph,fuel=trip+(100/a.kts)*a.gph+(45/60)*a.gph+trip*0.05;
  var fl=Math.ceil(fuel)*JA,ok=fuel<=a.maxGal;
  var pxW=(px.m||0)*PW.m+(px.w||0)*PW.w+(px.c||0)*PW.c,tw=Math.round(a.bow+a.crew+pxW+bg+fl);
  var wt={tw:tw,mt:a.mtow,mg:a.mtow-tw,ov:tw>a.mtow,tp:(px.m||0)+(px.w||0)+(px.c||0),pW:Math.round(pxW)};
  var baselineMaxNm=Math.round(((a.maxGal-(100/a.kts)*a.gph-(45/60)*a.gph)/a.gph)*a.kts/RF*0.95);
  var usefulLoad=Math.max(1,a.mtow-(a.bow+a.crew));
  var payloadLbs=pxW+bg;
  var payloadRatio=Math.max(0,payloadLbs/usefulLoad);
  var rangeFactor=Math.max(0.72,1-(Math.max(0,payloadRatio-0.55)*0.35));
  var adjustedMaxNm=Math.round(baselineMaxNm*rangeFactor);
  if(gc<=adjustedMaxNm&&ok)return{dir:true,gc:Math.round(gc),aw:aw,em:em,bm:bm,fl:Math.round(fl),wt:wt,stops:[],recommendations:[],isInternational:oa.co!==da.co,meta:{adjustedMaxNm:adjustedMaxNm,baselineMaxNm:baselineMaxNm,payloadLbs:Math.round(payloadLbs)}};

  function isLegFuelViable(legNm){
    var legTrip=legNm*RF/a.kts*a.gph;
    var legFuel=legTrip+(100/a.kts)*a.gph+(45/60)*a.gph+legTrip*0.05;
    return legFuel<=a.maxGal;
  }

  var stopPlan=recommendStops({
    origin:orig,
    destination:dest,
    originAirport:oa,
    destinationAirport:da,
    originCountry:oa.co,
    destinationCountry:da.co,
    aircraft:a,
    candidateAirports:FSTOPS,
    greatCircleNm:gc,
    adjustedMaxNm:adjustedMaxNm,
    minLegNm:220,
    maxStops:3,
    payloadLbs:payloadLbs,
    fuelWeightPerGal:JA,
    contingencyRate:0.05,
    routeFactor:RF,
    blockMinutes:BLK,
    distanceNm:function(from,to){
      var afrom=from===orig?oa:(from===dest?da:from);
      var ato=to===orig?oa:(to===dest?da:to);
      if(!afrom||!ato||!Number.isFinite(afrom.la)||!Number.isFinite(afrom.lo)||!Number.isFinite(ato.la)||!Number.isFinite(ato.lo))return Number.POSITIVE_INFINITY;
      return hv(afrom.la,afrom.lo,ato.la,ato.lo);
    },
    isFuelViableForLeg:isLegFuelViable,
  });
  var recommendations=stopPlan.recommendations||[];
  var primary=recommendations[0]||null;
  var firstLeg=primary&&Array.isArray(primary.legs)&&primary.legs.length>0?primary.legs[0]:null;
  var firstLegFuelLbs=firstLeg?Number(firstLeg.plannedFuelLbs||0):Math.round(fl);
  var wtByFirstLeg={tw:Math.round(a.bow+a.crew+pxW+bg+firstLegFuelLbs),mt:a.mtow,mg:Math.round(a.mtow-(a.bow+a.crew+pxW+bg+firstLegFuelLbs)),ov:Math.round(a.bow+a.crew+pxW+bg+firstLegFuelLbs)>a.mtow,tp:(px.m||0)+(px.w||0)+(px.c||0),pW:Math.round(pxW)};

  return{
    dir:false,
    gc:Math.round(gc),
    aw:aw,
    em:em,
    bm:bm,
    fl:firstLegFuelLbs,
    wt:wtByFirstLeg,
    stops:primary?primary.stops:[],
    recommendations:recommendations,
    isInternational:!!stopPlan.isInternational,
    meta:{adjustedMaxNm:adjustedMaxNm,baselineMaxNm:baselineMaxNm,payloadLbs:Math.round(payloadLbs),routeDebug:stopPlan.debug||null}
  };
}

export function getPos(fs, todayIso){var t=todayIso||getOperationalTodayISO(),pos={};Object.keys(AC).forEach(function(id){var p=fs.filter(function(f){return f.ac===id&&f.date<=t&&f.st!=="canc";}).sort(function(a,b){return b.date.localeCompare(a.date)||String(b.time).localeCompare(String(a.time));});pos[id]=p.length?p[0].dest:AC[id].base;});return pos;}

function googleUtcStamp(utcMs){var d=new Date(utcMs);if(!Number.isFinite(d.getTime()))return"";return d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");}

export function makeCalUrl(f){
  var a=AC[f.ac];
  var depDate=normalizeDateIso(f.date)||f.date;
  var depMinutes=parseTimeToMinutes(f.time);
  var depTz=resolveAirportTimezone(f.orig,{fallbackTimeZone:"America/Merida"}).timeZone;
  if(!depDate||!Number.isFinite(depMinutes)||!depTz)return "https://www.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(f.ac+" "+f.orig+" a "+f.dest);
  var startUtcMs=localDateTimeToUtcMs(depDate,depMinutes,depTz);
  var rt=calcR(f.orig,f.dest,f.ac),dur=rt?rt.bm:60;
  var endUtcMs=startUtcMs+dur*60*1000;
  return "https://www.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(f.ac+" "+f.orig+" a "+f.dest)+"&dates="+googleUtcStamp(startUtcMs)+"/"+googleUtcStamp(endUtcMs)+"&details="+encodeURIComponent(a.type+"\n"+f.orig+"->"+f.dest+"\n"+(f.rb||""));
}

export function apTz(ap){return airportTimezoneFromAirport(ap);}

export function etaText(f){
  if(!f||!f.date||!f.time||f.time==="STBY")return null;
  var rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);var bm=rt?rt.bm:60;
  var origTz=resolveAirportTimezone(f.orig,{fallbackTimeZone:"America/Merida"}).timeZone;
  var destTz=resolveAirportTimezone(f.dest,{fallbackTimeZone:origTz||"America/Merida"}).timeZone;
  var depDate=normalizeDateIso(f.date);var depMinutes=parseTimeToMinutes(f.time);
  if(!depDate||!Number.isFinite(depMinutes)||!origTz||!destTz)return null;
  var depUtc=localDateTimeToUtcMs(depDate,depMinutes,origTz);if(!Number.isFinite(depUtc))return null;
  var arrUtc=depUtc+bm*60000;
  var local=utcMsToLocalTime(arrUtc,destTz,"es-MX");
  if(!local)return null;
  return local+" ("+formatUtcLabel(arrUtc)+")";
}

export function etaLocalUtc(f){
  if(!f||!f.date||!f.time||f.time==="STBY")return null;
  var rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);var bm=rt?rt.bm:60;
  var origTz=resolveAirportTimezone(f.orig,{fallbackTimeZone:"America/Merida"}).timeZone;
  var destTz=resolveAirportTimezone(f.dest,{fallbackTimeZone:origTz||"America/Merida"}).timeZone;
  var depDate=normalizeDateIso(f.date);var depMinutes=parseTimeToMinutes(f.time);
  if(!depDate||!Number.isFinite(depMinutes)||!origTz||!destTz)return null;
  var depUtc=localDateTimeToUtcMs(depDate,depMinutes,origTz);if(!Number.isFinite(depUtc))return null;
  var arrUtc=depUtc+bm*60000;
  var local=utcMsToLocalTime(arrUtc,destTz,"es-MX");
  if(!local)return null;
  return {local:local,utc:formatUtcLabel(arrUtc)};
}

export async function loadFlightsFromDb() {
  const { data, error } = await supabase.from("flights").select("*").order("date", { ascending: true }).order("time", { ascending: true });
  if (error) throw error;
  return (data || []).map((f) => ({
    ...f,
    pm: Number(f.pm || 0),
    pw: Number(f.pw || 0),
    pc: Number(f.pc || 0),
    bg: Number(f.bg || 0),
    estimated_fixed_cost_usd: Number(f.estimated_fixed_cost_usd || 0),
    estimated_variable_cost_usd: Number(f.estimated_variable_cost_usd || 0),
    estimated_total_cost_usd: Number(f.estimated_total_cost_usd || 0),
    estimated_cost_hours: Number(f.estimated_cost_hours || 0),
  }));
}

export async function loadMaintFromDb() {
  const { data, error } = await supabase.from("aircraft_status").select("*");
  if (error) throw error;
  const mapped = {};
  const plan = {};
  (data || []).forEach((row) => {
    mapped[row.ac] = row.status;
    if (row.maintenance_start_date || row.maintenance_end_date) {
      plan[row.ac] = { from: row.maintenance_start_date || "", to: row.maintenance_end_date || "" };
    }
  });
  return { statusByAc: mapped, planByAc: plan };
}
