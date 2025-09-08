(async () => {
    try {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      await delay(1000); // initial wait just in case
  
      const productData = [];
  
      const productBlocks = document.querySelectorAll("div.panel.no-shadow");
  
      productBlocks.forEach((block, index) => {
        try {
          const cert = block.querySelector("span.certNo");
          const certNumber = cert ? cert.textContent.replace(/[()]/g, "").trim() : "";
  
          let productName = "";
          const title = block.querySelector("h4.panel-title");
          if (title && title.textContent.includes("Product Name")) {
            productName = title.textContent.split("Product Name :")[1]?.trim() || "";
          }
  
          // HS Code
          let hscode = "";
          const hsStrong = Array.from(block.querySelectorAll("strong"))
            .find(el => el.textContent.includes("HSCode"));
          if (hsStrong) {
            const hsSpan = hsStrong.nextElementSibling;
            if (hsSpan) hscode = hsSpan.textContent.trim();
          }
  
          // Country of Origin
          let country = "";
          const countryLabel = Array.from(block.querySelectorAll("span.control-label"))
            .find(el => el.textContent.includes("Country of origin"));
          if (countryLabel) {
            const parent = countryLabel.closest(".form-group");
            const countrySpan = parent?.querySelector("span.form-control");
            if (countrySpan) country = countrySpan.textContent.trim();
          }
  
          // Trademark
          let trademark = "";
          const trademarkLabel = block.querySelector("label[for='Trademark']");
          if (trademarkLabel) {
            const wrapper = trademarkLabel.closest(".form-group");
            const valueSpan = wrapper?.querySelector("span.form-control");
            if (valueSpan) trademark = valueSpan.textContent.trim();
          }
  
          const product = {
            certificateNumber: certNumber,
            productName,
            hscode,
            countryOfOrigin: country,
            trademark
          };

        // Skip empty product blocks
        if (!certNumber && !productName && !hscode && !country && !trademark) {
            console.log(`Skipping empty block at index ${index}`);
            return;
        }
          console.log(`Product ${index + 1}:`, product);
          productData.push(product);
        } catch (err) {
          console.warn("Failed to extract one product:", err);
        }
      });
  
      console.log("Extracted products:", productData);
      // alert(`Extracted ${productData.length} products!`);
  
      chrome.storage.local.set({ productData });
      chrome.storage.local.set({ greenLight: true });
  
    } catch (err) {
      console.error("check.js failed:", err);
      chrome.storage.local.set({ greenLight: false });
      alert("Extraction failed. See console for details.");
    }
  })();
  