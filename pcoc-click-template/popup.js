// popup.js — Expand panels, collect required fields, and read ONLY current-page model numbers.
//
// Outputs:
// { request_number, hs_code, product_name, country_of_origin, trademark, model_numbers: [] }

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const outputEl = $("#output");
const btn = $("#collectBtn");

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Runs inside each frame: expand panels, then extract ONLY the required fields */
function expandAndExtractMinimalInFrame() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TEXT = (el) => (el ? (el.innerText ?? el.textContent ?? "") : "").trim();

  function isVisible(el) {
    if (!el) return false;
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && el.offsetHeight > 0;
  }

  async function clickAndWaitVisible(toggleEl, targetEl) {
    if (!targetEl) return false;
    try { toggleEl?.scrollIntoView({ block: "center", inline: "center" }); } catch {}
    try { toggleEl?.click(); } catch {}
    for (let i = 0; i < 14; i++) {
      await sleep(120);
      if (targetEl.classList.contains("show") || targetEl.classList.contains("in") || isVisible(targetEl)) return true;
    }
    return isVisible(targetEl);
  }

  async function expandKnown() {
    const pairs = [
      ["#btnProductData", "#collapseProductDetails"],
      ["#btnHsCodeData",  "#collapseHsCodeData"],
      // models panel (from your snippet)
      ['a[href="#ProductModelNos_"]', "#ProductModelNos_"],
    ];
    for (const [btnSel, pnlSel] of pairs) {
      const btn = document.querySelector(btnSel);
      const pnl = document.querySelector(pnlSel);
      if (pnl && !(pnl.classList.contains("show") || pnl.classList.contains("in") || isVisible(pnl))) {
        await clickAndWaitVisible(btn, pnl);
      }
    }
  }

  async function expandGeneric() {
    const toggles = Array.from(document.querySelectorAll(
      '[data-bs-toggle="collapse"], [data-toggle="collapse"], [role="tab"], .nav-tabs a, a[href^="#collapse"], [aria-controls]'
    ));
    for (const t of toggles) {
      let sel = t.getAttribute("data-bs-target") || t.getAttribute("data-target") || t.getAttribute("href");
      if (!sel || !sel.startsWith("#")) {
        const ac = t.getAttribute("aria-controls");
        if (ac) sel = `#${ac}`;
      }
      const target = sel ? document.querySelector(sel) : null;
      if (target && (target.classList.contains("collapse") || target.classList.contains("tab-pane"))) {
        await clickAndWaitVisible(t, target);
      } else {
        const txt = TEXT(t);
        if (/HS\s*Code|Product|Details|Specification|المواصفات|المنتج|رمز|التعرفة|النظام|Model/i.test(txt)) {
          try { t.click(); } catch {}
          await sleep(150);
        }
      }
    }
  }

  async function forceShowRemaining() {
    for (const c of Array.from(document.querySelectorAll(".collapse"))) {
      if (!(c.classList.contains("show") || c.classList.contains("in") || isVisible(c))) {
        c.classList.add("show", "in");
        c.style.height = "auto";
      }
    }
    await sleep(150);
  }

  // ---------- Minimal extractors ----------

  function getRequestNumber() {
    const hdr = document.querySelector(".col-md-10.title-brdr .control-label") || document.querySelector(".control-label");
    if (hdr && /Request\s*Number/i.test(TEXT(hdr))) {
      let m = TEXT(hdr).match(/Request\s*Number\s*:?\s*\(?\s*([0-9-]+)/i);
      if (m?.[1]) return m[1].replace(/\)+$/, "").trim();
      const inner = hdr.querySelector("span");
      if (inner) {
        m = TEXT(inner).match(/([0-9]{2}-[0-9]{2}-[0-9]{5,})/);
        if (m?.[1]) return m[1].trim();
      }
    }
    for (const row of Array.from(document.querySelectorAll("tr, .row, dl, dd, dt"))) {
      const t = TEXT(row);
      if (/Request\s*Number/i.test(t)) {
        const m = t.match(/Request\s*Number\s*:?\s*\(?\s*([0-9-]+)/i);
        if (m?.[1]) return m[1].replace(/\)+$/, "").trim();
      }
    }
    return null;
  }

  function getHSCode() {
    const panel = document.querySelector("#collapseHsCodeData");
    const scope = panel && (panel.classList.contains("show") || panel.classList.contains("in") || isVisible(panel)) ? panel : document;
    for (const p of Array.from(scope.querySelectorAll("p"))) {
      const labs = p.querySelectorAll("label");
      if (labs.length >= 2) {
        const key = TEXT(labs[0]).replace(/\s+/g, "");
        if (/^HSCode:?$|^HS\s*Code:?$/i.test(key)) {
          const digits = TEXT(labs[1]).replace(/[^\d]/g, "");
          if (digits) return digits;
        }
      }
    }
    const lbl = Array.from(scope.querySelectorAll("label.control-label")).find(l => /^HS\s*Code:?$|^HSCode:?$/i.test(TEXT(l)));
    if (lbl) {
      let sib = lbl.nextElementSibling;
      while (sib && sib.tagName !== "LABEL") sib = sib.nextElementSibling;
      if (sib) {
        const digits = TEXT(sib).replace(/[^\d]/g, "");
        if (digits) return digits;
      }
    }
    return null;
  }

  function collectRelevantPairs() {
    const kv = {};
    const push = (k, v) => {
      if (!k || !v) return;
      const key = k.toLowerCase().replace(/\s+/g, "").trim();
      const val = v.trim();
      if (!key || !val) return;
      if (kv[key]) {
        if (Array.isArray(kv[key])) kv[key].push(val);
        else kv[key] = [kv[key], val];
      } else {
        kv[key] = val;
      }
    };

    const scopes = [document, document.querySelector("#collapseProductDetails"), document.querySelector("#collapseHsCodeData")].filter(Boolean);

    for (const scope of scopes) {
      for (const p of Array.from(scope.querySelectorAll("p"))) {
        const labs = p.querySelectorAll("label");
        if (labs.length >= 2) push(labs[0].innerText || labs[0].textContent || "", labs[1].innerText || labs[1].textContent || "");
      }
      for (const grp of Array.from(scope.querySelectorAll(".form-group"))) {
        const kEl = grp.querySelector("label.control-label, label[for]");
        const vEl = grp.querySelector("span.form-control, label.form-control, .form-control:not(input):not(textarea)");
        if (kEl && vEl) push(kEl.innerText || kEl.textContent || "", vEl.innerText || vEl.textContent || "");
      }
      for (const tr of Array.from(scope.querySelectorAll("tr"))) {
        const th = tr.querySelector("th");
        const tds = tr.querySelectorAll("td");
        if (th && tds.length) push(th.innerText || th.textContent || "", tds[tds.length - 1].innerText || tds[tds.length - 1].textContent || "");
        else if (tds.length >= 2) push(tds[0].innerText || tds[0].textContent || "", tds[1].innerText || tds[1].textContent || "");
      }
    }
    return kv;
  }

  // Current-page model numbers ONLY (no pagination)
  function collectCurrentPageModelNumbers() {
    const panel = document.querySelector("#ProductModelNos_");
    if (!panel) return [];
    const grid = panel.querySelector(".ProductModelsGrid") || panel;

    const inputs = Array.from(grid.querySelectorAll('input.form-control[readonly][value]'));
    const vals = inputs.map(i => (i.getAttribute("value") || "").trim()).filter(Boolean);

    // Dedup while keeping order
    const seen = new Set();
    const out = [];
    for (const v of vals) {
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }

  function firstVal(v) { return Array.isArray(v) ? v[0] : v; }

  return (async () => {
    // 1) Expand everything (including models panel)
    await expandKnown();
    await expandGeneric();
    await forceShowRemaining();

    // 2) Core fields
    const request_number = getRequestNumber();
    const hs_code = getHSCode();

    // Use limited kv for product_name, country_of_origin, trademark
    const kv = collectRelevantPairs();
    const product_name =
      firstVal(kv["englishproductname"]) || firstVal(kv["productname"]) || null;
    const country_of_origin =
      firstVal(kv["countryoforigin"]) || firstVal(kv["origin"]) || null;
    const trademark =
      firstVal(kv["englishtradmark"]) || firstVal(kv["arabictradmark"]) || firstVal(kv["trademark"]) || null;

    // 3) Model numbers from CURRENT page only
    const model_numbers = collectCurrentPageModelNumbers();

    return {
      frameUrl: location.href,
      minimal: {
        request_number: request_number ?? null,
        hs_code: hs_code ?? null,
        product_name,
        country_of_origin,
        trademark,
        model_numbers
      }
    };
  })();
}

function mergeMinimal(results) {
  const out = {
    request_number: null,
    hs_code: null,
    product_name: null,
    country_of_origin: null,
    trademark: null,
    model_numbers: []
  };
  const seen = new Set();

  for (const r of results) {
    const m = r?.result?.minimal;
    if (!m) continue;
    out.request_number    = out.request_number    ?? m.request_number    ?? null;
    out.hs_code           = out.hs_code           ?? m.hs_code           ?? null;
    out.product_name      = out.product_name      ?? m.product_name      ?? null;
    out.country_of_origin = out.country_of_origin ?? m.country_of_origin ?? null;
    out.trademark         = out.trademark         ?? m.trademark         ?? null;
    if (Array.isArray(m.model_numbers)) {
      for (const v of m.model_numbers) {
        const s = String(v).trim();
        if (s && !seen.has(s)) { seen.add(s); out.model_numbers.push(s); }
      }
    }
  }
  return out;
}

async function collectMinimal() {
  try {
    btn.disabled = true;
    setStatus("Expanding & collecting (current page models)…", "hint");

    const tab = await getActiveTab();
    if (!tab) return setStatus("No active tab found.", "err");

    const url = tab.url || "";
    const restricted = ["chrome://", "edge://", "about:", "chromewebstore.google.com"];
    if (restricted.some((p) => url.startsWith(p) || url.includes(p))) {
      return setStatus("This page is restricted. Switch to a normal website and try again.", "warn");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: expandAndExtractMinimalInFrame,
      world: "MAIN"
    });

    const minimal = mergeMinimal(results);

    const data = {
      collected_at: new Date().toISOString(),
      url,
      ...minimal
    };

    outputEl.textContent = JSON.stringify(data, null, 2);
    await chrome.storage.local.set({ lastCollected: data });

    const ok = !!(minimal.request_number || minimal.hs_code || minimal.product_name);
    setStatus(ok ? "Collected ✓ (models: current page)" : "Collected (check page fields)", ok ? "ok" : "warn");
  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err?.message || String(err)), "err");
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener("click", collectMinimal);

// Show last result on load
chrome.storage.local.get(["lastCollected"], ({ lastCollected }) => {
  if (lastCollected) {
    outputEl.textContent = JSON.stringify(lastCollected, null, 2);
  }
});
