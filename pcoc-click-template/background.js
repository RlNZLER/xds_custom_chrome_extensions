let rows = [];


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
if (msg.type === 'APPEND_ROWS') {
rows.push(...msg.rows);
sendResponse({ ok: true, total: rows.length });
}


if (msg.type === 'EXPORT_ALL') {
const { exportCsv, exportJson, filenameBase = 'pcoc_scrape' } = msg.options || {};


if (exportJson) {
const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
chrome.downloads.download({ url, filename: `${filenameBase}.json`, saveAs: true });
}


if (exportCsv) {
const csv = toCSV(rows);
const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
const url = URL.createObjectURL(blob);
chrome.downloads.download({ url, filename: `${filenameBase}.csv`, saveAs: true });
}


rows = []; // reset after export
}
});


function toCSV(data) {
if (!data.length) return '';
const headers = Array.from(new Set(data.flatMap(Object.keys)));
const esc = (v) => {
if (v == null) return '';
const s = String(v).replaceAll('"', '""');
return /[",\n]/.test(s) ? `"${s}"` : s;
};
const lines = [headers.join(',')];
for (const row of data) lines.push(headers.map(h => esc(row[h])).join(','));
return lines.join('\n');
}