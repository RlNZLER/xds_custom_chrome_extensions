const btn = document.getElementById('start');
const statusEl = document.getElementById('status');
const bar = document.getElementById('progress');
const logEl = document.getElementById('log');

function log(msg) {
  logEl.textContent += msg + '\n';
}

btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Injecting script…';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/portal\.xds-solutions\.com/.test(tab.url || '')) {
    statusEl.textContent = '⚠️ Open the XDS portal tasks page first.';
    btn.disabled = false;
    return;
  }

  // Inject content.js (important — without this, messages won’t be handled)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    statusEl.textContent = 'Failed to inject content.js';
    log(String(e));
    btn.disabled = false;
    return;
  }

  statusEl.textContent = 'Starting…';
  bar.style.display = 'none';
  bar.value = 0; bar.max = 1;

  // Send the start command
  chrome.tabs.sendMessage(tab.id, { cmd: 'START_SCRAPE' }, (resp) => {
    // We rely mainly on async runtime messages; this callback may not fire.
    if (chrome.runtime.lastError) {
      // It’s ok; progress will update via runtime messages
      log('Started. Waiting for updates…');
    }
  });
});

// Listen for progress messages from content.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.cmd === 'SCRAPE_INIT') {
    bar.max = msg.total || 1;
    bar.value = 0;
    bar.style.display = 'block';
    statusEl.textContent = `Found ${msg.total} tasks. Scraping renewals…`;
  }

  if (msg?.cmd === 'SCRAPE_PROGRESS') {
    if (typeof msg.total === 'number') bar.max = msg.total;
    if (typeof msg.done === 'number') bar.value = msg.done;
    statusEl.textContent = `Processed ${msg.done}/${msg.total} tasks…`;
  }

  if (msg?.cmd === 'SCRAPE_DONE') {
    if (msg.ok) {
      statusEl.textContent = `✅ Done. Collected ${msg.count} line items.`;
    } else {
      statusEl.textContent = `❌ Error: ${msg.error || 'Unknown error'}`;
    }
    bar.style.display = 'none';
    btn.disabled = false;
  }
});
