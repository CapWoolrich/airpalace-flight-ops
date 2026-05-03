import { calcR, etaLocalUtc } from "./helpers.js";
import { findAirportByAny } from "../lib/airports.js";
import { formatUtcLabel, localDateTimeToUtcMs, normalizeDateIso, parseTimeToMinutes, resolveAirportTimezone } from "../lib/timezones.js";

export function resolveFlightAwareUrl(aircraft){
  return String(aircraft?.flightAwareUrl || "").trim();
}

export function deriveOperationalStatus(input){
  var maintenanceStatus=String(input?.maintenanceStatus||"disponible").toLowerCase();
  if(input?.isInFlight)return { key:"en_vuelo", label:"En vuelo", tone:"#38bdf8" };
  if(maintenanceStatus==="aog")return { key:"aog", label:"AOG", tone:"#f87171" };
  if(maintenanceStatus==="mantenimiento")return { key:"mantenimiento", label:"Mantenimiento", tone:"#fbbf24" };
  if(input?.isStandby)return { key:"standby", label:"Standby", tone:"#a78bfa" };
  return { key:"disponible", label:"Disponible", tone:"#4ade80" };
}

function compareByDateTimeDesc(a,b){
  return String(b?.date||"").localeCompare(String(a?.date||"")) || String(b?.time||"").localeCompare(String(a?.time||""));
}

function compareByDateTimeAsc(a,b){
  return String(a?.date||"").localeCompare(String(b?.date||"")) || String(a?.time||"").localeCompare(String(b?.time||""));
}



function getFlightUtcWindow(flight){
  if(!flight?.date||!flight?.time||!flight?.orig||!flight?.dest||!flight?.ac)return null;
  var dateIso=normalizeDateIso(flight.date);
  var depMins=parseTimeToMinutes(flight.time);
  if(!dateIso||!Number.isFinite(depMins))return null;
  var tzInfo=resolveAirportTimezone(flight.orig,{ fallbackTimeZone: "America/Merida" });
  var tz=tzInfo?.timeZone;
  if(!tz)return null;
  var departureUtc=localDateTimeToUtcMs(dateIso, depMins, tz);
  if(!Number.isFinite(departureUtc))return null;
  var route=calcR(flight.orig, flight.dest, flight.ac, { m: flight.pm, w: flight.pw, c: flight.pc }, flight.bg);
  var blockMinutes=Number(route?.bm);
  if(!Number.isFinite(blockMinutes)||blockMinutes<=0)return null;
  var arrivalUtc=departureUtc + (blockMinutes*60*1000);
  if(!Number.isFinite(arrivalUtc))return null;
  return { departureUtc:departureUtc, arrivalUtc:arrivalUtc };
}

export function isFlightActiveNow(flight, nowMs){
  if(String(flight?.st||"")!=="enc")return false;
  var window=getFlightUtcWindow(flight);
  if(!window)return false;
  var now=Number.isFinite(nowMs)?nowMs:Date.now();
  return now>=window.departureUtc && now<=window.arrivalUtc;
}
export function getAircraftTimeline(fs, acId, todayIso){
  var flights=(fs||[]).filter(function(f){ return f?.ac===acId && f?.st!=="canc"; });
  var nowMs=Date.now();
  var inFlight=flights
    .map(function(f){
      var window=getFlightUtcWindow(f);
      return { flight:f, window:window };
    })
    .filter(function(item){
      return String(item.flight?.st||"")==="enc" && !!item.window && nowMs>=item.window.departureUtc && nowMs<=item.window.arrivalUtc;
    })
    .sort(function(a,b){ return b.window.departureUtc-a.window.departureUtc; })[0]?.flight || null;
  var lastLeg=flights
    .map(function(f){ return { flight:f, window:getFlightUtcWindow(f) }; })
    .filter(function(item){
      if(!item.window)return false;
      if(item.flight?.st==="canc")return false;
      return item.window.departureUtc<=nowMs || item.window.arrivalUtc<=nowMs || item.flight?.st==="comp";
    })
    .sort(function(a,b){ return b.window.departureUtc-a.window.departureUtc; })[0]?.flight || null;
  var upcoming=flights
    .map(function(f){ return { flight:f, window:getFlightUtcWindow(f) }; })
    .filter(function(item){
      if(!item.window)return false;
      if(item.flight?.st==="comp" || item.flight?.st==="canc")return false;
      return item.window.departureUtc>nowMs;
    })
    .sort(function(a,b){ return a.window.departureUtc-b.window.departureUtc; })[0]?.flight || null;
  return { inFlight, lastLeg, upcoming };
}

export function buildRouteStatusLine(input){
  if(input?.inFlight){
    var eta=etaLocalUtc(input.inFlight);
    if(eta?.local && eta?.utc)return "En vuelo · ETA "+eta.local+" · "+eta.utc;
    return "En vuelo";
  }
  if(input?.lastLeg?.orig && input?.lastLeg?.dest){
    return "Vuelo anterior: "+toIataLabel(input.lastLeg.orig)+" → "+toIataLabel(input.lastLeg.dest);
  }
  if(input?.isAtBase)return "En base";
  return "Estado operativo no disponible";
}

export function toIataLabel(value){
  var raw=String(value||"").trim();
  if(!raw)return "--";
  var upper=raw.toUpperCase();
  if(/^[A-Z]{3}$/.test(upper))return upper;
  if(/^[A-Z]{4}$/.test(upper)){
    var matchIcao=findAirportByAny(upper);
    if(matchIcao?.i3)return String(matchIcao.i3).toUpperCase();
    if(matchIcao?.i4)return String(matchIcao.i4).toUpperCase();
  }
  var matchCity=findAirportByAny(raw)||findAirportByAny(upper);
  if(matchCity?.i3)return String(matchCity.i3).toUpperCase();
  return raw;
}

function isUsefulMunicipality(value){
  var city=String(value||"").trim();
  if(!city)return false;
  if(city.length<3)return false;
  if(/^[A-Z]{3,4}$/.test(city.toUpperCase()))return false;
  return true;
}

export function toAirportNameLabel(value){
  var raw=String(value||"").trim();
  if(!raw)return "--";
  var match=findAirportByAny(raw)||findAirportByAny(raw.toUpperCase());
  if(!match)return raw;
  if(isUsefulMunicipality(match.municipality))return String(match.municipality).trim();
  if(String(match.c||"").trim())return String(match.c).trim();
  return raw;
}

export function getCompactAircraftTypeLabel(type){
  var raw=String(type||"").trim();
  if(!raw)return "";
  var firstWord=raw.split(/\s+/)[0]||raw;
  return firstWord;
}

export function formatMonthlyHoursLabel(hours){
  if(!Number.isFinite(hours))return "-- h";
  return hours.toFixed(1)+" h";
}

export function buildNextFlightLine(flight){
  if(!flight)return "Próximo: No programado";
  var localTime=String(flight?.time||"") && flight.time!=="STBY" ? String(flight.time) : "STBY";
  var compactDate="";
  if(flight?.date){
    var parsed=new Date(String(flight.date)+"T12:00:00");
    if(!isNaN(parsed.getTime())){
      compactDate=parsed.toLocaleDateString("es-MX",{weekday:"short",day:"2-digit",month:"short"})
        .replace(/\./g,"")
        .replace(",", "")
        .replace(/\s+/g," ")
        .trim();
      compactDate=compactDate.charAt(0).toUpperCase()+compactDate.slice(1);
    }
  }
  if(flight?.orig && flight?.dest)return "Próximo: "+(compactDate?compactDate+" · ":"")+localTime;
  return "Próximo: Tramo pendiente de definir";
}

export function buildNextFlightRouteLine(flight){
  if(!flight?.orig || !flight?.dest)return "";
  return toIataLabel(flight.orig)+" → "+toIataLabel(flight.dest);
}

export function getMonthlyAircraftMetrics(fs, acId, yearMonth){
  var monthFlights=(fs||[]).filter(function(f){
    return f?.ac===acId && f?.st!=="canc" && String(f?.date||"").slice(0,7)===String(yearMonth||"");
  });
  if(!monthFlights.length)return { flights:0, hours:0, utilization:null };
  var hours=monthFlights.reduce(function(acc,f){
    var route=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);
    return acc+((route?route.bm:60)/60);
  },0);
  var usedDays=new Set(monthFlights.map(function(f){return f.date;})).size;
  var utilization=Math.round((usedDays/new Date(Number(String(yearMonth).slice(0,4)), Number(String(yearMonth).slice(5,7)), 0).getDate())*100);
  return { flights:monthFlights.length, hours:hours, utilization:utilization };
}

export function formatOpsClock(nowMs, timezone){
  if(!timezone)return { local:"--:--", utc:"UTC --:--" };
  var now=Number.isFinite(nowMs)?new Date(nowMs):new Date();
  var local=now.toLocaleTimeString("es-MX",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hour12:false});
  return { local:local, utc:formatUtcLabel(now.getTime()) };
}

export function isStandbyFlight(flight){
  if(!flight)return false;
  return String(flight.time||"").toUpperCase()==="STBY" || parseTimeToMinutes(flight.time)===null;
}
