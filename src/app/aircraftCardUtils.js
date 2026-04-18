import { calcR, etaLocalUtc } from "./helpers.js";
import { formatUtcLabel, parseTimeToMinutes } from "../lib/timezones.js";

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

export function getAircraftTimeline(fs, acId, todayIso){
  var flights=(fs||[]).filter(function(f){ return f?.ac===acId && f?.st!=="canc"; });
  var inFlight=flights
    .filter(function(f){ return f?.st==="enc"; })
    .sort(compareByDateTimeAsc)[0] || null;
  var lastLeg=flights
    .filter(function(f){ return String(f?.date||"")<=String(todayIso||""); })
    .sort(compareByDateTimeDesc)[0] || null;
  var upcoming=flights
    .filter(function(f){ return String(f?.date||"")>=String(todayIso||"") && f?.st!=="comp"; })
    .sort(compareByDateTimeAsc)[0] || null;
  return { inFlight, lastLeg, upcoming };
}

export function buildRouteStatusLine(input){
  if(input?.inFlight){
    var eta=etaLocalUtc(input.inFlight);
    if(eta?.local && eta?.utc)return "En vuelo · ETA "+eta.local+" · "+eta.utc;
    return "En vuelo";
  }
  if(input?.lastLeg?.orig && input?.lastLeg?.dest){
    return "Último tramo: "+input.lastLeg.orig+" → "+input.lastLeg.dest;
  }
  if(input?.isAtBase)return "En base";
  return "Estado operativo no disponible";
}

export function buildNextFlightLine(flight){
  if(!flight)return "No programado";
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
  if(flight?.orig && flight?.dest)return "Próximo: "+(compactDate?compactDate+" · ":"")+localTime+" "+flight.orig+" → "+flight.dest;
  return "Próximo tramo pendiente de definir";
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
