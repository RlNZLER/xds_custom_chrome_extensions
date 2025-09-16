// Expand panels, collect required fields, and collect ALL model numbers across pages
// with a live progress bar in the popup. Base field extraction hardened for alt tabs/labels.
//
// Output:
// { request_number, hs_code, product_name, country_of_origin, trademark, model_numbers: [] }

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const outputEl = $("#output");
const btn = $("#collectBtn");
const wrapEl = $("#progressWrap");
const barEl = $("#progressBar");
const metaEl = $("#progressMeta");

function setStatus(msg, cls = "") {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

function setProgress(cur, total) {
  if (!total || total < 1) {
    wrapEl.style.display = "none";
    metaEl.style.display = "none";
    return;
  }
  const pct = Math.max(0, Math.min(100, Math.round((cur / total) * 100)));
  wrapEl.style.display = "block";
  metaEl.style.display = "block";
  barEl.style.width = pct + "%";
  metaEl.textContent = `${cur} / ${total} pages`;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** ================= IN-PAGE HELPERS ================= */

// 1) Expand + read base fields (hardened)
function _expandAndReadBase() {
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
      ['a[href="#ProductModelNos_"]', "#ProductModelNos_"], // models panel
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
      }
    }
  }

  // NEW: proactively click likely tabs by text (EN + AR)
  async function clickLikelyTabs() {
    const tabs = Array.from(document.querySelectorAll('.nav-tabs a, [data-bs-toggle="tab"], [data-toggle="tab"], [role="tab"], a[href^="#"]'));
    const matchers = [
      /product/i, /details/i, /spec/i, /hs\s*code/i,
      /المنتج/i, /تفاصيل/i, /المواصفات/i, /رمز/i, /التعرفة/i, /النظام/i
    ];
    for (const t of tabs) {
      const txt = TEXT(t);
      if (matchers.some(rx => rx.test(txt))) {
        try { t.click(); } catch {}
        await sleep(150);
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
    await sleep(100);
  }

  // --------- Field extractors (more tolerant) ---------

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

    // Strict pair pattern
    for (const p of Array.from(scope.querySelectorAll("p"))) {
      const labs = p.querySelectorAll("label");
      if (labs.length >= 2) {
        const key = (labs[0].innerText || labs[0].textContent || "").replace(/\s+/g, "");
        if (/^HSCode:?$|^HS\s*Code:?$/i.test(key)) {
          const digits = (labs[1].innerText || labs[1].textContent || "").replace(/[^\d]/g, "");
          if (digits) return digits;
        }
      }
    }
    // Label then sibling
    const lbl = Array.from(scope.querySelectorAll("label.control-label, th, dt, strong"))
      .find(l => /^(HS\s*Code|HSCode)\s*:?\s*$/i.test((l.innerText || l.textContent || "").trim()));
    if (lbl) {
      let sib = lbl.nextElementSibling;
      while (sib && !/^(label|span|td|dd)$/i.test(sib.tagName)) sib = sib.nextElementSibling;
      if (sib) {
        const digits = (sib.innerText || sib.textContent || "").replace(/[^\d]/g, "");
        if (digits) return digits;
      }
    }
    // Whole-page fallback (as last resort)
    const all = document.body?.innerText || "";
    const m = all.match(/HS\s*Code[^0-9]{0,50}(\d{6,15})/i);
    return m?.[1] || null;
  }

  // Generic pair collector limited to relevant sections
  function collectPairs() {
    const kv = {};
    const add = (k, v) => {
      const key = (k || "").toLowerCase().replace(/\s+/g, "").trim();
      const val = (v || "").trim();
      if (!key || !val) return;
      if (kv[key]) {
        if (Array.isArray(kv[key])) kv[key].push(val); else kv[key] = [kv[key], val];
      } else kv[key] = val;
    };
    const scopes = [
      document,
      document.querySelector("#collapseProductDetails"),
      document.querySelector("#collapseHsCodeData")
    ].filter(Boolean);

    for (const scope of scopes) {
      // p > labels
      for (const p of Array.from(scope.querySelectorAll("p"))) {
        const labs = p.querySelectorAll("label, span");
        if (labs.length >= 2) add(labs[0].innerText || labs[0].textContent, labs[1].innerText || labs[1].textContent);
      }
      // .form-group
      for (const grp of Array.from(scope.querySelectorAll(".form-group"))) {
        const kEl = grp.querySelector("label.control-label, label[for], strong");
        const vEl = grp.querySelector("span.form-control, label.form-control, .form-control:not(input):not(textarea), span, strong");
        if (kEl && vEl) add(kEl.innerText || kEl.textContent, vEl.innerText || vEl.textContent);
      }
      // tables / dl
      for (const tr of Array.from(scope.querySelectorAll("tr"))) {
        const th = tr.querySelector("th");
        const tds = tr.querySelectorAll("td");
        if (th && tds.length) add(th.innerText || th.textContent, tds[tds.length - 1].innerText || tds[tds.length - 1].textContent);
        else if (tds.length >= 2) add(tds[0].innerText || tds[0].textContent, tds[1].innerText || tds[1].textContent);
      }
      for (const dt of Array.from(scope.querySelectorAll("dt"))) {
        const dd = dt.nextElementSibling && dt.nextElementSibling.tagName === "DD" ? dt.nextElementSibling : null;
        if (dd) add(dt.innerText || dt.textContent, dd.innerText || dd.textContent);
      }
    }
    return kv;
  }

  // Targeted direct selectors/fallbacks
  function getProductName(kv) {
    // Common labels/keys
    const first = (v) => Array.isArray(v) ? v[0] : v;
    return (
      first(kv["englishproductname"]) ||
      first(kv["productname"]) ||
      // Arabic label fallback
      first(kv["اسم_المنتج"]) || first(kv["اسم المنتج"]) ||
      // Header/title fallback e.g., "Product Name : EPCON C8 XTREM"
      (() => {
        const h = document.querySelector("h4.panel-title");
        if (!h) return null;
        const t = (h.innerText || h.textContent || "").trim();
        const m = t.split(/Product\s*Name\s*:/i);
        return m.length > 1 ? m.slice(1).join(":").trim() : null;
      })() ||
      null
    );
  }

  function getCountryOfOrigin(kv) {
    const first = (v) => Array.isArray(v) ? v[0] : v;
    // direct label on page
    const span = Array.from(document.querySelectorAll("span.control-label, label.control-label"))
      .find(el => /Country\s*of\s*origin/i.test((el.innerText || el.textContent || "")));
    if (span) {
      const val = span.closest(".form-group")?.querySelector("span.form-control, label.form-control");
      if (val) return (val.innerText || val.textContent || "").trim();
    }
    return first(kv["countryoforigin"]) || first(kv["origin"]) || null;
  }

  function getTrademark(kv) {
    const first = (v) => Array.isArray(v) ? v[0] : v;
    // direct for="Trademark"
    const tm = document.querySelector("label[for='Trademark']");
    if (tm) {
      const val = tm.closest(".form-group")?.querySelector("span.form-control, label.form-control");
      if (val) return (val.innerText || val.textContent || "").trim();
    }
    return first(kv["englishtradmark"]) || first(kv["arabictradmark"]) || first(kv["trademark"]) || null;
  }

  return (async () => {
    // Expand broadly, also click likely tabs
    await expandKnown();
    await expandGeneric();
    await clickLikelyTabs();
    await forceShowRemaining();

    const request_number = getRequestNumber();
    const hs_code = getHSCode();
    const kv = collectPairs();
    const product_name = getProductName(kv);
    const country_of_origin = getCountryOfOrigin(kv);
    const trademark = getTrademark(kv);

    // Current page models (page 1)
    const model_inputs = Array.from((document.querySelector("#ProductModelNos_") || document)
      .querySelectorAll('.ProductModelsGrid input.form-control[readonly][value]'));
    const current_models = model_inputs.map(i => (i.getAttribute("value") || "").trim()).filter(Boolean);

    // Pager info
    const pageText = (document.querySelector("#ProductModelNos_ .panel-footer .search_results_text")?.innerText || "").trim();
    let totalPages = 1, currentPage = 1;
    const mm = pageText.match(/Page\s+(\d+)\s+Of\s+(\d+)/i);
    if (mm) { currentPage = parseInt(mm[1], 10) || 1; totalPages = parseInt(mm[2], 10) || 1; }
    else {
      const nums = Array.from(document.querySelectorAll("#ProductModelNos_ .pagination li a"))
        .map(a => parseInt(a.textContent.trim(), 10))
        .filter(n => !Number.isNaN(n));
      totalPages = nums.length ? Math.max(...nums) : 1;
    }

    return { base: { request_number, hs_code, product_name, country_of_origin, trademark },
             pager: { currentPage, totalPages },
             current_models };
  })();
}

// 2) Go to page n and read its models (used by popup loop)
function _gotoPageAndGetModels(n) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function getModels() {
    const grid = document.querySelector("#ProductModelNos_ .ProductModelsGrid") || document.querySelector("#ProductModelNos_");
    const inputs = Array.from(grid?.querySelectorAll('input.form-control[readonly][value]') || []);
    return inputs.map(i => (i.getAttribute("value") || "").trim()).filter(Boolean);
  }

  return (async () => {
    const panel = document.querySelector("#ProductModelNos_");
    if (!panel) return { ok: false, page: n, models: [] };

    const links = Array.from(panel.querySelectorAll(".pagination li a"));
    const link = links.find(a => a.textContent.trim() === String(n));
    if (!link) {
      const next = panel.querySelector('.pagination li a[rel="next"]');
      if (!next) return { ok: false, page: n, models: getModels() };
      try { next.scrollIntoView({ block: "center" }); } catch {}
      next.click();
    } else {
      try { link.scrollIntoView({ block: "center" }); } catch {}
      link.click();
    }

    const before = getModels();
    const beforeFirst = before[0] || "";
    const beforeCount = before.length;

    const start = performance.now();
    while (performance.now() - start < 20000) {
      await sleep(200);
      const cur = getModels();
      if (!cur.length) continue;
      if (cur[0] !== beforeFirst || cur.length !== beforeCount) break;
    }
    return { ok: true, page: n, models: getModels() };
  })();
}

/** ================= POPUP ORCHESTRATION ================= */

async function collectWithProgress() {
  try {
    btn.disabled = true;
    setStatus("Expanding & collecting…", "hint");
    setProgress(0, 0);

    const tab = await getActiveTab();
    if (!tab) return setStatus("No active tab found.", "err");

    const url = tab.url || "";
    const restricted = ["chrome://", "edge://", "about:", "chromewebstore.google.com"];
    if (restricted.some((p) => url.startsWith(p) || url.includes(p))) {
      return setStatus("This page is restricted. Switch to a normal website and try again.", "warn");
    }

    // Step 1: expand + read base + pager + page 1 models
    const [{ result: baseRes }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: _expandAndReadBase,
      world: "MAIN"
    });

    if (!baseRes) {
      setStatus("Could not read base info.", "warn");
      return;
    }

    const { base, pager, current_models } = baseRes;
    const totalPages = Math.max(1, pager?.totalPages || 1);

    // Progress bar
    setProgress(1, totalPages);

    // Collect models across all pages
    const seen = new Set();
    const allModels = [];

    // Page 1
    for (const v of current_models || []) {
      const s = String(v).trim();
      if (s && !seen.has(s)) { seen.add(s); allModels.push(s); }
    }

    // Pages 2..N
    for (let page = 2; page <= totalPages; page++) {
      setStatus(`Collecting models… (page ${page}/${totalPages})`, "hint");

      const [{ result: pageRes }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: _gotoPageAndGetModels,
        args: [page],
        world: "MAIN"
      });

      const models = (pageRes && pageRes.models) || [];
      for (const v of models) {
        const s = String(v).trim();
        if (s && !seen.has(s)) { seen.add(s); allModels.push(s); }
      }

      setProgress(page, totalPages);
    }

    // Final payload
    const data = {
      collected_at: new Date().toISOString(),
      url,
      request_number: base?.request_number ?? null,
      hs_code: base?.hs_code ?? null,
      product_name: base?.product_name ?? null,
      country_of_origin: base?.country_of_origin ?? null,
      trademark: base?.trademark ?? null,
      model_numbers: allModels
    };

    outputEl.textContent = JSON.stringify(data, null, 2);
    await chrome.storage.local.set({ lastCollected: data });
    setStatus("Collected ✓", "ok");

  } catch (err) {
    console.error(err);
    setStatus("Error: " + (err?.message || String(err)), "err");
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener("click", collectWithProgress);

// Show last result on load
chrome.storage.local.get(["lastCollected"], ({ lastCollected }) => {
  if (lastCollected) {
    outputEl.textContent = JSON.stringify(lastCollected, null, 2);
  }
});
