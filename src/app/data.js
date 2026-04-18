export const AC = {
  N35EA: { id:"N35EA", type:"Embraer Phenom 300E", tag:"P300E", kts:453, gph:145, maxGal:782, mtow:18387, bow:11880, maxPax:9, crew:400, clr:"#1d4ed8", base:"Merida", baseAirport:"MID", baseTimezone:"America/Merida", flightAwareUrl:"https://es.flightaware.com/live/flight/N35EA", docsUrl:"", maintenanceRoute:"gest" },
  N540JL: { id:"N540JL", type:"Cessna Citation M2", tag:"M2", kts:418, gph:115, maxGal:567, mtow:10700, bow:7280, maxPax:7, crew:400, clr:"#c2410c", base:"Merida", baseAirport:"MID", baseTimezone:"America/Merida", flightAwareUrl:"https://es.flightaware.com/live/flight/N540JL", docsUrl:"", maintenanceRoute:"gest" },
};

export const RF=1.18;
export const BLK=20;
export const JA=6.7;
export const PW={m:190,w:150,c:80};
export const REQBY=["Jabib C","Omar C","Gibran C","Jose C","Anuar C","Direccion","Mantenimiento","Otro"];
export const STS={prog:{l:"Programado",c:"#2563eb",b:"#dbeafe",i:"📋"},enc:{l:"En Curso",c:"#d97706",b:"#fef3c7",i:"✈️"},comp:{l:"Completado",c:"#16a34a",b:"#dcfce7",i:"✅"},canc:{l:"Cancelado",c:"#dc2626",b:"#fee2e2",i:"❌"}};
export const MST={disponible:{l:"Disponible",c:"#16a34a",b:"#dcfce7"},mantenimiento:{l:"Mantenimiento",c:"#d97706",b:"#fef3c7"},aog:{l:"AOG",c:"#dc2626",b:"#fee2e2"}};
export const MN=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const WK=["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];

export const APR=[
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

const FSIDS=["MMMD","MMCZ","MMUN","KMIA","KOPF","KFXE","KHOU","MYNN","MKJP","MBPV","MZBZ","MGGT","KSAT","MMMY","MPTO","MDPC","KTPA","KFLL","MMGL"];
export const FSTOPS=APR.filter(function(a){return FSIDS.indexOf(a.i4)>=0;});

export const LS={fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:4,marginTop:8};
export const IS={width:"100%",padding:"11px 13px",border:"1.5px solid #d1d5db",borderRadius:10,fontSize:14,color:"#1e293b",background:"#f8fafc",outline:"none",marginBottom:4,boxSizing:"border-box"};
export const NB={background:"#f1f5f9",border:"none",borderRadius:8,width:36,height:36,fontSize:20,cursor:"pointer",color:"#334155",display:"flex",alignItems:"center",justifyContent:"center"};
export const META_FIELDS=["created_by_email","created_by_name","updated_by_email","updated_by_name"];
