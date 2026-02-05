// ---------- Utilities ----------
const $ = (id) => document.getElementById(id);
const encStop = (s) => encodeURIComponent(s.trim()).replaceAll("%20", "+");

function parseFreeText(text) {
  return text
    .split(/-|,|\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function uniq(arr) {
  return [...new Set(arr)];
}

function nowIso() {
  return new Date().toISOString();
}

// ---------- Storage keys ----------
const APP_KEY = "routegen_v1";
const COORD_KEY = "routegen_coordcache_v1";

function getState() {
  try { return JSON.parse(localStorage.getItem(APP_KEY)) ?? {}; }
  catch { return {}; }
}
function setState(state) {
  localStorage.setItem(APP_KEY, JSON.stringify(state));
}

function getCoordCache() {
  try { return JSON.parse(localStorage.getItem(COORD_KEY)) ?? {}; }
  catch { return {}; }
}
function setCoordCache(cache) {
  localStorage.setItem(COORD_KEY, JSON.stringify(cache));
}

// ---------- Elements ----------
const tripNameEl = $("tripName");
const saveTripBtn = $("saveTrip");

const tabs = [...document.querySelectorAll(".tab")];
const panels = {
  route: $("tab-route"),
  pack: $("tab-pack"),
  weather: $("tab-weather"),
  spots: $("tab-spots")
};

// Route
const stopsEl = $("stops");
const stopTpl = $("stopTemplate");

const freeInput = $("freeInput");
const generateTextBtn = $("generateText");
const clearTextBtn = $("clearText");
const routeStatus = $("routeStatus");

const addStopBtn = $("addStop");
const generateStopsBtn = $("generateStops");

const routeTextEl = $("routeText");
const linkOutEl = $("linkOut");
const copyBtn = $("copy");
const openA = $("open");

// Packlist
const presetEl = $("preset");
const applyPresetBtn = $("applyPreset");
const clearPackBtn = $("clearPack");
const newItemEl = $("newItem");
const newCatEl = $("newCat");
const addItemBtn = $("addItem");
const packListEl = $("packList");
const copyPackBtn = $("copyPack");
const downloadPackBtn = $("downloadPack");
const packStatus = $("packStatus");

// Weather
const loadWeatherBtn = $("loadWeather");
const clearWeatherBtn = $("clearWeather");
const weatherBox = $("weatherBox");

// Spots
const spotGrid = $("spotGrid");

// ---------- Trip handling ----------
function currentTripKey() {
  const name = (tripNameEl.value || "default").trim();
  return name ? name : "default";
}

function loadTrip() {
  const state = getState();
  const key = currentTripKey();

  // Load stops / freetext
  const trip = state[key] ?? {};
  if (trip.freeText) freeInput.value = trip.freeText;
  if (Array.isArray(trip.stops) && trip.stops.length) {
    // rebuild stops UI
    stopsEl.innerHTML = "";
    trip.stops.forEach(v => createStop(v));
  } else if (!stopsEl.children.length) {
    createStop("");
    createStop("");
  }

  // Load packlist
  renderPack(trip.pack ?? []);

  // Refresh derived UIs
  updateStopNumbers();
  renderSpotQuickLinks();
  setRouteStatus(`Trip "${key}" geladen.`);
}

function saveTrip() {
  const state = getState();
  const key = currentTripKey();
  const stops = [...stopsEl.querySelectorAll(".stopInput")].map(i => i.value.trim()).filter(Boolean);

  state[key] = state[key] ?? {};
  state[key].freeText = freeInput.value;
  state[key].stops = stops;
  state[key].pack = getPackFromUI();
  state[key].savedAt = nowIso();

  setState(state);
  setRouteStatus(`Gespeichert: "${key}" (${new Date().toLocaleString()})`);
  renderSpotQuickLinks();
}

// ---------- Tabs ----------
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    const name = btn.dataset.tab;
    Object.values(panels).forEach(p => p.classList.remove("active"));
    panels[name].classList.add("active");
  });
});

// ---------- Route output ----------
function setRouteStatus(msg) {
  routeStatus.textContent = msg;
}

function setOutput(values) {
  if (values.length < 2) {
    routeTextEl.textContent = "Bitte mind. 2 Orte eingeben.";
    linkOutEl.value = "";
    openA.removeAttribute("href");
    return false;
  }
  routeTextEl.textContent = values.join(" → ");
  const path = values.map(encStop).join("/");
  const url = `https://www.google.com/maps/dir/${path}`;
  linkOutEl.value = url;
  openA.href = url;
  return true;
}

// ---------- Stops UI + Autocomplete (Nominatim) ----------
function updateStopNumbers() {
  [...stopsEl.querySelectorAll(".stop")].forEach((stop, i) => {
    stop.querySelector(".stopNr").textContent = `Etappe ${i + 1}`;
  });
}

function createStop(initialValue = "") {
  const node = stopTpl.content.firstElementChild.cloneNode(true);
  const input = node.querySelector(".stopInput");
  const suggBox = node.querySelector(".suggestions");
  const removeBtn = node.querySelector(".remove");

  input.value = initialValue;

  let debounceId = null;
  let abortCtrl = null;

  async function fetchSuggestions(q) {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "6");

    const res = await fetch(url.toString(), {
      signal: abortCtrl.signal,
      headers: { "Accept-Language": "de" }
    });

    if (!res.ok) return [];
    const data = await res.json();
    return data.map(x => x.display_name);
  }

  function renderSuggestions(items) {
    suggBox.innerHTML = "";
    if (!items.length) { suggBox.classList.remove("show"); return; }

    items.forEach(text => {
      const div = document.createElement("div");
      div.className = "sugg";
      div.textContent = text;
      div.addEventListener("click", () => {
        input.value = text;
        suggBox.classList.remove("show");
        saveTrip(); // autosave
      });
      suggBox.appendChild(div);
    });
    suggBox.classList.add("show");
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (debounceId) clearTimeout(debounceId);

    if (q.length < 3) { suggBox.classList.remove("show"); return; }

    debounceId = setTimeout(async () => {
      try { renderSuggestions(await fetchSuggestions(q)); }
      catch { /* ignore */ }
    }, 250);
  });

  input.addEventListener("blur", () => {
    setTimeout(() => suggBox.classList.remove("show"), 150);
  });

  removeBtn.addEventListener("click", () => {
    node.remove();
    updateStopNumbers();
    saveTrip();
    renderSpotQuickLinks();
  });

  stopsEl.appendChild(node);
  updateStopNumbers();
}

// ---------- Route actions ----------
generateTextBtn.addEventListener("click", () => {
  const values = parseFreeText(freeInput.value);
  setRouteStatus(`Freitext: ${values.length} Stop(s) erkannt.`);
  if (setOutput(values)) saveTrip();
});

clearTextBtn.addEventListener("click", () => {
  freeInput.value = "";
  setRouteStatus("Freitext geleert.");
  saveTrip();
});

freeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    generateTextBtn.click();
  }
});

addStopBtn.addEventListener("click", () => {
  createStop("");
  saveTrip();
});

generateStopsBtn.addEventListener("click", () => {
  const values = [...stopsEl.querySelectorAll(".stopInput")]
    .map(i => i.value.trim())
    .filter(Boolean);
  setRouteStatus(`Etappen: ${values.length} Stop(s) erkannt.`);
  if (setOutput(values)) saveTrip();
});

copyBtn.addEventListener("click", async () => {
  const text = linkOutEl.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Kopiert ✓";
    setTimeout(() => (copyBtn.textContent = "Kopieren"), 900);
  } catch {
    linkOutEl.focus();
    linkOutEl.select();
    document.execCommand("copy");
  }
});

// ---------- Packlist ----------
const PRESETS = {
  roadtrip: [
    ["Dokumente","ID/Pass"],["Dokumente","Führerausweis"],["Dokumente","Kreditkarte"],["Dokumente","Versicherung/Notfallnummern"],
    ["Technik","Handy + Ladekabel"],["Technik","Powerbank"],["Technik","Adapter"],["Technik","Kopfhörer"],
    ["Outdoor","Sonnenbrille"],["Outdoor","Trinkflasche"],["Outdoor","Taschenmesser"],["Outdoor","Regenschutz"],
    ["Hygiene","Zahnbürste"],["Hygiene","Sonnencreme"],["Hygiene","Reiseapotheke"],
    ["Kleidung","Jacke"],["Kleidung","Wechselshirt"],["Kleidung","Socken/Unterwäsche"]
  ],
  hike: [
    ["Outdoor","Rucksack"],["Outdoor","Regenjacke"],["Outdoor","Wanderschuhe"],["Outdoor","Stirnlampe"],
    ["Outdoor","1. Hilfe"],["Outdoor","Snacks"],["Outdoor","Karte/Offline Maps"],["Outdoor","Trekkingstöcke"],
    ["Technik","Handy + Ladekabel"],["Technik","Powerbank"],
    ["Kleidung","Funktionsshirt"],["Kleidung","Fleece"],["Kleidung","Mütze/Handschuhe"],["Kleidung","Wechselsocken"],
    ["Hygiene","Blasenpflaster"],["Dokumente","Notfallkontakt"]
  ],
  photo: [
    ["Technik","Kamera"],["Technik","Ersatzakku"],["Technik","SD-Karten"],["Technik","Ladegerät"],
    ["Technik","Stativ"],["Technik","Reinigung (Blasebalg/Tuch)"],
    ["Outdoor","Regenschutz (Kamera)"],["Outdoor","Mückenspray"],
    ["Kleidung","Warme Schicht"],["Kleidung","Regenjacke"],
    ["Dokumente","Versicherung/Seriennummern"]
  ]
};

function normalizePack(items) {
  // items: {id, cat, text, done, qty}
  return items.map(it => ({
    id: it.id ?? crypto.randomUUID(),
    cat: it.cat ?? "Sonstiges",
    text: (it.text ?? "").trim(),
    done: !!it.done,
    qty: Number.isFinite(it.qty) ? it.qty : (parseInt(it.qty,10) || 1),
  })).filter(it => it.text.length);
}

function getPackFromUI() {
  const items = [];
  packListEl.querySelectorAll(".packItem").forEach(row => {
    const id = row.dataset.id;
    const cat = row.dataset.cat;
    const done = row.querySelector("input[type=checkbox]").checked;
    const text = row.querySelector(".txt").value.trim();
    const qty = parseInt(row.querySelector(".qty").value, 10) || 1;
    items.push({ id, cat, text, done, qty });
  });
  return normalizePack(items);
}

function renderPack(items) {
  const norm = normalizePack(items);
  const groups = {};
  norm.forEach(it => {
    groups[it.cat] = groups[it.cat] ?? [];
    groups[it.cat].push(it);
  });

  const cats = Object.keys(groups).sort((a,b) => a.localeCompare(b, "de"));
  packListEl.innerHTML = "";

  if (!cats.length) {
    packListEl.innerHTML = `<div class="smallMuted">Noch kei Items. Wähle es Preset oder füeg eis hinzu.</div>`;
    packStatus.textContent = "–";
    return;
  }

  cats.forEach(cat => {
    const box = document.createElement("div");
    box.className = "packGroup";
    box.innerHTML = `<div class="packGroupTitle">${cat}</div>`;

    groups[cat].forEach(it => {
      const row = document.createElement("div");
      row.className = "packItem";
      row.dataset.id = it.id;
      row.dataset.cat = cat;

      row.innerHTML = `
        <div class="packLeft">
          <input type="checkbox" ${it.done ? "checked": ""} aria-label="Erledigt" />
          <input class="txt" type="text" value="${escapeHtml(it.text)}" />
        </div>
        <div class="packRight">
          <input class="qty" type="number" min="1" value="${it.qty}" />
          <button class="btn btnTight del">Löschen</button>
        </div>
      `;

      row.querySelector(".del").addEventListener("click", () => {
        row.remove();
        saveTrip();
        renderPack(getPackFromUI());
      });

      // autosave
      row.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("input", () => { saveTrip(); packStatus.textContent = "Autosave ✓"; });
        inp.addEventListener("change", () => { saveTrip(); packStatus.textContent = "Autosave ✓"; });
      });

      box.appendChild(row);
    });

    packListEl.appendChild(box);
  });

  packStatus.textContent = `${norm.length} Item(s)`;
}

function escapeHtml(s) {
  return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

applyPresetBtn.addEventListener("click", () => {
  const key = presetEl.value;
  if (!key) return;

  const preset = PRESETS[key] ?? [];
  const items = preset.map(([cat, text]) => ({
    id: crypto.randomUUID(),
    cat, text, done:false, qty:1
  }));

  renderPack(items);
  saveTrip();
  packStatus.textContent = `Preset "${key}" geladen`;
});

clearPackBtn.addEventListener("click", () => {
  renderPack([]);
  saveTrip();
});

addItemBtn.addEventListener("click", () => {
  const text = newItemEl.value.trim();
  if (!text) return;
  const cat = newCatEl.value;

  const items = getPackFromUI();
  items.push({ id: crypto.randomUUID(), cat, text, done:false, qty:1 });
  renderPack(items);
  newItemEl.value = "";
  saveTrip();
});

copyPackBtn.addEventListener("click", async () => {
  const trip = currentTripKey();
  const items = getPackFromUI();
  const md = packToMarkdown(trip, items);

  try {
    await navigator.clipboard.writeText(md);
    packStatus.textContent = "Markdown kopiert ✓";
  } catch {
    packStatus.textContent = "Kopieren nicht möglich (Browser).";
  }
});

downloadPackBtn.addEventListener("click", () => {
  const trip = currentTripKey();
  const items = getPackFromUI();
  const md = packToMarkdown(trip, items);

  const blob = new Blob([md], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `packliste_${trip.replaceAll(" ", "_")}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

function packToMarkdown(trip, items) {
  const groups = {};
  items.forEach(it => {
    groups[it.cat] = groups[it.cat] ?? [];
    groups[it.cat].push(it);
  });

  const cats = Object.keys(groups).sort((a,b)=>a.localeCompare(b,"de"));
  let out = `# Packliste – ${trip}\n\n`;

  cats.forEach(cat => {
    out += `## ${cat}\n`;
    groups[cat].forEach(it => {
      out += `- [${it.done ? "x":" "}] ${it.text} (x${it.qty})\n`;
    });
    out += "\n";
  });

  return out.trim() + "\n";
}

// ---------- Weather (Open-Meteo: Geocoding + Current) ----------
async function geocodeOpenMeteo(name) {
  const cache = getCoordCache();
  const key = name.trim().toLowerCase();
  if (cache[key]) return cache[key];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "de");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  const r = data?.results?.[0];
  if (!r) return null;

  const coord = { name: r.name, country: r.country, admin1: r.admin1, lat: r.latitude, lon: r.longitude };
  cache[key] = coord;
  setCoordCache(cache);
  return coord;
}

async function fetchCurrentWeather(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,precipitation,wind_speed_10m");
  url.searchParams.set("timezone", "Europe/Zurich");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Weather failed");
  const data = await res.json();
  return data.current;
}

function getAllStopsForFeatures() {
  const stopsFromFields = [...stopsEl.querySelectorAll(".stopInput")]
    .map(i => i.value.trim())
    .filter(Boolean);

  const stopsFromText = parseFreeText(freeInput.value);

  // Priorität: Etappen wenn vorhanden, sonst Freitext
  return stopsFromFields.length ? stopsFromFields : stopsFromText;
}

loadWeatherBtn.addEventListener("click", async () => {
  const stops = getAllStopsForFeatures();
  if (stops.length < 1) {
    weatherBox.innerHTML = `<div class="smallMuted">Bitte zuerst Stops erfassen (Route-Tab).</div>`;
    return;
  }

  weatherBox.innerHTML = `<div class="smallMuted">Lade Wetter…</div>`;

  const limited = stops.slice(0, 12); // Schutz
  const rows = [];

  for (const s of limited) {
    try {
      const geo = await geocodeOpenMeteo(s);
      if (!geo) { rows.push({ place: s, err: "nicht gefunden" }); continue; }
      const cur = await fetchCurrentWeather(geo.lat, geo.lon);
      rows.push({
        place: `${geo.name}${geo.admin1 ? ", " + geo.admin1 : ""}${geo.country ? ", " + geo.country : ""}`,
        temp: cur.temperature_2m,
        rain: cur.precipitation,
        wind: cur.wind_speed_10m,
        time: cur.time
      });
    } catch (e) {
      rows.push({ place: s, err: "Fehler" });
    }
  }

  const html = `
    <table class="table">
      <thead>
        <tr>
          <th>Ort</th>
          <th>Temp</th>
          <th>Regen</th>
          <th>Wind</th>
          <th>Zeit</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${escapeHtml(r.place)}</td>
            <td>${r.err ? "–" : `${r.temp}°C`}</td>
            <td>${r.err ? "–" : `${r.rain} mm`}</td>
            <td>${r.err ? "–" : `${r.wind} km/h`}</td>
            <td>${r.err ? `<span class="badge">⚠ ${escapeHtml(r.err)}</span>` : escapeHtml(r.time)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="smallMuted">Hinweis: nur erste ${limited.length} Stops geladen.</div>
  `;

  weatherBox.innerHTML = html;
});

clearWeatherBtn.addEventListener("click", () => {
  weatherBox.innerHTML = "";
});

// ---------- Spots (Quick links) ----------
function renderSpotQuickLinks() {
  const stops = getAllStopsForFeatures();
  const showStops = uniq(stops).slice(0, 8);

  if (!showStops.length) {
    spotGrid.innerHTML = `<div class="smallMuted">Erfasch zuerst Stops im Route-Tab.</div>`;
    return;
  }

  const types = [
    { label: "Viewpoints", q: "viewpoint near " },
    { label: "Wasserfälle", q: "waterfall near " },
    { label: "Wanderung", q: "hike trail near " },
    { label: "Fotospot", q: "photo spot near " },
  ];

  spotGrid.innerHTML = "";

  showStops.forEach(stop => {
    const box = document.createElement("div");
    box.className = "spotCard";
    box.innerHTML = `
      <div class="spotCardTitle">${escapeHtml(stop)}</div>
      <div class="smallMuted">Quick-Search in Google Maps:</div>
      <div class="spotLinks"></div>
    `;

    const links = box.querySelector(".spotLinks");
    types.forEach(t => {
      const a = document.createElement("a");
      a.className = "btn btnTight";
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = t.label;
      const q = `${t.q}${stop}`;
      a.href = `https://www.google.com/maps/search/${encodeURIComponent(q)}`;
      links.appendChild(a);
    });

    spotGrid.appendChild(box);
  });
}

// ---------- Trip UI events ----------
saveTripBtn.addEventListener("click", saveTrip);
tripNameEl.addEventListener("change", loadTrip);

// Autosave on route changes
freeInput.addEventListener("input", () => { saveTrip(); renderSpotQuickLinks(); });
stopsEl.addEventListener("input", () => { saveTrip(); renderSpotQuickLinks(); });

// ---------- Init ----------
(function init(){
  // Default trip name
  const state = getState();
  const lastTrip = state.__lastTrip;
  if (lastTrip) tripNameEl.value = lastTrip;

  // Two initial stops if empty
  if (!stopsEl.children.length) {
    createStop("");
    createStop("");
  }

  loadTrip();

  // remember trip name
  tripNameEl.addEventListener("input", () => {
    const st = getState();
    st.__lastTrip = currentTripKey();
    setState(st);
  });

  renderSpotQuickLinks();
})();
