"use strict";
// Екранування тексту, що надходить ззовні (пошук місць, збережений список)
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const validPlace = x => x && typeof x.id==="string" && /^[\w.\-]{1,40}$/.test(x.id) && x.id!=="lviv" && typeof x.name==="string" && x.name.length<=80 && Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat)<=90 && Math.abs(x.lon)<=180;
// LIST — список місць користувача (крім Львова, який є завжди); зберігається на пристрої
let LIST = null;
try{ const v=JSON.parse(localStorage.getItem("pogoda.list")||"null"); if(Array.isArray(v)) LIST=v.filter(validPlace).map(x=>({id:x.id,name:x.name,lat:x.lat,lon:x.lon})); }catch(e){}
if(!LIST){ LIST = PLACES.slice(1).map(x=>({...x}));
  try{ const old=JSON.parse(localStorage.getItem("pogoda.places")||"[]"); old.forEach(x=>{ if(validPlace(x)&&!LIST.some(y=>y.id===x.id)) LIST.push({id:x.id,name:x.name,lat:x.lat,lon:x.lon}); }); }catch(e){} }
let PLACE = PLACES[0], LAT = PLACE.lat, LON = PLACE.lon, LOADTOK = 0;
const WMO = c => c==null?"":c===0?"☀️":c<=2?"🌤️":c===3?"☁️":c<=48?"🌫️":c<=57?"🌦️":c<=67?"🌧️":c<=77?"🌨️":c<=82?"🌧️":c<=86?"🌨️":"⛈️";
const WTXT = c => c==null?"":c===0?"Ясно":c===1?"Переважно ясно":c===2?"Мінлива хмарність":c===3?"Хмарно":c<=48?"Туман":c<=55?"Мряка":c<=57?"Крижана мряка":c===61?"Невеликий дощ":c===63?"Дощ":c===65?"Сильний дощ":c<=67?"Крижаний дощ":c===71?"Невеликий сніг":c===73?"Сніг":c===75?"Сильний сніг":c===77?"Снігова крупа":c<=82?"Зливи":c<=86?"Снігопад":c===95?"Гроза":"Гроза з градом";
const isSnow = c => c!=null && ((c>=71&&c<=77)||c===85||c===86);
const isFog = c => c===45||c===48;
const fmt = (v,d=0) => v==null||Number.isNaN(v) ? '<span class="na">—</span>' : v.toFixed(d);
const mean = a => { const b=a.filter(x=>x!=null); return b.length? b.reduce((s,x)=>s+x,0)/b.length : null; };
const spread = a => { const b=a.filter(x=>x!=null); return b.length>1? Math.max(...b)-Math.min(...b) : null; };
const dayName = s => new Date(s+"T12:00").toLocaleDateString("uk-UA",{weekday:"long",day:"numeric",month:"long"});
const dayShort = s => new Date(s+"T12:00").toLocaleDateString("uk-UA",{weekday:"short",day:"numeric"});
const short = m => m.name.split(" (")[0];

let RES = [], ENS = null, NOWISO = "";
const hidden = new Set(MODELS.map((m,j)=>m.grp==="extra"?j:-1).filter(j=>j>=0));

function fcUrlBasic(id){
  return `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`+
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,weather_code`+
    `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m`+
    `&models=${id}&timezone=auto&forecast_days=${DAYS}&wind_speed_unit=ms`;
}
function fcUrl(id, vis){
  return `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}`+
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,weather_code`+
    `&hourly=temperature_2m,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m${vis?',visibility':''}`+
    `&models=${id}&timezone=auto&forecast_days=${DAYS}&wind_speed_unit=ms`;
}
let STALE_AT = null; // якщо відповідь прийшла зі збереженої копії (немає мережі) — час, коли її було отримано
async function getJSON(u){
  try{ const r=await fetch(u); if(!r.ok) return null;
    const at=+r.headers.get("x-fetched-at"); if(r.headers.get("x-from-cache") && at) STALE_AT = STALE_AT==null? at : Math.min(STALE_AT, at);
    return await r.json(); }catch(e){ return null; } }
async function getEnsemble(){
  for(const id of ENS_IDS){
    const d = await getJSON(`https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${LAT}&longitude=${LON}&hourly=precipitation&models=${id}&timezone=auto&forecast_days=${DAYS}`);
    if(d && d.hourly) return d;
  }
  return null;
}
// чи модель дає дані для вибраного місця (регіональні поза своєю зоною повертають порожні значення)
function covers(d){
  if(!d || !d.hourly || !d.hourly.temperature_2m) return false;
  return d.hourly.temperature_2m.slice(0,48).some(v=>v!=null);
}

async function load(){
  const tok = ++LOADTOK; STALE_AT = null;
  const st = document.getElementById("status");
  st.textContent = "Завантаження…";
  const [res, ens] = await Promise.all([ Promise.all(MODELS.map(m=>getJSON(fcUrl(m.id,true)).then(d=>d||getJSON(fcUrl(m.id))).then(d=>d||getJSON(fcUrlBasic(m.id))))), getEnsemble() ]);
  if(tok !== LOADTOK) return; // тим часом вибрали інше місце
  RES = res.map((d,j)=> covers(d) ? d : null);
  ENS = ens;
  const ok = RES.filter(Boolean).length;
  if(!ok){ st.innerHTML='<span class="err">Не вдалося отримати дані, і збереженого прогнозу для цього місця ще немає. Перевірте інтернет і натисніть ↻.</span>'; return; }
  const base = RES.find(Boolean);
  NOWISO = new Date(Date.now() + base.utc_offset_seconds*1000).toISOString().slice(0,13);
  renderNow(); renderWarnings(); renderHourly(); renderDays();
  const failed = MODELS.filter((m,j)=>m.grp!=="reg" && !RES[j]).map(short);
  const regOk = MODELS.filter((m,j)=>m.grp==="reg" && RES[j]).map(short);
  const regNo = MODELS.filter((m,j)=>m.grp==="reg" && !RES[j]).map(short);
  const tf = {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"};
  document.body.classList.toggle("offline", STALE_AT!=null);
  st.textContent = (STALE_AT!=null ? "Немає зв'язку — збережений прогноз від " + new Date(STALE_AT).toLocaleString("uk-UA",tf) : "Оновлено " + new Date().toLocaleString("uk-UA",tf)) +
    (failed.length? ` · недоступні: ${failed.join(", ")}` : "") + (ENS? "" : " · ансамбль ECMWF недоступний");
  document.getElementById("regional").textContent =
    "Регіональні моделі: " + (regOk.length? "покривають це місце — "+regOk.join(", ") : "жодна не покриває це місце") +
    (regNo.length? "; не покривають або недоступні — "+regNo.join(", ") : "") + ".";
}

// ансамбль: частка членів з опадами
function ensMembers(){ if(!ENS) return []; return Object.keys(ENS.hourly).filter(k=>k.startsWith("precipitation")); }
function ensProbHour(t, step=1){
  const keys = ensMembers(); if(!keys.length) return null;
  const i = ENS.hourly.time.indexOf(t); if(i<0) return null;
  let wet=0,n=0;
  keys.forEach(k=>{ let s=0,any=false; for(let q=i-step+1;q<=i;q++){const v=ENS.hourly[k][q]; if(v!=null){s+=v;any=true;}} if(any){n++; if(s>=WET) wet++;} });
  return n? Math.round(100*wet/n) : null;
}
function ensProbDay(day){
  const keys = ensMembers(); if(!keys.length) return null;
  const idx = ENS.hourly.time.map((t,i)=>t.startsWith(day)?i:-1).filter(i=>i>=0);
  let wet=0,n=0;
  keys.forEach(k=>{ let s=0,any=false; idx.forEach(i=>{const v=ENS.hourly[k][i]; if(v!=null){s+=v;any=true;}}); if(any){n++; if(s>=0.5) wet++;} });
  return n? Math.round(100*wet/n) : null;
}

function renderNow(){
  const items = MODELS.map((m,j)=>{
    if(m.grp==="extra") return null;
    const H = RES[j]?.hourly; if(!H) return null;
    let hi = H.time.findIndex(t => t.slice(0,13) === NOWISO); if(hi<0) return null;
    const t=H.temperature_2m?.[hi]; if(t==null) return null;
    return {m, t, w:H.weather_code?.[hi], p:H.precipitation?.[hi], ws:H.wind_speed_10m?.[hi], g:H.wind_gusts_10m?.[hi]};
  }).filter(Boolean);
  const el=document.getElementById("now");
  if(!items.length){ el.innerHTML='<div class="sub">Немає даних на поточну годину.</div>'; return; }
  const ts=items.map(i=>i.t), avg=mean(ts), lo=Math.min(...ts), hi=Math.max(...ts);
  const cnt={}; items.forEach(i=>{ if(i.w!=null) cnt[i.w]=(cnt[i.w]||0)+1; });
  const wc = Object.keys(cnt).length ? +Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0][0] : null;
  const pAvg=mean(items.map(i=>i.p)), wAvg=mean(items.map(i=>i.ws)), gAvg=mean(items.map(i=>i.g));
  // ймовірність опадів у найближчі 3 години (ансамбль)
  let p3=null;
  if(ENS){ const i=ENS.hourly.time.findIndex(t=>t.slice(0,13)===NOWISO);
    if(i>=0 && i+3<ENS.hourly.time.length) p3=ensProbHour(ENS.hourly.time[i+3],3); }
  el.innerHTML = `
    <div class="heroBox ${(()=>{const h=+NOWISO.slice(11,13); return h>=7&&h<17?"day":"night";})()}"><div class="hero"><div class="ic">${WMO(wc)}</div>
      <div><div class="t">${Math.round(avg)}°</div><div class="desc">${WTXT(wc)}</div><div class="rg">моделі: від ${Math.round(lo)}° до ${Math.round(hi)}°</div></div></div>
    <div class="facts"><span>💧 <b>${fmt(pAvg,1)}</b> мм/год</span><span>💨 <b>${fmt(wAvg)}</b> м/с${gAvg!=null&&gAvg>=8?`, пориви до <b>${Math.round(gAvg)}</b>`:''}</span>${p3==null?'':`<span>☔ <b>${p3}%</b> опадів у найближчі 3 год</span>`}</div></div>
    ${outlook24()}
    <details class="sm"><summary>За моделями (${items.length})</summary>
      <div class="mods">${items.map(i=>`<div><span>${short(i.m)}</span><span>${WMO(i.w)} <b>${Math.round(i.t)}°</b></span></div>`).join("")}</div>
    </details>`;
}

// прогноз на 24 години: консенсус основних і регіональних моделей + ансамбль ECMWF
function outlook24(){
  const base = RES.find(Boolean); const bt = base.hourly.time;
  const s0 = bt.findIndex(t=>t.slice(0,13)===NOWISO); if(s0<0) return "";
  const times = bt.slice(s0, s0+25);
  const today = NOWISO.slice(0,10);
  const tomorrow = new Date(Date.parse(today+"T12:00Z")+864e5).toISOString().slice(0,10);
  const lbl = t => { const d=t.slice(0,10), h=t.slice(11,13)+":00";
    const nightish = +t.slice(11,13)<6 ? " (вночі)" : "";
    return d===today ? h : d===tomorrow ? "завтра о "+h+nightish : dayShort(d)+" "+h; };
  const js = MODELS.map((m,j)=>j).filter(j=>MODELS[j].grp!=="extra" && RES[j]);
  const hrs = times.map(t=>{
    const temps=[],prs=[],ws=[],codes=[],gs=[],sns=[];
    js.forEach(j=>{ const H=RES[j].hourly, i=H.time.indexOf(t); if(i<0) return;
      const v=H.temperature_2m?.[i]; if(v==null) return; temps.push(v);
      if(H.precipitation?.[i]!=null) prs.push(H.precipitation[i]);
      if(H.wind_speed_10m?.[i]!=null) ws.push(H.wind_speed_10m[i]);
      if(H.wind_gusts_10m?.[i]!=null) gs.push(H.wind_gusts_10m[i]);
      if(H.snowfall?.[i]!=null) sns.push(H.snowfall[i]>0?1:0);
      if(H.weather_code?.[i]!=null) codes.push(H.weather_code[i]); });
    return {t, temp:mean(temps), pr:mean(prs), ws:mean(ws), g:mean(gs), snf:mean(sns), snow:codes.filter(isSnow).length>codes.length/2, fog:codes.filter(isFog).length>=codes.length/2 && codes.length>0};
  }).filter(h=>h.temp!=null);
  if(hrs.length<6) return "";
  const out=[];
  // температура
  const tmin = hrs.reduce((a,b)=>b.temp<a.temp?b:a), tmax = hrs.reduce((a,b)=>b.temp>a.temp?b:a);
  const now=hrs[0].temp, end=hrs[hrs.length-1].temp;
  let tline = `🌡 Від <b>${Math.round(tmin.temp)}°</b> (${lbl(tmin.t)}) до <b>${Math.round(tmax.temp)}°</b> (${lbl(tmax.t)})`;
  const d = end-now; tline += Math.abs(d)<2 ? "; за добу майже без змін." : d>0 ? `; через добу на ~${Math.round(d)}° тепліше.` : `; через добу на ~${Math.round(-d)}° холодніше.`;
  out.push(tline);
  if(tmin.temp<=0 && now>0) out.push(`❄️ Заморозок до <b>${Math.round(tmin.temp)}°</b> близько ${lbl(tmin.t)}.`);
  // опади
  const total = hrs.reduce((s,h)=>s+(h.pr||0),0);
  const snowy = hrs.filter(h=>h.snow).length > hrs.filter(h=>(h.pr||0)>=0.1).length/2;
  const kind = snowy ? "сніг" : "опади";
  let wins=[];
  if(ENS){
    const probs = hrs.map(h=>{ const utcH=((+h.t.slice(11,13)-base.utc_offset_seconds/3600)%24+24)%24; return utcH%3===0? {t:h.t,p:ensProbHour(h.t,3)} : null; }).filter(x=>x&&x.p!=null);
    const maxP = probs.length? Math.max(...probs.map(x=>x.p)) : null;
    let cur=null;
    probs.forEach(x=>{ if(x.p>=50){ if(!cur) cur={a:x.t,b:x.t,m:x.p}; else {cur.b=x.t; cur.m=Math.max(cur.m,x.p);} } else if(cur){ wins.push(cur); cur=null; } });
    if(cur) wins.push(cur);
    if(wins.length){
      out.push(`☔ ${snowy?"Сніг імовірний":"Опади ймовірні"}: ` + wins.map(w=>{
        // вікно ансамблю — сума за 3 год, що закінчуються в цей час
        let a=new Date(Date.parse(w.a+":00Z")-2*3600e3).toISOString().slice(0,16);
        if(a < hrs[0].t) a = hrs[0].t;
        if(a===hrs[0].t && w.b>=probs[probs.length-1].t) return `протягом усієї доби (до ${w.m}%)`;
        const bl = w.b.slice(0,10)===a.slice(0,10) ? w.b.slice(11,13)+":00" : lbl(w.b);
        return `${a===hrs[0].t?"вже зараз":lbl(a)} – ${bl} (до ${w.m}%)`; }).join(", ") + (total>=0.2? `; сумарно ~${total.toFixed(1)} мм.` : "."));
    } else if(maxP!=null){
      out.push(maxP>=20 ? `🌂 Опади малоймовірні (не більше ${maxP}%).` : "☀️ Без опадів.");
    }
  } else {
    out.push(total>=0.5 ? `☔ Моделі дають ${kind}, сумарно ~${total.toFixed(1)} мм.` : "☀️ Суттєвих опадів моделі не дають.");
  }
  // сніг: година рахується, якщо сніг дає щонайменше третина моделей
  const snH = hrs.filter(h=>h.snow || (h.snf!=null && h.snf>=0.34));
  if(snH.length){ const a=snH[0], b=snH[snH.length-1];
    out.push(`❄️ ${a.temp>0.5?"Мокрий сніг":"Сніг"} можливий: ${lbl(a.t)}${a.t===b.t?"":" – "+(b.t.slice(0,10)===a.t.slice(0,10)? b.t.slice(11,13)+":00" : lbl(b.t))}.`); }
  // туман
  const fogH = hrs.filter(h=>h.fog);
  if(fogH.length) out.push(`🌫 Можливий туман: ${lbl(fogH[0].t)}–${fogH[fogH.length-1].t.slice(11,13)}:00.`);
  // вітер
  const wmax = hrs.reduce((a,b)=>(b.ws||0)>(a.ws||0)?b:a);
  const gmax = hrs.reduce((a,b)=>(b.g||0)>(a.g||0)?b:a);
  if(gmax.g!=null && gmax.g>=15) out.push(`💨 Сильний вітер: пориви до <b>${Math.round(gmax.g)} м/с</b> близько ${lbl(gmax.t)}.`);
  else if(wmax.ws!=null) out.push(wmax.ws>=10 ? `💨 Посилення вітру до <b>${Math.round(wmax.ws)} м/с</b> близько ${lbl(wmax.t)}.` : `💨 Вітер помірний, до ${Math.round(wmax.ws)} м/с${gmax.g!=null&&gmax.g>=8?`, пориви до ${Math.round(gmax.g)}`:""}.`);
  return `<div class="outlook"><b>Наступні 24 години</b><ul>${out.map(x=>`<li>${x}</li>`).join("")}</ul></div>`;
}

// ===== попередження: небезпечні явища на 48 годин за основними й регіональними моделями =====
const FRZ = c => c===56||c===57||c===66||c===67;
const WARN_H = 48;
const WARN_DEFS = [
  {ic:"🧊", name:"Ожеледиця на дорогах", need:["temperature_2m","precipitation"],
   // мороз після опадів чи відлиги за попередню добу, крижані опади або туман на морозі
   test:(H,i)=>{ const T=H.temperature_2m[i]; if(T==null||T>0) return false;
     const wc=H.weather_code?.[i]; if(FRZ(wc)||isFog(wc)) return true;
     for(let q=Math.max(0,i-24); q<=i; q++){ const p=H.precipitation[q], t=H.temperature_2m[q];
       if(p>=0.1 && (t>0.3 || (!isSnow(H.weather_code?.[q]) && !(H.snowfall?.[q]>0)))) return true; }
     return false; }},
  {ic:"🌧", name:"Крижаний дощ (ожеледь)", need:["weather_code"], test:(H,i)=>FRZ(H.weather_code[i])},
  {ic:"🌫", name:"Туман", need:["weather_code"], test:(H,i)=>isFog(H.weather_code[i]) || (H.visibility?.[i]!=null && H.visibility[i]<1000)},
  {ic:"💨", name:"Сильний вітер", need:["wind_gusts_10m"], test:(H,i)=>H.wind_gusts_10m[i]>=15,
   val:(H,i)=>H.wind_gusts_10m[i], agg:"max", fmt:v=>`пориви до ${Math.round(v)} м/с`},
  {ic:"☔", name:"Значний дощ", need:["precipitation"],
   test:(H,i)=>sum12(H.precipitation,i)-sum12(H.snowfall,i)>=15, val:(H,i)=>sum12(H.precipitation,i), agg:"max", fmt:v=>`до ${Math.round(v)} мм за 12 год`},
  {ic:"❄️", name:"Значний сніг", need:["snowfall"], test:(H,i)=>sum12(H.snowfall,i)>=7, val:(H,i)=>sum12(H.snowfall,i), agg:"max", fmt:v=>`до ${Math.round(v)} см за 12 год`},
  {ic:"🌨", name:"Мокрий сніг, налипання", need:["snowfall","temperature_2m"], test:(H,i)=>H.snowfall[i]>0 && H.temperature_2m[i]>=-1 && H.temperature_2m[i]<=1.5},
  {ic:"🌬", name:"Хуртовина", need:["snowfall","wind_gusts_10m"], test:(H,i)=>H.snowfall[i]>0 && H.wind_gusts_10m[i]>=12},
  {ic:"⛈", name:"Гроза", need:["weather_code"], test:(H,i)=>H.weather_code[i]>=95},
  {ic:"🥶", name:"Сильний мороз", need:["temperature_2m"], test:(H,i)=>H.temperature_2m[i]!=null && H.temperature_2m[i]<=-10,
   val:(H,i)=>H.temperature_2m[i], agg:"min", fmt:v=>`до ${Math.round(v)}°`},
  {ic:"❄", name:"Заморозки", need:["temperature_2m"], warmOnly:true, test:(H,i)=>H.temperature_2m[i]!=null && H.temperature_2m[i]<=0,
   val:(H,i)=>H.temperature_2m[i], agg:"min", fmt:v=>`до ${Math.round(v)}°`},
  {ic:"🥵", name:"Сильна спека", need:["temperature_2m"], test:(H,i)=>H.temperature_2m[i]>=30,
   val:(H,i)=>H.temperature_2m[i], agg:"max", fmt:v=>`до ${Math.round(v)}°`}
];
function sum12(a,i){ if(!a) return 0; let s=0; for(let q=Math.max(0,i-11); q<=i; q++) s+=a[q]||0; return s; }
function hourRanges(ts, today){
  // ts — впорядковані години ISO; сусідні (розрив до 2 год) зливаються в проміжки
  const tomorrow = new Date(Date.parse(today+"T12:00Z")+864e5).toISOString().slice(0,10);
  const dl = d => d===today? "сьогодні" : d===tomorrow? "завтра" : dayShort(d);
  const rs=[]; ts.forEach(t=>{ const ms=Date.parse(t+":00Z"), last=rs[rs.length-1];
    if(last && ms-last.e<=2*3600e3){ last.e=ms; last.b=t; } else rs.push({a:t,b:t,e:ms}); });
  return rs.slice(0,3).map(x=>{ const da=x.a.slice(0,10), db=x.b.slice(0,10), ha=x.a.slice(11,16), hb=x.b.slice(11,16);
    return x.a===x.b? `${dl(da)} близько ${ha}` : da===db? `${dl(da)} ${ha}–${hb}` : `${dl(da)} ${ha} – ${dl(db)} ${hb}`; }).join("; ") + (rs.length>3?" і далі":"");
}
function renderWarnings(){
  const el=document.getElementById("warn"), base=RES.find(Boolean);
  const bt=base.hourly.time, s0=bt.findIndex(t=>t.slice(0,13)===NOWISO);
  if(s0<0){ el.hidden=true; return; }
  const times=bt.slice(s0, s0+WARN_H), today=NOWISO.slice(0,10), month=+today.slice(5,7);
  const js=MODELS.map((m,j)=>j).filter(j=>MODELS[j].grp!=="extra" && RES[j]);
  const items=[];
  WARN_DEFS.forEach(def=>{
    if(def.warmOnly && (month<4 || month>10)) return;
    let M=0; const who=[], cnt=times.map(()=>0); let ext=null;
    js.forEach(j=>{ const H=RES[j].hourly;
      if(!def.need.every(k=>H[k] && H[k].some(v=>v!=null))) return;
      const off=H.time.indexOf(times[0]); if(off<0) return;
      let hit=false, covered=false;
      times.forEach((t,k)=>{ const i=off+k; if(H.time[i]!==t || H.temperature_2m?.[i]==null) return; covered=true;
        if(def.test(H,i)){ hit=true; cnt[k]++;
          if(def.val){ const v=def.val(H,i); if(v!=null && (ext==null || (def.agg==="max"? v>ext : v<ext))) ext=v; } } });
      if(!covered) return; M++; if(hit) who.push(short(MODELS[j]));
    });
    if(!who.length) return;
    const thr=Math.max(1, Math.ceil(M*0.3));
    let hrs=times.filter((t,k)=>cnt[k]>=thr); if(!hrs.length) hrs=times.filter((t,k)=>cnt[k]>0);
    items.push({def, n:who.length, M, who, when:hourRanges(hrs,today), ext});
  });
  el.hidden=false;
  const note='<div class="sub" style="margin-top:6px">Ожеледицю й туман моделі ловлять гірше за синоптиків — звіряйтеся з <a href="https://www.meteo.gov.ua/" target="_blank" rel="noopener" style="color:var(--rain)">попередженнями гідрометцентру</a>.</div>';
  if(!items.length){ el.innerHTML='<h2>Попередження на 48 годин</h2><div class="sub">Небезпечних явищ моделі не дають.</div>'+note; return; }
  items.sort((a,b)=> b.n/b.M - a.n/a.M);
  el.innerHTML = `<h2>Попередження на 48 годин</h2><ul class="wl">${items.map(x=>{
    const sh=x.n/x.M, lv = sh>=0.6? ["bad","ймовірно"] : sh>=0.3? ["warn","можливо"] : ["ens","окремі моделі"];
    return `<li>${x.def.ic} <span class="wn">${x.def.name}</span><span class="lv ${lv[0]}">${lv[1]} · ${x.n} з ${x.M}</span>
      <div>${x.when}${x.ext!=null && x.def.fmt? " · "+x.def.fmt(x.ext):""}</div><span class="small">${x.who.join(", ")}</span></li>`; }).join("")}</ul>`+note;
}

function renderHourly(){
  const base = RES.find(Boolean), off = base.utc_offset_seconds/3600;
  let start = base.hourly.time.findIndex(t => t.slice(0,13) === NOWISO); if(start<0) start=0;
  const times = base.hourly.time.slice(start, start+HOURS), N = times.length;
  const series = MODELS.map((m,j)=>{
    const H = RES[j]?.hourly; if(!H) return null;
    const pts=[];
    times.forEach((t,k)=>{
      const idx=H.time.indexOf(t); if(idx<0) return;
      const utcH=((parseInt(t.slice(11,13))-off)%24+24)%24;
      if(utcH % m.step !== 0) return;
      const temp=H.temperature_2m?.[idx]; if(temp==null) return;
      let pr=0,any=false,sn=0; for(let q=idx-m.step+1;q<=idx;q++){const v=H.precipitation?.[q]; if(v!=null){pr+=v;any=true;} sn+=H.snowfall?.[q]||0;}
      pts.push({k,temp,pr:any?pr:null,sn,wc:H.weather_code?.[idx]});
    });
    return pts.length? pts : null;
  });
  // легенда
  document.getElementById("legend").innerHTML = MODELS.map((m,j)=> series[j] ?
    `<span data-j="${j}" class="${hidden.has(j)?'off':''}"><i style="background:${m.c}"></i>${short(m)} · ${m.step} год</span>` : "").join("");
  document.querySelectorAll("#legend span").forEach(el=>el.onclick=()=>{
    const j=+el.dataset.j; hidden.has(j)?hidden.delete(j):hidden.add(j); renderHourly(); });
  // ймовірність опадів (ансамбль ECMWF; крок 3 год, як у самого ансамблю)
  const prob = times.map((t,k)=>{ const utcH=((parseInt(t.slice(11,13))-off)%24+24)%24; return utcH%3===0? ensProbHour(t,3) : null; });
  // графік
  const box=document.getElementById("chart"); const W=Math.round(Math.max(300, Math.min(900, box.clientWidth||720)));
  const Hh=Math.round(Math.max(210, Math.min(280, W*0.6))),L=36,R=6,T=10,B=56,PB=24; // PB — висота смуги ймовірності
  const all = series.flatMap((s,j)=> s&&!hidden.has(j) ? s.map(p=>p.temp) : []);
  let g='';
  const x=k=>L+(W-L-R)*k/Math.max(N-1,1);
  if(all.length){
    const lo=Math.floor(Math.min(...all))-1, hi=Math.ceil(Math.max(...all))+1;
    const y=v=>T+(Hh-T-B)*(hi-v)/(hi-lo);
    const sY=(hi-lo)>12?4:2;
    for(let v=Math.ceil(lo/sY)*sY; v<=hi; v+=sY)
      g+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity="${v===0?.5:.12}"/><text x="${L-4}" y="${y(v)+4}" text-anchor="end">${v}°</text>`;
    series.forEach((s,j)=>{ if(!s||hidden.has(j)) return; const c=MODELS[j].c;
      g+=`<polyline fill="none" stroke="${c}" stroke-width="2" points="${s.map(p=>x(p.k)+','+y(p.temp)).join(' ')}"/>`;
      if(MODELS[j].step>1) g+=s.map(p=>`<circle cx="${x(p.k)}" cy="${y(p.temp)}" r="2.5" fill="${c}"/>`).join(''); });
  }
  // смуга ймовірності
  const pTop=Hh-B+18, bw=(W-L-R)/Math.max(N-1,1)*3*0.8;
  if(ENS){
    g+=`<text x="${L-4}" y="${pTop+PB-2}" text-anchor="end">0%</text><text x="${L-4}" y="${pTop+8}" text-anchor="end">100%</text>`;
    prob.forEach((p,k)=>{ if(p==null) return; const h=PB*p/100;
      g+=`<rect x="${x(k)-bw}" y="${pTop+PB-h}" width="${bw}" height="${h}" fill="var(--rain)" fill-opacity=".6"/>`; });
  }
  times.forEach((t,k)=>{ const h=t.slice(11,13);
    if(h==="00") g+=`<line x1="${x(k)}" x2="${x(k)}" y1="${T}" y2="${pTop+PB}" stroke="currentColor" stroke-opacity=".35"/><text x="${x(k)+3}" y="${T+10}">${dayShort(t.slice(0,10))}</text>`;
    if(+h%(W<500?12:6)===0) g+=`<text x="${x(k)}" y="${Hh-B+11}" text-anchor="middle">${h}</text>`; });
  g+=`<line id="curLine" y1="${T}" y2="${pTop+PB}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 3" visibility="hidden"/><text id="curLbl" y="${T+36}" style="fill:var(--ink);font-weight:600" visibility="hidden"></text>`;
  CUR.x = x; CUR.times = times; CUR.W = W; CUR.L = L; CUR.R = R; CUR.N = N;
  box.innerHTML=`<svg viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" style="color:var(--ink)">${g}</svg>`;
  // таблиця
  const vis = MODELS.map((m,j)=>j).filter(j=>series[j]&&!hidden.has(j));
  const maps = series.map(s=> s? Object.fromEntries(s.map(p=>[p.k,p])) : {});
  let html=`<thead><tr><th>Час</th>${ENS?'<th style="color:var(--rain)">Ймов. опадів (ENS)</th>':''}${vis.map(j=>`<th style="color:${MODELS[j].c}">${short(MODELS[j])}</th>`).join("")}</tr></thead><tbody>`;
  times.forEach((t,k)=>{
    if(!vis.some(j=>maps[j][k]) && prob[k]==null) return;
    const h=t.slice(11,13);
    html+=`<tr data-k="${k}" class="${h==="00"?'daystart':''}"><td>${h==="00"||k===0? dayShort(t.slice(0,10))+' ':''}<b>${h}:00</b></td>`+
      (ENS? `<td class="prob">${prob[k]==null?'':prob[k]+'%'}</td>`:'')+
      vis.map(j=>{const p=maps[j][k]; if(!p) return '<td></td>';
        return `<td>${WMO(p.wc)} ${Math.round(p.temp)||0}°${p.pr? `<span class="p">${p.sn>0?'❄ ':''}${p.pr.toFixed(1)} мм</span>`:''}</td>`;}).join("")+'</tr>';
  });
  // підпис вибраної години під графіком
  CUR.info = k => {
    const t=times[k]; if(!t) return "";
    const pts=vis.map(j=>maps[j][k]).filter(Boolean), ts=pts.map(p=>p.temp);
    let pk=null; for(let q=k;q<Math.min(k+3,N);q++){ if(prob[q]!=null){pk=prob[q];break;} }
    const sn=pts.some(p=>p.sn>0);
    return `<b>${dayShort(t.slice(0,10))}, ${t.slice(11,16)}</b>`+
      (ts.length? ` · <b>${Math.round(mean(ts))}°</b>`+(ts.length>1? ` (${Math.round(Math.min(...ts))}…${Math.round(Math.max(...ts))}°)`:"") : "")+
      (pk!=null? ` · ☔ ${pk}%`:"")+(sn? " · ❄":"");
  };
  document.getElementById("hourly").innerHTML = html+'</tbody>';
  document.querySelectorAll("#hourly tbody tr").forEach(tr=>tr.onclick=()=>setCursor(+tr.dataset.k, "smooth"));
  document.documentElement.style.setProperty("--stickH", document.getElementById("stick").offsetHeight+"px");
  const keep=CUR.k; CUR.k=null;
  if(keep!=null && Date.now()<CUR.lock+60000 && CUR.manual) setCursor(keep,false); else syncFromScroll();
}

// курсор: лінія на графіку + підсвічений рядок + підпис години під графіком
const CUR = {k:null, x:null, times:[], W:720, L:36, R:6, N:72, info:null, lock:0, manual:false};
const boxEl = document.querySelector(".scroll"), stickEl = document.getElementById("stick"), chartEl = document.getElementById("chart");
// верхня межа видимої частини таблиці: під закріпленим графіком і під шапкою таблиці
function visibleTop(){
  const br=boxEl.getBoundingClientRect(), sr=stickEl.getBoundingClientRect();
  const head=document.querySelector("#hourly thead"), hh=head?head.offsetHeight:0;
  const shift=Math.max(0, Math.min(sr.bottom-br.top, boxEl.clientHeight-hh-30));
  boxEl.style.setProperty("--hdrTop", shift+"px"); // шапка таблиці не ховається під графік
  return br.top+shift+hh;
}
function rowFor(k){
  let row=document.querySelector(`#hourly tr[data-k="${k}"]`);
  if(row) return row;
  const rows=[...document.querySelectorAll("#hourly tbody tr")]; if(!rows.length) return null;
  return rows.reduce((a,b)=>Math.abs(+b.dataset.k-k)<Math.abs(+a.dataset.k-k)?b:a);
}
function setCursor(k, scrollMode){
  if(k==null || CUR.x==null) return;
  k=Math.max(0, Math.min(CUR.N-1, k)); CUR.k=k;
  const ln=document.getElementById("curLine"), lb=document.getElementById("curLbl");
  if(ln){ const X=CUR.x(k); ln.setAttribute("x1",X); ln.setAttribute("x2",X); ln.setAttribute("visibility","visible");
    const t=CUR.times[k]||""; lb.textContent=t? t.slice(11,16) : "";
    const right = X > CUR.W-50; lb.setAttribute("x", right? X-4 : X+4); lb.setAttribute("text-anchor", right?"end":"start"); lb.setAttribute("visibility","visible"); }
  document.getElementById("readout").innerHTML = CUR.info? CUR.info(k) : "";
  document.querySelectorAll("#hourly tr.cur").forEach(tr=>tr.classList.remove("cur"));
  const row=rowFor(k);
  if(row){ row.classList.add("cur");
    if(scrollMode){ CUR.manual=true; CUR.lock=Date.now()+(scrollMode==="smooth"?900:400);
      const d=row.getBoundingClientRect().top - visibleTop();
      if(Math.abs(d)>1) boxEl.scrollBy({top:d, behavior:scrollMode==="smooth"?"smooth":"auto"}); } }
}
function syncFromScroll(){
  const top=visibleTop();
  if(Date.now()<CUR.lock) return;           // щойно вибрали годину дотиком — не перебивати
  const rows=[...document.querySelectorAll("#hourly tbody tr")]; if(!rows.length) return;
  const br=boxEl.getBoundingClientRect();
  if(top>br.bottom) return;                  // таблиця повністю поза екраном
  const row = rows.find(r=>r.getBoundingClientRect().bottom > top+6) || rows[rows.length-1];
  CUR.manual=false;
  if(+row.dataset.k !== CUR.k || !row.classList.contains("cur")) setCursor(+row.dataset.k, false);
}
let rafPending=false;
function onScroll(){ if(rafPending) return; rafPending=true; requestAnimationFrame(()=>{ rafPending=false; syncFromScroll(); }); }
boxEl.addEventListener("scroll", onScroll, {passive:true});
window.addEventListener("scroll", onScroll, {passive:true});
// вибір години пальцем або мишею просто на графіку
let dragging=false;
function chartPick(e){
  const svg=chartEl.querySelector("svg"); if(!svg || CUR.x==null) return;
  const r=svg.getBoundingClientRect(), px=(e.clientX-r.left)*CUR.W/r.width;
  setCursor(Math.round((px-CUR.L)/(CUR.W-CUR.L-CUR.R)*(CUR.N-1)), "auto");
}
chartEl.addEventListener("pointerdown", e=>{ dragging=true; if(e.pointerType==="mouse") e.preventDefault(); try{ window.getSelection().removeAllRanges(); }catch(_){} try{chartEl.setPointerCapture(e.pointerId);}catch(_){} chartPick(e); });
chartEl.addEventListener("pointermove", e=>{ if(dragging) chartPick(e); });
["pointerup","pointercancel","pointerleave"].forEach(n=>chartEl.addEventListener(n, ()=>{ dragging=false; }));

function dayTable(day, js, withAvg){
  const val=(j,k)=>{const D=RES[j]?.daily; if(!D) return null; const i=D.time.indexOf(day); return i<0?null:(D[k]?.[i]??null);};
  const live = js.filter(j=>val(j,"temperature_2m_max")!=null);
  if(!live.length) return {html:"", tmax:[]};
  const tmax=live.map(j=>val(j,"temperature_2m_max"));
  let rows='';
  let lastGrp='';
  live.forEach(j=>{
    const m=MODELS[j];
    if(withAvg && m.grp!==lastGrp){ rows+=`<tr class="grp"><td colspan="5">${m.grp==="main"?"Глобальні":"Регіональні (2–2,5 дні)"}</td></tr>`; lastGrp=m.grp; }
    rows+=`<tr><td>${WMO(val(j,"weather_code"))} ${short(m)}</td><td class="tmax">${fmt(val(j,"temperature_2m_max"))}°</td><td class="tmin">${fmt(val(j,"temperature_2m_min"))}°</td><td class="pr">${val(j,"snowfall_sum")>0?"❄ ":""}${fmt(val(j,"precipitation_sum"),1)}</td><td>${fmt(val(j,"wind_speed_10m_max"))}${val(j,"wind_gusts_10m_max")!=null?" / "+Math.round(val(j,"wind_gusts_10m_max")):""}</td></tr>`;
  });
  if(withAvg){
    const a=k=>mean(live.map(j=>val(j,k)));
    rows+=`<tr class="avg"><td>Середнє</td><td class="tmax">${fmt(a("temperature_2m_max"))}°</td><td class="tmin">${fmt(a("temperature_2m_min"))}°</td><td class="pr">${fmt(a("precipitation_sum"),1)}</td><td>${fmt(a("wind_speed_10m_max"))}${a("wind_gusts_10m_max")!=null?" / "+Math.round(a("wind_gusts_10m_max")):""}</td></tr>`;
  }
  return {html:`<table><thead><tr><th>Модель</th><th>макс</th><th>мін</th><th>мм</th><th>вітер / пориви</th></tr></thead><tbody>${rows}</tbody></table>`, tmax};
}

function renderDays(){
  const base = RES.find(Boolean), days = base.daily.time;
  const mainJ = MODELS.map((m,j)=>j).filter(j=>MODELS[j].grp!=="extra");
  const extraJ = MODELS.map((m,j)=>j).filter(j=>MODELS[j].grp==="extra");
  document.getElementById("days").innerHTML = days.map(day=>{
    const {html,tmax} = dayTable(day, mainJ, true); if(!html) return "";
    const sp=spread(tmax);
    const ag = sp==null?"": sp<=2?`<span class="badge ok">моделі згодні (±${sp.toFixed(0)}°)</span>`: sp<=4?`<span class="badge warn">розбіжність ${sp.toFixed(0)}°</span>`:`<span class="badge bad">велика розбіжність ${sp.toFixed(0)}°</span>`;
    const pd = ensProbDay(day);
    const pb = pd==null?"":`<span class="badge ens">☔ опади ${pd}% (ансамбль ECMWF)</span>`;
    return `<section class="card"><h2><span>${dayName(day)}</span><span>${pb} ${ag}</span></h2>${html}</section>`;
  }).join("");
  document.getElementById("extraDays").innerHTML = days.map(day=>{
    const {html} = dayTable(day, extraJ, false); if(!html) return "";
    return `<div style="margin-top:10px"><b>${dayName(day)}</b>${html}</div>`;
  }).join("") || '<div class="sub">Немає даних.</div>';
}

// ===== перевірка моделей за останні 2 дні =====
const median = a => { const b=a.filter(x=>x!=null).sort((x,y)=>x-y); if(!b.length) return null; const m=b.length>>1; return b.length%2? b[m] : (b[m-1]+b[m])/2; };
function vUrl(id, vars){
  const h=vars.flatMap(v=>[v, v+"_previous_day1", v+"_previous_day2"]).join(",");
  return `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=${h}&models=${id}&timezone=auto&past_days=2&forecast_days=1`;
}
let vLoaded=false;
async function loadVerify(){
  const out=document.getElementById("vout"), vp=PLACE;
  out.innerHTML='<div class="sub">Завантаження…</div>';
  const res = await Promise.all(MODELS.map(async m=>{
    let d = await getJSON(vUrl(m.id, ["temperature_2m","precipitation","snowfall"]));
    if(!d) d = await getJSON(vUrl(m.id, ["temperature_2m","precipitation"]));
    return d && d.hourly && (d.hourly.temperature_2m||[]).some(v=>v!=null) ? d : null;
  }));
  if(vp!==PLACE) return;
  const base=res.find(Boolean);
  if(!base){ out.innerHTML='<div class="err">Не вдалося отримати архів прогнозів. Спробуйте пізніше.</div>'; return; }
  vLoaded=true;
  const nowIso = NOWISO || new Date(Date.now()+base.utc_offset_seconds*1000).toISOString().slice(0,13);
  const times = base.hourly.time.filter(t=>t.slice(0,13)<=nowIso);
  const days=[...new Set(times.map(t=>t.slice(0,10)))];
  const at=(d,key,t)=>{ const H=d.hourly, i=H.time.indexOf(t); return i<0||!H[key]? null : H[key][i]; };
  // опорні значення по годинах
  const ref={}; times.forEach(t=>{ const live=res.filter(Boolean);
    const sn=live.map(d=>at(d,"snowfall",t)).filter(v=>v!=null);
    ref[t]={T:median(live.map(d=>at(d,"temperature_2m",t))), P:median(live.map(d=>at(d,"precipitation",t))), snN:sn.filter(v=>v>0).length, snM:sn.length}; });
  const span = hs => hs.length? (hs[0]===hs[hs.length-1]? hs[0]+" год" : hs[0]+"–"+hs[hs.length-1]+" год") : "";
  out.innerHTML = days.map(day=>{
    const ts=times.filter(t=>t.startsWith(day)); if(ts.length<3) return "";
    const rows = MODELS.map((m,j)=>{ const d=res[j]; if(!d) return null;
      const errs=[], sh1=[], sh2=[]; let p1=0,anyP=false,s1=0,s2=0,hasS=!!d.hourly.snowfall_previous_day1;
      ts.forEach(t=>{ const f=at(d,"temperature_2m_previous_day1",t), r0=ref[t].T; if(f!=null&&r0!=null) errs.push(Math.abs(f-r0));
        const p=at(d,"precipitation_previous_day1",t); if(p!=null){p1+=p;anyP=true;}
        const a=at(d,"snowfall_previous_day1",t); if(a>0){s1+=a; sh1.push(t.slice(11,13));}
        const b=at(d,"snowfall_previous_day2",t); if(b>0){s2+=b; sh2.push(t.slice(11,13));} });
      if(!errs.length) return null;
      return {m, mae:mean(errs), p1:anyP?p1:null, s1, s2, sh1, sh2, hasS};
    }).filter(Boolean).sort((a,b)=>a.mae-b.mae);
    if(!rows.length) return "";
    const refP=ts.reduce((s,t)=>s+(ref[t].P||0),0);
    const refSn=ts.filter(t=>ref[t].snM && ref[t].snN/ref[t].snM>=0.34).map(t=>t.slice(11,13));
    const who1=rows.filter(r=>r.s1>0).map(r=>short(r.m)), who2=rows.filter(r=>r.s2>0).map(r=>short(r.m));
    const noS=rows.filter(r=>r.hasS && !(r.s1>0)).map(r=>short(r.m));
    const sum = `<div class="vsum">Опорно: опадів ~<b>${refP.toFixed(1)} мм</b>${refSn.length? `, сніг ${span(refSn)}`:", без снігу"}.<br>`+
      (who1.length? `❄ Сніг за добу наперед давали: <b>${who1.join(", ")}</b>.`:"За добу наперед сніг не давала жодна модель.")+
      (who2.length? `<br>❄ Ще за дві доби: ${who2.join(", ")}.`:"")+
      (who1.length&&noS.length? `<br>Без снігу в прогнозі: ${noS.join(", ")}.`:"")+`</div>`;
    const tr = rows.map(r=>`<tr><td>${short(r.m)}${r.m.grp==="extra"?' <span class="na">(дод.)</span>':''}</td><td>±${r.mae.toFixed(1)}°</td><td class="pr">${fmt(r.p1,1)}</td>`+
      `<td>${!r.hasS?'<span class="na">—</span>': r.s1>0? `❄ ${r.s1.toFixed(1)} см<span class="small">${span(r.sh1)}</span>`:"ні"}</td>`+
      `<td>${!r.hasS?'<span class="na">—</span>': r.s2>0? "❄ так":"ні"}</td></tr>`).join("");
    return `<div class="vday"><b>${dayName(day)}${day===nowIso.slice(0,10)?" (до цієї години)":""}</b>${sum}
      <div style="overflow-x:auto"><table><thead><tr><th>Модель</th><th>Δt°</th><th>мм</th><th>сніг за 1 д.</th><th>за 2 д.</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
  }).join("") || '<div class="sub">Немає даних для порівняння.</div>';
}
document.getElementById("verify").addEventListener("toggle", e=>{ if(e.target.open && !vLoaded) loadVerify(); });

let rzT=null, lastW=window.innerWidth;
window.addEventListener("resize", ()=>{ if(Math.abs(window.innerWidth-lastW)<20) return; lastW=window.innerWidth;
  clearTimeout(rzT); rzT=setTimeout(()=>{ if(RES.length){ renderHourly(); } }, 200); });
document.getElementById("reload").onclick = ()=>{ load(); if(document.getElementById("verify").open) loadVerify(); };
// ===== вибір місця =====
function allPlaces(){ return [PLACES[0]].concat(LIST); }
function saveList(){ try{ localStorage.setItem("pogoda.list", JSON.stringify(LIST)); }catch(e){} }
function addPlace(p){ if(p.id!=="lviv" && !LIST.some(x=>x.id===p.id)){ LIST.push(p); saveList(); } return allPlaces().find(x=>x.id===p.id); }
function removePlace(p){ LIST=LIST.filter(x=>x!==p); saveList(); if(p===PLACE) selectPlace(PLACES[0]); else renderPlaces(); renderSuggest(); }
function renderPlaces(){
  const nav=document.getElementById("places");
  nav.innerHTML = allPlaces().map(p=>`<button data-id="${esc(p.id)}" class="${p===PLACE?'on':''}">${esc(p.name)}${p===PLACE&&p.id!=="lviv"?'<span class="x" title="Прибрати зі списку" aria-label="Прибрати зі списку">✕</span>':''}</button>`).join("") + `<button data-id="+">＋ додати</button>`;
  nav.querySelectorAll("button").forEach(b=>b.onclick=e=>{
    const id=b.dataset.id;
    if(id==="+"){ const ps=document.getElementById("psearch"); ps.hidden=!ps.hidden; if(!ps.hidden){ renderSuggest(); document.getElementById("pq").focus(); } return; }
    const p=allPlaces().find(x=>x.id===id); if(!p) return;
    if(e.target.closest(".x")){ removePlace(p); return; }   // ✕ — прибрати місце зі списку
    if(p!==PLACE) selectPlace(p);
  });
  const on=nav.querySelector("button.on"); if(on && on.scrollIntoView) on.scrollIntoView({inline:"center",block:"nearest"});
}
// у панелі додавання: запропонувати стандартні місця, яких зараз немає у списку
function renderSuggest(){
  const box=document.getElementById("pres"), miss=PLACES.slice(1).filter(x=>!LIST.some(y=>y.id===x.id));
  box.innerHTML = miss.length? `<div class="sub">Повернути до списку:</div><div class="chips">${miss.map(x=>`<button data-pid="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>` : "";
  box.querySelectorAll("button[data-pid]").forEach(b=>b.onclick=()=>{ const x=PLACES.find(y=>y.id===b.dataset.pid); document.getElementById("psearch").hidden=true; selectPlace(addPlace({...x})); });
}
function selectPlace(p, fromHash){
  PLACE=p; LAT=p.lat; LON=p.lon;
  document.getElementById("pname").textContent=p.name;
  document.title="Погода: "+p.name;
  document.getElementById("windyLink").href=`https://www.windy.com/${p.lat.toFixed(3)}/${p.lon.toFixed(3)}`;
  document.getElementById("lvivLinks").hidden = p.id!=="lviv";
  try{ localStorage.setItem("pogoda.last", p.id); }catch(e){}
  if(!fromHash){ try{ if(PLACES.some(x=>x.id===p.id)) location.hash=p.id; else history.replaceState(null,"",location.pathname+location.search); }catch(e){} }
  renderPlaces();
  CUR.k=null; CUR.manual=false; vLoaded=false; document.getElementById("vout").innerHTML="";
  load(); if(document.getElementById("verify").open) loadVerify();
}
document.getElementById("pform").addEventListener("submit", async e=>{
  e.preventDefault();
  const q=document.getElementById("pq").value.trim(), box=document.getElementById("pres"); if(!q) return;
  box.innerHTML='<div class="sub">Пошук…</div>';
  const d=await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=uk&format=json`);
  const rs=((d&&d.results)||[]).filter(x=>x && typeof x.name==="string" && Number.isFinite(x.latitude) && Number.isFinite(x.longitude));
  if(!rs.length){ box.innerHTML='<div class="sub">Нічого не знайдено. Спробуйте іншу назву або латинкою.</div>'; return; }
  box.innerHTML=rs.map((x,i)=>`<button data-i="${i}">${esc(x.name)}<span class="small">${esc([x.admin2,x.admin1,x.country].filter(Boolean).join(", "))}${Number.isFinite(x.elevation)?" · "+Math.round(x.elevation)+" м":""}</span></button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const x=rs[+b.dataset.i], id="c"+x.latitude.toFixed(3)+"_"+x.longitude.toFixed(3);
    const p=addPlace({id, name:x.name.slice(0,80), lat:x.latitude, lon:x.longitude});
    box.innerHTML=""; document.getElementById("pq").value=""; document.getElementById("psearch").hidden=true;
    selectPlace(p);
  });
});
function placeFromHash(){ const h=(location.hash||"").slice(1); const x=PLACES.find(p=>p.id===h); return x? addPlace({...x}) : null; } // місце з посилання повертається до списку
window.addEventListener("hashchange", ()=>{ const p=placeFromHash(); if(p && p!==PLACE) selectPlace(p,true); });
(function init(){
  let p=placeFromHash();
  if(!p){ let last=null; try{ last=localStorage.getItem("pogoda.last"); }catch(e){} p=allPlaces().find(x=>x.id===last)||PLACES[0]; }
  selectPlace(p, true);
})();

// вебзастосунок: службовий працівник зберігає сторінку й останній прогноз для роботи без мережі
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
window.addEventListener("online", ()=>{ if(document.body.classList.contains("offline")) load(); });
