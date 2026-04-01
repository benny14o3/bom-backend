// ============================================================
//  KONFIGURATION
// ============================================================
const ADMIN_PASSWORD = "fritsch2024"; // ← hier Passwort ändern
const STORAGE_KEY    = "bom_data_v1";

const BOM_BACKEND = "https://bom-backend-d246.onrender.com";

// ============================================================
//  STATE
// ============================================================
let data          = [];
let verpackungMap = {};
let isAdmin       = false;
let currentlyOpen = null;

// ============================================================
//  INIT – immer frisch von GitHub/data.json laden
// ============================================================
function loadData() {
  fetch(BOM_BACKEND + "/bom")
    .then(res => res.json())
    .then(json => {
      data          = json.boms          || [];
      verpackungMap = json.verpackung_map || {};
      renderResults(data);
    })
    .catch(() => {
      // Fallback: localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed  = JSON.parse(stored);
        data          = parsed.boms          || [];
        verpackungMap = parsed.verpackung_map || {};
        renderResults(data);
      }
    });
}

// ============================================================
//  SPEICHERN – GitHub API + localStorage Backup
// ============================================================
async function saveToStorage() {
  const payload = { boms: data, verpackung_map: verpackungMap };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  if (!isAdmin) return;

  showSaveStatus("⏳ Wird gespeichert...", "#1e3a8a");

  try {
    const res = await fetch(
      `${BOM_BACKEND}/bom?password=${encodeURIComponent(ADMIN_PASSWORD)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    if (res.ok) {
      showSaveStatus("✅ Gespeichert & online", "#15803d");
      setTimeout(() => hideSaveStatus(), 3000);
    } else {
      const err = await res.json();
      showSaveStatus("❌ Fehler: " + (err.detail || "unbekannt"), "#b91c1c");
    }
  } catch (e) {
    showSaveStatus("❌ Netzwerkfehler", "#b91c1c");
  }
}

function showSaveStatus(text, color) {
  let el = document.getElementById("saveStatus");
  if (!el) {
    el = document.createElement("div");
    el.id = "saveStatus";
    el.style.cssText = [
      "position:fixed", "bottom:20px", "right:20px",
      "padding:10px 18px", "border-radius:10px",
      "color:white", "font-weight:700", "font-size:14px",
      "z-index:9999", "box-shadow:0 4px 12px rgba(0,0,0,0.2)"
    ].join(";");
    document.body.appendChild(el);
  }
  el.style.background = color;
  el.textContent = text;
  el.style.display = "block";
}

function hideSaveStatus() {
  const el = document.getElementById("saveStatus");
  if (el) el.style.display = "none";
}

// ============================================================
//  SUCHE
// ============================================================
document.getElementById("searchInput").addEventListener("input", function () {
  const value = this.value.toLowerCase();
  const filtered = data.filter(bom => {
    const bomMatch =
      String(bom.bom_id       || "").toLowerCase().includes(value) ||
      String(bom.beschreibung  || "").toLowerCase().includes(value) ||
      String(bom.neutralisierung || "").toLowerCase().includes(value) ||
      String(bom.arbeitsanweisung || "").toLowerCase().includes(value);
    const componentMatch = Array.isArray(bom.components) &&
      bom.components.some(c =>
        String(c.artikelnummer || "").toLowerCase().includes(value) ||
        String(c.beschreibung  || "").toLowerCase().includes(value)
      );
    return bomMatch || componentMatch;
  });
  renderResults(filtered);
});

// ============================================================
//  RENDER
// ============================================================
function renderResults(boms) {
  const container = document.getElementById("results");
  container.innerHTML = "";

  // Admin-Button oben
  container.insertAdjacentHTML("beforebegin", ""); // kein Duplikat

  if (!boms || boms.length === 0) {
    container.innerHTML = "<p style='padding:15px;'>Keine Ergebnisse</p>";
    return;
  }

  boms.forEach((bom, index) => {
    const detailsId = "details_" + index;

    let verpackungsTexte = [];
    if (Array.isArray(bom.components)) {
      bom.components.forEach(c => {
        const text = verpackungMap[c.artikelnummer];
        if (text && !verpackungsTexte.includes(text)) verpackungsTexte.push(text);
      });
    }

    const componentsHTML = (bom.components || []).map(c => `
      <tr>
        <td>${c.artikelnummer}</td>
        <td>${c.beschreibung}</td>
        <td>${formatNumber(c.menge)}</td>
      </tr>
    `).join("");

    const adminButtons = isAdmin ? `
      <div class="admin-actions">
        <button class="admin-btn edit-btn"   onclick="openEditModal('${bom.bom_id}')">✏️ Bearbeiten</button>
        <button class="admin-btn delete-btn" onclick="deleteBOM('${bom.bom_id}')">🗑️ Löschen</button>
      </div>
    ` : "";

    const card = document.createElement("div");
    card.className = "card";
    card.dataset.bomId = bom.bom_id;

    card.innerHTML = `
      <div class="print-header">
        <div class="print-meta">Druckdatum: ${new Date().toLocaleString("de-DE")}</div>
        <hr class="print-divider">
      </div>

      <div class="bom-header-row">
        <div>
          <div class="bom-id">BOM: ${bom.bom_id}</div>
          <div class="bom-desc">${bom.beschreibung}</div>
        </div>
        <button class="header-action-btn" onclick="printSingleBOM('${bom.bom_id}')">🖨 Drucken</button>
      </div>

      ${adminButtons}

      ${bom.arbeitsanweisung ? `
        <div class="info-box arbeitsanweisung-box">
          <span class="info-title">🔧 ARBEITSANWEISUNG</span>
          <div class="info-text">${bom.arbeitsanweisung}</div>
        </div>` : ""}

      ${verpackungsTexte.length > 0 ? `
        <div class="info-box verpackung-box">
          <span class="info-title">📦 VERPACKUNGSANWEISUNG</span>
          <div class="info-text">${verpackungsTexte.join("<br>")}</div>
        </div>` : ""}

      ${bom.neutralisierung ? `
        <div class="info-box neutral-warning">
          <span class="info-title">⚠ NEUTRALISIERUNG ERFORDERLICH</span>
          <div class="info-text">${bom.neutralisierung}</div>
        </div>` : ""}

      ${bom.oe_nummern ? `
        <div class="info-box oe-box no-print">
          <span class="info-title">🔢 OE-NUMMERN</span>
          <div class="info-text">${bom.oe_nummern}</div>
        </div>` : ""}

      <button onclick="toggleDetails('${detailsId}')">Stückliste anzeigen</button>

      <div id="${detailsId}" class="details">
        <table>
          <thead><tr><th>Artikel</th><th>Beschreibung</th><th>Menge</th></tr></thead>
          <tbody>${componentsHTML}</tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
  });
}

// ============================================================
//  ADMIN LOGIN / LOGOUT
// ============================================================
function toggleAdminMode() {
  if (isAdmin) {
    isAdmin = false;
    updateAdminUI();
    renderResults(data);
    return;
  }

  const pw = prompt("Admin-Passwort:");
  if (pw === ADMIN_PASSWORD) {
    isAdmin = true;
    updateAdminUI();
    renderResults(data);
  } else if (pw !== null) {
    alert("Falsches Passwort.");
  }
}

function updateAdminUI() {
  const btn = document.getElementById("adminToggleBtn");
  if (!btn) return;
  if (isAdmin) {
    btn.textContent   = "🔓 Admin aktiv – Beenden";
    btn.style.background = "#b91c1c";
    document.getElementById("addBomBtn").style.display = "inline-block";
  } else {
    btn.textContent   = "🔐 Admin";
    btn.style.background = "";
    document.getElementById("addBomBtn").style.display = "none";
  }
}

// ============================================================
//  BOM LÖSCHEN
// ============================================================
function deleteBOM(bomId) {
  if (!confirm(`BOM ${bomId} wirklich löschen?`)) return;
  data = data.filter(b => b.bom_id !== bomId);
  saveToStorage();
  renderResults(data);
}

// ============================================================
//  EDIT MODAL – öffnen
// ============================================================
function openEditModal(bomId) {
  const bom = data.find(b => b.bom_id === bomId);
  if (!bom) return;

  document.getElementById("modal-bom-id-display").textContent = bomId;
  document.getElementById("modal-bom-id").value           = bomId;
  document.getElementById("modal-beschreibung").value     = bom.beschreibung       || "";
  document.getElementById("modal-arbeitsanweisung").value = bom.arbeitsanweisung   || "";
  document.getElementById("modal-neutralisierung").value  = bom.neutralisierung    || "";

  // Komponenten
  renderComponentEditor(bom.components || []);

  // Verpackungsanweisung: erste Komponente mit Eintrag
  let verpackText = "";
  if (Array.isArray(bom.components)) {
    for (const c of bom.components) {
      if (verpackungMap[c.artikelnummer]) {
        verpackText = verpackungMap[c.artikelnummer];
        break;
      }
    }
  }
  document.getElementById("modal-verpackung").value = verpackText;
  document.getElementById("modal-verpackung").dataset.bomId = bomId;

  document.getElementById("editModal").style.display = "flex";
}

function renderComponentEditor(components) {
  const tbody = document.getElementById("component-editor-body");
  tbody.innerHTML = "";

  components.forEach((c, i) => {
    const tr = document.createElement("tr");
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td><input class="comp-input" data-field="artikelnummer" value="${c.artikelnummer}"></td>
      <td><input class="comp-input" data-field="beschreibung"  value="${c.beschreibung}"></td>
      <td><input class="comp-input comp-menge" data-field="menge" type="number" step="0.01" value="${c.menge}"></td>
      <td><button class="comp-del-btn" onclick="removeComponentRow(this)">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function removeComponentRow(btn) {
  btn.closest("tr").remove();
}

function addComponentRow() {
  const tbody = document.getElementById("component-editor-body");
  const idx   = tbody.rows.length;
  const tr    = document.createElement("tr");
  tr.dataset.idx = idx;
  tr.innerHTML = `
    <td><input class="comp-input" data-field="artikelnummer" value=""></td>
    <td><input class="comp-input" data-field="beschreibung"  value=""></td>
    <td><input class="comp-input comp-menge" data-field="menge" type="number" step="0.01" value="1"></td>
    <td><button class="comp-del-btn" onclick="removeComponentRow(this)">✕</button></td>
  `;
  tbody.appendChild(tr);
}

// ============================================================
//  EDIT MODAL – speichern
// ============================================================
function saveEdit() {
  const bomId        = document.getElementById("modal-bom-id").value.trim();
  const beschreibung = document.getElementById("modal-beschreibung").value.trim();
  const arbeits      = document.getElementById("modal-arbeitsanweisung").value.trim();
  const neutral      = document.getElementById("modal-neutralisierung").value.trim();
  const verpack      = document.getElementById("modal-verpackung").value.trim();
  const origBomId    = document.getElementById("modal-verpackung").dataset.bomId || bomId;

  if (!bomId) { alert("BOM-ID darf nicht leer sein."); return; }

  // Komponenten auslesen
  const rows = document.querySelectorAll("#component-editor-body tr");
  const components = [];
  rows.forEach(tr => {
    const inputs = tr.querySelectorAll(".comp-input");
    const artikelnummer = inputs[0].value.trim();
    const beschr        = inputs[1].value.trim();
    const menge         = parseFloat(inputs[2].value) || 0;
    if (artikelnummer) {
      components.push({ artikelnummer, beschreibung: beschr, menge });
    }
  });

  // Verpackungs-Map aktualisieren: alte Einträge der Komponenten entfernen,
  // neue setzen (auf alle Artikel-Nummern dieser BOM)
  const oldBom = data.find(b => b.bom_id === origBomId);
  if (oldBom && Array.isArray(oldBom.components)) {
    oldBom.components.forEach(c => { delete verpackungMap[c.artikelnummer]; });
  }
  components.forEach(c => {
    if (verpack) verpackungMap[c.artikelnummer] = verpack;
  });

  // BOM im Array aktualisieren / neu anlegen
  const existingIdx = data.findIndex(b => b.bom_id === origBomId);
  const updatedBom  = { bom_id: bomId, beschreibung, arbeitsanweisung: arbeits, neutralisierung: neutral, components };

  if (existingIdx >= 0) {
    data[existingIdx] = updatedBom;
  } else {
    data.push(updatedBom);
  }

  saveToStorage();
  closeModal();
  renderResults(data);
}

// ============================================================
//  NEUE BOM ANLEGEN
// ============================================================
function openNewBOMModal() {
  document.getElementById("modal-bom-id-display").textContent = "Neue BOM";
  document.getElementById("modal-bom-id").value           = "";
  document.getElementById("modal-beschreibung").value     = "";
  document.getElementById("modal-arbeitsanweisung").value = "";
  document.getElementById("modal-neutralisierung").value  = "";
  document.getElementById("modal-verpackung").value       = "";
  document.getElementById("modal-verpackung").dataset.bomId = "";
  renderComponentEditor([]);
  document.getElementById("editModal").style.display = "flex";
}

// ============================================================
//  MODAL SCHLIEẞEN
// ============================================================
function closeModal() {
  document.getElementById("editModal").style.display = "none";
}

// Außerhalb klicken → schließen
document.getElementById("editModal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

// ============================================================
//  HELPERS
// ============================================================
function toggleDetails(id) {
  if (currentlyOpen && currentlyOpen !== id) {
    const prev = document.getElementById(currentlyOpen);
    if (prev) prev.style.display = "none";
  }
  const el = document.getElementById(id);
  if (el.style.display === "block") { el.style.display = "none"; currentlyOpen = null; }
  else                              { el.style.display = "block"; currentlyOpen = id;  }
}

function formatNumber(value) {
  if (Number.isInteger(value)) return value;
  return parseFloat(value).toFixed(2);
}

// ============================================================
//  DRUCK
// ============================================================
function printSingleBOM(bomId) {
  let quantity = prompt("Wie viele Stück sollen produziert werden?", "1");
  if (!quantity) return;
  quantity = parseInt(quantity);
  if (isNaN(quantity) || quantity <= 0) { alert("Bitte eine gültige Anzahl eingeben."); return; }

  const targetCard = document.querySelector(`.card[data-bom-id="${bomId}"]`);
  if (!targetCard) return;

  const details = targetCard.querySelector(".details");
  if (details) details.style.display = "block";

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html><head><title>BOM ${bomId}</title><style>
      @page { margin: 10mm; }
      body { font-family: Arial, sans-serif; padding: 15px; font-size: 10pt; }
      .header-top { display: flex; justify-content: space-between; align-items: center; }
      .company { font-size: 18pt; font-weight: bold; }
      .doc-info { text-align: right; font-size: 10pt; }
      .title { font-size: 16pt; font-weight: bold; margin-top: 10px; }
      hr { margin: 15px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 15px; }
      th { text-align: left; border-bottom: 2px solid black; padding: 6px; }
      td { border-bottom: 1px solid #ccc; padding: 6px; }
      .info-box { margin-top: 15px; padding: 10px; border-left: 4px solid black; }
      button, .admin-actions { display: none !important; }
      .production-section { margin-top: 40px; font-size: 12pt; }
      .production-section div { margin-bottom: 18px; }
      .checkbox { display: inline-block; width: 18px; height: 18px; border: 2px solid black; margin-right: 8px; vertical-align: middle; }
      .form-row { display: flex; align-items: center; margin-bottom: 18px; }
      .label { width: 220px; display: inline-block; }
      .time-box { width: 35px; height: 24px; border: 2px solid black; display: inline-block; margin-right: 4px; }
    </style></head><body>
      <div class="header-top">
        <div class="company">FORMTEILE FRITSCH GMBH</div>
        <div class="doc-info">Dokument: PRD-BOM-01<br>Version: 1.0<br>Druckdatum: ${new Date().toLocaleString("de-DE")}</div>
      </div>
      <div class="title">Produktionsauftrag</div>
      <div><strong>BOM:</strong> ${bomId}<br><strong>Produktionsmenge:</strong> ${quantity} Stück</div>
      <hr>
      ${targetCard.innerHTML}
      <div class="production-section">
        <div><span class="checkbox"></span>Neutralisiert</div>
        <div class="form-row"><span class="label">Start (hh:mm)</span><span class="time-box"></span><span class="time-box"></span></div>
        <div class="form-row"><span class="label">Ende (hh:mm)</span><span class="time-box"></span><span class="time-box"></span></div>
        <div class="form-row"><span class="label">Produziert von: ___________________________</span></div>
        <div class="form-row"><span class="label">QS Freigabe: ___________________________</span></div>
      </div>
    </body></html>
  `);
  printWindow.document.close();
  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 300);
}

// ============================================================
//  START
// ============================================================
loadData();
