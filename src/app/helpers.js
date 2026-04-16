import { getOperationalTodayISO } from "../ai/operationalDate.js";
import { supabase } from "../supabase.js";
import { AC, APR, BLK, FSTOPS, JA, MN, PW, RF, WK } from "./data.js";

export function tds(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
export function fdt(d){var x=new Date(d+"T12:00:00");return WK[x.getDay()]+" "+x.getDate()+" "+MN[x.getMonth()];}
export function ftm(t){if(!t||t==="STBY")return"STBY";var h=parseInt(t),m=t.split(":")[1]||"00",ap=h>=12?"PM":"AM";if(h>12)h-=12;if(h===0)h=12;return h+":"+m+" "+ap;}
export function findAP(v){return APR.find(function(x){return x.c===v||x.i4===v;});}
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
  var maxNm=Math.round(((a.maxGal-(100/a.kts)*a.gph-(45/60)*a.gph)/a.gph)*a.kts/RF*0.95);
  if(gc<=maxNm&&ok)return{dir:true,gc:Math.round(gc),aw:aw,em:em,bm:bm,fl:Math.round(fl),wt:wt,stops:[]};
  var bs=null,bt=1e9;
  for(var i=0;i<FSTOPS.length;i++){var s=FSTOPS[i];if(s.c===orig||s.c===dest)continue;var l1=hv(oa.la,oa.lo,s.la,s.lo),l2=hv(s.la,s.lo,da.la,da.lo),f1=l1*RF/a.kts*a.gph*1.1,f2=l2*RF/a.kts*a.gph*1.1;if(f1<=a.maxGal&&f2<=a.maxGal&&l1+l2<bt){bt=l1+l2;bs={c:s.c,i4:s.i4,bm1:Math.round(l1*RF/a.kts*60+BLK),bm2:Math.round(l2*RF/a.kts*60+BLK)};}}
  return{dir:false,gc:Math.round(gc),aw:aw,em:em,bm:bm,fl:Math.round(fl),wt:wt,stops:bs?[bs]:[]};
}

export function getPos(fs, todayIso){var t=todayIso||getOperationalTodayISO(),pos={};Object.keys(AC).forEach(function(id){var p=fs.filter(function(f){return f.ac===id&&f.date<=t&&f.st!=="canc";}).sort(function(a,b){return b.date.localeCompare(a.date)||String(b.time).localeCompare(String(a.time));});pos[id]=p.length?p[0].dest:AC[id].base;});return pos;}

export function makeCalUrl(f){
  var a=AC[f.ac],dc=f.date.replace(/-/g,""),st="T120000";
  if(f.time&&f.time!=="STBY"){var mm=f.time.match(/(\d{2}):(\d{2})/);if(mm)st="T"+mm[1]+mm[2]+"00";}
  var rt=calcR(f.orig,f.dest,f.ac),dur=rt?rt.bm:60;
  var startIso=`${f.date}${st.replace("T", "T")}`;
  var startDate=new Date(`${f.date}T${st.slice(1,3)}:${st.slice(3,5)}:00`);
  if(!isFinite(startDate.getTime()))startDate=new Date(`${f.date}T12:00:00`);
  var endDate=new Date(startDate.getTime()+dur*60*1000);
  var endDatePart=endDate.toISOString().slice(0,10).replace(/-/g,"");
  var endTimePart=`T${("0"+endDate.getHours()).slice(-2)}${("0"+endDate.getMinutes()).slice(-2)}00`;
  return "https://www.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(f.ac+" "+f.orig+" a "+f.dest)+"&dates="+dc+st+"/"+endDatePart+endTimePart+"&details="+encodeURIComponent(a.type+"\n"+f.orig+"->"+f.dest+"\n"+(f.rb||""));
}

export function apTz(ap){if(!ap)return null;var i4=String(ap.i4||"").toUpperCase(),i3=String(ap.i3||"").toUpperCase(),city=String(ap.c||"").toLowerCase();if(i4==="MMMD"||i3==="MID"||city.indexOf("merida")>=0||city.indexOf("mérida")>=0)return"America/Merida";if(i4==="MMUN"||i3==="CUN"||city.indexOf("cancun")>=0||city.indexOf("cancún")>=0)return"America/Cancun";if(i4==="MMCZ"||i3==="CZM"||city.indexOf("cozumel")>=0)return"America/Cancun";if(i4==="MMTO"||i3==="TLC"||city.indexOf("toluca")>=0)return"America/Mexico_City";if(i4==="MMMX"||i3==="MEX"||city.indexOf("cdmx")>=0||city.indexOf("mexico city")>=0)return"America/Mexico_City";if(i4==="KOPF"||i3==="OPF")return"America/New_York";if(i4==="KFLL"||i3==="FLL")return"America/New_York";if(i4==="KMIA"||i3==="MIA")return"America/New_York";if(i4==="KMCO"||i3==="MCO")return"America/New_York";var z={MX:"America/Merida",US:"America/New_York",DO:"America/Santo_Domingo",TC:"America/Grand_Turk",KY:"America/Cayman",JM:"America/Jamaica",BS:"America/Nassau",CU:"America/Havana",PR:"America/Puerto_Rico",AW:"America/Aruba",CW:"America/Curacao",GT:"America/Guatemala",BZ:"America/Belize",SV:"America/El_Salvador",HN:"America/Tegucigalpa",NI:"America/Managua",CR:"America/Costa_Rica",PA:"America/Panama",CO:"America/Bogota",VE:"America/Caracas",PE:"America/Lima",BR:"America/Sao_Paulo",AR:"America/Argentina/Buenos_Aires",CL:"America/Santiago"};return z[ap.co]||null;}
function tzOffsetMin(ts,tz){try{var parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"shortOffset",hour:"2-digit"}).formatToParts(new Date(ts));var label=(parts.find(function(p){return p.type==="timeZoneName";})||{}).value||"GMT+0";var m=label.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);if(!m)return 0;var sign=m[1]==="-"?-1:1;return sign*((+m[2]||0)*60+(+m[3]||0));}catch{return 0;}}
function originLocalToUtc(dateStr,timeStr,originTz){var d=String(dateStr||"").split("-"),t=String(timeStr||"00:00").split(":"),y=+d[0],m=(+d[1]||1)-1,da=+d[2]||1,h=+t[0]||0,mi=+t[1]||0;var guess=Date.UTC(y,m,da,h,mi,0);var off1=tzOffsetMin(guess,originTz),utc=guess-off1*60000,off2=tzOffsetMin(utc,originTz);return guess-off2*60000;}
export function etaText(f){if(!f||!f.date||!f.time||f.time==="STBY")return null;var rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);var bm=rt?rt.bm:60;var origAp=findAP(f.orig),destAp=findAP(f.dest),origTz=apTz(origAp),destTz=apTz(destAp);if(!origTz||!destTz)return null;var depUtc=originLocalToUtc(f.date,f.time,origTz);if(!isFinite(depUtc))return null;var arr=new Date(depUtc+bm*60000);try{return new Intl.DateTimeFormat("es-MX",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true,timeZone:destTz}).format(arr);}catch{return null;}}

export async function loadFlightsFromDb() {
  const { data, error } = await supabase.from("flights").select("*").order("date", { ascending: true }).order("time", { ascending: true });
  if (error) throw error;
  return (data || []).map((f) => ({ ...f, pm: Number(f.pm || 0), pw: Number(f.pw || 0), pc: Number(f.pc || 0), bg: Number(f.bg || 0) }));
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
