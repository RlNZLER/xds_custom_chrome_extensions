(() => {
    try {
      console.log("📥 rules.js script running...");
  
      // Try to locate the Global Rules table immediately
      const table = document.querySelector("table.table.table-sm.table-bordered");
  
      if (!table || !table.querySelector("tbody")) {
        alert(
          `❌ Global Rules table not found.\n\n📋 Please follow these steps:\n\n1. Go to:\nhttps://portal.xds-solutions.com/portal/technical/hs-code-rules\n2. Click the “View” button next to “Global Rules”\n3. Once the drawer panel opens, click “Extract Global HS Code Rules” again`
        );
        return;
      }
  
      const rows = table.querySelectorAll("tbody tr");
      const rules = [];
  
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 5) {
          rules.push({
            hsCode: cells[0].innerText.trim(),
            rule: cells[1].innerText.trim(),
            level: cells[2].innerText.trim(),
            reason: cells[3].innerText.trim(),
            affectedTariffs: cells[4].innerText.trim()
          });
        }
      }
  
      chrome.storage.local.set({ hsCodeRules: rules });
      console.log("✅ Extracted and saved rules:", rules);
      alert(`✅ Extracted and saved ${rules.length} Global Rules`);
  
    } catch (err) {
      console.error("❌ Error during rule extraction:", err);
      alert("❌ Something went wrong. See console.");
    }
  })();
  