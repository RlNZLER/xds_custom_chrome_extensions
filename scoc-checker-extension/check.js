(async () => {
  try {
    const productBlocks = document.querySelectorAll("div.panel.no-shadow");
    if (!productBlocks || productBlocks.length === 0) {
      alert(`❌ No product data found.\n\n📋 Make sure:\n1. You're on the correct SABER SCOC page\n2. Open the 'Request View' section\n3. Then click 'Start Extraction'`);
      chrome.storage.local.set({ greenLight: false });
      return;
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));
    const sendProgress = (page, total) => chrome.runtime?.sendMessage({ type: "progress", page, total });
    const productData = new Set();
    const allProducts = [];

    const extractProducts = () => {
      const blocks = document.querySelectorAll("div.panel.no-shadow");
      const products = [];
      blocks.forEach((block) => {
        const cert = block.querySelector("span.certNo")?.textContent.replace(/[()]/g, "").trim();
        const name = block.querySelector("h4.panel-title")?.textContent.split("Product Name :")[1]?.trim() || "";
        let hscode = "", country = "", trademark = "";

        const hsStrong = Array.from(block.querySelectorAll("strong")).find(el => el.textContent.includes("HSCode"));
        if (hsStrong?.nextElementSibling) hscode = hsStrong.nextElementSibling.textContent.trim();

        const originLabel = Array.from(block.querySelectorAll("span.control-label")).find(el => el.textContent.includes("Country of origin"));
        if (originLabel) country = originLabel.closest(".form-group")?.querySelector("span.form-control")?.textContent.trim() || "";

        const tmLabel = block.querySelector("label[for='Trademark']");
        if (tmLabel) trademark = tmLabel.closest(".form-group")?.querySelector("span.form-control")?.textContent.trim() || "";

        const key = `${cert}|${hscode}|${name}`;
        if (cert && !productData.has(key)) {
          productData.add(key);
          products.push({ certificateNumber: cert, productName: name, hscode, countryOfOrigin: country, trademark });
        }
      });
      return products;
    };

    const getTotalPages = () => {
      return Array.from(document.querySelectorAll("ul.pagination li a"))
        .map(a => a.textContent.trim()).filter(text => /^\d+$/.test(text)).map(Number).sort((a, b) => b - a)[0] || 1;
    };

    const goToPageAndWait = async (pageNumber, currentFirstCert, currentPanelCount) => {
      const pageLink = Array.from(document.querySelectorAll("ul.pagination li a")).find(a => a.textContent.trim() === pageNumber.toString());
      if (!pageLink) return false;
      pageLink.click();

      for (let i = 0; i < 90; i++) {
        await delay(1000);
        const newCert = document.querySelector("span.certNo")?.textContent || "";
        const newPanelCount = document.querySelectorAll("div.panel.no-shadow").length;
        if (newCert !== currentFirstCert || newPanelCount !== currentPanelCount) return true;
      }
      return false;
    };

    const totalPages = getTotalPages();
    const startTime = Date.now();

    for (let page = 1; page <= totalPages; page++) {
      sendProgress(page, totalPages);
      const currentCert = document.querySelector("span.certNo")?.textContent || "";
      const currentPanels = document.querySelectorAll("div.panel.no-shadow").length;
      if (page !== 1) {
        const success = await goToPageAndWait(page, currentCert, currentPanels);
        if (!success) continue;
      }
      await delay(1000);
      const pageData = extractProducts();
      allProducts.push(...pageData);
    }

    chrome.storage.local.get("hsCodeRules", (data) => {
      const hsCodeRules = data.hsCodeRules || [];
      const hsLookup = {};
      hsCodeRules.forEach(rule => hsLookup[rule.hsCode] = rule.reason);

      const gccCountries = new Set(["Bahrain", "Kuwait", "Oman", "Qatar", "Saudi Arabia", "United Arab Emirates"]);
      const failedItems = [];
      const successComments = [];

      for (const product of allProducts) {
        const hsStatus = hsLookup[product.hscode] || "OK";
        const cooStatus = gccCountries.has(product.countryOfOrigin) ? "Need GCC" : "OK";

        product["HS code status"] = hsStatus;
        product["COO status"] = cooStatus;

        if (hsStatus !== "OK" || cooStatus !== "OK") {
          failedItems.push(product);
        } else {
          successComments.push(
            `PCOC: ${product.certificateNumber}\nHS Code: ${product.hscode}\nCOO: ${product.countryOfOrigin}\nChecked. Does not require MIM or GCC`
          );
          
        }
      }

      chrome.storage.local.set({ productData: allProducts, greenLight: failedItems.length === 0 });

      const endTime = Date.now();
      const seconds = Math.round((endTime - startTime) / 1000);
      const minutes = Math.floor(seconds / 60);
      const timeTaken = `${minutes}m ${seconds % 60}s`;

      chrome.runtime.sendMessage({
        type: "done",
        count: allProducts.length,
        time: timeTaken
      });

      if (failedItems.length > 0) {
        const headers = Object.keys(failedItems[0]);
        const csv = [headers.join(",")].concat(failedItems.map(row => headers.map(h => `"${row[h]}"`).join(","))).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "failed_products_review.csv";
        a.click();
        URL.revokeObjectURL(url);

        alert(`⚠️ Do not approve SCOC yet.\n\n${failedItems.length} product(s) need review.\nThe CSV file 'failed_products_review.csv' was downloaded for your reference.`);
      } else {
        const comment = successComments.join("\n\n");
        chrome.runtime.sendMessage({ type: "jobComment", text: comment });

      }
    });

  } catch (err) {
    console.error("❌ check.js error:", err);
    chrome.storage.local.set({ greenLight: false });
    alert("❌ Something went wrong. Check console.");
  }
})();
