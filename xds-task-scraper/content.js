// ================================
// XDS Task Renewals Scraper (content.js)
// - Step 1: Collect Task IDs + Client Names across all pages
// - Step 2: For each Task ID, load /renewals in a hidden iframe,
//           parse the table, and export ONE combined CSV,
//           while reporting progress to the popup.
// ================================

// ====== CONFIG ======
const DEFAULT_URL =
  "https://portal.xds-solutions.com/portal/tasks/search?assigned_to=user_32&completed=0&type=PCOC_RENEWALS&page=1";

// ====== UTILS ======
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function waitForLoad(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const table = document.querySelector("table");
    const rows = table?.querySelectorAll("tbody tr");
    if (rows && rows.length > 0) return;
    await wait(300);
  }
}

async function ensureOnDefaultList() {
  const base = DEFAULT_URL.split("&page=")[0];
  if (!location.href.startsWith(base)) {
    location.href = DEFAULT_URL;
    await waitForLoad();
  }
}

// ====== STEP 1: scrape Task ID + Client Name from list ======
function getRowsDataFromCurrentPage() {
  const out = [];
  const rows = document.querySelectorAll("table tbody tr");
  if (!rows.length) return out;

  rows.forEach((tr, rowIdx) => {
    const cells = tr.querySelectorAll("td");
    if (!cells.length) return;

    // Task ID (col 0)
    const idText = (cells[0].textContent || "").trim();
    const idMatch = idText.match(/\d+/);
    const id = idMatch ? idMatch[0] : "";
    if (!id) return;

    // Client Name (col 2)
    let client = "";
    const colWithClient = cells[2];
    if (colWithClient) {
      // Most reliable: dropdown anchor with javascript:;
      const anchors = Array.from(
        colWithClient.querySelectorAll('.dropdown a[href="javascript:;"], a[href="javascript:;"]')
      )
        .map((a) => (a.textContent || "").trim())
        .filter(Boolean);

      if (anchors.length) {
        anchors.sort((a, b) => b.length - a.length);
        client = anchors[0];
      }

      // Fallbacks
      if (!client) {
        const ps = colWithClient.querySelectorAll("p");
        if (ps.length >= 2) {
          const text = (ps[1].textContent || "").trim().replace(/\s+/g, " ");
          if (text) client = text;
        }
      }
      if (!client) {
        const lines = (colWithClient.textContent || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (lines.length >= 2) client = lines[1];
        else if (lines.length >= 1) client = lines[0];
      }
    }

    if (!client && rowIdx === 0) {
      console.debug(
        "⚠️ Couldn’t find client in this row, refine selector if needed:\n",
        tr.innerHTML
      );
    }

    out.push({ id, client });
  });

  return out;
}

function findNextButton() {
  let btn = document.querySelector(
    'a[aria-label="Next"]:not([aria-disabled="true"]), button[aria-label="Next"]:not([disabled])'
  );
  if (btn) return btn;

  const candidates = Array.from(document.querySelectorAll("a, button")).filter((el) => {
    const t = (el.textContent || "").trim().toLowerCase();
    if (!t) return false;
    if (!["next", "›", "»"].some((s) => t === s || t.includes("next"))) return false;
    const disabled = el.matches("[disabled], .disabled, [aria-disabled='true']");
    return !disabled;
  });
  return candidates[0] || null;
}

async function goToNextPageAndWait(previousFirstId) {
  const nextBtn = findNextButton();
  if (!nextBtn) return false;

  nextBtn.click();
  const start = Date.now();
  while (Date.now() - start < 10000) {
    await wait(350);
    const rows = getRowsDataFromCurrentPage();
    const firstId = rows[0]?.id || "";
    if (firstId && firstId !== previousFirstId) return true;
  }
  return false;
}

async function scrapeAllTaskIdAndClient() {
  await ensureOnDefaultList();
  await waitForLoad();

  const collected = new Map(); // id -> client
  let safetyCounter = 0;

  while (true) {
    await waitForLoad();
    const rows = getRowsDataFromCurrentPage();
    rows.forEach(({ id, client }) => {
      if (!id) return;
      collected.set(id, client || collected.get(id) || "");
    });

    const firstId = rows[0]?.id || "";
    const advanced = await goToNextPageAndWait(firstId);

    safetyCounter += 1;
    if (!advanced || safetyCounter > 300) break;
  }

  return Array.from(collected.entries()).map(([id, client]) => ({ id, client }));
}

// ====== STEP 2: fetch & parse each /task/{id}/renewals via iframe ======
const pickText = (el) => (el?.textContent || "").trim().replace(/\s+/g, " ");

function parseRenewalsTableFromDoc(doc) {
  // Identify the target table by its headers
  const tables = Array.from(doc.querySelectorAll("table"));
  let table = null;
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll("thead .td-squared span")).map((s) =>
      (s.textContent || "").trim().toLowerCase()
    );
    if (headers.includes("paying client") && headers.includes("product") && headers.includes("hs code")) {
      table = t;
      break;
    }
  }
  if (!table) return [];

  const rows = [];
  table.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    if (!tds.length) return;

    // Cols per provided HTML:
    // 0=checkbox, 1=Paying Client, 2=Product/Brand/Cert, 3=HS, 4=COO, 5=CB, 6=Job, 7=Expiry, 8=Last Shipped, 9=Renewed, 10=Eye btn
    const payingClient =
      pickText(tr.querySelector('td:nth-child(2) .dropdown a[href="javascript:;"]')) ||
      pickText(tds[1]);

    const productCell = tds[2];
    const product = pickText(productCell?.querySelector("strong"));
    const full = productCell?.textContent || "";
    const brand = (full.match(/Brand:\s*([^\n<]+)/i)?.[1] || "").trim();
    const cert = (full.match(/Cert:\s*([^\n<]+)/i)?.[1] || "").trim();

    const hsCode =
      pickText(tr.querySelector('td:nth-child(4) a[href="javascript:;"]')) || pickText(tds[3]);

    const coo =
      pickText(tr.querySelector('td:nth-child(5) a[href="javascript:;"]')) || pickText(tds[4]);

    const cb = pickText(tds[5]);

    const job = pickText(tds[6]?.querySelector("a")) || pickText(tds[6]);

    const expiry = (() => {
      const c = tds[7];
      if (!c) return "";
      const first = c.childNodes[0];
      return first && first.nodeType === Node.TEXT_NODE
        ? (first.textContent || "").trim()
        : pickText(c).split(" ")[0];
    })();

    const lastShipped = (() => {
      const c = tds[8];
      if (!c) return "";
      const raw = (c.textContent || "").trim();
      return raw.split("(")[0].trim(); // strip "(xxx days ago)"
    })();

    const renewed = pickText(tds[9]);

    rows.push({
      payingClient,
      product,
      brand,
      cert,
      hsCode,
      coo,
      cb,
      job,
      expiry,
      lastShipped,
      renewed,
    });
  });

  return rows;
}

async function scrapeSingleTaskViaIframe(taskId) {
  return new Promise(async (resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `/portal/task/${taskId}/renewals`;
    document.body.appendChild(iframe);

    let timeoutId = setTimeout(() => {
      iframe.remove();
      reject(new Error("Renewals iframe timeout"));
    }, 20000);

    iframe.addEventListener("load", async () => {
      try {
        // Wait up to 10s for the table headers to appear (dynamic page)
        const start = Date.now();
        while (Date.now() - start < 10000) {
          const doc = iframe.contentDocument;
          const found = Array.from(doc.querySelectorAll("thead .td-squared span")).map((s) =>
            (s.textContent || "").trim().toLowerCase()
          );
          if (found.includes("paying client") && found.includes("product") && found.includes("hs code")) break;
          await wait(250);
        }

        const doc = iframe.contentDocument;
        const items = parseRenewalsTableFromDoc(doc);
        clearTimeout(timeoutId);
        iframe.remove();
        resolve(items);
      } catch (e) {
        clearTimeout(timeoutId);
        iframe.remove();
        reject(e);
      }
    });
  });
}

// ====== EXPORT (one combined CSV for all tasks) ======
function downloadCSVAllTasks(rows) {
  const header = [
    "Task ID",
    "Client Name",
    "Paying Client",
    "Product",
    "Brand",
    "Cert",
    "HS Code",
    "COO",
    "CB",
    "Job",
    "Expiry",
    "Last Shipped",
    "Renewed",
  ];

  const body = rows
    .map((r) => header.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const csv = header.join(",") + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "renewals_all.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Gentle concurrency so the portal isn't hammered
async function scrapeAllTasksWithLimit(list, parallel = 3, onTaskDone /* (id, items) */) {
  const results = [];
  let index = 0;
  let active = 0;

  return new Promise((resolve) => {
    const next = () => {
      if (index >= list.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < parallel && index < list.length) {
        const { id, client } = list[index++];
        active++;

        (async () => {
          try {
            const items = await scrapeSingleTaskViaIframe(id);

            // Aggregate results for CSV
            items.forEach((it) => {
              results.push({
                "Task ID": id,
                "Client Name": client,
                "Paying Client": it.payingClient,
                "Product": it.product,
                "Brand": it.brand,
                "Cert": it.cert,
                "HS Code": it.hsCode,
                "COO": it.coo,
                "CB": it.cb,
                "Job": it.job,
                "Expiry": it.expiry,
                "Last Shipped": it.lastShipped,
                "Renewed": it.renewed,
              });
            });

            // Optional per-task callback for progress
            if (onTaskDone) onTaskDone(id, items);

          } catch (e) {
            console.warn("Failed task", id, e);
          } finally {
            active--;
            next();
          }
        })();
      }
    };
    next();
  });
}

// ====== MASTER FLOW: all tasks → progress → one CSV ======
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.cmd === "START_SCRAPE") {
    (async () => {
      try {
        // Step 1: collect all Task IDs + Clients from the list
        const list = await scrapeAllTaskIdAndClient(); // [{id, client}]
        if (!list.length) throw new Error("No tasks found on the list page.");
        console.log(`Discovered ${list.length} tasks. Starting renewals scrape…`);

        // Tell popup how many tasks there are (initialize progress bar)
        chrome.runtime.sendMessage({ cmd: "SCRAPE_INIT", total: list.length });

        // Step 2: scrape each task's Renewals table (gentle concurrency) + progress
        let completed = 0;
        const allRows = await scrapeAllTasksWithLimit(list, 3, (id, items) => {
          completed++;
          chrome.runtime.sendMessage({
            cmd: "SCRAPE_PROGRESS",
            done: completed,
            total: list.length,
            lastId: id,
            lastCount: items.length,
          });
        });

        console.log("All parsed rows:", allRows.length);

        // Step 3: download ONE combined CSV
        downloadCSVAllTasks(allRows);

        chrome.runtime.sendMessage({ cmd: "SCRAPE_DONE", ok: true, count: allRows.length });
      } catch (e) {
        console.error("Scrape error:", e);
        chrome.runtime.sendMessage({ cmd: "SCRAPE_DONE", ok: false, error: String(e) });
      }
    })();
  }
});
