document.getElementById("checkBtn").addEventListener("click", async () => {
  const description = document.getElementById("descriptionInput").value.trim().toUpperCase();

  if (description) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: selectMatchingRows,
      args: [description]
    });
  }
});

function selectMatchingRows(description) {
  const rows = document.querySelectorAll("tr");
  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const descTd = cells[1];
      if (descTd && descTd.textContent.toUpperCase().includes(description)) {
        const checkbox = row.querySelector("input[type='checkbox']");
        if (checkbox && !checkbox.checked) {
          checkbox.click();
        }
      }
    }
  });
}
