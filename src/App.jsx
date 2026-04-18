import { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { AC, REQBY, STS, MST, LS, IS, NB, META_FIELDS, MN } from "./app/data";
import { AirportInput as ApIn } from "./app/components/AirportInput";
import { PassengerStepper as Stp } from "./app/components/PassengerStepper";
import { loadFlightsFromDb, loadMaintFromDb, tds, fdt, ftm, gmd, calcR, getPos, makeCalUrl, etaLocalUtc } from "./app/helpers";
import { buildNextFlightLine, buildRouteStatusLine, deriveOperationalStatus, getAircraftTimeline, getMonthlyAircraftMetrics, resolveFlightAwareUrl } from "./app/aircraftCardUtils";
import { analyzeOpsInstruction } from "./ai/agentClient";
import { validateAgentResult } from "./ai/agentValidator";
import { executeAgentAction } from "./ai/agentExecutor";
import { detectFlightConflicts, uniqueFlightsFromConflicts } from "./ai/conflictUtils";
import { getOperationalDateOffsetISO, getOperationalTodayISO, getOperationalTomorrowISO } from "./ai/operationalDate";
import { subscribeToPush } from "./lib/push";
import { buildOpsPush } from "./lib/opsNotifications";
import { formatUtcLabel, localDateTimeToUtcMs, normalizeDateIso, parseTimeToMinutes, resolveAirportTimezone } from "./lib/timezones.js";

const TECH_MAP_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' fill='none'>
    <defs>
      <linearGradient id='line' x1='0' x2='1' y1='0' y2='0'>
        <stop offset='0' stop-color='rgba(91,141,179,.04)'/>
        <stop offset='0.5' stop-color='rgba(143,203,255,.28)'/>
        <stop offset='1' stop-color='rgba(91,141,179,.04)'/>
      </linearGradient>
    </defs>
    <g opacity='.32' stroke='url(#line)' stroke-width='1.2'>
      <path d='M80 280 C180 220 290 210 390 245 C475 275 560 275 655 240 C750 204 860 205 955 248 C1050 292 1165 300 1280 268' />
      <path d='M40 500 C145 455 230 450 320 474 C410 498 490 503 590 468 C700 430 810 430 910 472 C1010 514 1110 528 1310 495' />
      <path d='M120 670 C220 636 320 635 415 661 C510 686 625 690 730 655 C835 620 940 620 1040 650 C1140 680 1235 688 1350 660' />
      <path d='M245 140 L292 190 L370 175 L420 222 L476 208 L540 248' />
      <path d='M690 162 L754 205 L822 188 L900 236 L975 218 L1058 244' />
      <path d='M590 566 L670 600 L752 588 L828 622 L925 608' />
      <path d='M294 360 L352 404 L440 388 L508 426 L585 415' />
      <path d='M965 400 L1044 436 L1118 420 L1198 446' />
    </g>
    <g opacity='.23' fill='rgba(154,208,255,.45)'>
      <circle cx='292' cy='190' r='4'/><circle cx='420' cy='222' r='3'/><circle cx='754' cy='205' r='4'/>
      <circle cx='900' cy='236' r='3'/><circle cx='670' cy='600' r='3.5'/><circle cx='508' cy='426' r='3'/>
      <circle cx='1044' cy='436' r='3.5'/><circle cx='1198' cy='446' r='3'/>
    </g>
  </svg>`
)}`;

/*
  AIRPALACE FLIGHT OPS v5.1 — REALTIME SHARED OPS
*/

// ═══ MAIN APP ═══
export default function App(){
  var DEMO_SEED_ENABLED = import.meta.env.DEV || String(import.meta.env.VITE_ENABLE_DEMO_SEED || "").toLowerCase() === "true";
  var[fs,setFsRaw]=useState([]);
  var[mt,setMtRaw]=useState({});
  var[phase,setPhase]=useState("loading");
  var[errMsg,setErrMsg]=useState("");

  var[vw,setVw]=useState("cal");
  var initialOpsDate=getOperationalTodayISO();
  var initialOpsDateParts=initialOpsDate.split("-").map(function(v){return Number(v||0);});
  var[sel,setSel]=useState(initialOpsDate);
  var[cM,setCM]=useState(Math.max(0,(initialOpsDateParts[1]||1)-1));
  var[cY,setCY]=useState(initialOpsDateParts[0]||Number(getOperationalTodayISO().slice(0,4)));
  var[sf,setSf]=useState(false);
  var[editId,setEditId]=useState(null);
  var[fa,setFa]=useState("all");
  var[ntf,setNtf]=useState(null);
  var EF={ac:"N35EA",orig:"",dest:"",date:initialOpsDate,time:"",rb:"",nt:"",pm:0,pw:0,pc:0,bg:0,st:"prog"};
  var[nf,setNf]=useState(EF);
  var[rc,setRc]=useState({ac:"N35EA",orig:"",dest:"",pm:0,pw:0,pc:0,bg:0,res:null});
  var[agentInstruction,setAgentInstruction]=useState("");
  var[agentResult,setAgentResult]=useState(null);
  var[agentValidation,setAgentValidation]=useState(null);
  var[pendingWrite,setPendingWrite]=useState(null);
  var[agentBusy,setAgentBusy]=useState(false);
  var[agentOpen,setAgentOpen]=useState(false);
  var[currentUser,setCurrentUser]=useState(null);
  var[actorName,setActorName]=useState("");
  var[recording,setRecording]=useState(false);
  var[transcribing,setTranscribing]=useState(false);
  var[agentLiveTranscript,setAgentLiveTranscript]=useState("");
  var[agentVoiceState,setAgentVoiceState]=useState("idle"); // idle | listening | thinking | speaking | clarification
  var[agentMessages,setAgentMessages]=useState([{role:"assistant",text:"¿En qué te puedo ayudar hoy? Puedo ayudarte a programar vuelos, consultar agenda, revisar aeronaves y responder dudas operativas.",ts:new Date().toISOString()}]);
  var[recorder,setRecorder]=useState(null);
  var[speechRec,setSpeechRec]=useState(null);
  var liveAnalyzeTimerRef=useRef(null);
  var realtimePcRef=useRef(null);
  var realtimeDcRef=useRef(null);
  var realtimeAudioRef=useRef(null);
  var realtimeStreamRef=useRef(null);
  var[realtimeConnected,setRealtimeConnected]=useState(false);
  var[realtimeConnecting,setRealtimeConnecting]=useState(false);
  var[realtimeText,setRealtimeText]=useState("");
  var[maintPlan,setMaintPlan]=useState(function(){
    try{return JSON.parse(localStorage.getItem("airpalace_maint_plan")||"{}");}catch{return{};}
  });
  var[pushState,setPushState]=useState("idle");
  var[recentAc,setRecentAc]=useState("all");
  var[recentCreator,setRecentCreator]=useState("all");
  var[recentDate,setRecentDate]=useState("30d");
  var[recentSource,setRecentSource]=useState("all");
  var[anMonth,setAnMonth]=useState("all");
  var[anYear,setAnYear]=useState(String(initialOpsDateParts[0]||Number(getOperationalTodayISO().slice(0,4))));
  var[listAlertFilter,setListAlertFilter]=useState("all");
  var[expandedConflictKeys,setExpandedConflictKeys]=useState({});
  var[hoveredCommandCard,setHoveredCommandCard]=useState("");
  var[scrollY,setScrollY]=useState(0);
  var[reducedMotion,setReducedMotion]=useState(false);
  var today=getOperationalTodayISO();

  function toErrorMessage(e) {
    if (!e) return "Error desconocido";
    if (typeof e === "string") return e;
    if (typeof e?.message === "string" && e.message) return e.message;
    return String(e);
  }

  function getCreatorMeta(source) {
    return {
      source,
      actorEmail: currentUser?.email || actorName || "",
      actorName: currentUser?.user_metadata?.name || actorName || "",
      actorUserId: currentUser?.id || "",
    };
  }

  function isAgentWriteAction(action) {
    return ["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"].includes(String(action || ""));
  }

  function getCreatorLabel(f) {
    var ordered=[
      f?.updated_by_name,
      f?.created_by_name,
      f?.updated_by_email,
      f?.created_by_email,
      f?.updated_by_user_name,
      f?.created_by_user_name,
      f?.updated_by_user_email,
      f?.created_by_user_email,
    ];
    var firstMeta=ordered.find(function(v){return String(v||"").trim();});
    if(firstMeta)return prettyName(firstMeta);
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

  function flightDepartureUtcLabel(f) {
    var dateIso = normalizeDateIso(f?.date);
    var depMins = parseTimeToMinutes(f?.time);
    var tz = resolveAirportTimezone(f?.orig, { fallbackTimeZone: "America/Merida" }).timeZone;
    if (!dateIso || !Number.isFinite(depMins) || !tz) return "UTC --:--";
    var utcMs = localDateTimeToUtcMs(dateIso, depMins, tz);
    return formatUtcLabel(utcMs);
  }

  function flightArrivalUtcLabel(f) {
    var eta = etaLocalUtc(f);
    return eta?.utc || "UTC --:--";
  }

  useEffect(function () {
    supabase.auth.getUser().then(function (r) {
      setCurrentUser(r?.data?.user || null);
      if (r?.data?.user?.email) setActorName(r.data.user.email);
    });
  }, []);

  async function callOpsWrite(action, payload) {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData?.session?.access_token;
    const response = await fetch("/api/ops-write", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, payload }),
    });
    const body = await response.json().catch(function(){return{};});
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    if (Array.isArray(body.side_effect_warnings) && body.side_effect_warnings.length) {
      setErrMsg(`Acción guardada con avisos operativos: ${body.side_effect_warnings.join("; ")}`);
      setPhase("warn");
      setTimeout(function(){setPhase("ready");}, 2200);
    }
    return body;
  }


  

  

  

  

  
  async function sendPushEvent(title, body, url){
    try{
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      await fetch("/api/send-push-notification",{method:"POST",headers:{"Content-Type":"application/json", ...(token ? { Authorization: `Bearer ${token}` } : {})},body:JSON.stringify({title,body,url:url||"/"})});
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

        if (!freshFlights.length && DEMO_SEED_ENABLED) {
          try {
            await callOpsWrite("restore_demo", {});
          } catch {}
          const seededFlights = await loadFlightsFromDb();
          setFsRaw(seededFlights);
        } else {
          setFsRaw(freshFlights);
        }

        if (!Object.keys(freshMaint.statusByAc).length && DEMO_SEED_ENABLED) {
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
  }, [DEMO_SEED_ENABLED]);

  useEffect(function () {
    if (typeof window === "undefined") return;
    var mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    var updatePreference = function(){ setReducedMotion(!!mq.matches); };
    updatePreference();
    if (mq.addEventListener) mq.addEventListener("change", updatePreference);
    else mq.addListener(updatePreference);
    var ticking = false;
    var onScroll = function(){
      if (reducedMotion) return;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function(){
        setScrollY(window.scrollY || window.pageYOffset || 0);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return function(){
      window.removeEventListener("scroll", onScroll);
      if (mq.removeEventListener) mq.removeEventListener("change", updatePreference);
      else mq.removeListener(updatePreference);
    };
  }, [reducedMotion]);

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
            saveMaintPlan(Object.assign({},freshMaint.planByAc||{}));
          } catch {}
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(flightsChannel);
      supabase.removeChannel(maintChannel);
    };
  }, []);

  useEffect(function(){
    return function(){
      if (liveAnalyzeTimerRef.current) clearTimeout(liveAnalyzeTimerRef.current);
      stopRealtimeVoice();
    };
  },[]);

  async function addFlight(flight) {
    const aircraftStatus = getAcStatus(flight.ac, flight.date);
    const outOfServiceWarning = aircraftStatus === "aog"
      ? `Advertencia: la aeronave ${flight.ac} actualmente se encuentra fuera de servicio (AOG). El vuelo puede programarse, pero deberá verificarse su disponibilidad antes de la operación.`
      : aircraftStatus === "mantenimiento"
        ? `Advertencia: la aeronave ${flight.ac} actualmente está en mantenimiento. El vuelo puede programarse, pero su disponibilidad deberá confirmarse antes de la fecha de salida.`
        : "";

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
        await callOpsWrite("create_flight", {
          ...flight,
          dest: stop.c,
          nt: noteWithActor((flight.nt ? flight.nt + " | " : "") + "Escala -> " + flight.dest, actorName),
        });
        await callOpsWrite("create_flight", {
          ...flight,
          orig: stop.c,
          time: "STBY",
          nt: noteWithActor("Tras recarga", actorName),
        });
      } else {
        await callOpsWrite("create_flight", { ...flight, nt: noteWithActor(flight.nt, actorName) });
      }

      setNtf({ fl: flight, lbl: "PROGRAMADO" });
      setSf(false);
      setEditId(null);
      setNf(Object.assign({}, EF, { date: sel }));
      if (outOfServiceWarning) {
        setErrMsg(outOfServiceWarning);
        setPhase("warn");
        setTimeout(() => setPhase("ready"), 2200);
      } else {
        setPhase("saved");
        setTimeout(() => setPhase("ready"), 1500);
      }
    } catch (e) {
      setErrMsg(toErrorMessage(e));
      setPhase("error");
    }
  }

  async function editFlight(flight) {
    setPhase("saving");
    try {
      const mutation = await callOpsWrite("edit_flight", {
        flight_id: flight.id,
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
      });

      setNtf({ fl: mutation.flight || flight, lbl: "MODIFICADO" });
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
    return chgStatus(id, "canc");
  }

  async function chgStatus(id, newSt) {
    setPhase("saving");

    try {
      if(newSt==="canc"){
        await callOpsWrite("cancel_flight", { flight_id: id });
      } else {
        await callOpsWrite("edit_flight", { flight_id: id, st: newSt });
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
      await callOpsWrite("change_aircraft_status", {
        ac: acId,
        status_change: newSt,
        maintenance_start_date: (newSt==="mantenimiento"||newSt==="aog")?(maintPlan[acId]?.from||null):null,
        maintenance_end_date: (newSt==="mantenimiento"||newSt==="aog")?(maintPlan[acId]?.to||null):null,
      });
      setMtRaw(function(prev){return Object.assign({},prev,{[acId]:newSt});});

      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1500);
    } catch (e) {
      if (String(e.message || "").toLowerCase().includes("maintenance_start_date") || String(e.message || "").toLowerCase().includes("maintenance_end_date")) {
        setErrMsg("Faltan columnas de persistencia en aircraft_status. Ejecuta la migración que agrega maintenance_start_date y maintenance_end_date.");
      } else {
        setErrMsg(e.message || String(e));
      }
      setPhase("error");
    }
  }

  async function persistMaintenanceDates(acId, nextPlanForAc, statusOverride) {
    try {
      await callOpsWrite("change_aircraft_status", {
        ac: acId,
        status_change: statusOverride || mt[acId] || "disponible",
        maintenance_start_date: nextPlanForAc?.from || null,
        maintenance_end_date: nextPlanForAc?.to || null,
      });
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
    }
  }

  async function restore() {
    if (!DEMO_SEED_ENABLED) {
      setErrMsg("La restauración demo está deshabilitada en este entorno.");
      setPhase("error");
      return;
    }
    if (!confirm("Restaurar todos los datos originales?")) return;

    setPhase("saving");

    try {
      await callOpsWrite("restore_demo", {});

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
    setAgentVoiceState("thinking");
    setPhase("saving");
    setErrMsg("");
    try {
      setAgentMessages(function(prev){return prev.concat([{role:"user",text:agentInstruction.trim(),ts:new Date().toISOString()}]);});
      const ctx = agentMessages.slice(-6).map(function(m){return `${m.role}: ${m.text}`;});
      const analyzed = await analyzeOpsInstruction(agentInstruction, ctx);
      const validated = await validateAgentResult(analyzed, agentInstruction);
      setAgentResult(analyzed);
      setAgentValidation(validated);
      if (isAgentWriteAction(validated.action) && !validated.errors?.length) {
        const token = validated.server_confirmation_token || null;
        setPendingWrite({
          validation: validated,
          token,
          card: {
            action: validated.action,
            aircraft: validated.payload?.ac || "-",
            route: validated.payload?.orig && validated.payload?.dest ? `${validated.payload.orig} → ${validated.payload.dest}` : "-",
            departure: validated.payload?.date && validated.payload?.time ? `${validated.payload.date} ${validated.payload.time}` : validated.payload?.date || validated.payload?.time || "-",
            requester: validated.payload?.rb || "-",
            notes: validated.payload?.nt || "-",
            statusChange: validated.payload?.status_change || "-",
          },
        });
      } else {
        setPendingWrite(null);
      }
      const clarificationText = validated.clarification_prompts && validated.clarification_prompts.length
        ? validated.clarification_prompts.join(" ")
        : (validated.errors && validated.errors.length ? validated.errors.join(" ") : (validated.human_summary || "Instrucción analizada."));
      setAgentMessages(function(prev){return prev.concat([{role:"assistant",text:clarificationText,ts:new Date().toISOString()}]);});
      speakAssistant(clarificationText);
      if (validated.requires_confirmation || (validated.errors && validated.errors.length) || isAgentWriteAction(validated.action)) {
        setAgentVoiceState("clarification");
      } else if (validated.can_execute && String(validated.action || "").startsWith("query_")) {
        await executeAgentInstruction(validated);
      } else {
        setAgentVoiceState("idle");
      }
      setPhase("saved");
      setTimeout(() => setPhase("ready"), 1200);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
      setAgentVoiceState("idle");
    } finally {
      setAgentBusy(false);
    }
  }

  function queueLiveAnalyze(nextInstruction) {
    try {
      if (liveAnalyzeTimerRef.current) clearTimeout(liveAnalyzeTimerRef.current);
      liveAnalyzeTimerRef.current = setTimeout(function () {
        if (!agentBusy && String(nextInstruction || "").trim()) analyzeAgentInstruction();
      }, 900);
    } catch {}
  }

  function speakAssistant(text){
    try{
      if(!text||typeof window==="undefined"||!("speechSynthesis" in window))return;
      window.speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(text);
      u.lang="es-MX";
      u.rate=1;
      u.onstart=function(){setAgentVoiceState("speaking");};
      u.onend=function(){setAgentVoiceState("idle");};
      u.onerror=function(){setAgentVoiceState("idle");};
      window.speechSynthesis.speak(u);
    }catch{}
  }

  function stopRealtimeVoice() {
    try {
      if (realtimeDcRef.current) realtimeDcRef.current.close();
      if (realtimePcRef.current) realtimePcRef.current.close();
      if (realtimeStreamRef.current) realtimeStreamRef.current.getTracks().forEach(function(t){t.stop();});
      realtimeDcRef.current = null;
      realtimePcRef.current = null;
      realtimeStreamRef.current = null;
      setRealtimeConnected(false);
      setRealtimeConnecting(false);
      setAgentVoiceState("idle");
      setRealtimeText("");
    } catch {}
  }

  async function startRealtimeVoice() {
    if (realtimeConnecting || realtimeConnected) return;
    setRealtimeConnecting(true);
    setAgentVoiceState("thinking");
    try {
      const { data: realtimeAuth } = await supabase.auth.getSession();
      const realtimeToken = realtimeAuth?.session?.access_token;
      const sessionResp = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(realtimeToken ? { Authorization: `Bearer ${realtimeToken}` } : {}) },
        body: JSON.stringify({
          instructions:
            "Actúa como front-end de transcripción en tiempo real para AI Pilot. Tu tarea principal es transcribir en español/inglés aeronáutico con alta precisión. No ejecutes acciones operativas por tu cuenta.",
        }),
      });
      const session = await sessionResp.json().catch(function(){return{};});
      if (!sessionResp.ok || !session.client_secret) throw new Error(session.error || "No se pudo iniciar sesión realtime.");

      const pc = new RTCPeerConnection();
      realtimePcRef.current = pc;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      realtimeAudioRef.current = remoteAudio;
      pc.ontrack = function(event) {
        if (event.streams && event.streams[0]) remoteAudio.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      realtimeStreamRef.current = stream;
      stream.getTracks().forEach(function(track){pc.addTrack(track, stream);});

      const dc = pc.createDataChannel("oai-events");
      realtimeDcRef.current = dc;
      dc.onopen = function(){
        setRealtimeConnected(true);
        setRealtimeConnecting(false);
        setAgentVoiceState("listening");
      };
      dc.onclose = function(){
        setRealtimeConnected(false);
        if (!realtimeConnecting) setAgentVoiceState("idle");
      };
      dc.onmessage = function(evt){
        try {
          const msg = JSON.parse(evt.data || "{}");
          if (msg.type === "input_audio_buffer.speech_started") {
            if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
            setAgentVoiceState("listening");
          } else if (msg.type === "response.created") {
            setAgentVoiceState("thinking");
          } else if (msg.type === "response.audio_transcript.delta") {
            setRealtimeText(function(prev){return `${prev}${msg.delta || ""}`.slice(-3000);});
          } else if (msg.type === "response.audio_transcript.done" && msg.transcript) {
            const transcript = String(msg.transcript || "").trim();
            if (transcript) {
              if (transcript.length >= 12 && window.speechSynthesis && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
              }
              setAgentInstruction(transcript);
              queueLiveAnalyze(transcript);
            }
            setAgentVoiceState("thinking");
          } else if (msg.type === "conversation.item.input_audio_transcription.completed" && msg.transcript) {
            const transcript2 = String(msg.transcript || "").trim();
            if (transcript2) {
              setAgentInstruction(transcript2);
              queueLiveAnalyze(transcript2);
            }
          } else if (msg.type === "response.done") {
            setAgentVoiceState("idle");
          }
        } catch {}
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const model = encodeURIComponent(String(import.meta.env.VITE_OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview"));
      const sdpResp = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.client_secret}`,
          "Content-Type": "application/sdp",
        },
      });
      const answerSdp = await sdpResp.text();
      if (!sdpResp.ok) throw new Error(answerSdp || `HTTP ${sdpResp.status}`);
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (e) {
      setErrMsg(e.message || String(e));
      setPhase("error");
      stopRealtimeVoice();
    } finally {
      setRealtimeConnecting(false);
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
      const { data: pushAuth } = await supabase.auth.getSession();
      const pushToken = pushAuth?.session?.access_token;
      const r=await fetch("/api/save-push-subscription",{method:"POST",headers:{"Content-Type":"application/json", ...(pushToken ? { Authorization: `Bearer ${pushToken}` } : {})},body:JSON.stringify({subscription:sub.toJSON()})});
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

      const { data: transcribeAuth } = await supabase.auth.getSession();
      const transcribeToken = transcribeAuth?.session?.access_token;
      const r = await fetch("/api/transcribe-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(transcribeToken ? { Authorization: `Bearer ${transcribeToken}` } : {}) },
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
    if (recording && (speechRec || recorder)) {
      if (speechRec) speechRec.stop();
      if (recorder && recorder.state !== "inactive") recorder.stop();
      setRecording(false);
      setAgentVoiceState("idle");
      setAgentLiveTranscript("");
      return;
    }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        if (typeof MediaRecorder === "undefined") throw new Error("Tu navegador no soporta voz en tiempo real ni grabación.");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];
        var mimeCandidates=["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"];
        var selected=mimeCandidates.find(function(m){return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m);})||"";
        const mediaRecorder = selected?new MediaRecorder(stream,{mimeType:selected}):new MediaRecorder(stream);
        mediaRecorder.ondataavailable = function(e){ if(e.data&&e.data.size>0)chunks.push(e.data); };
        mediaRecorder.onstart = function(){setAgentVoiceState("listening");};
        mediaRecorder.onstop = function(){
          stream.getTracks().forEach(function(t){t.stop();});
          setRecording(false);
          setAgentVoiceState("thinking");
          const blob = new Blob(chunks, { type: selected || chunks[0]?.type || "audio/mp4" });
          transcribeAudio(blob).finally(function(){setAgentVoiceState("idle");});
        };
        setRecorder(mediaRecorder);
        mediaRecorder.start();
        setRecording(true);
        return;
      }
      const recognition = new SR();
      recognition.lang = "es-MX";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = function(){setAgentVoiceState("listening");};
      recognition.onresult = function(event){
        let interim = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) finalText += text + " ";
          else interim += text;
        }
        if (interim) setAgentLiveTranscript(interim.trim());
        if (finalText.trim()) {
          if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel();
          setAgentInstruction(function(prev){
            const next = `${String(prev||"").trim()} ${finalText.trim()}`.trim();
            queueLiveAnalyze(next);
            return next;
          });
          setAgentLiveTranscript("");
        }
      };
      recognition.onerror = function(e){
        setErrMsg(e?.error ? `Reconocimiento de voz: ${e.error}` : "Error de reconocimiento de voz.");
        setPhase("error");
        setAgentVoiceState("idle");
      };
      recognition.onend = function(){
        setRecording(false);
        if (agentVoiceState === "listening") setAgentVoiceState("idle");
      };
      setSpeechRec(recognition);
      recognition.start();
      setRecording(true);
    } catch (e) {
      setErrMsg(e?.message || "No se pudo iniciar el micrófono.");
      setPhase("error");
      setAgentVoiceState("idle");
    }
  }

  async function executeAgentInstruction(validationOverride) {
    const validation = validationOverride || pendingWrite?.validation || agentValidation;
    if (!validation) return;
    const isPendingWriteConfirm = !validationOverride && !!pendingWrite && isAgentWriteAction(validation.action) && !(validation.errors && validation.errors.length);
    if (!validation.can_execute && !isPendingWriteConfirm) return;
    setAgentBusy(true);
    setPhase("saving");
    setErrMsg("");
    try {
      let execRes = null;
      const isWriteAction = isAgentWriteAction(validation.action);
      if (isWriteAction) {
        if (!pendingWrite?.token && !validationOverride) throw new Error("Falta token de confirmación del servidor.");
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const response = await fetch("/api/ai-write", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            action: validation.action,
            payload: validation.payload,
            confirmed: !!pendingWrite && !validationOverride,
            confirmation_token: pendingWrite?.token || null,
          }),
        });
        execRes = await response.json().catch(function(){return{};});
        if (!response.ok) throw new Error(execRes.error || `HTTP ${response.status}`);
      } else {
        execRes = await executeAgentAction(validation, {
          calcRoute: calcR,
          creatorMeta: getCreatorMeta("ai"),
          instruction: agentInstruction,
          confirmed: false,
          confirmationToken: null,
        });
      }
      if (execRes?.requires_confirmation) {
        setPendingWrite(function(prev){return prev||{validation,token:execRes.confirmation_token,card:execRes.confirmation_card};});
        setAgentVoiceState("clarification");
        setAgentMessages(function(prev){return prev.concat([{role:"assistant",text:execRes.message || "Confirma por escrito para ejecutar.",ts:new Date().toISOString()}]);});
        speakAssistant(execRes.message || "Confirma por escrito para ejecutar.");
        return;
      }
      if (!validationOverride) {
        setAgentInstruction("");
        setAgentResult(null);
        setAgentValidation(null);
        setPendingWrite(null);
      }
      if (execRes && execRes.warning) {
        setErrMsg(`Vuelo creado, pero WhatsApp falló: ${execRes.warning}`);
        setPhase("error");
        setTimeout(function(){setPhase("ready");}, 2200);
        return;
      }
      if (execRes && Array.isArray(execRes.side_effect_warnings) && execRes.side_effect_warnings.length) {
        setErrMsg(`Acción ejecutada con avisos operativos: ${execRes.side_effect_warnings.join("; ")}`);
        setPhase("warn");
        setTimeout(function(){setPhase("ready");}, 2200);
      }
      if (execRes && execRes.message) {
        const rendered = execRes.data?.flights && execRes.data.flights.length
          ? `${execRes.message}\n${execRes.data.flights.map(function(f){return `• ${f.date} ${f.time||"STBY"} · ${f.ac} · ${f.orig} → ${f.dest} (${f.rb||"-"})`;}).join("\n")}`
          : execRes.message;
        setAgentMessages(function(prev){return prev.concat([{role:"assistant",text:rendered,ts:new Date().toISOString()}]);});
        speakAssistant(execRes.message);
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

  var pos=useMemo(function(){return getPos(fs,today);},[fs,today]);
  var monthKey=today.slice(0,7);
  var aircraftCommandCards=useMemo(function(){
    return Object.values(AC).map(function(a){
      var liveUrl=resolveFlightAwareUrl(a);
      var timeline=getAircraftTimeline(fs,a.id,today);
      var atBase=(pos[a.id]||a.base)===a.base;
      var routeStatus=buildRouteStatusLine({inFlight:timeline.inFlight,lastLeg:timeline.lastLeg,isAtBase:atBase});
      var metricsMonth=getMonthlyAircraftMetrics(fs,a.id,monthKey);
      var isStandby=!timeline.inFlight && String(timeline.upcoming?.time||"").toUpperCase()==="STBY";
      var opStatus=deriveOperationalStatus({maintenanceStatus:mt[a.id]||"disponible",isInFlight:Boolean(timeline.inFlight),isStandby:isStandby});
      return {
        id:a.id,
        tag:a.tag,
        type:a.type,
        color:a.clr,
        location:pos[a.id]||a.base,
        liveUrl:liveUrl,
        routeStatus:routeStatus,
        metricsMonth:metricsMonth,
        opStatus:opStatus,
        nextLine:buildNextFlightLine(timeline.upcoming),
      };
    });
  },[fs,today,pos,mt,monthKey]);
  var dayF=useMemo(function(){return fs.filter(function(f){return f.date===sel&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.time==="STBY"?1:b.time==="STBY"?-1:String(a.time).localeCompare(String(b.time));});},[fs,sel,fa]);
  var upcoming=useMemo(function(){return fs.filter(function(f){return f.date>=today&&f.st!=="canc"&&f.st!=="comp"&&(fa==="all"||f.ac===fa);}).sort(function(a,b){return a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time));}).slice(0,20);},[fs,today,fa]);
  var operationalFlights=useMemo(function(){return fs.filter(function(f){return f.st!=="canc"&&f.st!=="comp"&&f.date>=today;});},[fs,today]);
  var conflictPairs=useMemo(function(){return detectFlightConflicts(operationalFlights,{activeStatuses:["prog","enc"]});},[operationalFlights]);
  var dataIssueTypes=useMemo(function(){return new Set(["invalid_chronology","timezone_mismatch","display_time_mismatch"]);},[]);
  var conflictList=useMemo(function(){return uniqueFlightsFromConflicts(conflictPairs);},[conflictPairs]);
  var conflictsBySeverity=useMemo(function(){
    return conflictPairs.reduce(function(acc,c){
      var sev=String(c.severity||"warning");
      acc[sev]=(acc[sev]||0)+1;
      return acc;
    },{critical:0,warning:0});
  },[conflictPairs]);
  var conflictBuckets=useMemo(function(){
    return conflictPairs.reduce(function(acc,c){
      if(dataIssueTypes.has(String(c.type||"")))acc.timeData+=1;
      else acc.operational+=1;
      return acc;
    },{operational:0,timeData:0});
  },[conflictPairs,dataIssueTypes]);
  function conflictTypeLabel(type){
    if(type==="aircraft_overlap")return"Operational · Aircraft overlap";
    if(type==="pilot_overlap")return"Operational · Pilot overlap";
    if(type==="turnaround_insufficient")return"Operational · Turnaround insufficient";
    if(type==="location_mismatch")return"Operational · Location mismatch";
    if(type==="blocked_resource")return"Operational · Blocked resource";
    if(type==="invalid_chronology")return"Time/Data · Invalid chronology";
    if(type==="timezone_mismatch")return"Time/Data · Timezone mismatch";
    if(type==="display_time_mismatch")return"Time/Data · Display time mismatch";
    return String(type||"unknown");
  }
  var listFlights=useMemo(function(){
    if(listAlertFilter==="conflicts")return conflictList;
    if(listAlertFilter==="today")return fs.filter(function(f){return f.date===today&&f.st!=="canc";});
    if(listAlertFilter==="tomorrow"){var t2=getOperationalTomorrowISO();return fs.filter(function(f){return f.date===t2&&f.st!=="canc";});}
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
    var start7=getOperationalDateOffsetISO(-7);var start30=getOperationalDateOffsetISO(-30);
    return fs
      .filter(function(f){
        if(recentAc!=="all"&&f.ac!==recentAc)return false;
        if(recentCreator!=="all"&&getCreatorLabel(f)!==recentCreator)return false;
        if(recentSource!=="all"&&String(f.creation_source||"manual")!==recentSource)return false;
        var dIso=String(f.created_at||f.date||today).slice(0,10);
        if(recentDate==="today"&&dIso!==today)return false;
        if(recentDate==="7d"&&dIso<start7)return false;
        if(recentDate==="30d"&&dIso<start30)return false;
        return true;
      })
      .sort(function(a,b){return String(b.created_at||"").localeCompare(String(a.created_at||""))||String(b.date||"").localeCompare(String(a.date||""));});
  },[fs,recentAc,recentCreator,recentDate,recentSource,today]);
  var activeForMgmt=useMemo(function(){return fs.filter(function(f){return f.st!=="canc"&&f.st!=="comp";});},[fs]);
  var flightsByAc=useMemo(function(){var o={N35EA:0,N540JL:0};activeForMgmt.forEach(function(f){o[f.ac]=(o[f.ac]||0)+1;});return o;},[activeForMgmt]);
  var hoursByAc=useMemo(function(){var o={N35EA:0,N540JL:0};activeForMgmt.forEach(function(f){var r=calcR(f.orig,f.dest,f.ac,{m:f.pm,w:f.pw,c:f.pc},f.bg);o[f.ac]+=(r?r.bm:60)/60;});return o;},[activeForMgmt]);
  var requestsByPerson=useMemo(function(){var o={};fs.filter(function(f){return f.st!=="canc";}).forEach(function(f){var k=f.rb||"No disponible";o[k]=(o[k]||0)+1;});return Object.entries(o).sort(function(a,b){return b[1]-a[1];});},[fs]);
  var tomorrow=getOperationalTomorrowISO();
  var opsAlerts=useMemo(function(){
    var unavailable=Object.keys(AC).filter(function(id){return getAcStatus(id,today)!=="disponible";});
    var maint=Object.keys(AC).filter(function(id){return getAcStatus(id,today)==="mantenimiento";});
    var aog=Object.keys(AC).filter(function(id){return getAcStatus(id,today)==="aog";});
    var outBase=Object.keys(AC).filter(function(id){return pos[id]!==AC[id].base;});
    var conflicts=conflictList.length;
    var pending=fs.filter(function(f){return f.st==="prog";}).length;
    return{today:todayFs.length,tomorrow:fs.filter(function(f){return f.date===tomorrow&&f.st!=="canc";}).length,unavailable:unavailable.length,maint:maint.length,aog:aog.length,conflicts:conflicts,pending:pending,outBase:outBase.length,recentChanges:fs.filter(function(f){return (f.updated_at||f.created_at||"").slice(0,10)>=today;}).length};
  },[fs,today,tomorrow,todayFs,pos,mt,maintPlan,conflictList]);
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
    var tomFlights=fs.filter(function(f){return f.date===tomorrow&&f.st!=="canc";});
    if(tomFlights.length>0){
      var f0=tomFlights[0];
      var tomorrowPush=buildOpsPush("tomorrow_flight",{ac:f0.ac});
      sendPushOnce("push_tomorrow_"+tomorrow, tomorrowPush.title, tomorrowPush.body);
    }
  },[fs,tomorrow]);

  if(phase==="loading")return <div className="ops-loading-shell"><div style={{textAlign:"center",color:"#97a7c4"}}><div style={{fontSize:34,marginBottom:12}}>✈</div><div style={{fontSize:14,fontWeight:600,letterSpacing:0.4}}>Cargando centro de operaciones...</div></div></div>;

  var TABS=[{k:"cal",l:"Agenda"},{k:"list",l:"Vuelos"},{k:"recent",l:"Recientes"},{k:"plan",l:"Planificar"},{k:"gest",l:"Gestión"}];
  var mapOffset = reducedMotion ? 0 : Math.min(72, scrollY * 0.08);
  var glowOffset = reducedMotion ? 0 : Math.min(54, scrollY * 0.05);
  var panelPrimary={background:"linear-gradient(165deg,rgba(9,17,31,.94),rgba(16,28,45,.9))",border:"1px solid rgba(148,163,184,.25)",borderRadius:16,boxShadow:"0 14px 28px rgba(2,6,23,.26)"};
  var panelSecondary={background:"linear-gradient(165deg,rgba(12,21,37,.9),rgba(16,28,45,.82))",border:"1px solid rgba(148,163,184,.2)",borderRadius:12};
  var flightCardSurface={background:"linear-gradient(168deg,rgba(12,21,37,.92),rgba(18,31,48,.84))",border:"1px solid rgba(196,168,120,.42)",borderRadius:12,boxShadow:"0 10px 20px rgba(2,6,23,.24)"};
  var subtleText="#9fb0cd";
  var strongText="#e2e8f0";

  return(
    <div className="ops-app-shell">
      <div className="ops-bg-base" />
      <div className="ops-bg-glow" style={{transform:`translate3d(0,${glowOffset}px,0)`}} />
      <div className="ops-bg-map" style={{transform:`translate3d(0,${mapOffset}px,0)`, backgroundImage:`url("${TECH_MAP_SVG}")`}} />
      <div className="ops-bg-noise" />
      <div style={{fontFamily:"Inter,-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",maxWidth:480,margin:"0 auto",minHeight:"100vh",position:"relative",zIndex:1,paddingBottom:10}}>

      <div style={{background:"linear-gradient(160deg,rgba(12,20,34,.95),rgba(17,29,48,.82))",padding:"18px 16px 14px",borderRadius:"0 0 22px 22px",boxShadow:"0 18px 42px rgba(2,6,23,.42)",border:"1px solid rgba(148,163,184,.16)",backdropFilter:"blur(6px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center"}}>
            <div><div style={{fontSize:9,color:"#7b8cab",fontWeight:700,letterSpacing:4}}>AIRPALACE</div><div style={{fontSize:22,fontWeight:700,color:"#e7eefb",letterSpacing:0.3}}>Flight Ops</div></div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
          {aircraftCommandCards.map(function(card){
            var monthHoursLabel=Number.isFinite(card?.metricsMonth?.hours)?card.metricsMonth.hours.toFixed(1)+" h":"-- h";
            return(
              <div
                key={card.id}
                onMouseEnter={function(){setHoveredCommandCard(card.id);}}
                onMouseLeave={function(){setHoveredCommandCard("");}}
                style={{borderRadius:15,padding:"11px 11px 10px",border:"1px solid "+card.opStatus.tone+"52",background:"linear-gradient(168deg,rgba(7,15,30,.9),rgba(15,25,42,.76))",boxShadow:hoveredCommandCard===card.id?"0 16px 24px rgba(2,6,23,.45)":"0 8px 16px rgba(2,6,23,.3)",transform:hoveredCommandCard===card.id?"translateY(-2px)":"none",transition:"transform .22s ease, box-shadow .22s ease, border-color .22s ease"}}
              >
                <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:card.color,letterSpacing:0.4}}>{card.id} · {card.tag}</div>
                    <div style={{fontSize:9,color:"#8a9ab5",marginTop:1}}>{card.type}</div>
                  </div>
                  <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                    <span style={{fontSize:9,padding:"2px 8px",borderRadius:999,border:"1px solid "+card.opStatus.tone+"65",background:"rgba(11,18,32,.8)",color:card.opStatus.tone,fontWeight:700,letterSpacing:0.3}}>{card.opStatus.label}</span>
                    {card.liveUrl&&<a href={card.liveUrl} target="_blank" rel="noopener noreferrer" aria-label={"Live Track "+card.id+" en FlightAware"} style={{fontSize:9,padding:"2px 8px",borderRadius:999,textDecoration:"none",border:"1px solid #7dd3fc4a",background:"rgba(8,36,60,.62)",color:"#9eddff",fontWeight:700,display:"inline-flex",alignItems:"center",gap:4}}>● Live Track</a>}
                  </div>
                </div>
                <div style={{marginTop:7,padding:"7px 8px",borderRadius:10,background:"rgba(15,23,42,.56)",border:"1px solid rgba(148,163,184,.2)"}}>
                  <div style={{fontSize:11,fontWeight:600,color:"#e2e8f0",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{fontSize:10,color:"#93c5fd"}}>◈</span>
                    {card.location}
                  </div>
                  <div style={{fontSize:9,color:"#afbee6",marginTop:3,lineHeight:1.3}}>{card.nextLine}</div>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:7,alignItems:"center"}}>
                  <div style={{fontSize:9,color:"#cbd5e1"}}>{card.metricsMonth.flights} vuelos mes · {monthHoursLabel}</div>
                  <div style={{fontSize:8,color:"#64748b",letterSpacing:0.4,textTransform:"uppercase"}}>Command</div>
                </div>
                <div style={{fontSize:9,color:"#bfdbfe",marginTop:3,lineHeight:1.3}}>{card.routeStatus}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat("+TABS.length+",1fr)",gap:5,padding:"10px 14px 0"}}>
        {TABS.map(function(t){return <button key={t.k} onClick={function(){setVw(t.k);}} style={{padding:"10px 6px",border:"1px solid "+(vw===t.k?"rgba(148,163,184,.44)":"rgba(71,85,105,.28)"),borderRadius:11,fontSize:12,fontWeight:600,cursor:"pointer",background:vw===t.k?"linear-gradient(140deg,rgba(226,232,240,.95),rgba(203,213,225,.86))":"rgba(15,23,42,.52)",color:vw===t.k?"#0f172a":"#a9b5cc",transition:"all .2s ease"}}>{t.l}</button>;})}
      </div>
      {vw!=="gest"&&vw!=="plan"&&<div style={{display:"flex",gap:5,padding:"8px 14px"}}>
        {[{k:"all",l:"✈️ Ambas",c:"#22c55e"},{k:"N35EA",l:"🔵 N35EA",c:AC.N35EA.clr},{k:"N540JL",l:"🟠 N540JL",c:AC.N540JL.clr}].map(function(f){return <button key={f.k} onClick={function(){setFa(f.k);}} style={{padding:"5px 12px",border:"1.5px solid "+f.c,borderRadius:16,fontSize:11,fontWeight:700,cursor:"pointer",background:fa===f.k?f.c:"transparent",color:fa===f.k?"#fff":f.c}}>{f.l}</button>;})}
      </div>}
      {vw==="cal"&&<div style={{padding:"0 14px"}}>
        <div style={Object.assign({},panelPrimary,{borderRadius:18,padding:14,marginBottom:14})}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <button onClick={function(){var m=cM-1,y=cY;if(m<0){m=11;y--;}setCM(m);setCY(y);}} style={NB}>◀</button>
            <span style={{fontSize:21,fontWeight:700,color:strongText}}>{MN[cM]+" "+cY}</span>
            <button onClick={function(){var m=cM+1,y=cY;if(m>11){m=0;y++;}setCM(m);setCY(y);}} style={NB}>▶</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,textAlign:"center"}}>
            {["L","M","X","J","V","S","D"].map(function(d){return <div key={d} style={{fontSize:11,color:"#8ea2c8",fontWeight:700,padding:"4px 0"}}>{d}</div>;})}
            {gmd(cY,cM).map(function(d,i){var ds=tds(d.d),df=fs.filter(function(f){return f.date===ds&&(fa==="all"||f.ac===fa);}),iS=ds===sel,iT=ds===today;return(
              <div key={i} onClick={function(){if(!d.o)setSel(ds);}} style={{aspectRatio:"1",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:10,cursor:d.o?"default":"pointer",background:iS?"#1e3a5f":iT?"rgba(30,41,59,.68)":"transparent",opacity:d.o?.25:1}}>
                <span style={{fontSize:13,fontWeight:iT||iS?700:400,color:iS?"#f8fafc":"#dbeafe"}}>{d.d.getDate()}</span>
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
          <div key={f.id} style={Object.assign({},flightCardSurface,{borderLeft:"3px solid "+a.clr,padding:"14px 16px",marginBottom:10})}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:800,color:a.clr}}>{f.ac} {a.tag}</span>
              <span style={{fontSize:10,background:s.b,color:s.c,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{s.i} {s.l}</span>
              <div style={{flex:1}}/>
              <a href={makeCalUrl(f)} target="_blank" rel="noreferrer" style={{background:"rgba(30,41,59,.8)",border:"1px solid rgba(148,163,184,.28)",borderRadius:7,padding:"4px 8px",fontSize:13,textDecoration:"none",color:"#cbd5e1"}}>📅</a>
              <button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{background:"rgba(30,41,59,.8)",border:"1px solid rgba(148,163,184,.28)",borderRadius:7,padding:"4px 8px",fontSize:13,cursor:"pointer",color:"#cbd5e1"}}>✏️</button>
              <button onClick={function(){delFlight(f.id);}} style={{background:"rgba(30,41,59,.8)",border:"1px solid rgba(148,163,184,.28)",borderRadius:7,padding:"4px 8px",fontSize:13,cursor:"pointer",color:"#94a3b8"}}>×</button>
            </div>
            <div style={{fontWeight:700,color:"#f1f5f9",fontSize:17}}>{f.orig} <span style={{color:"#94a3b8"}}>→</span> {f.dest}</div>
            <div style={{color:subtleText,fontSize:13,marginTop:2}}>{ftm(f.time)} · {f.rb||"-"}{px>0?" · "+px+" pax":""}{f.nt?" · "+f.nt:""}</div>
            <div style={{fontSize:11,color:"#9fb0cd"}}>UTC salida: {flightDepartureUtcLabel(f)}</div>
            {etaLocalUtc(f)&&<div style={{fontSize:11,color:"#bfdbfe",marginTop:3}}>🕓 ETA local destino: {etaLocalUtc(f).local}</div>}
            {etaLocalUtc(f)&&<div style={{fontSize:11,color:"#9fb0cd"}}>UTC llegada: {flightArrivalUtcLabel(f)}</div>}
            {rt&&<div style={{marginTop:6,fontSize:12,color:"#cbd5e1",background:"rgba(15,23,42,.72)",borderRadius:8,padding:"6px 8px",border:"1px solid rgba(148,163,184,.2)"}}>
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
        {listAlertFilter==="conflicts"&&<div style={{background:"linear-gradient(160deg,rgba(11,20,35,.92),rgba(15,27,43,.84))",borderRadius:12,padding:10,marginBottom:10,border:"1px solid rgba(148,163,184,.24)"}}>
          <div style={{fontSize:13,fontWeight:800,color:"#f1f5f9"}}>Total conflictos: {conflictPairs.length}</div>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <span style={{fontSize:11,fontWeight:700,color:"#fca5a5",background:"rgba(127,29,29,.28)",padding:"3px 8px",borderRadius:999,border:"1px solid rgba(239,68,68,.35)"}}>Críticos: {conflictsBySeverity.critical||0}</span>
            <span style={{fontSize:11,fontWeight:700,color:"#fcd34d",background:"rgba(113,63,18,.28)",padding:"3px 8px",borderRadius:999,border:"1px solid rgba(245,158,11,.35)"}}>Warning: {conflictsBySeverity.warning||0}</span>
            <span style={{fontSize:11,fontWeight:700,color:"#93c5fd",background:"rgba(30,64,175,.25)",padding:"3px 8px",borderRadius:999,border:"1px solid rgba(59,130,246,.35)"}}>Operacionales: {conflictBuckets.operational||0}</span>
            <span style={{fontSize:11,fontWeight:700,color:"#c4b5fd",background:"rgba(91,33,182,.24)",padding:"3px 8px",borderRadius:999,border:"1px solid rgba(139,92,246,.34)"}}>Tiempo/Datos: {conflictBuckets.timeData||0}</span>
          </div>
        </div>}
        {listAlertFilter==="conflicts" ? (
          conflictPairs.length===0 ? <div style={{textAlign:"center",color:"#475569",padding:30}}>Sin conflictos detectados</div> : conflictPairs.map(function(c,idx){
            var key=String(c.flightId||"")+"::"+String(c.conflictingFlightId||"")+"::"+String(c.type||idx);
            var isOpen=!!expandedConflictKeys[key];
            var sevCritical=c.severity==="critical";
            var cardBg=sevCritical?"linear-gradient(155deg,rgba(69,10,10,.5),rgba(24,24,27,.78))":"linear-gradient(155deg,rgba(120,53,15,.45),rgba(24,24,27,.76))";
            var borderColor=sevCritical?"#f87171":"#fbbf24";
            var fg=sevCritical?"#fecaca":"#fde68a";
            var flightA=(c.flights&&c.flights[0])||null;
            var flightB=(c.flights&&c.flights[1])||null;
            return <div key={key} style={{background:cardBg,border:"1px solid "+borderColor+"66",borderLeft:"3px solid "+borderColor,borderRadius:12,padding:"10px 12px",marginBottom:8,boxShadow:"0 10px 26px rgba(2,6,23,.24)"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:10,fontWeight:800,color:fg,background:sevCritical?"#fecaca":"#fde68a",padding:"2px 8px",borderRadius:999}}>{sevCritical?"CRITICAL":"WARNING"}</span>
                <span style={{fontSize:11,fontWeight:700,color:fg}}>{conflictTypeLabel(c.type)}</span>
                <div style={{flex:1}}/>
                <button onClick={function(){setExpandedConflictKeys(function(prev){var n=Object.assign({},prev);n[key]=!n[key];return n;});}} style={{border:"none",background:"transparent",fontSize:11,fontWeight:700,color:fg,cursor:"pointer"}}>{isOpen?"Ocultar":"Ver detalle"}</button>
              </div>
              <div style={{fontSize:13,fontWeight:700,color:"#f8fafc",marginTop:4}}>{c.message}</div>
              <div style={{fontSize:11,color:"#cbd5e1",marginTop:5}}>
                Vuelo A: {flightA?(String(flightA.id||"-")+" · "+String(flightA.ac||"-")+" · "+String(flightA.orig||"-")+" → "+String(flightA.dest||"-")):"-"}
                {flightB&&<span> | Vuelo B: {String(flightB.id||"-")} · {String(flightB.ac||"-")} · {String(flightB.orig||"-")} → {String(flightB.dest||"-")}</span>}
              </div>
              {isOpen&&<div style={{marginTop:8,paddingTop:8,borderTop:"1px dashed "+borderColor+"AA"}}>
                <div style={{fontSize:11,color:"#dbeafe"}}><strong>Tipo:</strong> {conflictTypeLabel(c.type)}</div>
                <div style={{fontSize:11,color:"#dbeafe"}}><strong>Recurso:</strong> {c.resourceType} · {c.resourceLabel||"-"}</div>
                <div style={{fontSize:11,color:"#dbeafe"}}><strong>Razón exacta:</strong> {c.details?.reason||"n/a"}</div>
                <div style={{fontSize:11,color:"#dbeafe",marginTop:3}}>Ventana A: {c.details?.startA||"-"} → {c.details?.endA||"-"}</div>
                <div style={{fontSize:11,color:"#dbeafe"}}>Ventana B: {c.details?.startB||"-"} → {c.details?.endB||"-"}</div>
                <div style={{fontSize:11,color:"#dbeafe"}}>Solape: {Number(c.details?.overlapMinutes||0)} min{c.details?.airportMismatch?" · mismatch de aeropuerto":""}</div>
                <div style={{fontSize:11,color:"#dbeafe",marginTop:3}}>
                  <strong>Registros involucrados:</strong> {c.flightId||"-"}{c.conflictingFlightId?(" , "+c.conflictingFlightId):""}
                </div>
                {(c.details?.rawTimestamps||c.details?.parsedUtc||c.details?.displayedLocal)&&<div style={{fontSize:10,color:"#cbd5e1",marginTop:4,background:"rgba(15,23,42,.65)",borderRadius:8,padding:"6px 8px",border:"1px solid rgba(148,163,184,.2)"}}>
                  <div><strong>Raw stored:</strong> {JSON.stringify(c.details?.rawTimestamps||{})}</div>
                  <div><strong>Parsed UTC:</strong> {JSON.stringify(c.details?.parsedUtc||{})}</div>
                  <div><strong>Displayed local:</strong> {JSON.stringify(c.details?.displayedLocal||{})}</div>
                </div>}
                <div style={{marginTop:6,fontSize:12,fontWeight:800,color:"#0f172a"}}>Suggested fix</div>
                <div style={{fontSize:11,color:fg,marginTop:2}}>{c.suggestedFix}</div>
              </div>}
            </div>;
          })
        ) : (
          listFlights.length===0 ? <div style={{textAlign:"center",color:"#475569",padding:30}}>Sin vuelos</div> : listFlights.map(function(f){var a=AC[f.ac],s=STS[f.st]||STS.prog;return(
            <div key={f.id} style={{marginBottom:4}}><div style={{fontSize:11,fontWeight:600,color:"#64748b",marginTop:8,marginBottom:2}}>{fdt(f.date)}</div>
              <div style={Object.assign({},flightCardSurface,{borderLeft:"3px solid "+a.clr,padding:"8px 12px"})}>
                <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:11,fontWeight:800,color:a.clr}}>{f.ac}</span><span style={{fontSize:10,background:s.b,color:s.c,padding:"1px 6px",borderRadius:8,fontWeight:700}}>{s.i} {s.l}</span><div style={{flex:1}}/><a href={makeCalUrl(f)} target="_blank" rel="noreferrer" style={{fontSize:11,textDecoration:"none"}}>📅</a><button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{background:"#f1f5f9",border:"none",borderRadius:7,padding:"3px 7px",fontSize:11,cursor:"pointer"}}>✏️</button></div>
                <div style={{fontWeight:700,color:"#f1f5f9",fontSize:14}}>{f.orig+" → "+f.dest}</div>
                <div style={{fontSize:12,color:"#9fb0cd"}}>{ftm(f.time)+" · "+(f.rb||"-")}</div>
                <div style={{fontSize:11,color:"#9fb0cd"}}>UTC salida: {flightDepartureUtcLabel(f)}</div>
                {etaLocalUtc(f)&&<div style={{fontSize:11,color:"#9fb0cd"}}>UTC llegada: {flightArrivalUtcLabel(f)}</div>}
                <div style={{fontSize:11,color:"#9fb0cd"}}>Última edición: {getCreatorLabel(f)}</div>
                {etaLocalUtc(f)&&<div style={{fontSize:11,color:"#bfdbfe",marginTop:2}}>ETA destino: {etaLocalUtc(f).local}</div>}
              </div>
            </div>
          );})
        )}
      </div>}

      {vw==="recent"&&<div style={{padding:"0 14px 24px"}}>
        <div style={{fontWeight:700,color:"#fff",fontSize:15,marginBottom:8}}>🕘 Últimos vuelos creados</div>
        <div style={Object.assign({},panelPrimary,{padding:10,marginBottom:10})}>
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
          <div key={f.id} style={Object.assign({},flightCardSurface,{padding:12,marginBottom:8,borderLeft:"3px solid "+(AC[f.ac]?.clr||"#64748b")})}>
            <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
            <div style={{fontSize:12,fontWeight:800,color:"#f8fafc"}}>{f.date} · {ftm(f.time)}</div>
              <span style={{fontSize:10,background:s.b,color:s.c,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{s.i} {s.l}</span>
            </div>
            <div style={{fontSize:11,color:"#475569"}}>UTC salida: {flightDepartureUtcLabel(f)}</div>
            {etaLocalUtc(f)&&<div style={{fontSize:11,color:"#475569"}}>UTC llegada: {flightArrivalUtcLabel(f)}</div>}
            <div style={{fontWeight:800,color:"#f8fafc",fontSize:15}}>{f.ac} · {f.orig} → {f.dest}</div>
            <div style={{fontSize:12,color:"#9fb0cd"}}>Solicitó: {f.rb||"-"}</div>
            <div style={{fontSize:11,color:"#9fb0cd",marginTop:4}}>{f.updated_at?"Actualizado":"Creado"}: {formatCreatedAt(f.updated_at||f.created_at)} · Tipo: {(f.creation_source||"manual").toUpperCase()}</div>
            <button onClick={function(){setNf(Object.assign({},f));setEditId(f.id);setSf(true);}} style={{marginTop:7,fontSize:11,padding:"6px 10px",borderRadius:8,border:"1px solid #1d4ed8",background:"#dbeafe",color:"#1d4ed8",fontWeight:700,cursor:"pointer"}}>✏️ Editar</button>
          </div>);})}
      </div>}

      {vw==="plan"&&<div style={{padding:"0 14px 24px"}}>
        <div style={Object.assign({},panelPrimary,{borderRadius:18,padding:16})}>
          <div style={{fontWeight:800,fontSize:16,color:"#e2e8f0"}}>🧭 Planificación de vuelo</div>
          <div style={{fontSize:11,color:"#8ea2c8",marginBottom:14}}>Rutas IFR +18% · Block +20min</div>
          <label style={LS}>Aeronave</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>{Object.values(AC).map(function(a){return <button key={a.id} onClick={function(){setRc(function(p){return Object.assign({},p,{ac:a.id,res:null});});}} style={{flex:1,padding:"10px 8px",border:"2px solid "+a.clr,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",background:rc.ac===a.id?a.clr:"transparent",color:rc.ac===a.id?"#fff":a.clr}}>{a.id}<br/><span style={{fontSize:10,fontWeight:500}}>{a.tag}</span></button>;})}</div>
          <ApIn value={rc.orig} onChange={function(v){setRc(function(p){return Object.assign({},p,{orig:v,res:null});});}} label="Origen"/>
          <ApIn value={rc.dest} onChange={function(v){setRc(function(p){return Object.assign({},p,{dest:v,res:null});});}} label="Destino"/>
          <div style={{background:"rgba(15,23,42,.66)",borderRadius:12,padding:12,border:"1px solid rgba(148,163,184,.24)",marginTop:6}}>
            <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>👥 Pasajeros + 2 pilotos</div>
            <Stp label="Hombres" value={rc.pm} onChange={function(v){setRc(function(p){return Object.assign({},p,{pm:v,res:null});});}} icon="M" wl="190 lbs"/>
            <Stp label="Mujeres" value={rc.pw} onChange={function(v){setRc(function(p){return Object.assign({},p,{pw:v,res:null});});}} icon="F" wl="150 lbs"/>
            <Stp label="Niños" value={rc.pc} onChange={function(v){setRc(function(p){return Object.assign({},p,{pc:v,res:null});});}} icon="N" wl="80 lbs"/>
          </div>
          <button onClick={function(){if(rc.orig&&rc.dest)setRc(function(p){return Object.assign({},p,{res:calcR(rc.orig,rc.dest,rc.ac,{m:rc.pm,w:rc.pw,c:rc.pc},rc.bg)});});}} disabled={!rc.orig||!rc.dest} style={{width:"100%",padding:14,background:rc.orig&&rc.dest?"linear-gradient(140deg,#1d4ed8,#1e3a8a)":"rgba(71,85,105,.7)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",marginTop:14}}>🧭 Calcular</button>
          {rc.res&&<div style={{marginTop:14}}>
            <div style={{background:"rgba(15,23,42,.7)",borderRadius:14,padding:14,border:"1px solid rgba(148,163,184,.24)"}}>
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
        <div style={{marginTop:8,marginBottom:10}}>
          <button onClick={enablePushNotifications} style={{width:"100%",padding:"11px 12px",border:"1px solid rgba(148,163,184,.42)",borderRadius:11,background:"linear-gradient(145deg,rgba(8,18,34,.9),rgba(15,23,42,.74))",fontSize:11,fontWeight:700,color:"#dce7fb",cursor:"pointer",letterSpacing:0.25}}>
            {pushState==="saving"?"⏳ Activando notificaciones...":pushState==="ok"?"🔔 Notificaciones activas":"🔔 Activar notificaciones push"}
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14,marginTop:8}}>
          <div style={{background:"#dbeafe",borderRadius:14,padding:"13px 8px",textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:"#1d4ed8"}}>{todayFs.length}</div><div style={{fontSize:10,color:"#1d4ed8",fontWeight:700}}>Hoy</div></div>
          <div style={{background:"#d1fae5",borderRadius:14,padding:"13px 8px",textAlign:"center"}}><div style={{fontSize:26,fontWeight:800,color:"#059669"}}>{fs.filter(function(f){return f.st==="prog";}).length}</div><div style={{fontSize:10,color:"#059669",fontWeight:700}}>Programados</div></div>
        </div>
        <div style={Object.assign({},panelPrimary,{padding:12,marginBottom:12})}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:8}}>🚨 Alertas operativas</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[["Vuelos hoy",opsAlerts.today],["Vuelos mañana",opsAlerts.tomorrow],["No disponibles",opsAlerts.unavailable],["Mantenimiento",opsAlerts.maint],["AOG",opsAlerts.aog],["Conflictos",opsAlerts.conflicts],["Pendientes",opsAlerts.pending],["Fuera de base",opsAlerts.outBase],["Cambios recientes",opsAlerts.recentChanges]].map(function(r){return <button key={r[0]} onClick={function(){onAlertClick(r[0]);}} style={{background:"rgba(15,23,42,.78)",border:"1px solid rgba(148,163,184,.24)",borderRadius:10,padding:"8px 6px",textAlign:"center",cursor:"pointer"}}><div style={{fontSize:18,fontWeight:800,color:"#f8fafc"}}>{r[1]}</div><div style={{fontSize:10,color:"#9fb0cd"}}>{r[0]}</div></button>;})}
          </div>
        </div>
        <div style={Object.assign({},panelPrimary,{padding:14,marginBottom:12})}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:12}}>✈️ Estado de flota</div>
          {Object.values(AC).map(function(a){var ms=getAcStatus(a.id,today),ml=MST[ms],p=pos[a.id],plan=maintPlan[a.id]||{};return(
            <div key={a.id} style={{marginBottom:10,padding:12,borderRadius:12,border:"1px solid "+(ms!=="disponible"?ml.c+"88":"rgba(148,163,184,.25)"),background:"rgba(15,23,42,.58)"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:800,color:a.clr}}>{a.id+" · "+a.type}</span><span style={{fontSize:11,background:ml.b,color:ml.c,padding:"2px 8px",borderRadius:8,fontWeight:700}}>{ms.toUpperCase()}</span></div>
              <div style={{fontSize:12,color:"#475569",marginBottom:6}}>📍 {p}</div>
              {ms==="mantenimiento"&&plan.to&&<div style={{fontSize:11,color:"#b45309",marginBottom:6}}>En mantenimiento hasta: {new Date(plan.to+"T12:00:00").toLocaleDateString("es-MX")}</div>}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:6}}>
                <input type="date" value={plan.from||""} onChange={function(e){var next=Object.assign({},plan,{from:e.target.value});saveMaintPlan(Object.assign({},maintPlan,{[a.id]:next}));persistMaintenanceDates(a.id,next,mt[a.id]||"disponible");}} style={Object.assign({},IS,{marginBottom:0,padding:"7px 9px",fontSize:11})}/>
                <input type="date" value={plan.to||""} onChange={function(e){var next=Object.assign({},plan,{to:e.target.value});saveMaintPlan(Object.assign({},maintPlan,{[a.id]:next}));persistMaintenanceDates(a.id,next,mt[a.id]||"disponible");}} style={Object.assign({},IS,{marginBottom:0,padding:"7px 9px",fontSize:11})}/>
              </div>
              <div style={{display:"flex",gap:4}}>
                {Object.entries(MST).map(function(e){return <button key={e[0]} onClick={function(){chgMaint(a.id,e[0]);}} style={{fontSize:10,padding:"3px 8px",borderRadius:6,border:"1px solid "+e[1].c,background:ms===e[0]?e[1].c:"transparent",color:ms===e[0]?"#fff":e[1].c,fontWeight:700,cursor:"pointer"}}>{e[1].l}</button>;})}
              </div>
            </div>);})}
        </div>
        <div style={Object.assign({},panelPrimary,{padding:14,marginBottom:12})}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10,color:"#eaf2ff"}}>📊 Analítica operativa</div>
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
          <div style={{fontSize:12,fontWeight:700,color:"#dbeafe",marginBottom:6}}>Vuelos programados por aeronave</div>
          {Object.keys(flightsByAc).map(function(ac){var total=Object.values(flightsByAc).reduce(function(a,b){return a+b;},0)||1;var pct=Math.round((flightsByAc[ac]/total)*100);return <div key={ac+"f"} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#bfdbfe"}}><span>{ac}</span><strong style={{color:"#f8fafc"}}>{flightsByAc[ac]} vuelos</strong></div><div style={{height:8,background:"rgba(30,41,59,.9)",borderRadius:999,border:"1px solid rgba(148,163,184,.18)"}}><div style={{height:8,width:pct+"%",background:ac==="N540JL"?"#fb923c":"#60a5fa",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#dbeafe",marginTop:12,marginBottom:6}}>Horas de vuelo por aeronave (estimadas)</div>
          {Object.keys(hoursByAc).map(function(ac){var max=Math.max.apply(null,Object.values(hoursByAc).concat([1]));var pct=Math.round((hoursByAc[ac]/max)*100);return <div key={ac+"h"} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#bfdbfe"}}><span>{ac}</span><strong style={{color:"#f8fafc"}}>{hoursByAc[ac].toFixed(1)} h</strong></div><div style={{height:8,background:"rgba(30,41,59,.9)",borderRadius:999,border:"1px solid rgba(148,163,184,.18)"}}><div style={{height:8,width:pct+"%",background:ac==="N540JL"?"#fdba74":"#93c5fd",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#dbeafe",marginTop:12,marginBottom:6}}>Vuelos solicitados por persona</div>
          {requestsByPerson.length===0?<div style={{fontSize:11,color:"#9fb0cd"}}>Sin registros.</div>:requestsByPerson.map(function(r){var max=requestsByPerson[0][1]||1;var pct=Math.round((r[1]/max)*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#bfdbfe"}}><span>{r[0]}</span><strong style={{color:"#f8fafc"}}>{r[1]}</strong></div><div style={{height:8,background:"rgba(30,41,59,.9)",borderRadius:999,border:"1px solid rgba(148,163,184,.18)"}}><div style={{height:8,width:pct+"%",background:"#fbbf24",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#dbeafe",marginTop:12,marginBottom:6}}>Top destinos</div>
          {Object.keys(metrics.byDest).length===0?<div style={{fontSize:11,color:"#9fb0cd"}}>Sin registros.</div>:Object.entries(metrics.byDest).sort(function(a,b){return b[1]-a[1];}).slice(0,5).map(function(r){var max=Math.max.apply(null,Object.values(metrics.byDest));var pct=Math.round((r[1]/(max||1))*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#bfdbfe"}}><span>{r[0]}</span><strong style={{color:"#f8fafc"}}>{r[1]}</strong></div><div style={{height:8,background:"rgba(30,41,59,.9)",borderRadius:999,border:"1px solid rgba(148,163,184,.18)"}}><div style={{height:8,width:pct+"%",background:"#38bdf8",borderRadius:999}}/></div></div>;})}
          <div style={{fontSize:12,fontWeight:700,color:"#dbeafe",marginTop:12,marginBottom:6}}>Vuelos por estatus</div>
          {Object.keys(metrics.bySt).length===0?<div style={{fontSize:11,color:"#9fb0cd"}}>Sin registros.</div>:Object.entries(metrics.bySt).map(function(r){var max=Math.max.apply(null,Object.values(metrics.bySt));var pct=Math.round((r[1]/(max||1))*100);return <div key={r[0]} style={{marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#bfdbfe"}}><span>{(STS[r[0]]||{l:r[0]}).l}</span><strong style={{color:"#f8fafc"}}>{r[1]}</strong></div><div style={{height:8,background:"rgba(30,41,59,.9)",borderRadius:999,border:"1px solid rgba(148,163,184,.18)"}}><div style={{height:8,width:pct+"%",background:"#a78bfa",borderRadius:999}}/></div></div>;})}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}>
            <div style={{background:"#f8fafc",padding:9,borderRadius:10,border:"1px solid #e2e8f0"}}><div style={{fontSize:10,color:"#64748b"}}>Cancelaciones</div><div style={{fontSize:19,fontWeight:800,color:"#dc2626"}}>{metrics.cancelled}</div></div>
            <div style={{background:"#f8fafc",padding:9,borderRadius:10,border:"1px solid #e2e8f0"}}><div style={{fontSize:10,color:"#64748b"}}>Utilización estimada</div><div style={{fontSize:19,fontWeight:800,color:"#0f172a"}}>{Object.values(metrics.byAc).reduce(function(a,b){return a+b;},0)} vuelos</div></div>
          </div>
        </div>
        <button onClick={restore} style={{width:"100%",padding:10,background:"transparent",border:"1.5px solid #dc2626",borderRadius:10,color:"#dc2626",fontSize:12,fontWeight:700,cursor:"pointer"}}>🔄 Restaurar datos originales</button>
      </div>}

      {sf&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:1000,background:"rgba(2,6,23,.72)",display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={function(){setSf(false);}}>
        <div style={{background:"linear-gradient(170deg,rgba(8,16,31,.98),rgba(15,25,42,.95))",borderRadius:"22px 22px 0 0",width:"100%",maxWidth:480,maxHeight:"93vh",overflowY:"auto",padding:"18px 18px 36px",border:"1px solid rgba(148,163,184,.26)"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{width:36,height:4,background:"rgba(148,163,184,.45)",borderRadius:2,margin:"0 auto 12px"}}/>
          <div style={{fontWeight:800,fontSize:17,marginBottom:14,color:"#e2e8f0"}}>{editId!==null?"✏️ Editar vuelo":"✈️ Nuevo vuelo"}</div>
          <label style={LS}>Fecha</label><input type="date" value={nf.date} onChange={function(e){setNf(function(p){return Object.assign({},p,{date:e.target.value});});}} style={IS}/>
          <label style={LS}>Aeronave</label>
          <div style={{display:"flex",gap:8,marginBottom:10}}>{Object.values(AC).map(function(a){return <button key={a.id} onClick={function(){setNf(function(p){return Object.assign({},p,{ac:a.id});});}} style={{flex:1,padding:"10px 8px",border:"2px solid "+a.clr,borderRadius:12,fontSize:12,fontWeight:700,cursor:"pointer",background:nf.ac===a.id?a.clr:"transparent",color:nf.ac===a.id?"#fff":a.clr}}>{a.id}<br/><span style={{fontSize:10}}>{a.tag}</span></button>;})}</div>
          <ApIn value={nf.orig} onChange={function(v){setNf(function(p){return Object.assign({},p,{orig:v});});}} label="Origen"/>
          <ApIn value={nf.dest} onChange={function(v){setNf(function(p){return Object.assign({},p,{dest:v});});}} label="Destino"/>
          {formR&&<div style={{marginBottom:8,background:formR.dir&&!formR.wt.ov?"rgba(20,83,45,.36)":"rgba(127,29,29,.35)",borderRadius:10,padding:10,fontSize:12,border:"1px solid "+(formR.dir&&!formR.wt.ov?"#86efac":"#fca5a5"),color:"#e2e8f0"}}>
            📏 ~{formR.aw} NM | ⏱ {Math.floor(formR.bm/60)}h{("0"+(formR.bm%60)).slice(-2)}m block
            {formR.stops.length>0&&<div style={{color:"#b45309",fontWeight:600}}>🛬 Auto-escala: {formR.stops[0].c}</div>}
            {formR.dir&&<div style={{color:"#166534",fontWeight:600}}>✅ Directo</div>}
            <div style={{color:formR.wt.ov?"#dc2626":"#166534",fontWeight:600}}>⚖️ {formR.wt.tw.toLocaleString()}/{formR.wt.mt.toLocaleString()} lbs {formR.wt.ov?"❌ SOBREPESO":""}</div>
          </div>}
          <div style={{background:"rgba(15,23,42,.66)",borderRadius:12,padding:12,border:"1px solid rgba(148,163,184,.24)"}}>
            <Stp label="Hombres" value={nf.pm} onChange={function(v){setNf(function(p){return Object.assign({},p,{pm:v});});}} icon="M" wl="190"/>
            <Stp label="Mujeres" value={nf.pw} onChange={function(v){setNf(function(p){return Object.assign({},p,{pw:v});});}} icon="F" wl="150"/>
            <Stp label="Niños" value={nf.pc} onChange={function(v){setNf(function(p){return Object.assign({},p,{pc:v});});}} icon="N" wl="80"/>
          </div>
          <label style={LS}>Hora</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
            {["STBY","07:00","08:00","09:00","12:00","15:00","16:00","18:00"].map(function(t){return <button key={t} onClick={function(){setNf(function(p){return Object.assign({},p,{time:t});});}} style={{padding:"7px 11px",border:"1px solid "+(nf.time===t?"#93c5fd":"rgba(148,163,184,.25)"),borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",background:nf.time===t?"rgba(30,58,138,.55)":"rgba(15,23,42,.72)",color:"#dbeafe"}}>{t==="STBY"?t:ftm(t)}</button>;})}
          </div>
          <input type="time" value={nf.time!=="STBY"?nf.time:""} onChange={function(e){setNf(function(p){return Object.assign({},p,{time:e.target.value});});}} style={IS}/>
          <label style={LS}>Solicitado por</label>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {REQBY.map(function(r){return <button key={r} onClick={function(){setNf(function(p){return Object.assign({},p,{rb:r});});}} style={{padding:"7px 11px",border:"1px solid "+(nf.rb===r?"#93c5fd":"rgba(148,163,184,.25)"),borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",background:nf.rb===r?"rgba(30,58,138,.55)":"rgba(15,23,42,.72)",color:"#dbeafe"}}>{r}</button>;})}
          </div>
          <label style={LS}>Notas</label>
          <input type="text" placeholder="Ferry, observaciones..." value={nf.nt} onChange={function(e){setNf(function(p){return Object.assign({},p,{nt:e.target.value});});}} style={IS}/>
          <label style={LS}>Programado/Editado por</label>
          <input type="text" placeholder="Nombre o correo" value={actorName} onChange={function(e){setActorName(e.target.value);}} style={IS}/>
          <button onClick={handleSave} disabled={!nf.orig||!nf.dest||!nf.time||!nf.rb||phase==="saving"} style={{width:"100%",padding:15,border:"none",borderRadius:14,fontSize:16,fontWeight:700,cursor:"pointer",marginTop:10,background:nf.orig&&nf.dest&&nf.time&&nf.rb?"#0f172a":"#cbd5e1",color:"#fff"}}>{phase==="saving"?"⏳ Guardando...":editId!==null?"✅ Guardar cambios":"✈️ Programar vuelo"}</button>
          {editId!==null&&<button onClick={function(){if(confirm("¿Cancelar este vuelo?"))chgStatus(editId,"canc");setSf(false);}} style={{width:"100%",padding:12,border:"1px solid #f87171",borderRadius:12,fontSize:13,fontWeight:700,cursor:"pointer",marginTop:8,background:"rgba(127,29,29,.28)",color:"#fecaca"}}>❌ Cancelar vuelo</button>}
        </div>
      </div>}

      {ntf&&<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:2000,background:"rgba(2,6,23,.72)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={function(){setNtf(null);}}>
        <div style={{background:"linear-gradient(170deg,rgba(8,16,31,.98),rgba(15,25,42,.94))",borderRadius:22,width:"100%",maxWidth:400,padding:"24px 22px",boxShadow:"0 20px 45px rgba(15,23,42,.45)",border:"1px solid rgba(148,163,184,.25)"}} onClick={function(e){e.stopPropagation();}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:"#dcfce7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>✅</div>
            <div style={{fontWeight:900,fontSize:18,color:"#e2e8f0",letterSpacing:.2}}>Vuelo {ntf.lbl}</div>
          </div>
          <div style={{fontSize:21,fontWeight:900,color:"#e2e8f0",lineHeight:1.2,marginBottom:4}}>{ntf.fl.orig} <span style={{color:"#94a3b8"}}>→</span> {ntf.fl.dest}</div>
          <div style={{fontSize:12,color:"#9fb0cd",fontWeight:700,marginBottom:14}}>{ntf.fl.ac} · {fdt(ntf.fl.date)} · {ftm(ntf.fl.time)}</div>
          <div style={{background:"rgba(15,23,42,.72)",borderRadius:14,padding:"12px 13px",border:"1px solid rgba(148,163,184,.25)",fontSize:13,color:"#cbd5e1",lineHeight:1.7}}>
            <div><strong>Aeronave:</strong> {ntf.fl.ac}</div>
            <div><strong>Fecha:</strong> {fdt(ntf.fl.date)}</div>
            <div><strong>Hora salida:</strong> {ftm(ntf.fl.time)}</div>
            <div><strong>Solicitó:</strong> {ntf.fl.rb||"-"}</div>
            <div><strong>PAX:</strong> {(ntf.fl.pm||0)+(ntf.fl.pw||0)+(ntf.fl.pc||0)}</div>
            {ntf.fl.nt&&<div><strong>Notas:</strong> {ntf.fl.nt}</div>}
          </div>
          <button onClick={function(){setNtf(null);}} style={{width:"100%",padding:12,background:"#0f172a",color:"#fff",border:"none",borderRadius:12,fontSize:14,fontWeight:800,cursor:"pointer",marginTop:14}}>Cerrar</button>
        </div>
      </div>}

      <div style={{position:"fixed",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:900}}>
        {phase==="saving"&&<div style={{background:"#d97706",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,.3)"}}>⏳ Guardando...</div>}
        {phase==="saved"&&<div style={{background:"#16a34a",color:"#fff",padding:"12px 24px",borderRadius:14,fontSize:13,fontWeight:700,boxShadow:"0 4px 20px rgba(22,163,106,.5)"}}>✅ Sincronizado</div>}
        {phase==="warn"&&<div style={{background:"#f59e0b",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:11,fontWeight:600,boxShadow:"0 4px 20px rgba(245,158,11,.45)",textAlign:"center",maxWidth:340}}>⚠️ {errMsg}</div>}
        {phase==="error"&&<div style={{background:"#dc2626",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:11,fontWeight:600,boxShadow:"0 4px 20px rgba(220,38,38,.5)",textAlign:"center",maxWidth:340}}>❌ Error: {errMsg}</div>}
      </div>

      <button
        onClick={function(){setAgentOpen(function(v){return !v;});}}
        style={{position:"fixed",right:16,bottom:88,zIndex:950,width:52,height:52,borderRadius:"50%",border:"1px solid #334155",background:"linear-gradient(145deg,#0f172a,#1e293b)",color:"#fff",fontSize:24,cursor:"pointer",boxShadow:"0 8px 20px rgba(0,0,0,.35)"}}
        aria-label="AI Pilot"
      >
        👨🏼‍✈️
      </button>

      {agentOpen&&<div style={{position:"fixed",right:12,bottom:146,width:"calc(100% - 24px)",maxWidth:360,zIndex:960,background:"linear-gradient(170deg,rgba(8,16,31,.98),rgba(15,25,42,.94))",borderRadius:16,padding:12,boxShadow:"0 20px 45px rgba(0,0,0,.45)",border:"1px solid rgba(148,163,184,.28)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{fontWeight:800,fontSize:14,color:"#e2e8f0"}}>👨🏼‍✈️ AI Pilot</div>
          <button onClick={function(){setAgentOpen(false);}} style={{border:"none",background:"transparent",fontSize:18,cursor:"pointer",color:"#64748b"}}>×</button>
        </div>
        <div style={{fontSize:11,color:"#9fb0cd",marginBottom:7}}>Estoy listo para ayudarte con la operación de hoy.</div>
        <div style={{fontSize:11,fontWeight:700,color:"#cbd5e1",marginBottom:6}}>
          Estado: {agentVoiceState==="listening"?"🎙️ Escuchando":agentVoiceState==="thinking"?"🧠 Analizando":agentVoiceState==="speaking"?"🔊 Hablando":agentVoiceState==="clarification"?"❓ Esperando aclaración":"✅ En espera"}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
          <button onClick={startRealtimeVoice} disabled={realtimeConnected||realtimeConnecting} style={{padding:8,border:"1px solid rgba(148,163,184,.34)",borderRadius:10,background:realtimeConnected?"rgba(20,83,45,.56)":"rgba(15,23,42,.72)",fontSize:11,fontWeight:700,cursor:realtimeConnected?"default":"pointer",color:"#e2e8f0"}}>
            {realtimeConnecting?"⏳ Conectando...":realtimeConnected?"🟢 Realtime activo":"🎧 Conectar Realtime"}
          </button>
          <button onClick={stopRealtimeVoice} disabled={!realtimeConnected&&!realtimeConnecting} style={{padding:8,border:"1px solid rgba(148,163,184,.34)",borderRadius:10,background:"rgba(15,23,42,.72)",fontSize:11,fontWeight:700,cursor:"pointer",color:"#e2e8f0"}}>
            ⏹️ Cerrar Realtime
          </button>
        </div>
        {agentMessages.length>0&&<div style={{maxHeight:120,overflowY:"auto",border:"1px solid rgba(148,163,184,.24)",borderRadius:10,padding:8,background:"rgba(15,23,42,.65)",marginBottom:8}}>
          {agentMessages.slice(-6).map(function(m,i){return <div key={i} style={{fontSize:11,color:m.role==="assistant"?"#dbeafe":"#cbd5e1",marginBottom:6}}><strong>{m.role==="assistant"?"AI":"Tú"}:</strong> {m.text}</div>;})}
        </div>}
        {realtimeText&&<div style={{fontSize:11,color:"#cbd5e1",background:"rgba(15,23,42,.7)",border:"1px solid rgba(148,163,184,.24)",borderRadius:8,padding:"6px 8px",marginBottom:8}}>Realtime: {realtimeText.slice(-240)}</div>}
        {agentLiveTranscript&&<div style={{fontSize:11,color:"#0369a1",background:"#e0f2fe",border:"1px solid #bae6fd",borderRadius:8,padding:"6px 8px",marginBottom:8}}>Transcripción en vivo: {agentLiveTranscript}</div>}
        <textarea
          value={agentInstruction}
          onChange={function(e){setAgentInstruction(e.target.value);}}
          placeholder="Escribe o dicta una instrucción..."
          style={{width:"100%",minHeight:80,padding:10,border:"1.5px solid #d1d5db",borderRadius:10,fontSize:13,resize:"vertical",boxSizing:"border-box",marginBottom:8}}
        />
        <button onClick={toggleVoiceInput} disabled={transcribing} style={{width:"100%",padding:9,border:"1px solid rgba(148,163,184,.34)",borderRadius:10,background:"rgba(15,23,42,.72)",color:"#e2e8f0",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}}>
          {recording?"⏹️ Detener escucha en vivo":"🎙️ Hablar en vivo"}
        </button>
        <button onClick={function(){try{if(window.speechSynthesis)window.speechSynthesis.cancel();setAgentVoiceState("idle");}catch{}}} style={{width:"100%",padding:8,border:"1px solid rgba(148,163,184,.34)",borderRadius:10,background:"rgba(15,23,42,.72)",color:"#cbd5e1",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}}>
          🔇 Detener voz del asistente
        </button>
        <button onClick={analyzeAgentInstruction} disabled={!agentInstruction.trim()||agentBusy} style={{width:"100%",padding:10,border:"none",borderRadius:10,background:agentInstruction.trim()&&!agentBusy?"#0f172a":"#cbd5e1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
          {agentBusy?"⏳ Analizando...":"🔍 Analizar instrucción"}
        </button>
        {agentValidation&&<div style={{marginTop:8,border:"1px solid rgba(148,163,184,.24)",borderRadius:10,padding:9,background:"rgba(15,23,42,.65)"}}>
          <div style={{fontSize:11,color:"#cbd5e1"}}>Acción: <strong>{agentValidation.action||"-"}</strong></div>
          <div style={{fontSize:11,color:"#cbd5e1"}}>Confianza: <strong>{Math.round((agentValidation.confidence||0)*100)}%</strong></div>
          <div style={{fontSize:11,color:"#cbd5e1"}}>Confirmación: <strong>{agentValidation.requires_confirmation?"Sí":"No"}</strong></div>
          {agentValidation.clarification_prompts&&agentValidation.clarification_prompts.length>0&&<div style={{fontSize:11,color:"#92400e",marginTop:5}}>{agentValidation.clarification_prompts.map(function(c,i){return <div key={i}>• {c}</div>;})}</div>}
          {agentValidation.warnings.length>0&&<div style={{marginTop:5,fontSize:11,color:"#92400e"}}>{agentValidation.warnings.map(function(w,i){return <div key={i}>⚠️ {w}</div>;})}</div>}
          {agentValidation.errors.length>0&&<div style={{marginTop:5,fontSize:11,color:"#b91c1c"}}>{agentValidation.errors.map(function(er,i){return <div key={i}>❌ {er}</div>;})}</div>}
          <button onClick={executeAgentInstruction} disabled={!agentValidation.can_execute||agentBusy||isAgentWriteAction(agentValidation.action)} style={{width:"100%",marginTop:8,padding:10,border:"none",borderRadius:10,background:agentValidation.can_execute&&!agentBusy&&!isAgentWriteAction(agentValidation.action)?"#16a34a":"#cbd5e1",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {agentBusy?"⏳ Ejecutando...":"✅ Execute"}
          </button>
        </div>}
        {pendingWrite&&<div style={{marginTop:8,border:"1px solid rgba(148,163,184,.24)",borderRadius:10,padding:10,background:"rgba(15,23,42,.68)"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#e2e8f0",marginBottom:6}}>🧾 Confirmación escrita requerida (pendiente)</div>
          <div style={{fontSize:11,color:"#cbd5e1",lineHeight:1.6}}>
            <div><strong>Acción:</strong> {pendingWrite.card.action}</div>
            <div><strong>Aeronave:</strong> {pendingWrite.card.aircraft}</div>
            <div><strong>Ruta:</strong> {pendingWrite.card.route}</div>
            <div><strong>Salida:</strong> {pendingWrite.card.departure}</div>
            <div><strong>Solicitó:</strong> {pendingWrite.card.requester}</div>
            <div><strong>Notas:</strong> {pendingWrite.card.notes}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginTop:8}}>
            <button onClick={executeAgentInstruction} disabled={agentBusy} style={{padding:8,border:"none",borderRadius:8,background:"#16a34a",color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer"}}>Confirmar</button>
            <button onClick={function(){setPendingWrite(null);setAgentVoiceState("idle");}} style={{padding:8,border:"1px solid rgba(148,163,184,.35)",borderRadius:8,background:"rgba(15,23,42,.72)",color:"#cbd5e1",fontSize:11,fontWeight:700,cursor:"pointer"}}>Editar</button>
            <button onClick={function(){setPendingWrite(null);setAgentValidation(null);setAgentResult(null);}} style={{padding:8,border:"1px solid #fca5a5",borderRadius:8,background:"rgba(127,29,29,.28)",color:"#fecaca",fontSize:11,fontWeight:700,cursor:"pointer"}}>Cancelar</button>
          </div>
        </div>}
      </div>}

      <div style={{height:70}}/>
      </div>
    </div>
  );
}
