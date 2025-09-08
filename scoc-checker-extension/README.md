SCoC MIM/GCC Checker
====================

**Purpose:** Chrome extension to check whether products in SABER/SCoC flows require **MIM approval** or **GCC**.\
It injects a page script to extract product rows, streams **progress** back to the popup, and lets you **export** the results to CSV. It can also extract and save **Global HS-code rules** used to determine MIM/GCC applicability.

* * * * *

Features
--------

-   **One-click extraction** of product rows from the active tab.

-   Live **progress bar** (page X of Y).

-   **CSV export** of all extracted products (includes status fields added by the extractor).

-   **Extract & save Global HS-code rules** to `global_rules.json`.

-   **Copy job comment** helper when the page script provides a suggested comment.

* * * * *

How it works (high level)
-------------------------

1.  You click **Start** in the popup.

2.  The popup injects **`check.js`** into the current tab.

3.  `check.js` scrapes product pages and sends messages back:

    -   `progress` → `{ page, total }`

    -   `done` → `{ count, time }` (and writes `productData` to `chrome.storage.local`)

    -   (optional) `jobComment` → `{ text }`

4.  You can click **Download** to export the data in `chrome.storage.local.productData` as CSV.

5.  You can click **Extract Rules** to inject **`rules.js`**, which writes `hsCodeRules` to storage.


Usage
-----

1.  Navigate to request details tab of SCOC.

2.  Click the extension icon → **Start**.

3.  Watch the **progress bar**; when done, click **Download CSV**.

4.  (Optional) Click **Extract Global HS Rules**, then **Download Rules JSON**.

5.  (Optional) If a suggested **job comment** appears, click **Copy**.
