// Налаштування: місця за замовчуванням і погодні моделі
"use strict";
const DAYS = 7, HOURS = 72;
// місця: координати населених пунктів (для сіл — приблизно центр села)
const PLACES = [
  {id:"lviv",      name:"Львів",            lat:49.8397, lon:24.0297},
  {id:"skole",     name:"Сколе",            lat:49.0364, lon:23.5133},
  {id:"slavske",   name:"Славське",         lat:48.8483, lon:23.4489},
  {id:"mukachevo", name:"Мукачево",         lat:48.4414, lon:22.7178},
  {id:"osmoloda",  name:"Осмолода",         lat:48.6639, lon:24.0181},
  {id:"stara-huta",name:"Стара Гута",       lat:48.6300, lon:24.1900},
  {id:"frankivsk", name:"Івано-Франківськ", lat:48.9226, lon:24.7111},
  {id:"ternopil",  name:"Тернопіль",        lat:49.5535, lon:25.5948}
];
// grp: main — основні; reg — регіональні високої роздільності (перевіряється покриття); extra — додаткові
const MODELS = [
  {id:"ecmwf_ifs",            name:"ECMWF IFS 9 км",            grp:"main",  step:1, c:"#1f77b4"},
  {id:"icon_seamless",        name:"ICON (DWD, Німеччина)",     grp:"main",  step:1, c:"#2ca02c"},
  {id:"ukmo_seamless",        name:"UKMO (Велика Британія)",    grp:"main",  step:1, c:"#8c564b"},
  {id:"meteofrance_seamless", name:"ARPEGE (Франція)",          grp:"main",  step:1, c:"#9467bd"},
  {id:"gfs_seamless",         name:"GFS (NOAA, США)",           grp:"main",  step:1, c:"#d62728"},
  {id:"ecmwf_aifs025_single", name:"AIFS (ECMWF, ШІ)",          grp:"main",  step:6, c:"#ff7f0e"},
  {id:"icon_d2",              name:"ICON-D2 2 км",              grp:"reg",   step:1, c:"#00a37a"},
  {id:"chmi_aladin_central_europe_2km", name:"ALADIN 2 км (Чехія)", grp:"reg", step:1, c:"#c2185b"},
  {id:"dmi_harmonie_arome_europe",  name:"HARMONIE 2 км (DMI)",  grp:"reg",  step:1, c:"#5d4037"},
  {id:"knmi_harmonie_arome_europe", name:"HARMONIE 5,5 км (KNMI)", grp:"reg", step:1, c:"#455a64"},
  {id:"jma_seamless",         name:"JMA (Японія)",              grp:"extra", step:6, c:"#e377c2"},
  {id:"gem_seamless",         name:"GEM (Канада)",              grp:"extra", step:3, c:"#7f7f7f"},
  {id:"cma_grapes_global",    name:"GRAPES (Китай)",            grp:"extra", step:3, c:"#bcbd22"},
  {id:"bom_access_global",    name:"ACCESS-G (Австралія)",      grp:"extra", step:1, c:"#17becf"},
  {id:"kma_seamless",         name:"KMA (Корея)",               grp:"extra", step:3, c:"#6a3d9a"},
  {id:"gfs_graphcast025",     name:"GraphCast (Google, ШІ)",    grp:"extra", step:6, c:"#b15928"}
];
const ENS_IDS = ["ecmwf_ifs025", "ecmwf_ifs025_ensemble"]; // пробуємо по черзі
const WET = 0.1; // мм за годину — поріг «є опади»
