const stopsEl = document.getElementById("stops");
const tpl = document.getElementById("stopTemplate");

const freeInput = document.getElementById("freeInput");
const generateTextBtn = document.getElementById("generateText");
const clearTextBtn = document.getElementById("clearText");

const addStopBtn = document.getElementById("addStop");
const generateStopsBtn = document.getElementById("generateStops");

const routeTextEl = document.getElementById("routeText");
const linkOutEl = document.getElementById("linkOut");
const copyBtn = document.getElementById("copy");
const openA = document.getElementById("open");

// --- Helpers ---
function encodeStop(s) {
  return encodeURIComponent(s.trim()).replaceAll("%20", "+");
}

// akzeptiert: "-" oder "," oder Zeilenumbruch
function parseFreeText(text) {
  return text
    .split(/-|,|\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
}

function setOutput(values) {
  if (values.length < 2) {
    routeTextEl.textContent = "Bitte mind. 2 Orte eingeben.";
    linkOutEl.value = "";
    openA.removeAttribute("href");
    return;
  }

  routeTextEl.textContent = values.join(" → ");
  const path = values.map(encodeStop).join("/");
  const url = `https://www.google.com/maps/dir/${path}`;

  linkOutEl.value = url;
  openA.href = url;
}

function updateNumbers() {
  [...stopsEl.querySelectorAll(".stop")].forEach((stop, i) => {
    stop.querySelector(".stopNr").textContent = `Etappe ${i + 1}`;
  });
}

function createStop(initialValue = "") {
  const node = tpl.content.firstElementChild.cloneNode(true);
  const input = node.querySelector(".stopInput");
  const suggBox = node.querySelector(".suggestions");
  const removeBtn = node.querySelector(".remove");

  input.value = initialValue;

  // --- Autocomplete via Nominatim (OSM) ---
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
    if (!items.length) {
      suggBox.classList.remove("show");
      return;
    }

    items.forEach(text => {
      const div = document.createElement("div");
      div.className = "sugg";
      div.textContent = text;

      div.addEventListener("click", () => {
        input.value = text;
        suggBox.classList.remove("show");
      });

      suggBox.appendChild(div);
    });

    suggBox.classList.add("show");
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (debounceId) clearTimeout(debounceId);

    if (q.length < 3) {
      suggBox.classList.remove("show");
      return;
    }

    debounceId = setTimeout(async () => {
      try {
        const items = await fetchSuggestions(q);
        renderSuggestions(items);
      } catch {
        // aborted/offline -> ignore
      }
    }, 250);
  });

  // Klick ausserhalb -> Suggestions zu
  document.addEventListener("click", (e) => {
    if (!node.contains(e.target)) suggBox.classList.remove("show");
  });

  removeBtn.addEventListener("click", () => {
    node.remove();
    updateNumbers();
  });

  stopsEl.appendChild(node);
  updateNumbers();
}

// --- Initial stops ---
createStop("");
createStop("");

// --- Buttons ---
addStopBtn.addEventListener("click", () => createStop(""));

generateTextBtn.addEventListener("click", () => {
  const values = parseFreeText(freeInput.value);
  setOutput(values);
});

generateStopsBtn.addEventListener("click", () => {
  const values = [...stopsEl.querySelectorAll(".stopInput")]
    .map(i => i.value.trim())
    .filter(Boolean);
  setOutput(values);
});

clearTextBtn.addEventListener("click", () => {
  freeInput.value = "";
  freeInput.focus();
});

// Ctrl+Enter / Cmd+Enter im Freitextfeld generiert
freeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    generateTextBtn.click();
  }
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
