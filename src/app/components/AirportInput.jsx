import { useEffect, useMemo, useRef, useState } from "react";
import { IS, LS } from "../data";
import { findAirportByAny, formatAirportOption, searchAirports } from "../../lib/airports";

export function AirportInput({ value, onChange, label }) {
  var [q, setQ] = useState("");
  var [open, setOpen] = useState(false);
  var [results, setResults] = useState([]);
  var ref = useRef(null);

  var sel = useMemo(function () { return findAirportByAny(value); }, [value]);

  useEffect(function () {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h); };
  }, []);

  useEffect(function () {
    var active = true;
    searchAirports(q || value || "", 12).then(function (rows) {
      if (active) setResults(rows || []);
    }).catch(function () {
      if (active) setResults([]);
    });
    return function () { active = false; };
  }, [q, value, open]);

  var fl = useMemo(function () { return results.slice(0, 12); }, [results]);

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 6 }}>
      <label style={LS}>{label}</label>
      <input
        value={open ? q : (sel ? formatAirportOption(sel) : (value || ""))}
        onChange={function (e) { setQ(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
        onFocus={function () { setOpen(true); setQ(""); }}
        placeholder="Ciudad, IATA, ICAO, estado o país..."
        style={Object.assign({}, IS, { borderColor: open ? "#60a5fa" : "rgba(148,163,184,.35)", boxShadow: open ? "0 0 0 2px rgba(59,130,246,.22)" : "none" })}
      />
      {open && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, background: "linear-gradient(170deg,rgba(8,15,29,.98),rgba(16,25,43,.95))", border: "1px solid rgba(148,163,184,.3)", borderRadius: 10, maxHeight: 220, overflowY: "auto", boxShadow: "0 14px 28px rgba(2,6,23,.45)" }}>
        {fl.map(function (a) {
          return <div key={(a.i4 || "") + a.c + (a.i3 || "")} onClick={function () { onChange(a.c); setQ(""); setOpen(false); }} style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid rgba(148,163,184,.15)", display: "flex", justifyContent: "space-between", color: "#dbeafe" }}><div><strong>{a.c}</strong> <span style={{ color: "#8ea2c8", fontSize: 11 }}>{a.municipality || a.co}</span></div><span style={{ fontSize: 11, color: "#9fb0cd", fontFamily: "monospace" }}>{[a.i3, a.i4].filter(Boolean).join("/")}</span></div>;
        })}
      </div>}
    </div>
  );
}
