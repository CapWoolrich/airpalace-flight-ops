import { useEffect, useMemo, useRef, useState } from "react";
import { APR, IS, LS } from "../data";

export function AirportInput({value,onChange,label}){
  var[q,setQ]=useState("");var[open,setOpen]=useState(false);var ref=useRef(null);
  var sel=APR.find(function(a){return a.c===value;});
  useEffect(function(){function h(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}document.addEventListener("mousedown",h);return function(){document.removeEventListener("mousedown",h);};},[]);
  var fl=useMemo(function(){if(!q)return APR.slice(0,10);var l=q.toLowerCase();return APR.filter(function(a){return a.c.toLowerCase().indexOf(l)>=0||a.i4.toLowerCase().indexOf(l)>=0||a.i3.toLowerCase().indexOf(l)>=0;}).slice(0,12);},[q]);
  return(
    <div ref={ref} style={{position:"relative",marginBottom:6}}>
      <label style={LS}>{label}</label>
      <input value={open?q:(sel?sel.c+" ("+sel.i3+"/"+sel.i4+")":(value||""))} onChange={function(e){setQ(e.target.value);setOpen(true);if(!e.target.value)onChange("");}} onFocus={function(){setOpen(true);setQ("");}} placeholder="Ciudad, IATA o ICAO..." style={Object.assign({},IS,{borderColor:open?"#60a5fa":"rgba(148,163,184,.35)",boxShadow:open?"0 0 0 2px rgba(59,130,246,.22)":"none"})}/>
      {open&&<div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:100,background:"linear-gradient(170deg,rgba(8,15,29,.98),rgba(16,25,43,.95))",border:"1px solid rgba(148,163,184,.3)",borderRadius:10,maxHeight:200,overflowY:"auto",boxShadow:"0 14px 28px rgba(2,6,23,.45)"}}>
        {fl.map(function(a){return <div key={a.i4+a.c} onClick={function(){onChange(a.c);setQ("");setOpen(false);}} style={{padding:"9px 14px",cursor:"pointer",fontSize:13,borderBottom:"1px solid rgba(148,163,184,.15)",display:"flex",justifyContent:"space-between",color:"#dbeafe"}}><div><strong>{a.c}</strong> <span style={{color:"#8ea2c8",fontSize:11}}>{a.co}</span></div><span style={{fontSize:11,color:"#9fb0cd",fontFamily:"monospace"}}>{a.i3}/{a.i4}</span></div>;})}
      </div>}
    </div>);
}
