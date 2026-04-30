import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from "recharts";

const glass={background:"linear-gradient(165deg,rgba(8,16,30,.82),rgba(14,27,43,.78))",border:"1px solid rgba(148,163,184,.24)",borderRadius:14,padding:12};
const tipStyle={background:"rgba(5,10,20,.96)",border:"1px solid rgba(212,185,140,.5)",borderRadius:10,color:"#e2e8f0"};
const COLORS=["#d4b98c","#22d3ee","#60a5fa","#f59e0b","#8b9db8"];

export default function AnalyticsDashboard({filters,setters,analyticsData,requesters,aircrafts,IS}){
  const kpis=[
    ["Horas YTD",`${analyticsData.ytdHours.toFixed(1)}h`],
    ["Horas período",`${analyticsData.totalHours.toFixed(1)}h`],
    ["Vuelos / legs",String(analyticsData.totalFlights)],
    ["Promedio h/vuelo",`${analyticsData.avgHours.toFixed(2)}h`],
    ["Utilización prom.",`${analyticsData.aircraftSeries.length?((analyticsData.totalHours/Math.max(1,analyticsData.aircraftSeries.length))/10).toFixed(1):0}%`],
    ["Aeronave top",analyticsData.topAircraft?analyticsData.topAircraft.ac:"-"],
    ["Solicitante top",analyticsData.topPerson?analyticsData.topPerson.name:"-"],
    ["Var vs mes ant.",`${(analyticsData.monthSeries.at(-1)?.delta||0).toFixed(1)}%`],
  ];
  const monthComp=(analyticsData.monthSeries.slice(-2).map(m=>({month:m.month,hours:m.hours,flights:m.flights,avg:m.flights?m.hours/m.flights:0})));
  const heatDays=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]; const heatSlots=["00-04","04-08","08-12","12-16","16-20","20-24"];
  const maxHeat=Math.max(...Object.values(analyticsData.heat||{}),1);

  return <div style={{display:"grid",gap:10}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:6}}>
      <input type="date" value={filters.analyticsDateFrom} onChange={e=>setters.setAnalyticsDateFrom(e.target.value)} style={Object.assign({},IS,{marginBottom:0,fontSize:12})}/>
      <input type="date" value={filters.analyticsDateTo} onChange={e=>setters.setAnalyticsDateTo(e.target.value)} style={Object.assign({},IS,{marginBottom:0,fontSize:12})}/>
      <select value={filters.analyticsAircraft} onChange={e=>setters.setAnalyticsAircraft(e.target.value)} style={IS}><option value="all">Aeronave: Todas</option>{aircrafts.map(a=><option key={a} value={a}>{a}</option>)}</select>
      <select value={filters.analyticsRequester} onChange={e=>setters.setAnalyticsRequester(e.target.value)} style={IS}><option value="all">Solicitante: Todos</option>{requesters.map(r=><option key={r} value={r}>{r}</option>)}</select>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>{kpis.map(k=><div key={k[0]} style={glass}><div style={{fontSize:10,color:"#94a3b8"}}>{k[0]}</div><div style={{fontSize:18,fontWeight:800,color:"#ecf2ff"}}>{k[1]}</div></div>)}</div>

    <div style={{display:"grid",gridTemplateColumns:"1.6fr 1fr",gap:10}}>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Tendencia mensual de horas</div><div style={{height:250}}><ResponsiveContainer><LineChart data={analyticsData.monthSeries}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="month" stroke="#9fb0cd"/><YAxis stroke="#9fb0cd"/><Tooltip contentStyle={tipStyle}/><Legend/><Line type="monotone" dataKey="hours" stroke="#d4b98c" strokeWidth={3} name="Horas"/><Line type="monotone" dataKey="prevYear" stroke="#22d3ee" strokeWidth={2} name="Año anterior"/></LineChart></ResponsiveContainer></div></div>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Distribución del uso</div><div style={{height:250}}><ResponsiveContainer><PieChart><Pie data={analyticsData.typeSeries} innerRadius={55} outerRadius={88} dataKey="value" nameKey="name" label>{analyticsData.typeSeries.map((e,i)=><Cell key={e.name} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip contentStyle={tipStyle}/><Legend/></PieChart></ResponsiveContainer></div></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Utilización por aeronave</div><div style={{height:250}}><ResponsiveContainer><BarChart data={analyticsData.aircraftSeries}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="ac" stroke="#9fb0cd"/><YAxis stroke="#9fb0cd"/><Tooltip contentStyle={tipStyle}/><Legend/><Bar dataKey="hours" fill="#d4b98c" name="Horas"/><Bar dataKey="flights" fill="#22d3ee" name="Vuelos"/><Bar dataKey="util" fill="#60a5fa" name="Util %"/></BarChart></ResponsiveContainer></div></div>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Uso por persona</div><div style={{height:250}}><ResponsiveContainer><BarChart data={analyticsData.personSeries.slice(0,8)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis type="number" stroke="#9fb0cd"/><YAxis dataKey="name" type="category" width={110} stroke="#9fb0cd"/><Tooltip contentStyle={tipStyle}/><Legend/><Bar dataKey="hours" fill="#22d3ee" name="Horas"/><Bar dataKey="flights" fill="#d4b98c" name="Vuelos"/></BarChart></ResponsiveContainer></div></div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Comparativa mensual</div><div style={{height:250}}><ResponsiveContainer><BarChart data={monthComp}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="month" stroke="#9fb0cd"/><YAxis stroke="#9fb0cd"/><Tooltip contentStyle={tipStyle}/><Legend/><Bar dataKey="hours" fill="#d4b98c"/><Bar dataKey="flights" fill="#22d3ee"/><Bar dataKey="avg" fill="#60a5fa"/></BarChart></ResponsiveContainer></div></div>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Planificado vs real</div><div style={{height:250}}><ResponsiveContainer><LineChart data={analyticsData.plannedVsReal}><CartesianGrid strokeDasharray="3 3" stroke="#334155"/><XAxis dataKey="month" stroke="#9fb0cd"/><YAxis stroke="#9fb0cd"/><Tooltip contentStyle={tipStyle}/><Legend/><Line dataKey="planned" stroke="#60a5fa"/><Line dataKey="real" stroke="#d4b98c"/></LineChart></ResponsiveContainer></div>{!analyticsData.plannedVsReal.some(r=>r.real>0)&&<div style={{fontSize:11,color:"#9fb0cd"}}>Datos reales pendientes de captura</div>}</div>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Patrón de operación</div><div style={{display:"grid",gridTemplateColumns:"90px repeat(6,1fr)",gap:4,fontSize:11}}><div></div>{heatSlots.map(h=><div key={h} style={{color:"#94a3b8",textAlign:"center"}}>{h}</div>)}{heatDays.map((d,di)=><><div key={d} style={{color:"#cbd5e1"}}>{d}</div>{heatSlots.map((h,hi)=>{const v=analyticsData.heat?.[`${di}-${hi}`]||0;const a=v/maxHeat;return <div key={d+h} style={{height:20,borderRadius:6,background:`rgba(${Math.round(34+178*a)},${Math.round(50+130*a)},${Math.round(70+110*a)},0.85)`,border:"1px solid rgba(148,163,184,.2)"}}/>;})}</>)}</div></div>
      <div style={glass}><div style={{fontWeight:700,color:"#f3dfbf",marginBottom:8}}>Ranking operativo</div><table style={{width:"100%",fontSize:11,color:"#dbeafe",borderCollapse:"collapse"}}><thead><tr><th>#</th><th>Aeronave</th><th>Horas</th><th>Vuelos</th><th>Prom</th><th>Util%</th><th>Último</th><th>Índice</th></tr></thead><tbody>{analyticsData.aircraftSeries.map((a,i)=>{const idx=((a.hours*1.5)+(a.flights*0.8)).toFixed(1);return <tr key={a.ac}><td>{i+1}</td><td>{a.ac}</td><td>{a.hours.toFixed(1)}</td><td>{a.flights}</td><td>{a.avg.toFixed(2)}</td><td>{a.util.toFixed(1)}</td><td>{a.last||"-"}</td><td>{idx}</td></tr>;})}</tbody></table></div>
    </div>
  </div>;
}
