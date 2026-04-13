import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { analyzeOpsInstruction } from "./ai/agentClient";
import { validateAgentResult } from "./ai/agentValidator";
import { executeAgentAction } from "./ai/agentExecutor";
import { subscribeToPush } from "./lib/push";
import { buildOpsPush } from "./lib/opsNotifications";

/*
  AIRPALACE FLIGHT OPS v5.1 — REALTIME SHARED OPS
*/

// ═══ DATA ═══
const AC = {
  N35EA: { id:"N35EA", type:"Embraer Phenom 300E", tag:"P300E", kts:453, gph:145, maxGal:782, mtow:18387, bow:11880, maxPax:9, crew:400, clr:"#1d4ed8", base:"Merida" },
  N540JL: { id:"N540JL", type:"Cessna Citation M2", tag:"M2", kts:418, gph:115, maxGal:567, mtow:10700, bow:7280, maxPax:7, crew:400, clr:"#c2410c", base:"Merida" },
};
const RF=1.18, BLK=20, JA=6.7, PW={m:190,w:150,c:80};
const CMB="9509768", PH="5219995703030";
const REQBY=["Jabib C","Omar C","Gibran C","Jose C","Anuar C","Direccion","Mantenimiento","Otro"];
const STS={prog:{l:"Programado",c:"#2563eb",b:"#dbeafe",i:"📋"},enc:{l:"En Curso",c:"#d97706",b:"#fef3c7",i:"✈️"},comp:{l:"Completado",c:"#16a34a",b:"#dcfce7",i:"✅"},canc:{l:"Cancelado",c:"#dc2626",b:"#fee2e2",i:"❌"}};
const MST={disponible:{l:"Disponible",c:"#16a34a",b:"#dcfce7"},mantenimiento:{l:"Mantenimiento",c:"#d97706",b:"#fef3c7"},aog:{l:"AOG",c:"#dc2626",b:"#fee2e2"}};
const MN=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WK=["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];
const APR=[
  "Merida|MMMD|MID|20.937|-89.658|MX","Cozumel|MMCZ|CZM|20.522|-86.926|MX","Cancun|MMUN|CUN|21.037|-86.877|MX",
  "Puebla|MMPB|PBC|19.158|-98.371|MX","Toluca|MMTO|TLC|19.337|-99.566|MX","CDMX AICM|MMMX|MEX|19.436|-99.072|MX",
  "Monterrey|MMMY|MTY|25.778|-100.107|MX","Guadalajara|MMGL|GDL|20.522|-103.311|MX","Tijuana|MMTJ|TIJ|32.541|-116.97|MX",
  "Los Cabos|MMSD|SJD|23.152|-109.721|MX","Tuxtla Gutierrez|MMTG|TGZ|16.563|-93.022|MX","Villahermosa|MMVA|VSA|17.997|-92.817|MX",
  "Oaxaca|MMOX|OAX|16.999|-96.726|MX","Huatulco|MMBT|HUX|15.775|-96.263|MX","Veracruz|MMVR|VER|19.146|-96.187|MX",
  "Leon Bajio|MMLO|BJX|20.993|-101.481|MX","Queretaro|MMQT|QRO|20.617|-100.186|MX","Chihuahua|MMCU|CUU|28.703|-105.965|MX",
  "Hermosillo|MMHO|HMO|29.096|-111.048|MX","Mazatlan|MMMZ|MZT|23.161|-106.266|MX","Puerto Vallarta|MMPR|PVR|20.68|-105.254|MX",
  "Aguascalientes|MMAS|AGU|21.705|-102.318|MX","San Luis Potosi|MMSP|SLP|22.254|-100.931|MX","Tampico|MMTM|TAM|22.296|-97.866|MX",
  "Acapulco|MMAA|ACA|16.757|-99.754|MX","Campeche|MMCP|CPE|19.816|-90.5|MX","Ciudad del Carmen|MMCE|CME|18.654|-91.799|MX",
  "Chetumal|MMCM|CTM|18.505|-88.327|MX","Morelia|MMMM|MLM|19.85|-101.025|MX","Durango|MMDO|DGO|24.124|-104.528|MX",
  "Ixtapa Zihuatanejo|MMZH|ZIH|17.602|-101.461|MX","La Paz|MMLP|LAP|24.072|-110.362|MX","Culiacan|MMCL|CUL|24.765|-107.475|MX",
  "Miami MIA|KMIA|MIA|25.796|-80.287|US","Opa-Locka Exec|KOPF|OPF|25.907|-80.278|US","Fort Lauderdale|KFLL|FLL|26.073|-80.153|US",
  "Ft Lauderdale Exec|KFXE|FXE|26.197|-80.171|US","Orlando MCO|KMCO|MCO|28.431|-81.308|US","Orlando Exec|KORL|ORL|28.545|-81.333|US",
  "Houston Hobby|KHOU|HOU|29.645|-95.279|US","Houston IAH|KIAH|IAH|29.984|-95.341|US","San Antonio|KSAT|SAT|29.534|-98.47|US",
  "Dallas Love Field|KDAL|DAL|32.847|-96.852|US","Teterboro NY|KTEB|TEB|40.85|-74.061|US","Van Nuys LA|KVNY|VNY|34.21|-118.49|US",
  "Palm Beach|KPBI|PBI|26.683|-80.096|US","Atlanta DeKalb|KPDK|PDK|33.876|-84.302|US","Tampa|KTPA|TPA|27.976|-82.533|US",
  "Key West|KEYW|EYW|24.556|-81.76|US","New Orleans|KNEW|NEW|30.042|-90.028|US","Las Vegas|KLAS|LAS|36.08|-115.152|US",
  "Punta Cana|MDPC|PUJ|18.567|-68.363|DO","Santo Domingo|MDSD|SDQ|18.43|-69.669|DO","La Romana|MDLR|LRM|18.45|-68.912|DO",
  "Providenciales|MBPV|PLS|21.774|-72.265|TC","Grand Cayman|MWCR|GCM|19.293|-81.358|KY","Kingston|MKJP|KIN|17.936|-76.788|JM",
  "Montego Bay|MKJS|MBJ|18.504|-77.913|JM","Nassau|MYNN|NAS|25.039|-77.466|BS","La Habana|MUHA|HAV|22.989|-82.409|CU",
  "San Juan PR|TJSJ|SJU|18.439|-66.002|PR","Aruba|TNCA|AUA|12.501|-70.015|AW","Curazao|TNCC|CUR|12.189|-68.96|CW",
  "Guatemala City|MGGT|GUA|14.583|-90.527|GT","Belize City|MZBZ|BZE|17.539|-88.308|BZ","San Salvador|MSLP|SAL|13.441|-89.056|SV",
  "Tegucigalpa|MHTG|TGU|14.061|-87.217|HN","Managua|MNMG|MGA|12.142|-86.168|NI","San Jose CR|MROC|SJO|9.994|-84.208|CR",
  "Panama Tocumen|MPTO|PTY|9.071|-79.383|PA","Bogota|SKBO|BOG|4.702|-74.147|CO","Medellin|SKRG|MDE|6.165|-75.428|CO",
  "Cartagena|SKCG|CTG|10.442|-75.513|CO","Caracas|SVMI|CCS|10.603|-66.991|VE","Lima|SPJC|LIM|-12.022|-77.114|PE",
  "Sao Paulo GRU|SBGR|GRU|-23.432|-46.47|BR","Buenos Aires|SAEZ|EZE|-34.822|-58.536|AR","Santiago Chile|SCEL|SCL|-33.393|-70.786|CL",
].map(function(s){var p=s.split("|");return{c:p[0],i4:p[1],i3:p[2],la:+p[3],lo:+p[4],co:p[5]};});
var FSIDS=["MMMD","MMCZ","MMUN","KMIA","KOPF","KFXE","KHOU","MYNN","MKJP","MBPV","MZBZ","MGGT","KSAT","MMMY","MPTO","MDPC","KTPA","KFLL","MMGL"];
var FSTOPS=APR.filter(function(a){return FSIDS.indexOf(a.i4)>=0;});

// ═══ UTILS ═══
function tds(d){return d.getFullYear()+"-"+("0"+(d.getMonth()+1)).slice(-2)+"-"+("0"+d.getDate()).slice(-2);}
function fdt(d){var x=new Date(d+"T12:00:00");return WK[x.getDay()]+" "+x.getDate()+" "+MN[x.getMonth()];}
function ftm(t){if(!t||t==="STBY")return"STBY";var h=parseInt(t),m=t.split(":")[1]||"00",ap=h>=12?"PM":"AM";if(h>12)h-=12;if(h===0)h=12;return h+":"+m+" "+ap;}
function findAP(v){return APR.find(function(x){return x.c===v||x.i4===v;});}
function hv(a,b,c,d){var R=3440.065,pi=Math.PI,dx=(c-a)*pi/180,dy=(d-b)*pi/180,sa=Math.sin(dx/2),sb=Math.sin(dy/2);return R*2*Math.atan2(Math.sqrt(sa*sa+Math.cos(a*pi/180)*Math.cos(c*pi/180)*sb*sb),Math.sqrt(1-sa*sa-Math.cos(a*pi/180)*Math.cos(c*pi/180)*sb*sb));}
function gmd(y,m){var f=new Date(y,m,1),l=new Date(y,m+1,0),ds=[],sp=(f.getDay()+6)%7;for(var i=sp-1;i>=0;i--)ds.push({d:new Date(y,m,-i),o:1});for(var j=1;j<=l.getDate();j++)ds.push({d:new Date(y,m,j),o:0});while(ds.length%7)ds.push({d:new Date(y,m+1,ds.length-l.getDate()-sp+1),o:1});return ds;}

function calcR(orig,dest,id,px,bg){
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
function getPos(fs){var t=tds(new Date()),pos={};Object.keys(AC).forEach(function(id){var p=fs.filter(function(f){return f.ac===id&&f.date<=t&&f.st!=="canc";}).sort(function(a,b){return b.date.localeCompare(a.date)||String(b.time).localeCompare(String(a.time));});pos[id]=p.length?p[0].dest:AC[id].base;});return pos;}
function makeWaUrl(f,lbl){var a=AC[f.ac];return"https://api.callmebot.com/whatsapp.php?phone="+PH+"&text="+encodeURIComponent("*AirPalace*\n"+lbl+"\n"+fdt(f.date)+"\n"+f.ac+" "+a.type+"\n"+f.orig+" -> "+f.dest+"\n"+ftm(f.time)+"\n"+(f.rb||"-"))+"&apikey="+CMB;}
function makeCalUrl(f){var a=AC[f.ac],dc=f.date.replace(/-/g,""),st="T120000";if(f.time&&f.time!=="STBY"){var mm=f.time.match(/(\d{2}):(\d{2})/);if(mm)st="T"+mm[1]+mm[2]+"00";}var rt=calcR(f.orig,f.dest,f.ac),dur=rt?rt.bm:60;var eH=parseInt(st.slice(1,3))+Math.floor(dur/60),eM=parseInt(st.slice(3,5))+(dur%60);if(eM>=60){eH++;eM-=60;}return"https://www.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(f.ac+" "+f.orig+" a "+f.dest)+"&dates="+dc+st+"/"+dc+"T"+("0"+eH).slice(-2)+("0"+eM).slice(-2)+"00&details="+encodeURIComponent(a.type+"\n"+f.orig+"->"+f.dest+"\n"+(f.rb||""));}
function makeIcsUrl(f){var st=(f.time&&f.time!=="STBY"?f.time:"12:00")+":00",s=new Date(f.date+"T"+st),rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg),dur=(rt?rt.bm:60),e=new Date(s.getTime()+dur*60000);function p(n){return("0"+n).slice(-2);}function fmt(d){return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"T"+p(d.getHours())+p(d.getMinutes())+p(d.getSeconds());}var uid=(f.id||[f.ac,f.date,f.time,f.orig,f.dest].join("-")).replace(/[^a-zA-Z0-9_-]/g,"")+"@airpalace.app";var tz="America/Merida",o=String(f.orig||"").toLowerCase();if(o.indexOf("cancun")>=0||o.indexOf("cancún")>=0||o.indexOf("cozumel")>=0)tz="America/Cancun";var txt=["BEGIN:VCALENDAR","PRODID:-//AirPalace//Flight Ops//ES","VERSION:2.0","CALSCALE:GREGORIAN","METHOD:REQUEST","BEGIN:VEVENT","UID:flight-"+uid,"DTSTAMP:"+fmt(new Date()),"SEQUENCE:0","STATUS:CONFIRMED","DTSTART;TZID="+tz+":"+fmt(s),"DTEND;TZID="+tz+":"+fmt(e),"SUMMARY:"+f.ac+" "+f.orig+"-"+f.dest,"DESCRIPTION:Ruta\\: "+f.orig+" -> "+f.dest+"\\nSolicitó\\: "+(f.rb||"-"),"END:VEVENT","END:VCALENDAR"].join("\r\n");return"data:text/calendar;charset=utf-8,"+encodeURIComponent(txt);}
function apTz(ap){if(!ap)return null;var z={MX:"America/Merida",US:"America/New_York",DO:"America/Santo_Domingo",TC:"America/Grand_Turk",KY:"America/Cayman",JM:"America/Jamaica",BS:"America/Nassau",CU:"America/Havana",PR:"America/Puerto_Rico",AW:"America/Aruba",CW:"America/Curacao",GT:"America/Guatemala",BZ:"America/Belize",SV:"America/El_Salvador",HN:"America/Tegucigalpa",NI:"America/Managua",CR:"America/Costa_Rica",PA:"America/Panama",CO:"America/Bogota",VE:"America/Caracas",PE:"America/Lima",BR:"America/Sao_Paulo",AR:"America/Argentina/Buenos_Aires",CL:"America/Santiago"};return z[ap.co]||null;}
function etaText(f){if(!f||!f.date||!f.time||f.time==="STBY")return null;var rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);var bm=rt?rt.bm:60;var dt=new Date(f.date+"T"+f.time+":00");if(isNaN(dt.getTime()))return null;var arr=new Date(dt.getTime()+bm*60000),ap=findAP(f.dest),tz=apTz(ap);if(!tz)return null;return new Intl.DateTimeFormat("es-MX",{hour:"2-digit",minute:"2-digit",day:"2-digit",month:"2-digit",timeZone:tz}).format(arr);}

// ═══ SEED DATA ═══
var SEED=[
  {date:"2026-04-02",ac:"N35EA",orig:"Cozumel",dest:"Merida",time:"08:30",rb:"Jabib C",nt:"",pm:0,pw:0,pc:0,bg:0,st:"comp"},
  {date:"2026-04-06",ac:"N35EA",orig:"Merida",dest:"Punta Cana",time:"07:00",rb:"Jabib C",nt:"",pm:2,pw:1,pc:0,bg:100,st:"comp"},
  {date:"2026-04-07",ac:"N35EA",orig:"Punta Cana",dest:"Cozumel",time:"17:00",rb:"Jabib C",nt:"",pm:2,pw:1,pc:0,bg:100,st:"comp"},
  {date:"2026-04-07",ac:"N35EA",orig:"Cozumel",dest:"Merida",time:"20:00",rb:"Jabib C",nt:"",pm:0,pw:0,pc:0,bg:0,st:"comp"},
  {date:"2026-04-12",ac:"N35EA",orig:"Merida",dest:"Providenciales",time:"15:00",rb:"Direccion",nt:"",pm:3,pw:1,pc:0,bg:150,st:"prog"},
  {date:"2026-04-12",ac:"N35EA",orig:"Providenciales",dest:"Kingston",time:"STBY",rb:"Direccion",nt:"",pm:3,pw:1,pc:0,bg:150,st:"prog"},
  {date:"2026-04-12",ac:"N540JL",orig:"Orlando MCO",dest:"Merida",time:"STBY",rb:"Mantenimiento",nt:"Ferry",pm:0,pw:0,pc:0,bg:0,st:"prog"},
  {date:"2026-04-15",ac:"N540JL",orig:"Merida",dest:"Puebla",time:"08:00",rb:"Omar C",nt:"",pm:3,pw:2,pc:0,bg:200,st:"prog"},
  {date:"2026-04-15",ac:"N540JL",orig:"Puebla",dest:"Merida",time:"15:00",rb:"Omar C",nt:"",pm:3,pw:2,pc:0,bg:200,st:"prog"},
  {date:"2026-04-27",ac:"N540JL",orig:"Merida",dest:"Cancun",time:"07:00",rb:"Jabib C",nt:"",pm:0,pw:0,pc:0,bg:0,st:"prog"},
  {date:"2026-04-28",ac:"N540JL",orig:"Cancun",dest:"Miami MIA",time:"16:00",rb:"Gibran C",nt:"",pm:2,pw:0,pc:0,bg:0,st:"prog"},
  {date:"2026-04-30",ac:"N35EA",orig:"Merida",dest:"Punta Cana",time:"09:00",rb:"Jabib C",nt:"",pm:3,pw:2,pc:1,bg:250,st:"prog"},
  {date:"2026-05-05",ac:"N35EA",orig:"Punta Cana",dest:"Merida",time:"09:00",rb:"Jabib C",nt:"Via Cozumel",pm:3,pw:2,pc:1,bg:250,st:"prog"},
];
var SEED_M={N35EA:"disponible",N540JL:"disponible"};

// ═══ DB HELPERS ═══
async function loadFlightsFromDb() {
  const { data, error } = await supabase
    .from("flights")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) throw error;

  return (data || []).map((f) => ({
    ...f,
    pm: Number(f.pm || 0),
    pw: Number(f.pw || 0),
    pc: Number(f.pc || 0),
    bg: Number(f.bg || 0),
  }));
}

async function loadMaintFromDb() {
  const { data, error } = await supabase
    .from("aircraft_status")
    .select("*");

  if (error) throw error;

  const mapped = {};
  const plan = {};
  (data || []).forEach((row) => {
    mapped[row.ac] = row.status;
    if (row.maintenance_start_date || row.maintenance_end_date) {
      plan[row.ac] = {
        from: row.maintenance_start_date || "",
        to: row.maintenance_end_date || "",
      };
    }
  });

  return { statusByAc: mapped, planByAc: plan };
}

// ═══ STYLES ═══
var LS={fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:4,marginTop:8};
var IS={width:"100%",padding:"11px 13px",border:"1.5px solid #d1d5db",borderRadius:10,fontSize:14,color:"#1e293b",background:"#f8fafc",outline:"none",marginBottom:4,boxSizing:"border-box"};
var NB={background:"#f1f5f9",border:"none",borderRadius:8,width:36,height:36,fontSize:20,cursor:"pointer",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center"};
var META_FIELDS=["created_by_email","created_by_name","updated_by_email","updated_by_name"];

// ═══ COMPONENTS ═══
function ApIn({value,onChange,label}){
  var[q,setQ]=useState("");var[open,setOpen]=useState(false);var ref=useRef(null);
  var sel=APR.find(function(a){return a.c===value;});
  useEffect(function(){function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[]);
  var fl=useMemo(function(){if(!q)return APR.slice(0,10);var l=q.toLowerCase();return APR.filter(function(a){return a.c.toLowerCase().indexOf(l)>=0||a.i4.toLowerCase().indexOf(l)>=0||a.i3.toLowerCase().indexOf(l)>=0;}).slice(0,12);},[q]);
  return(
    <div ref={ref} style={{position:"relative",marginBottom:6}}>
      <label style={LS}>{label}</label>
      <input value={open?q:(sel?sel.c+" ("+sel.i3+"/"+sel.i4+")":(value||""))} onChange={function(e){setQ(e.target.value);setOpen(true);if(!e.target.value)onChange("");}} onFocus={function(){setOpen(true);setQ("");}} placeholder="Ciudad, IATA o ICAO..." style={Object.assign({},IS,{borderColor:open?"#1d4ed8":"#d1d5db"})}/>
      {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:"#fff",border:"1px solid #d1d5db",borderRadius:10,maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,.15)"}}>
        {fl.map(function(a){return <div key={a.i4+a.c} onClick={function(){onChange(a.c);setQ("");setOpen(false);}} style={{padding:"9px 14px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between"}}><div><strong>{a.c}</strong> <span style={{color:"#94a3b8",fontSize:11}}>{a.co}</span></div><span style={{fontSize:11,color:"#64748b",fontFamily:"monospace"}}>{a.i3}/{a.i4}</span></div>;})}
      </div>}
    </div>);
}
function Stp({label,value,onChange,icon,wl}){var ic={M:"👨",F:"👩",N:"🧒"};return <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}><div><span style={{fontSize:16,marginRight:5}}>{ic[icon]||icon}</span><span style={{fontSize:13,fontWeight:600}}>{label}</span> <span style={{fontSize:11,color:"#94a3b8"}}>({wl})</span></div><div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={function(){onChange(Math.max(0,value-1));}} style={{width:30,height:30,borderRadius:"50%",border:"2px solid #d1d5db",background:"#fff",fontSize:16,cursor:"pointer"}}>-</button><span style={{fontSize:17,fontWeight:700,minWidth:22,textAlign:"center"}}>{value}</span><button onClick={function(){onChange(value+1);}} style={{width:30,height:30,borderRadius:"50%",border:"2px solid #d1d5db",background:"#fff",fontSize:16,cursor:"pointer"}}>+</button></div></div>;}

// ═══ MAIN APP ═══
export default function App(){
  var[fs,setFsRaw]=useState([]);
  var[mt,setMtRaw]=useState(SEED_M);
  var[phase,setPhase]=useState("loading");
  var[errMsg,setErrMsg]=useState("");

  var[vw,setVw]=useState("cal");
  var[sel,setSel]=useState(tds(new Date()));
  var[cM,setCM]=useState(new Date().getMonth());
  var[cY,setCY]=useState(new Date().getFullYear());
  var[sf,setSf]=useState(false);
  var[editId,setEditId]=useState(null);
  var[fa,setFa]=useState("all");
  var[ntf,setNtf]=useState(null);
  var EF={ac:"N35EA",orig:"",dest:"",date:tds(new Date()),time:"",rb:"",nt:"",pm:0,pw:0,pc:0,bg:0,st:"prog"};
  var[nf,setNf]=useState(EF);
  var[rc,setRc]=useState({ac:"N35EA",orig:"",dest:"",pm:0,pw:0,pc:0,bg:0,res:null});
  var[agentInstruction,setAgentInstruction]=useState("");
  var[agentResult,setAgentResult]=useState(null);
  var[agentValidation,setAgentValidation]=useState(null);
  var[agentBusy,setAgentBusy]=useState(false);
  var[agentOpen,setAgentOpen]=useState(false);
  var[currentUser,setCurrentUser]=useState(null);
  var[actorName,setActorName]=useState("");
  var[recording,setRecording]=useState(false);
  var[transcribing,setTranscribing]=useState(false);
  var[recorder,setRecorder]=useState(null);
  var[maintPlan,setMaintPlan]=useState(function(){
    try{return JSON.parse(localStorage.getItem("airpalace_maint_plan")||"{}");}catch{return{};}
  });
  var[pushState,setPushState]=useState("idle");
  var[recentAc,setRecentAc]=useState("all");
  var[recentCreator,setRecentCreator]=useState("all");
  var[recentDate,setRecentDate]=useState("30d");
  var[recentSource,setRecentSource]=useState("all");
  var[anMonth,setAnMonth]=useState("all");
  var[anYear,setAnYear]=useState(String(new Date().getFullYear()));
  var[listAlertFilter,setListAlertFilter]=useState("all");
  var today=tds(new Date());

  function toErrorMessage(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (typeof e?.message === "string" && e.message) return e.message;
    return String(e);
  }

  function getCreatorMeta(source) {
    return {
      creation_source: source,
    };
  }

  function getCreatorLabel(f) {
    var m=String(f.nt||"").match(/\[By:\s*([^\]]+)\]/i);
    return m&&m[1]?prettyName(m[1].trim()):"Por sistema";
  }

  function prettyName(v){
    var raw=String(v||"").trim();
    if(!raw)return"";
    var local=raw.includes("@")?raw.split("@")[0]:raw;
    return local.split(/[._\-\s]+/).filter(Boolean).map(function(p){return p.charAt(0).toUpperCase()+p.slice(1);}).join(" ");
  }

  function noteWithActor(note, actor) {
    var clean=String(note||"").replace(/\s*\[By:\s*[^\]]+\]\s*/gi,"").trim();
    return actor ? (clean?`${clean} [By: ${actor}]`:`[By: ${actor}]`) : clean;
  }

  function getAcStatus(acId, dateStr) {
    var status=mt[acId]||"disponible";
    var plan=maintPlan[acId];
    if(status==="mantenimiento"&&plan&&plan.from&&plan.to&&dateStr){
      if(dateStr>=plan.from&&dateStr<=plan.to)return"mantenimiento";
      if(dateStr>plan.to)return"disponible";
    }
    return status;
  }

  function saveMaintPlan(nextPlan) {
    setMaintPlan(nextPlan);
    try{localStorage.setItem("airpalace_maint_plan",JSON.stringify(nextPlan));}catch{}
  }

  function formatCreatedAt(ts) {
    if (!ts) return "No disponible";
    var d=new Date(ts);if(isNaN(d.getTime()))return"No disponible";
    return d.toLocaleDateString("es-MX")+" "+d.toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"});
  }

  useEffect(function () {
    supabase.auth.getUser().then(function (r) {
      setCurrentUser(r?.data?.user || null);
      if (r?.data?.user?.email) setActorName(r.data.user.email);
    });
  }, []);

  async function safeInsertFlights(rows) {
    const { data, error } = await supabase.from("flights").insert(rows).select("*");
    if (error) throw error;
    return data || [];
  }

  async function safeUpdateFlight(id, updates) {
    const first = await supabase.from("flights").update(updates).eq("id", id);
    if (first.error) throw first.error;
  }

  async function autoSendWhatsApp(flight, label) {
    try {
      const r = await fetch("/api/send-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flight, label }),
      });
      const data = await r.json().catch(function(){return{};});
      if (!r.ok) {
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      if (data.warning) {
        setErrMsg(`Vuelo guardado correctamente. WhatsApp parcial: ${data.warning}`);
        setPhase("error");
        setTimeout(function(){setPhase("ready");}, 2200);
      }
    } catch (e) {
      setErrMsg(`Vuelo guardado correctamente, pero WhatsApp falló: ${e.message || String(e)}`);
      setPhase("error");
      setTimeout(function(){setPhase("ready");}, 2200);
    }
  }

  function buildFlightEmailPayload(flight, eventLabel) {
    var routeEst=(flight?.orig&&flight?.dest&&flight?.ac)?calcR(flight.orig,flight.dest,flight.ac,{m:flight.pm,w:flight.pw,c:flight.pc},flight.bg):null;
    return {
      event_label: eventLabel,
      id: flight?.id || null,
      flight_id: flight?.id || null,
      date: flight?.date || "",
      ac: flight?.ac || "",
      orig: flight?.orig || "",
      dest: flight?.dest || "",
      time: flight?.time || "STBY",
      block_minutes: routeEst?.bm || 60,
      eta_local: etaText(flight) || "",
      rb: flight?.rb || "",
      pm: Number(flight?.pm || 0),
      pw: Number(flight?.pw || 0),
      pc: Number(flight?.pc || 0),
      notes: String(flight?.nt || "").replace(/\s*\[By:\s*[^\]]+\]\s*/gi, "").trim(),
      actor: actorName || "",
      edited_by: actorName || "",
      created_by: actorName || "",
    };
  }

  async function autoSendEmail(eventType, payload, okPrefix) {
    try {
      const r = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType, payload }),
      });
      const data = await r.json().catch(function(){return{};});
      if (!r.ok) {
        throw new Error(data.error || "No se pudo enviar el correo.");
      }
      if (data.warning) {
        setErrMsg(`${okPrefix}, pero correo parcial: ${data.warning}`);
        setPhase("error");
        setTimeout(function(){setPhase("ready");}, 2200);
      }
    } catch (e) {
      setErrMsg(`${okPrefix}, pero no se pudo enviar el correo: ${e.message || String(e)}`);
      setPhase("error");
      setTimeout(function(){setPhase("ready");}, 2200);
    }
  }

  async function sendPushEvent(title, body, url){
    try{
      await fetch("/api/send-push-notification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,body,url:url||"/"})});
    }catch{}
  }

  async function sendPushOnce(key, title, body) {
    try {
      if (localStorage.getItem(key) === "1") return;
      await sendPushEvent(title, body);
      localStorage.setItem(key, "1");
    } catch {}
  }

  useEffect(function () {
    (async function () {
      try {
        const freshFlights = await loadFlightsFromDb();
        const freshMaint = await loadMaintFromDb();

        if (!freshFlights.length) {
          const { error } = await supabase.from("flights").insert(SEED);
          if (error) throw error;
          const seededFlights = await loadFlightsFromDb();
          setFsRaw(seededFlights);
        } else {
          setFsRaw(freshFlights);
        }

        if (!Object.keys(freshMaint.statusByAc).length) {
          const maintRows = Object.entries(SEED_M).map(([ac, status]) => ({
            ac,
            status,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await supabase.from("aircraft_status").upsert(maintRows);
          if (error) throw error;
          const seededMaint = await loadMaintFromDb();
          setMtRaw(seededMaint.statusByAc);
          saveMaintPlan(Object.assign({},seededMaint.planByAc||{}));
        } else {
          setMtRaw(freshMaint.statusByAc);
          saveMaintPlan(Object.assign({},freshMaint.planByAc||{}));
        }

        setPhase("ready");
      } catch (e) {
        setErrMsg(e.message || String(e));
        setPhase("error");
      }
    })();
  }, []);

  useEffect(() => {
    const flightsChannel = supabase
      .channel("flights-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "flights" },
        async () => {
          try {
            const freshFlights = await loadFlightsFromDb();
            setFsRaw(freshFlights);
          } catch {}
        }
      )
      .subscribe();

    const maintChannel = supabase
      .channel("aircraft-status-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "aircraft_status" },
        async () => {
          try {
            const freshMaint = await loadMaintFromDb();
            setMtRaw(freshMaint.statusByAc);
            if (Object.keys(freshMaint.planByAc || {}).length) saveMaintPlan(Object.assign({},freshMaint.planByAc||{}));
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(flightsChannel);
      supabase.removeChannel(maintChannel);
    };
  }, []);

  async function addFlight(flight) {
    const aircraftStatus = getAcStatus(flight.ac, flight.date);

    if (aircraftStatus === "aog" || aircraftStatus === "mantenimiento") {
      setErrMsg(`La aeronave ${flight.ac} está en ${aircraftStatus.toUpperCase()}`);
      setPhase("error");
      return;
    }

    setPhase("saving");
    const creatorMeta = getCreatorMeta("manual");

    const rt = calcR(
      flight.orig,
      flight.dest,
      flight.ac,
      { m: flight.pm, w: flight.pw, c: flight.pc },
      flight.bg
    );

    try {
      if (rt && !rt.dir && rt.stops.length > 0) {
        const stop = rt.stops[0];

        const legs = [
          {
            ...flight,
            dest: stop.c,
            nt: noteWithActor((flight.nt ? flight.nt + " | " : "") + "Escala -> " + flight.dest, actorName),
            ...creatorMeta,
          },
          {
            ...flight,
            orig: stop.c,
            time: "STBY",
            nt: noteWithActor("Tras recarga", actorName),
            ...creatorMeta,
          },
        ];

        const insertedLegs = await safeInsertFlights(legs);
        var firstLeg = insertedLegs[0] || legs[0];
        await autoSendWhatsApp(firstLeg, "PROGRAMADO");
        await autoSendEmail("flight_created", buildFlightEmailPayload(firstLeg, "Vuelo programado"), "Vuelo guardado correctamente");
        var programmedPush = buildOpsPush("flight_programmed", firstLeg);
        await sendPushEvent(programmedPush.title, programmedPush.body, programmedPush.url);
      } else {
        const created = { ...flight, nt: noteWithActor(flight.nt, actorName), ...creatorMeta };
        const insertedSingle = await safeInsertFlights([created]);
        var createdSaved = insertedSingle[0] || created;
        await autoSendWhatsApp(createdSaved, "PROGRAMADO");
        await autoSendEmail("flight_created", buildFlightEmailPayload(createdSaved, "Vuelo programado"), "Vuelo guardado correctamente");
        var programmedSinglePush = buildOpsPush("flight_programmed", createdSaved);
        await sendPushEvent(programmedSinglePush.title, programmedSinglePush.body, programmedSinglePush.url);
      }

      setNtf({ fl: flight, lbl: "PROGRAMADO" });
      setSf(false);
      setEditId(null);
      setNf(Object.assign({}, EF, { date: sel }));
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(toErrorMessage(e));
      setPhase("error");
    }
  }

  async function editFlight(flight) {
    setPhase("saving");
    const creatorMeta = getCreatorMeta("manual");

    try {
      await safeUpdateFlight(flight.id, {
          date: flight.date,
          ac: flight.ac,
          orig: flight.orig,
          dest: flight.dest,
          time: flight.time,
          rb: flight.rb,
          nt: noteWithActor(flight.nt, actorName),
          pm: flight.pm,
          pw: flight.pw,
          pc: flight.pc,
          bg: flight.bg,
          st: flight.st,
          updated_by_email: creatorMeta.created_by_email,
          updated_by_name: creatorMeta.created_by_name,
          updated_at: new Date().toISOString(),
        });
      await autoSendWhatsApp(flight, "MODIFICADO");
      await autoSendEmail("flight_updated", buildFlightEmailPayload(flight, "Vuelo modificado"), "Vuelo guardado correctamente");
      var modifiedPush = buildOpsPush("flight_modified", flight);
      await sendPushEvent(modifiedPush.title, modifiedPush.body, modifiedPush.url);

      setNtf({ fl: flight, lbl: "MODIFICADO" });
      setSf(false);
      setEditId(null);
      setNf(Object.assign({}, EF, { date: sel }));
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(toErrorMessage(e));
      setPhase("error");
    }
  }

  async function delFlight(id) {
    setPhase("saving");

    try {
      const { data: flightToCancel } = await supabase.from("flights").select("*").eq("id", id).single();
      const { error } = await supabase
        .from("flights")
        .delete()
        .eq("id", id);

      if (error) throw error;
      const cancelledPush = buildOpsPush("flight_cancelled", flightToCancel || { ac: "Aeronave" });
      await sendPushEvent(cancelledPush.title, cancelledPush.body, cancelledPush.url);
      await autoSendEmail("flight_cancelled", buildFlightEmailPayload(flightToCancel || {}, "Vuelo cancelado"), "Vuelo guardado correctamente");

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function chgStatus(id, newSt) {
    setPhase("saving");

    try {
      const { data: existing } = await supabase.from("flights").select("*").eq("id", id).single();
      const { error } = await supabase
        .from("flights")
        .update({
          st: newSt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      if(newSt==="canc"){
        const cancelledPush = buildOpsPush("flight_cancelled", existing || { ac: "Aeronave" });
        await sendPushEvent(cancelledPush.title, cancelledPush.body, cancelledPush.url);
        await autoSendEmail("flight_cancelled", buildFlightEmailPayload(existing || {}, "Vuelo cancelado"), "Vuelo guardado correctamente");
      }

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function chgMaint(acId, newSt) {
    setPhase("saving");

    try {
      const { error } = await supabase
        .from("aircraft_status")
        .upsert([
          {
            ac: acId,
            status: newSt,
            maintenance_start_date: newSt==="mantenimiento"?(maintPlan[acId]?.from||null):null,
            maintenance_end_date: newSt==="mantenimiento"?(maintPlan[acId]?.to||null):null,
            updated_at: new Date().toISOString(),
          },
        ]);

      if (error) {
        const { error: fallbackError } = await supabase
          .from("aircraft_status")
          .upsert([{ ac: acId, status: newSt, updated_at: new Date().toISOString() }]);
        if (fallbackError) throw fallbackError;
      }
      if(newSt==="aog"){
        var aogPush=buildOpsPush("aog",{ac:acId});
        await sendPushEvent(aogPush.title, aogPush.body, aogPush.url);
        await autoSendEmail("aircraft_aog", { event_label:"AOG", ac: acId, actor: actorName }, "Estado guardado correctamente");
      }
      if(newSt==="mantenimiento"){
        var maintPush=buildOpsPush("maintenance",{ac:acId,maintenanceEndDate:maintPlan[acId]?.to});
        await sendPushEvent(maintPush.title, maintPush.body, maintPush.url);
        await autoSendEmail("aircraft_maintenance", { event_label:"Mantenimiento", ac: acId, maintenance_end_date: maintPlan[acId]?.to || "", actor: actorName }, "Estado guardado correctamente");
      }

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function persistMaintenanceDates(acId, nextPlanForAc) {
    try {
      await supabase.from("aircraft_status").upsert([
        {
          ac: acId,
          status: mt[acId] || "disponible",
          maintenance_start_date: nextPlanForAc?.from || null,
          maintenance_end_date: nextPlanForAc?.to || null,
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch {}
  }

  async function restore() {
    if (!confirm("Restaurar todos los datos originales?")) return;

    setPhase("saving");

    try {
      await supabase.from("flights").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      const { error: flightsError } = await supabase.from("flights").insert(SEED);
      if (flightsError) throw flightsError;

      const maintRows = Object.entries(SEED_M).map(([ac, status]) => ({
        ac,
        status,
        updated_at: new Date().toISOString(),
      }));

      const { error: maintError } = await supabase
        .from("aircraft_status")
        .upsert(maintRows);

      if (maintError) throw maintError;

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(String(e));
      setPhase("error");
    }
  }

  function handleSave() {
    if (!nf.orig||!nf.dest||!nf.time||!nf.rb) return;
    if (!actorName.trim()) {
      setErrMsg("Indica quién está programando/editando este vuelo.");
      setPhase("error");
      return;
    }
    if (editId !== null) editFlight(nf);
    else addFlight(nf);
  }

  async function analyzeAgentInstruction() {
    if (!agentInstruction.trim()) return;
    setAgentBusy(true);
    setPhase("saving");
    setErrMsg("");
    try {
      const analyzed = await analyzeOpsInstruction(agentInstruction);
      const validated = await validateAgentResult(analyzed, agentInstruction);
      setAgentResult(analyzed);
      setAgentValidation(validated);
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1200);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    } finally {
      setAgentBusy(false);
    }
  }

  async function enablePushNotifications(){
    var publicKey=import.meta.env.VITE_VAPID_PUBLIC_KEY||import.meta.env.VITE_PUBLIC_VAPID_KEY;
    if(!publicKey){
      setPushState("error");
      setErrMsg("Falta la llave pública VAPID (VITE_VAPID_PUBLIC_KEY) para notificaciones push.");
      setPhase("error");
      return;
    }
    setPushState("saving");
    try{
      const sub=await subscribeToPush(publicKey);
      const r=await fetch("/api/save-push-subscription",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:sub.toJSON()})});
      if(!r.ok){const d=await r.json().catch(function(){return{};});throw new Error(d.error||`HTTP ${r.status}`);}
      setPushState("ok");
    }catch(e){
      setPushState("error");
      setErrMsg(e.message||String(e));
      setPhase("error");
    }
  }

  async function transcribeAudio(blob) {
    setTranscribing(true);
    try {
      const base64 = await new Promise(function(resolve,reject){
        var fr=new FileReader();
        fr.onloadend=function(){var s=String(fr.result||"");resolve((s.split(",")[1]||""));};
        fr.onerror=function(){reject(new Error("No se pudo leer el audio grabado."));};
        fr.readAsDataURL(blob);
      });

      const r = await fetch("/api/transcribe-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_base64: base64, mime_type: blob.type || "audio/mp4" }),
      });
      const data = await r.json().catch(function(){return{};});
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      if (data.text) setAgentInstruction(data.text);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleVoiceInput() {
    if (recording && recorder) {
      recorder.stop();
      return;
    }
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("Tu navegador no soporta grabación de audio.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      var mimeCandidates=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
      var selected=mimeCandidates.find(function(m){return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m);})||"";
      const mediaRecorder = selected?new MediaRecorder(stream,{mimeType:selected}):new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e){ if(e.data&&e.data.size>0)chunks.push(e.data); };
      mediaRecorder.onstop = function(){
        stream.getTracks().forEach(function(t){t.stop();});
        setRecording(false);
        const blob = new Blob(chunks, { type: selected || chunks[0]?.type || "audio/mp4" });
        transcribeAudio(blob);
      };
      setRecorder(mediaRecorder);
      mediaRecorder.start();
      setRecording(true);
    } catch (e) {
      setErrMsg(e?.message || "No se pudo iniciar el micrófono.");
      setPhase("error");
    }
  }

  async function executeAgentInstruction() {
    if (!agentValidation || !agentValidation.can_execute) return;
    setAgentBusy(true);
    setPhase("saving");
    setErrMsg("");
    try {
      const execRes = await executeAgentAction(agentValidation, {
        calcRoute: calcR,
        creatorMeta: getCreatorMeta("ai"),
      });
      setAgentInstruction("");
      setAgentResult(null);
      setAgentValidation(null);
      if (execRes && execRes.warning) {
        setErrMsg(`Vuelo creado, pero WhatsApp falló: ${execRes.warning}`);
        setPhase("error");
        setTimeout(function(){setPhase("ready");}, 2200);
        return;
      }
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1200);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    } finally {
      setAgentBusy(false);
    }
  }

  var pos=useMemo(function(){return getPos(fs);},[fs]);
  var dayF=useMemo(function(){return fs.filter(function(f){return f.date===sel&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.time==="STBY"?1:b.time==="STBY"?-1:String(a.time).localeCompare(String(b.time));});},[fs,sel,fa]);
  var upcoming=useMemo(function(){return fs.filter(function(f){return f.date>=today&&f.st!=="canc"&&f.st!=="comp"&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time));}).slice(0,20);},[fs,today,fa]);
  var operationalFlights=useMemo(function(){return fs.filter(function(f){return f.st!=="canc"&&f.st!=="comp"&&f.date>=today;});},[fs,today]);
  var conflictList=useMemo(function(){var m={};operationalFlights.forEach(function(f){var k=[f.ac,f.date,f.time].join("|");m[k]=(m[k]||[]).concat([f]);});return Object.values(m).filter(function(v){return v.length>1;}).flat();},[operationalFlights]);
  var listFlights=useMemo(function(){
    if(listAlertFilter==="conflicts")return conflictList;
    if(listAlertFilter==="today")return fs.filter(function(f){return f.date===today&&f.st!=="canc";});
    if(listAlertFilter==="tomorrow"){var d=new Date(today+"T12:00:00");d.setDate(d.getDate()+1);var t2=tds(d);return fs.filter(function(f){return f.date===t2&&f.st!=="canc";});}
    if(listAlertFilter==="pending")return fs.filter(function(f){return f.st==="prog";});
    return upcoming;
  },[listAlertFilter,conflictList,fs,today,upcoming]);
  function onAlertClick(lbl){
    if(lbl==="Cambios recientes"){setVw("recent");setRecentDate("today");return;}
    setVw("list");
    if(lbl==="Conflictos")setListAlertFilter("conflicts");
    else if(lbl==="Vuelos hoy")setListAlertFilter("today");
    else if(lbl==="Vuelos mañana")setListAlertFilter("tomorrow");
    else if(lbl==="Pendientes")setListAlertFilter("pending");
    else setListAlertFilter("all");
    if(lbl==="Mantenimiento"){setVw("gest");}
  }
  var formR=useMemo(function(){return nf.orig&&nf.dest?calcR(nf.orig,nf.dest,nf.ac,{m:nf.pm,w:nf.pw,c:nf.pc},nf.bg):null;},[nf.orig,nf.dest,nf.ac,nf.pm,nf.pw,nf.pc,nf.bg]);
  var todayFs=fs.filter(function(f){return f.date===today&&f.st!=="canc";});
  var creators=useMemo(function(){
    var s=new Set();fs.forEach(function(f){s.add(getCreatorLabel(f));});return["all"].concat(Array.from(s).sort());
  },[fs]);
  var recentFlights=useMemo(function(){
    var now=new Date();var start7=new Date(now);start7.setDate(now.getDate()-7);var start30=new Date(now);start30.setDate(now.getDate()-30);
    return fs
      .filter(function(f){
        if(recentAc!=="all"&&f.ac!==recentAc)return false;
        if(recentCreator!=="all"&&getCreatorLabel(f)!==recentCreator)return false;
        if(recentSource!=="all"&&String(f.creation_source||"manual")!==recentSource)return false;
        var d=new Date((f.created_at||f.date||today)+"T00:00:00");
        if(recentDate==="today"&&tds(d)!==today)return false;
        if(recentDate==="7d"&&d<start7)return false;
        if(recentDate==="30d"&&d<start30)return false;
        return true;
      })
      .sort(function(a,b){return String(b.created_at||"").localeCompare(String(a.created_at||""))||String(b.date||"").localeCompare(String(a.date||""));});
  },[fs,recentAc,recentCreator,recentDate,recentSource,today]);
  var activeForMgmt=useMemo(function(){return fs.filter(function(f){return f.st!=="canc"&&f.st!=="comp";});},[fs]);
  var flightsByAc=useMemo(function(){var o={N35EA:0,N540JL:0};activeForMgmt.forEach(function(f){o[f.ac]=(o[f.ac]||0)+1;});return o;},[activeForMgmt]);
  var hoursByAc=useMemo(function(){var o={N35EA:0,N540JL:0};activeForMgmt.forEach(function(f){var r=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);o[f.ac]+=(r?r.bm:60)/60;});return o;},[activeForMgmt]);
  var requestsByPerson=useMemo(function(){var o={};fs.filter(function(f){return f.st!=="canc";}).forEach(function(f){var k=f.rb||"No disponible";o[k]=(o[k]||0)+1;});return Object.entries(o).sort(function(a,b){return b[1]-a[1];});},[fs]);
  var tomorrow=useMemo(function(){var d=new Date(today+"T12:00:00");d.setDate(d.getDate()+1);return tds(d);},[today]);
  var opsAlerts=useMemo(function(){
    var unavailable=Object.keys(AC).filter(function(id){return getAcStatus(id,today)!=="disponible";});
    var maint=Object.keys(AC).filter(function(id){return getAcStatus(id,today)==="mantenimiento";});
    var aog=Object.keys(AC).filter(function(id){return getAcStatus(id,today)==="aog";});
    var outBase=Object.keys(AC).filter(function(id){return pos[id]!==AC[id].base;});
    var conflicts=0,idx={};operationalFlights.forEach(function(f){var k=[f.ac,f.date,f.time].join("|");idx[k]=(idx[k]||0)+1;});Object.values(idx).forEach(function(n){if(n>1)conflicts+=n;});
    var pending=fs.filter(function(f){return f.st==="prog";}).length;
    return{today:todayFs.length,tomorrow:fs.filter(function(f){return f.date===tomorrow&&f.st!=="canc";}).length,unavailable:unavailable.length,maint:maint.length,aog:aog.length,conflicts:conflicts,pending:pending,outBase:outBase.length,recentChanges:fs.filter(function(f){return (f.updated_at||f.created_at||"").slice(0,10)>=today;}).length};
  },[fs,today,tomorrow,todayFs,pos,mt,maintPlan,operationalFlights]);
  var filteredAnalytics=useMemo(function(){
    return fs.filter(function(f){
      if(anYear!=="all"&&String(f.date||"").slice(0,4)!==anYear)return false;
      if(anMonth!=="all"&&String(f.date||"").slice(5,7)!==anMonth)return false;
      return true;
    });
  },[fs,anYear,anMonth]);
  var metrics=useMemo(function(){
    var byReq={},byAc={},byDest={},bySt={},byMonth={},byYear={},hrsMonth={},hrsYear={};
    filteredAnalytics.forEach(function(f){
      var ym=String(f.date||"").slice(0,7),yr=String(f.date||"").slice(0,4);
      byReq[f.rb||"No disponible"]=(byReq[f.rb||"No disponible"]||0)+1;
      byAc[f.ac]=(byAc[f.ac]||0)+1;byDest[f.dest]=(byDest[f.dest]||0)+1;bySt[f.st]=(bySt[f.st]||0)+1;
      byMonth[ym]=(byMonth[ym]||0)+1;byYear[yr]=(byYear[yr]||0)+1;
      var r=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg),h=(r?r.bm:60)/60;
      hrsMonth[ym]=(hrsMonth[ym]||0)+h;hrsYear[yr]=(hrsYear[yr]||0)+h;
    });
    return {byReq,byAc,byDest,bySt,byMonth,byYear,hrsMonth,hrsYear,cancelled:filteredAnalytics.filter(function(f){return f.st==="canc";}).length};
  },[filteredAnalytics]);

  useEffect(function(){
    if(conflictList.length>0){
      var ac=conflictList[0]?.ac||"Aeronave";
      var conflictPush=buildOpsPush("operational_conflict",{ac:ac});
      sendPushOnce("push_conflict_"+today,conflictPush.title,conflictPush.body);
    }
    var d=new Date(today+"T12:00:00");d.setDate(d.getDate()+1);var t2=tds(d);
    var tomFlights=fs.filter(function(f){return f.date===t2&&f.st!=="canc";});
    if(tomFlights.length>0){
      var f0=tomFlights[0];
      var tomorrowPush=buildOpsPush("tomorrow_flight",{ac:f0.ac});
      sendPushOnce("push_tomorrow_"+t2, tomorrowPush.title, tomorrowPush.body);
    }
  },[conflictList,fs,today]);

  if(phase==="loading")return <div style={{fontFamily:"-apple-system,sans-serif",maxWidth:480,margin:"0 auto",minHeight:"100vh",background:"#0c1220",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:12}}>✈️</div><div style={{fontSize:14,fontWeight:600}}>Cargando datos...</div></div></div>;

  var TABS=[{k:"cal",l:"📅 Agenda"},{k:"list",l:"✈️ Vuelos"},{k:"recent",l:"🕘 Recientes"},{k:"plan",l:"🧭 Planificar"},{k:"gest",l:"⚙️ Gestión"}];

  return(
    <div style={{fontFamily:"-apple-system,sans-serif",maxWidth:480,margin:"0 auto",minHeight:"100vh",background:"#0c1220",backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 39px,#1a2d4a22 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#1a2d4a22 40px)",backgroundSize:"40px 40px"}}>

      <div style={{background:"linear-gradient(145deg,#0a1220,#14243c)",padding:"18px 16px 14px",borderRadius:"0 0 22px 22px",boxShadow:"0 4px 25px rgba(0,0,0,.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src="/logo-192.png" alt="AirPalace" style={{width:30,height:30,borderRadius:8,objectFit:"cover",border:"1px solid #334155"}}/>
            <div><div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:4}}>AIRPALACE</div><div style={{fontSize:22,fontWeight:800,color:"#fff"}}>Flight Ops</div></div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {Object.values(AC).map(function(a){var p=pos[a.id],atB=p===a.base,ms=mt[a.id]||"disponible",ml=MST[ms];return(
            <div key={a.id} style={{flex:1,borderRadius:10,padding:"7px 10px",border:"1px solid "+(ms!=="disponible"?ml.c+"55":atB?"#22c55e55":"#fbbf2455"),background:"rgba(255,255,255,.04)"}}>
              <div style={{fontSize:10,fontWeight:800,color:a.clr==="#1d4ed8"?"#93c5fd":"#fdba74"}}>{a.id} · {a.tag}</div>
              <div style={{fontSize:11,fontWeight:700,color:"#e2e8f0",marginTop:1}}>📍 {p}</div>
              <div style={{fontSize:9,color:ms!=="disponible"?ml.c:atB?"#86efac":"#fcd34d"}}>{ms!=="disponible"?ms.toUpperCase():atB?"✅ En base":"⚠️ Fuera de base"}</div>
            </div>);})}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat("+TABS.length+",1fr)",gap:3,padding:"10px 14px 0"}}>
        {TABS.map(function(t){return <button key={t.k} onClick={function(){setVw(t.k);}} style={{padding:"9px 4px",border:"none",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",background:vw===t.k?"#fff":"rgba(255,255,255,.07)",color:vw===t.k?"#0f172a":"#94a3b8"}}>{t.l}</button>;})}
      </div>
      {vw!=="gest"&&vw!=="plan"&&<div style={{display:"flex",gap:5,padding:"8px 14px"}}>
        {[{k:"all",l:"✈️ Ambas",c:"#22c55e"},{k:"N35EA",l:"🔵 N35EA",c:AC.N35EA.clr},{k:"N540JL",l:"🟠 N540JL",c:AC.N540JL.clr}].map(function(f){return <button key={f.k} onClick={function(){setFa(f.k);}} style={{padding:"5px 12px",border:"1.5px solid "+f.c,borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",background:fa===f.k?f.c:"transparent",color:fa===f.k?"#fff":f.c}}>{f.l}</button>;})}
      </div>}
      <div style={{padding:"0 14px 8px"}}>
        <button onClick={enablePushNotifications} style={{width:"100%",padding:"8px 10px",border:"1px solid #334155",borderRadius:10,background:"#fff",fontSize:11,fontWeight:700,color:"#0f172a",cursor:"pointer"}}>
          {pushState==="saving"?"⏳ Activando notificaciones...":pushState==="ok"?"🔔 Notificaciones activas":"🔔 Activar notificaciones push"}
        </button>
      </div>

      {vw==="cal"&&<div style={{padding:"0 14px"}}>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:18,padding:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <button onClick={function(){var m=cM-1,y=cY;if(m<0){m=11;y--;}setCM(m);setCY(y);}} style={NB}>◀</button>
            <span style={{fontSize:21,fontWeight:800,color:"#0f172a"}}>{MN[cM]+" "+cY}</span>
            <button onClick={function(){var m=cM+1,y=cY;if(m>11){m=0;y++;}setCM(m);setCY(y);}} style={NB}>▶</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}}>
            {["L","M","X","J","V","S","D"].map(function(d){return <div key={d} style={{fontSize:11,color:"#94a3b8",fontWeight:700,padding:"4px 0"}}>{d}</div>;})}
            {gmd(cY,cM).map(function(d,i){var ds=tds(d.d),df=fs.filter(function(f){return f.date===ds&&(fa==="all"||f.ac===fa);}),iS=ds===sel,iT=ds===today;return(
              <div key={i} onClick={function(){if(!d.o)setSel(ds);}} style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,cursor:d.o?"default":"pointer",background:iS?"#0f172a":iT?"#f1f5f9":"transparent",opacity:d.o?.25:1}}>
                <span style={{fontSize:13,fontWeight:iT||iS?700:400,color:iS?"#fff":"#1e293b"}}>{d.d.getDate()}</span>
                {df.length>0&&<div style={{display:"flex",gap:2,marginTop:1}}>{df.some(function(f){return f.ac==="N35EA";})&&<div style={{width:5,height:5,borderRadius:"50%",background:AC.N35EA.clr}}/>}{df.some(function(f){return f.ac==="N540JL";})&&<div style={{width:5,height:5,borderRadius:"50%",background:AC.N540JL.clr}}/>}</div>}
              </div>);})}
          </div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <span style={{fontWeight:700,color:"#fff",fontSize:15}}>{fdt(sel)}</span>
          <button onClick={function(){setNf(Object.assign({},EF,{date:sel}));setEditId(null);setSf(true);}} style={{background:"#fff",color:"#0f172a",border:"none",borderRadius:10,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>✈️ + Vuelo</button>
        </div>
        {dayF.length===0?<div style={{textAlign:"center",color:"#475569",padding:"24px 0"}}>✈️ Sin vuelos este día</div>
        :dayF.map(function(f){var a=AC[f.ac],s=STS[f.st]||STS.prog,px=(f.pm||0)+(f.pw||0)+(f.pc||0),rt=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);return(
          <div key={f.id} style={{background:"rgba(255,255,255,.97)",borderLeft:"4px solid "+a.clr,borderRadius:12,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:800,color:a.clr}}>{f.ac} {a.tag}</span>
              <span style={{fontSize:10,background:s.b,color:s.c,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{s.i} {s.l}</span>
              <div style={{flex:1}}/>
              <a href={makeCalUrl(f)} target="_blank" rel="noreferrer" style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 8px",fontSize:13,textDecoration:"none",color:"#475569"}}>📅</a>
              <button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 8px",fontSize:13,cursor:"pointer"}}>✏️</button>
              <button onClick={function(){delFlight(f.id);}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"4px 8px",fontSize:13,cursor:"pointer",color:"#94a3b8"}}>×</button>
            </div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:17}}>{f.orig} <span style={{color:"#94a3b8"}}>→</span> {f.dest}</div>
            <div style={{color:"#64748b",fontSize:13,marginTop:2}}>{ftm(f.time)} · {f.rb||"-"}{px>0?" · "+px+" pax":""}{f.nt?" · "+f.nt:""}</div>
            {etaText(f)&&<div style={{fontSize:11,color:"#334155",marginTop:3}}>🕓 ETA local destino: {etaText(f)}</div>}
            {rt&&<div style={{marginTop:6,fontSize:12,color:"#475569",background:"#f8fafc",borderRadius:8,padding:"6px 8px"}}>
              {"~"+rt.aw+" NM | "}<strong>{Math.floor(rt.bm/60)+"h"+("0"+(rt.bm%60)).slice(-2)+"m block"}</strong>
              {rt.stops.length>0&&<div style={{color:"#b45309",fontWeight:600}}>🛬 Escala: {rt.stops[0].c} ({rt.stops[0].i4})</div>}
              {rt.wt.ov&&<div style={{color:"#dc2626",fontWeight:700}}>❌ SOBREPESO +{Math.abs(rt.wt.mg).toLocaleString()} lbs</div>}
            </div>}
            <div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
              {Object.entries(STS).filter(function(e){return e[0]!==f.st;}).map(function(e){return <button key={e[0]} onClick={function(){chgStatus(f.id,e[0]);}} style={{fontSize:10,padding:"4px 10px",borderRadius:8,border:"1px solid "+e[1].c,background:e[1].b,color:e[1].c,fontWeight:700,cursor:"pointer"}}>{e[1].i} {e[1].l}</button>;})}
            </div>
          </div>);})}
        <div style={{marginTop:6,marginBottom:16,background:"rgba(255,251,235,.9)",borderRadius:12,padding:10,border:"1px solid #fde68a",fontSize:11,color:"#92400e",lineHeight:1.5}}>⚠️ Los tiempos son estimaciones (+18% ruta, +20min bloque). La programación final es responsabilidad del piloto al mando.</div>
      </div>}

      {vw==="list"&&<div style={{padding:"0 14px 24px"}}>
        <div style={{fontWeight:700,color:"#fff",fontSize:15,marginBottom:8}}>📋 {listAlertFilter==="conflicts"?"Vuelos con conflictos":"Próximos vuelos"}</div>
        {listFlights.length===0?<div style={{textAlign:"center",color:"#475569",padding:30}}>Sin vuelos</div>
        :listFlights.map(function(f){var a=AC[f.ac],s=STS[f.st]||STS.prog;return(
          <div key={f.id} style={{marginBottom:4}}><div style={{fontSize:11,fontWeight:600,color:"#64748b",marginTop:8,marginBottom:2}}>{fdt(f.date)}</div>
            <div style={{background:"rgba(255,255,255,.95)",borderLeft:"4px solid "+a.clr,borderRadius:10,padding:"8px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:800,color:a.clr}}>{f.ac}</span><span style={{fontSize:10,background:s.b,color:s.c,padding:"1px 6px",borderRadius:8,fontWeight:700}}>{s.i} {s.l}</span><div style={{flex:1}}/><a href={makeCalUrl(f)} target="_blank" rel="noreferrer" style={{fontSize:11,textDecoration:"none"}}>📅</a><button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"3px 7px",fontSize:11,cursor:"pointer"}}>✏️</button></div>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:14}}>{f.orig+" → "+f.dest}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{ftm(f.time)+" · "+(f.rb||"-")}</div>
              <div style={{fontSize:11,color:"#475569"}}>Última edición: {getCreatorLabel(f)}</div>
              {etaText(f)&&<div style={{fontSize:11,color:"#334155",marginTop:2}}>ETA destino: {etaText(f)}</div>}
            </div></div>);})}
      </div>}

      {vw==="recent"&&<div style={{padding:"0 14px 24px"}}>
        <div style={{fontWeight:700,color:"#fff",fontSize:15,marginBottom:8}}>🕘 Últimos vuelos creados</div>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:12,padding:10,marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            <select value={recentAc} onChange={function(e){setRecentAc(e.target.value);}} style={IS}>
              <option value="all">Aeronave: Todas</option><option value="N35EA">N35EA</option><option value="N540JL">N540JL</option>
            </select>
            <select value={recentSource} onChange={function(e){setRecentSource(e.target.value);}} style={IS}>
              <option value="all">Tipo: Todos</option><option value="manual">Manual</option><option value="ai">AI</option>
            </select>
            <select value={recentCreator} onChange={function(e){setRecentCreator(e.target.value);}} style={IS}>
              {creators.map(function(c){return <option key={c} value={c}>{c==="all"?"Creador: Todos":c}</option>;})}
            </select>
            <select value={recentDate} onChange={function(e){setRecentDate(e.target.value);}} style={IS}>
              <option value="all">Fecha: Todas</option><option value="today">Hoy</option><option value="7d">7 días</option><option value="30d">30 días</option>
            </select>
          </div>
        </div>
        {recentFlights.length===0?<div style={{textAlign:"center",color:"#475569",padding:22}}>Sin resultados</div>
        :recentFlights.slice(0,60).map(function(f){var s=STS[f.st]||STS.prog;return(
          <div key={f.id} style={{background:"rgba(255,255,255,.97)",borderRadius:12,padding:12,marginBottom:8,borderLeft:"4px solid "+(AC[f.ac]?.clr||"#64748b")}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
              <div style={{fontSize:12,fontWeight:800,color:"#0f172a"}}>{f.date} · {ftm(f.time)}</div>
              <span style={{fontSize:10,background:s.b,color:s.c,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{s.i} {s.l}</span>
            </div>
            <div style={{fontWeight:800,color:"#0f172a",fontSize:15}}>{f.ac} · {f.orig} → {f.dest}</div>
            <div style={{fontSize:12,color:"#64748b"}}>Solicitó: {f.rb||"-"}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:4}}>{f.updated_at?"Actualizado":"Creado"}: {formatCreatedAt(f.updated_at||f.created_at)} · Tipo: {(f.creation_source||"manual").toUpperCase()}</div>
            <button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{marginTop:7,fontSize:11,padding:"6px 10px",borderRadius:8,border:"1px solid #1d4ed8",background:"#dbeafe",color:"#1d4ed8",fontWeight:700,cursor:"pointer"}}>✏️ Editar</button>
          </div>);})}
      </div>}

      {vw==="plan"&&<div style={{padding:"0 14px 24px"}}>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:18,padding:16}}>
          <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>🧭 Planificación de vuelo</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:14}}>Rutas IFR +18% · Block +20min</div>
          <label style={LS}>Aeronave</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>{Object.values(AC).map(function(a){return <button key={a.id} onClick={function(){setRc(function(p){return Object.assign({},p,{ac:a.id,res:null});});}} style={{flex:1,padding:"10px 8px",border:"2px solid "+a.clr,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",background:rc.ac===a.id?a.clr:"transparent",color:rc.ac===a.id?"#fff":a.clr}}>{a.id}<br/><span style={{fontSize:10,fontWeight:500}}>{a.tag}</span></button>;})}</div>
          <ApIn value={rc.orig} onChange={function(v){setRc(function(p){return Object.assign({},p,{orig:v,res:null});});}} label="Origen"/>
          <ApIn value={rc.dest} onChange={function(v){setRc(function(p){return Object.assign({},p,{dest:v,res:null});});}} label="Destino"/>
          <div style={{background:"#f8fafc",borderRadius:12,padding:12,border:"1.5px solid #e2e8f0",marginTop:6}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>👥 Pasajeros + 2 pilotos</div>
            <Stp label="Hombres" value={rc.pm} onChange={function(v){setRc(function(p){return Object.assign({},p,{pm:v,res:null});});}} icon="M" wl="190 lbs"/>
            <Stp label="Mujeres" value={rc.pw} onChange={function(v){setRc(function(p){return Object.assign({},p,{pw:v,res:null});});}} icon="F" wl="150 lbs"/>
            <Stp label="Niños" value={rc.pc} onChange={function(v){setRc(function(p){return Object.assign({},p,{pc:v,res:null});});}} icon="N" wl="80 lbs"/>
          </div>
          <button onClick={function(){if(rc.orig&&rc.dest)setRc(function(p){return Object.assign({},p,{res:calcR(rc.orig,rc.dest,rc.ac,{m:rc.pm,w:rc.pw,c:rc.pc},rc.bg)});});}} disabled={!rc.orig||!rc.dest} style={{width:"100%",padding:14,background:rc.orig&&rc.dest?"#0f172a":"#cbd5e1",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:14}}>🧭 Calcular</button>
          {rc.res&&<div style={{marginTop:14}}>
            <div style={{background:"#f8fafc",borderRadius:14,padding:14,border:"1.5px solid #e2e8f0"}}>
              <div style={{fontWeight:800,fontSize:17}}>{rc.orig+" → "+rc.dest}</div>
              <div style={{fontSize:12,color:"#64748b",lineHeight:1.9,marginTop:4}}>GC: {rc.res.gc} NM | Vía aérea: ~{rc.res.aw} NM<br/>En ruta: {Math.floor(rc.res.em/60)}h{("0"+(rc.res.em%60)).slice(-2)}m | <strong>Block: {Math.floor(rc.res.bm/60)}h{("0"+(rc.res.bm%60)).slice(-2)}m</strong></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginTop:10}}>
                <div style={{textAlign:"center",padding:10,borderRadius:10,background:rc.res.dir?"#dcfce7":"#fef3c7"}}><div style={{fontSize:22}}>{rc.res.dir?"✅":"⚠️"}</div><div style={{fontSize:10,fontWeight:700,color:rc.res.dir?"#166534":"#92400e"}}>{rc.res.dir?"DIRECTO":"ESCALA"}</div></div>
                <div style={{textAlign:"center",padding:10,borderRadius:10,background:!rc.res.wt.ov?"#dcfce7":"#fee2e2"}}><div style={{fontSize:22}}>{!rc.res.wt.ov?"⚖️":"❌"}</div><div style={{fontSize:10,fontWeight:700,color:!rc.res.wt.ov?"#166534":"#991b1b"}}>{!rc.res.wt.ov?"PESO OK":"SOBREPESO"}</div></div>
              </div>
              {rc.res.stops.length>0&&<div style={{marginTop:10,background:"#fef3c7",borderRadius:10,padding:10,border:"1px solid #fcd34d",fontSize:12,color:"#92400e"}}><strong>🛬 Escala: {rc.res.stops[0].c} ({rc.res.stops[0].i4})</strong><br/>Tramo 1: ~{rc.res.stops[0].bm1}min | Tramo 2: ~{rc.res.stops[0].bm2}min</div>}
            </div>
            <div style={{background:rc.res.wt.ov?"#fef2f2":"#f0fdf4",borderRadius:12,padding:14,marginTop:10,border:"1.5px solid "+(rc.res.wt.ov?"#fca5a5":"#86efac")}}>
              <div style={{fontWeight:700,fontSize:13,marginBottom:8}}>⚖️ Peso de despegue</div>
              {[["BOW + Crew",AC[rc.ac].bow+AC[rc.ac].crew],["Combustible",rc.res.fl],["Pasajeros ("+rc.res.wt.tp+")",rc.res.wt.pW],["Equipaje",rc.bg]].map(function(r,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#475569",lineHeight:2}}><span>{r[0]}</span><strong>{r[1].toLocaleString()} lbs</strong></div>;})}
              <div style={{height:1,background:"#d1d5db",margin:"5px 0"}}/>
              <div style={{display:"flex",justifyContent:"space-between",fontWeight:800,fontSize:15}}><span>TOW</span><span style={{color:rc.res.wt.ov?"#dc2626":"#166534"}}>{rc.res.wt.tw.toLocaleString()} lbs</span></div>
              <div style={{marginTop:7,padding:7,borderRadius:8,background:rc.res.wt.ov?"#fee2e2":"#dcfce7",textAlign:"center",fontWeight:700,fontSize:13,color:rc.res.wt.ov?"#991b1b":"#166534"}}>{rc.res.wt.ov?"SOBREPESO +"+Math.abs(rc.res.wt.mg).toLocaleString()+" lbs":"Margen: "+rc.res.wt.mg.toLocaleString()+" lbs"}</div>
            </div>
          </div>}
        </div>
      </div>}

      {vw==="gest"&&<div style={{padding:"0 14px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14,marginTop:8}}>
          <div style={{background:"#dbeafe",borderRadius:14,padding:"13px 8px",textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:"#1d4ed8"}}>{todayFs.length}</div><div style={{fontSize:10,color:"#1d4ed8",fontWeight:700}}>Hoy</div></div>
          <div style={{background:"#d1fae5",borderRadius:14,padding:"13px 8px",textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:"#059669"}}>{fs.filter(function(f){return f.st==="prog";}).length}</div><div style={{fontSize:10,color:"#059669",fontWeight:700}}>Programados</div></div>
        </div>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:16,padding:12,marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:8}}>🚨 Alertas operativas</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[["Vuelos hoy",opsAlerts.today],["Vuelos mañana",opsAlerts.tomorrow],["No disponibles",opsAlerts.unavailable],["Mantenimiento",opsAlerts.maint],["AOG",opsAlerts.aog],["Conflictos",opsAlerts.conflicts],["Pendientes",opsAlerts.pending],["Fuera de base",opsAlerts.outBase],["Cambios recientes",opsAlerts.recentChanges]].map(function(r){return <button key={r[0]} onClick={function(){onAlertClick(r[0]);}} style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"8px 6px",textAlign:"center",cursor:"pointer"}}><div style={{fontSize:18,fontWeight:800,color:"#0f172a"}}>{r[1]}</div><div style={{fontSize:10,color:"#64748b"}}>{r[0]}</div></button>;})}
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:16,padding:14,marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>✈️ Estado de flota</div>
          {Object.values(AC).map(function(a){var ms=getAcStatus(a.id,today),ml=MST[ms],p=pos[a.id],plan=maintPlan[a.id]||{};return(
            <div key={a.id} style={{marginBottom:10,padding:12,borderRadius:12,border:"1.5px solid "+(ms!=="disponible"?ml.c:"#e2e8f0")}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:800,color:a.clr}}>{a.id+" · "+a.type}</span><span style={{fontSize:11,background:ml.b,color:ml.c,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{ms.toUpperCase()}</span></div>
              <div style={{fontSize:12,color:"#475569",marginBottom:6}}>📍 {p}</div>
              {ms==="mantenimiento"&&plan.to&&<div style={{fontSize:11,color:"#b45309",marginBottom:6}}>En mantenimiento hasta: {new Date(plan.to+"T12:00:00").toLocaleDateString("es-MX")}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:6}}>
                <input type="date" value={plan.from||""} onChange={function(e){var next=Object.assign({},plan,{from:e.target.value});saveMaintPlan(Object.assign({},maintPlan,{[a.id]:next}));persistMaintenanceDates(a.id,next);}} style={Object.assign({},IS,{marginBottom:0,padding:"7px 9px",fontSize:11})}/>
                <input type="date" value={plan.to||""} onChange={function(e){var next=Object.assign({},plan,{to:e.target.value});saveMaintPlan(Object.assign({},maintPlan,{[a.id]:next}));persistMaintenanceDates(a.id,next);}} style={Object.assign({},IS,{marginBottom:0,padding:"7px 9px",fontSize:11})}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                {Object.entries(MST).map(function(e){return <button key={e[0]} onClick={function(){chgMaint(a.id,e[0]);}} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:"1px solid "+e[1].c,background:ms===e[0]?e[1].c:"transparent",color:ms===e[0]?"#fff":e[1].c,fontWeight:700,cursor:"pointer"}}>{e[1].l}</button>;})}
              </div>
            </div>);})}
        </div>
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:16,padding:14,marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:10}}>📊 Analítica operativa</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
            <select value={anMonth} onChange={function(e){setAnMonth(e.target.value);}} style={IS}>
              <option value="all">Mes: Todos</option>
              {["01","02","03","04","05","06","07","08","09","10","11","12"].map(function(m,i){return <option key={m} value={m}>{MN[i]}</option>;})}
            </select>
            <select value={anYear} onChange={function(e){setAnYear(e.target.value);}} style={IS}>
              <option value="all">Año: Todos</option>
              {Array.from(new Set(fs.map(function(f){return String(f.date||"").slice(0,4);}).filter(Boolean))).sort().map(function(y){return <option key={y} value={y}>{y}</option>;})}
            </select>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginBottom:6}}>Vuelos programados por aeronave</div>
          {Object.keys(flightsByAc).map(function(ac){var total=Object.values(flightsByAc).reduce(function(a,b){return a+b;},0)||1;var pct=Math.round((flightsByAc[ac]/total)*100);return <div key={ac+"f"} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#334155"}}><span>{ac}</span><strong>{flightsByAc[ac]} vuelos</strong></div><div style={{height:8,background:"#e2e8f0",borderRadius:999}}><div style={{height:8,width:pct+"%",background:AC[ac].clr,borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginTop:12,marginBottom:6}}>Horas de vuelo por aeronave (estimadas)</div>
          {Object.keys(hoursByAc).map(function(ac){var max=Math.max.apply(null,Object.values(hoursByAc).concat([1]));var pct=Math.round((hoursByAc[ac]/max)*100);return <div key={ac+"h"} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#334155"}}><span>{ac}</span><strong>{hoursByAc[ac].toFixed(1)} h</strong></div><div style={{height:8,background:"#e2e8f0",borderRadius:999}}><div style={{height:8,width:pct+"%",background:AC[ac].clr,borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginTop:12,marginBottom:6}}>Vuelos solicitados por persona</div>
          {requestsByPerson.length===0?<div style={{fontSize:11,color:"#64748b"}}>Sin registros.</div>:requestsByPerson.map(function(r){var max=requestsByPerson[0][1]||1;var pct=Math.round((r[1]/max)*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#334155"}}><span>{r[0]}</span><strong>{r[1]}</strong></div><div style={{height:8,background:"#e2e8f0",borderRadius:999}}><div style={{height:8,width:pct+"%",background:"#0f172a",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginTop:12,marginBottom:6}}>Top destinos</div>
          {Object.keys(metrics.byDest).length===0?<div style={{fontSize:11,color:"#64748b"}}>Sin registros.</div>:Object.entries(metrics.byDest).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(r){var max=Math.max.apply(null,Object.values(metrics.byDest));var pct=Math.round((r[1]/(max||1))*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#334155"}}><span>{r[0]}</span><strong>{r[1]}</strong></div><div style={{height:8,background:"#e2e8f0",borderRadius:999}}><div style={{height:8,width:pct+"%",background:"#0ea5e9",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#334155",marginTop:12,marginBottom:6}}>Vuelos por estatus</div>
          {Object.keys(metrics.bySt).length===0?<div style={{fontSize:11,color:"#64748b"}}>Sin registros.</div>:Object.entries(metrics.bySt).map(function(r){var max=Math.max.apply(null,Object.values(metrics.bySt));var pct=Math.round((r[1]/(max||1))*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#334155"}}><span>{(STS[r[0]]||{l:r[0]}).l}</span><strong>{r[1]}</strong></div><div style={{height:8,background:"#e2e8f0",borderRadius:999}}><div style={{height:8,width:pct+"%",background:"#7c3aed",borderRadius:999}}/></div></div>;})}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
            <div style={{background:"#f8fafc",padding:9,borderRadius:10,border:"1px solid #e2e8f0"}}><div style={{fontSize:10,color:"#64748b"}}>Cancelaciones</div><div style={{fontSize:19,fontWeight:800,color:"#dc2626"}}>{metrics.cancelled}</div></div>
            <div style={{background:"#f8fafc",padding:9,borderRadius:10,border:"1px solid #e2e8f0"}}><div style={{fontSize:10,color:"#64748b"}}>Utilización estimada</div><div style={{fontSize:19,fontWeight:800,color:"#0f172a"}}>{Object.values(metrics.byAc).reduce(function(a,b){return a+b;},0)} vuelos</div></div>
          </div>
        </div>
        <button onClick={restore} style={{width:"100%",padding:10,background:"transparent",border:"1.5px solid #dc2626",borderRadius:10,color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔄 Restaurar datos originales</button>
      </div>}

      {sf&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:1000,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={function(){setSf(false);}}>
        <div style={{background:"#fff",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:480,maxHeight:"93vh",overflowY:"auto",padding:"18px 18px 36px"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{width:36,height:4,background:"#d1d5db",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{fontWeight:800,fontSize:17,marginBottom:14}}>{editId!==null?"✏️ Editar vuelo":"✈️ Nuevo vuelo"}</div>
          <label style={LS}>Fecha</label><input type="date" value={nf.date} onChange={function(e){setNf(function(p){return Object.assign({},p,{date:e.target.value});});}} style={IS}/>
          <label style={LS}>Aeronave</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>{Object.values(AC).map(function(a){return <button key={a.id} onClick={function(){setNf(function(p){return Object.assign({},p,{ac:a.id});});}} style={{flex:1,padding:"10px 8px",border:"2px solid "+a.clr,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",background:nf.ac===a.id?a.clr:"transparent",color:nf.ac===a.id?"#fff":a.clr}}>{a.id}<br/><span style={{fontSize:10}}>{a.tag}</span></button>;})}</div>
          <ApIn value={nf.orig} onChange={function(v){setNf(function(p){return Object.assign({},p,{orig:v});});}} label="Origen"/>
          <ApIn value={nf.dest} onChange={function(v){setNf(function(p){return Object.assign({},p,{dest:v});});}} label="Destino"/>
          {formR&&<div style={{marginBottom:8,background:formR.dir&&!formR.wt.ov?"#f0fdf4":"#fef2f2",borderRadius:10,padding:10,fontSize:12,border:"1px solid "+(formR.dir&&!formR.wt.ov?"#86efac":"#fca5a5")}}>
            📏 ~{formR.aw} NM | ⏱ {Math.floor(formR.bm/60)}h{("0"+(formR.bm%60)).slice(-2)}m block
            {formR.stops.length>0&&<div style={{color:"#b45309",fontWeight:600}}>🛬 Auto-escala: {formR.stops[0].c}</div>}
            {formR.dir&&<div style={{color:"#166534",fontWeight:600}}>✅ Directo</div>}
            <div style={{color:formR.wt.ov?"#dc2626":"#166534",fontWeight:600}}>⚖️ {formR.wt.tw.toLocaleString()}/{formR.wt.mt.toLocaleString()} lbs {formR.wt.ov?"❌ SOBREPESO":""}</div>
          </div>}
          <div style={{background:"#f8fafc",borderRadius:12,padding:12,border:"1.5px solid #e2e8f0"}}>
            <Stp label="Hombres" value={nf.pm} onChange={function(v){setNf(function(p){return Object.assign({},p,{pm:v});});}} icon="M" wl="190"/>
            <Stp label="Mujeres" value={nf.pw} onChange={function(v){setNf(function(p){return Object.assign({},p,{pw:v});});}} icon="F" wl="150"/>
            <Stp label="Niños" value={nf.pc} onChange={function(v){setNf(function(p){return Object.assign({},p,{pc:v});});}} icon="N" wl="80"/>
          </div>
          <label style={LS}>Hora</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
            {["STBY","07:00","08:00","09:00","12:00","15:00","16:00","18:00"].map(function(t){return <button key={t} onClick={function(){setNf(function(p){return Object.assign({},p,{time:t});});}} style={{padding:"7px 11px",border:"1.5px solid "+(nf.time===t?"#0f172a":"#e2e8f0"),borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",background:nf.time===t?"#0f172a":"#fff",color:nf.time===t?"#fff":"#475569"}}>{t==="STBY"?t:ftm(t)}</button>;})}
          </div>
          <input type="time" value={nf.time!=="STBY"?nf.time:""} onChange={function(e){setNf(function(p){return Object.assign({},p,{time:e.target.value});});}} style={IS}/>
          <label style={LS}>Solicitado por</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {REQBY.map(function(r){return <button key={r} onClick={function(){setNf(function(p){return Object.assign({},p,{rb:r});});}} style={{padding:"7px 11px",border:"1.5px solid "+(nf.rb===r?"#0f172a":"#e2e8f0"),borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",background:nf.rb===r?"#0f172a":"#fff",color:nf.rb===r?"#fff":"#475569"}}>{r}</button>;})}
          </div>
          <label style={LS}>Notas</label>
          <input type="text" placeholder="Ferry, observaciones..." value={nf.nt} onChange={function(e){setNf(function(p){return Object.assign({},p,{nt:e.target.value});});}} style={IS}/>
          <label style={LS}>Programado/Editado por</label>
          <input type="text" placeholder="Nombre o correo" value={actorName} onChange={function(e){setActorName(e.target.value);}} style={IS}/>
          <button onClick={handleSave} disabled={!nf.orig||!nf.dest||!nf.time||!nf.rb||phase==="saving"} style={{width:"100%",padding:15,border:"none",borderRadius:14,fontSize:16,fontWeight:700,cursor:"pointer",marginTop:10,background:nf.orig&&nf.dest&&nf.time&&nf.rb?"#0f172a":"#cbd5e1",color:"#fff"}}>{phase==="saving"?"⏳ Guardando...":editId!==null?"✅ Guardar cambios":"✈️ Programar vuelo"}</button>
          {editId!==null&&<button onClick={function(){if(confirm("¿Cancelar este vuelo?"))chgStatus(editId,"canc");setSf(false);}} style={{width:"100%",padding:12,border:"1.5px solid #dc2626",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",marginTop:8,background:"#fff",color:"#dc2626"}}>❌ Cancelar vuelo</button>}
        </div>
      </div>}

      {ntf&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:2000,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setNtf(null);}}>
        <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:400,padding:24}} onClick={function(e){e.stopPropagation();}}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:6}}>✅ Vuelo {ntf.lbl}</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>✈️ {ntf.fl.orig} → {ntf.fl.dest} · {fdt(ntf.fl.date)}</div>
          <div style={{background:"#f0fdf4",borderRadius:12,padding:12,marginBottom:12,border:"1px solid #86efac"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:8}}>💬 WhatsApp</div>
            <button onClick={function(){autoSendWhatsApp(ntf.fl, ntf.lbl);}} style={{display:"block",width:"100%",background:"#16a34a",color:"#fff",textAlign:"center",padding:12,borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none",border:"none",cursor:"pointer"}}>📤 Enviar WhatsApp</button>
          </div>
          <div style={{background:"#dbeafe",borderRadius:12,padding:12,border:"1px solid #93c5fd"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1d4ed8",marginBottom:8}}>📅 Calendario</div>
            <a href={makeIcsUrl(ntf.fl)} download={"airpalace-"+(ntf.fl?.ac||"vuelo")+"-"+(ntf.fl?.date||"evento")+".ics"} style={{display:"block",background:"#1d4ed8",color:"#fff",textAlign:"center",padding:12,borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none"}}>📅 Agregar al calendario (.ics)</a>
          </div>
          <button onClick={function(){setNtf(null);}} style={{width:"100%",padding:12,background:"#0f172a",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",marginTop:12}}>Cerrar</button>
        </div>
      </div>}

      <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:900}}>
        {phase==="saving"&&<div style={{background:"#d97706",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>⏳ Guardando...</div>}
        {phase==="saved"&&<div style={{background:"#16a34a",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(22,163,106,.5)"}}>✅ Sincronizado</div>}
        {phase==="error"&&<div style={{background:"#dc2626",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:11,fontWeight:600,boxShadow:"0 4px 20px rgba(220,38,38,.5)",textAlign:"center",maxWidth:340}}>❌ Error: {errMsg}</div>}
      </div>

      <button
        onClick={function(){setAgentOpen(function(v){return !v;});}}
        style={{position:"fixed",right:16,bottom:88,zIndex:950,width:52,height:52,borderRadius:"50%",border:"1px solid #334155",background:"linear-gradient(145deg,#0f172a,#1e293b)",color:"#fff",fontSize:24,cursor:"pointer",boxShadow:"0 8px 20px rgba(0,0,0,.35)"}}
        aria-label="AI Pilot"
      >
        👨🏼‍✈️
      </button>

      {agentOpen&&<div style={{position:"fixed",right:12,bottom:146,width:"calc(100% - 24px)",maxWidth:360,zIndex:960,background:"rgba(255,255,255,.98)",borderRadius:16,padding:12,boxShadow:"0 20px 45px rgba(0,0,0,.45)",border:"1px solid #dbeafe"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>👨🏼‍✈️ AI Pilot</div>
          <button onClick={function(){setAgentOpen(false);}} style={{border:"none",background:"transparent",fontSize:18,cursor:"pointer",color:"#64748b"}}>×</button>
        </div>
        <div style={{fontSize:11,color:"#475569",marginBottom:7}}>Estoy listo para ayudarte con la operación de hoy.</div>
        <textarea
          value={agentInstruction}
          onChange={function(e){setAgentInstruction(e.target.value);}}
          placeholder="Escribe una instrucción..."
          style={{width:"100%",minHeight:80,padding:10,border:"1.5px solid #d1d5db",borderRadius:10,fontSize:13,resize:"vertical",boxSizing:"border-box",marginBottom:8}}
        />
        <button onClick={toggleVoiceInput} disabled={transcribing} style={{width:"100%",padding:9,border:"1px solid #334155",borderRadius:10,background:"#fff",color:"#0f172a",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}}>
          {transcribing?"⏳ Transcribiendo...":recording?"⏹️ Detener grabación":"🎤 Grabar voz"}
        </button>
        <button onClick={analyzeAgentInstruction} disabled={!agentInstruction.trim()||agentBusy} style={{width:"100%",padding:10,border:"none",borderRadius:10,background:agentInstruction.trim()&&!agentBusy?"#0f172a":"#cbd5e1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {agentBusy?"⏳ Analizando...":"🔍 Analyze instruction"}
        </button>
        {agentValidation&&<div style={{marginTop:8,border:"1px solid #e2e8f0",borderRadius:10,padding:9,background:"#f8fafc"}}>
          <div style={{fontSize:11,color:"#334155"}}>Acción: <strong>{agentValidation.action||"-"}</strong></div>
          <div style={{fontSize:11,color:"#334155"}}>Confianza: <strong>{Math.round((agentValidation.confidence||0)*100)}%</strong></div>
          <div style={{fontSize:11,color:"#334155"}}>Confirmación: <strong>{agentValidation.requires_confirmation?"Sí":"No"}</strong></div>
          {agentValidation.missing_fields.length>0&&<div style={{fontSize:11,color:"#92400e",marginTop:5}}>Faltantes: {agentValidation.missing_fields.join(", ")}</div>}
          {agentValidation.warnings.length>0&&<div style={{marginTop:5,fontSize:11,color:"#92400e"}}>{agentValidation.warnings.map(function(w,i){return <div key={i}>⚠️ {w}</div>;})}</div>}
          {agentValidation.errors.length>0&&<div style={{marginTop:5,fontSize:11,color:"#b91c1c"}}>{agentValidation.errors.map(function(er,i){return <div key={i}>❌ {er}</div>;})}</div>}
          <button onClick={executeAgentInstruction} disabled={!agentValidation.can_execute||agentBusy} style={{width:"100%",marginTop:8,padding:10,border:"none",borderRadius:10,background:agentValidation.can_execute&&!agentBusy?"#16a34a":"#cbd5e1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {agentBusy?"⏳ Ejecutando...":"✅ Execute"}
          </button>
        </div>}
      </div>}

      <div style={{height:70}}/>
    </div>
  );
}
