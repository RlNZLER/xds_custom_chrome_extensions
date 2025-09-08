const indicator = document.getElementById("indicator");
const startBtn = document.getElementById("startBtn");
const downloadBtn = document.getElementById("downloadBtn");
const progressBar = document.getElementById("progressBar");
const progressContainer = document.getElementById("progressContainer");

// Start SABER extraction
startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  indicator.textContent = "⏳ Running extraction...";
  progressBar.style.width = "0%";
  progressBar.textContent = "0%";
  progressContainer.style.display = "block";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["check.js"]
    });
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "progress") {
    const { page, total } = msg;
    const percent = Math.round((page / total) * 100);
    progressBar.style.width = `${percent}%`;
    progressBar.textContent = `${percent}%`;
    indicator.textContent = `📄 Page ${page} of ${total}`;
  }

  if (msg.type === "done") {
    progressBar.style.width = `100%`;
    progressBar.textContent = `100%`;
    indicator.textContent = `✅ Extracted ${msg.count} products in ${msg.time}`;
    downloadBtn.disabled = false;
  }
});

// Download button - repurposed to export full data with status
downloadBtn.addEventListener("click", () => {
    chrome.storage.local.get("productData", (data) => {
      const products = data.productData;
      if (!products || !products.length) {
        alert("❌ No extracted data found.");
        return;
      }
  
      const headers = Object.keys(products[0]);
      const csvContent = [
        headers.join(","), // Header row
        ...products.map(p => headers.map(h => `"${(p[h] ?? "").replace(/"/g, '""')}"`).join(",")) // Data rows
      ].join("\n");
  
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
  
      const a = document.createElement("a");
      a.href = url;
      a.download = "saber_products_full.csv";
      a.click();
  
      URL.revokeObjectURL(url);
    });
  });
  

// Extract Global HS Code Rules manually
document.getElementById("extractRulesBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) return;

    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["rules.js"]
    });
  });
});

// Download last saved rules
document.getElementById("downloadRulesBtn").addEventListener("click", () => {
  chrome.storage.local.get("hsCodeRules", (data) => {
    const rules = data.hsCodeRules;
    if (!rules || !rules.length) {
      alert("No saved rules found.");
      return;
    }

    const json = JSON.stringify(rules, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "global_rules.json";
    a.click();
    URL.revokeObjectURL(url);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "jobComment") {
    const container = document.getElementById("jobCommentContainer");
    const commentBox = document.getElementById("jobComment");
    container.style.display = "block";
    commentBox.value = msg.text;
  }
});

document.getElementById("copyCommentBtn").addEventListener("click", () => {
  const comment = document.getElementById("jobComment");
  comment.select();
  document.execCommand("copy");
  alert("✅ Copied to clipboard!");
});
