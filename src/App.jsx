import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabase";

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
  (data || []).forEach((row) => {
    mapped[row.ac] = row.status;
  });

  return mapped;
}

// ═══ STYLES ═══
var LS={fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:4,marginTop:8};
var IS={width:"100%",padding:"11px 13px",border:"1.5px solid #d1d5db",borderRadius:10,fontSize:14,color:"#1e293b",background:"#f8fafc",outline:"none",marginBottom:4,boxSizing:"border-box"};
var NB={background:"#f1f5f9",border:"none",borderRadius:8,width:36,height:36,fontSize:20,cursor:"pointer",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center"};

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
  var today=tds(new Date());

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

        if (!Object.keys(freshMaint).length) {
          const maintRows = Object.entries(SEED_M).map(([ac, status]) => ({
            ac,
            status,
            updated_at: new Date().toISOString(),
          }));
          const { error } = await supabase.from("aircraft_status").upsert(maintRows);
          if (error) throw error;
          const seededMaint = await loadMaintFromDb();
          setMtRaw(seededMaint);
        } else {
          setMtRaw(freshMaint);
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
            setMtRaw(freshMaint);
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
    const aircraftStatus = mt[flight.ac] || "disponible";

    if (aircraftStatus === "aog" || aircraftStatus === "mantenimiento") {
      setErrMsg(`La aeronave ${flight.ac} está en ${aircraftStatus.toUpperCase()}`);
      setPhase("error");
      return;
    }

    setPhase("saving");

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
            nt: (flight.nt ? flight.nt + " | " : "") + "Escala -> " + flight.dest,
          },
          {
            ...flight,
            orig: stop.c,
            time: "STBY",
            nt: "Tras recarga",
          },
        ];

        const { error } = await supabase.from("flights").insert(legs);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("flights").insert([flight]);
        if (error) throw error;
      }

      setNtf({ fl: flight, url: makeWaUrl(flight, "PROGRAMADO"), lbl: "PROGRAMADO" });
      setSf(false);
      setEditId(null);
      setNf(Object.assign({}, EF, { date: sel }));
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function editFlight(flight) {
    setPhase("saving");

    try {
      const { error } = await supabase
        .from("flights")
        .update({
          date: flight.date,
          ac: flight.ac,
          orig: flight.orig,
          dest: flight.dest,
          time: flight.time,
          rb: flight.rb,
          nt: flight.nt,
          pm: flight.pm,
          pw: flight.pw,
          pc: flight.pc,
          bg: flight.bg,
          st: flight.st,
          updated_at: new Date().toISOString(),
        })
        .eq("id", flight.id);

      if (error) throw error;

      setNtf({ fl: flight, url: makeWaUrl(flight, "MODIFICADO"), lbl: "MODIFICADO" });
      setSf(false);
      setEditId(null);
      setNf(Object.assign({}, EF, { date: sel }));
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function delFlight(id) {
    setPhase("saving");

    try {
      const { error } = await supabase
        .from("flights")
        .delete()
        .eq("id", id);

      if (error) throw error;

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
      const { error } = await supabase
        .from("flights")
        .update({
          st: newSt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

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
            updated_at: new Date().toISOString(),
          },
        ]);

      if (error) throw error;

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
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
    if (editId !== null) editFlight(nf);
    else addFlight(nf);
  }

  var pos=useMemo(function(){return getPos(fs);},[fs]);
  var dayF=useMemo(function(){return fs.filter(function(f){return f.date===sel&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.time==="STBY"?1:b.time==="STBY"?-1:String(a.time).localeCompare(String(b.time));});},[fs,sel,fa]);
  var upcoming=useMemo(function(){return fs.filter(function(f){return f.date>=today&&f.st!=="canc"&&f.st!=="comp"&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time));}).slice(0,20);},[fs,today,fa]);
  var formR=useMemo(function(){return nf.orig&&nf.dest?calcR(nf.orig,nf.dest,nf.ac,{m:nf.pm,w:nf.pw,c:nf.pc},nf.bg):null;},[nf.orig,nf.dest,nf.ac,nf.pm,nf.pw,nf.pc,nf.bg]);
  var todayFs=fs.filter(function(f){return f.date===today&&f.st!=="canc";});

  if(phase==="loading")return <div style={{fontFamily:"-apple-system,sans-serif",maxWidth:480,margin:"0 auto",minHeight:"100vh",background:"#0c1220",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:32,marginBottom:12}}>✈️</div><div style={{fontSize:14,fontWeight:600}}>Cargando datos...</div></div></div>;

  var TABS=[{k:"cal",l:"📅 Agenda"},{k:"list",l:"✈️ Vuelos"},{k:"plan",l:"🧭 Planificar"},{k:"gest",l:"⚙️ Gestión"}];

  return(
    <div style={{fontFamily:"-apple-system,sans-serif",maxWidth:480,margin:"0 auto",minHeight:"100vh",background:"#0c1220",backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 39px,#1a2d4a22 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,#1a2d4a22 40px)",backgroundSize:"40px 40px"}}>

      <div style={{background:"linear-gradient(145deg,#0a1220,#14243c)",padding:"18px 16px 14px",borderRadius:"0 0 22px 22px",boxShadow:"0 4px 25px rgba(0,0,0,.4)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div><div style={{fontSize:9,color:"#475569",fontWeight:700,letterSpacing:4}}>AIRPALACE</div><div style={{fontSize:22,fontWeight:800,color:"#fff"}}>Flight Ops</div></div>
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

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:3,padding:"10px 14px 0"}}>
        {TABS.map(function(t){return <button key={t.k} onClick={function(){setVw(t.k);}} style={{padding:"9px 4px",border:"none",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",background:vw===t.k?"#fff":"rgba(255,255,255,.07)",color:vw===t.k?"#0f172a":"#94a3b8"}}>{t.l}</button>;})}
      </div>
      {vw!=="gest"&&vw!=="plan"&&<div style={{display:"flex",gap:5,padding:"8px 14px"}}>
        {[{k:"all",l:"✈️ Ambas",c:"#22c55e"},{k:"N35EA",l:"🔵 N35EA",c:AC.N35EA.clr},{k:"N540JL",l:"🟠 N540JL",c:AC.N540JL.clr}].map(function(f){return <button key={f.k} onClick={function(){setFa(f.k);}} style={{padding:"5px 12px",border:"1.5px solid "+f.c,borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",background:fa===f.k?f.c:"transparent",color:fa===f.k?"#fff":f.c}}>{f.l}</button>;})}
      </div>}

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
        <div style={{fontWeight:700,color:"#fff",fontSize:15,marginBottom:8}}>📋 Próximos vuelos</div>
        {upcoming.length===0?<div style={{textAlign:"center",color:"#475569",padding:30}}>Sin vuelos</div>
        :upcoming.map(function(f){var a=AC[f.ac],s=STS[f.st]||STS.prog;return(
          <div key={f.id} style={{marginBottom:4}}><div style={{fontSize:11,fontWeight:600,color:"#64748b",marginTop:8,marginBottom:2}}>{fdt(f.date)}</div>
            <div style={{background:"rgba(255,255,255,.95)",borderLeft:"4px solid "+a.clr,borderRadius:10,padding:"8px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:800,color:a.clr}}>{f.ac}</span><span style={{fontSize:10,background:s.b,color:s.c,padding:"1px 6px",borderRadius:8,fontWeight:700}}>{s.i} {s.l}</span><div style={{flex:1}}/><a href={makeCalUrl(f)} target="_blank" rel="noreferrer" style={{fontSize:11,textDecoration:"none"}}>📅</a></div>
              <div style={{fontWeight:700,color:"#0f172a",fontSize:14}}>{f.orig+" → "+f.dest}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{ftm(f.time)+" · "+(f.rb||"-")}</div>
            </div></div>);})}
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
        <div style={{background:"rgba(255,255,255,.97)",borderRadius:16,padding:14,marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>✈️ Estado de flota</div>
          {Object.values(AC).map(function(a){var ms=mt[a.id]||"disponible",ml=MST[ms],p=pos[a.id];return(
            <div key={a.id} style={{marginBottom:10,padding:12,borderRadius:12,border:"1.5px solid "+(ms!=="disponible"?ml.c:"#e2e8f0")}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:800,color:a.clr}}>{a.id+" · "+a.type}</span><span style={{fontSize:11,background:ml.b,color:ml.c,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{ms.toUpperCase()}</span></div>
              <div style={{fontSize:12,color:"#475569",marginBottom:6}}>📍 {p}</div>
              <div style={{display:"flex",gap:4}}>
                {Object.entries(MST).map(function(e){return <button key={e[0]} onClick={function(){chgMaint(a.id,e[0]);}} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:"1px solid "+e[1].c,background:ms===e[0]?e[1].c:"transparent",color:ms===e[0]?"#fff":e[1].c,fontWeight:700,cursor:"pointer"}}>{e[1].l}</button>;})}
              </div>
            </div>);})}
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
          <button onClick={handleSave} disabled={!nf.orig||!nf.dest||!nf.time||!nf.rb||phase==="saving"} style={{width:"100%",padding:15,border:"none",borderRadius:14,fontSize:16,fontWeight:700,cursor:"pointer",marginTop:10,background:nf.orig&&nf.dest&&nf.time&&nf.rb?"#0f172a":"#cbd5e1",color:"#fff"}}>{phase==="saving"?"⏳ Guardando...":editId!==null?"✅ Guardar cambios":"✈️ Programar vuelo"}</button>
        </div>
      </div>}

      {ntf&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:2000,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setNtf(null);}}>
        <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:400,padding:24}} onClick={function(e){e.stopPropagation();}}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:6}}>✅ Vuelo {ntf.lbl}</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>✈️ {ntf.fl.orig} → {ntf.fl.dest} · {fdt(ntf.fl.date)}</div>
          <div style={{background:"#f0fdf4",borderRadius:12,padding:12,marginBottom:12,border:"1px solid #86efac"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#166534",marginBottom:8}}>💬 WhatsApp</div>
            <a href={ntf.url} target="_blank" rel="noreferrer" style={{display:"block",background:"#16a34a",color:"#fff",textAlign:"center",padding:12,borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none"}}>📤 Enviar WhatsApp</a>
          </div>
          <div style={{background:"#dbeafe",borderRadius:12,padding:12,border:"1px solid #93c5fd"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1d4ed8",marginBottom:8}}>📅 Calendario</div>
            <a href={makeCalUrl(ntf.fl)} target="_blank" rel="noreferrer" style={{display:"block",background:"#1d4ed8",color:"#fff",textAlign:"center",padding:12,borderRadius:10,fontWeight:700,fontSize:14,textDecoration:"none"}}>📅 Abrir Google Calendar</a>
          </div>
          <button onClick={function(){setNtf(null);}} style={{width:"100%",padding:12,background:"#0f172a",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",marginTop:12}}>Cerrar</button>
        </div>
      </div>}

      <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:900}}>
        {phase==="saving"&&<div style={{background:"#d97706",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>⏳ Guardando...</div>}
        {phase==="saved"&&<div style={{background:"#16a34a",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(22,163,106,.5)"}}>✅ Sincronizado</div>}
        {phase==="error"&&<div style={{background:"#dc2626",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:11,fontWeight:600,boxShadow:"0 4px 20px rgba(220,38,38,.5)",textAlign:"center",maxWidth:340}}>❌ Error: {errMsg}</div>}
      </div>

      <div style={{height:70}}/>
    </div>
  );
}
