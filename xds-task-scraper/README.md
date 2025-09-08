XDS Task Renewals Scraper
=========================

Scrapes **all PCOC renewal tasks** from the XDS portal into **one CSV**.\
It:

1.  Crawls the tasks list (with pagination) and collects **Task ID + Client Name**.

2.  Loads each task's **/renewals** page in a **hidden iframe** (same-origin), parses the table, and compiles rows with:

`Task ID, Client Name, Paying Client, Product, Brand, Cert,
HS Code, COO, CB, Job, Expiry, Last Shipped, Renewed`

1.  Streams **progress** to the popup and downloads a single file: `renewals_all.csv`.

* * * * *

What this file is
-----------------

`content.js` --- the content script that performs the scraping and CSV export.\
It expects a popup to send `{ cmd: "START_SCRAPE" }` and to display progress.

* * * * *

How it works (high level)
-------------------------

-   **Step 1 --- List crawl**

    -   Ensures we're on the default list URL (`DEFAULT_URL`).

    -   Reads the current page's table: grabs **Task ID** (col 0) and **Client Name** (col 2).

    -   Clicks **Next** and repeats until the end (300-page safety cap).

-   **Step 2 --- Per task, via hidden iframe**

    -   For each `{id, client}`, injects a hidden `<iframe src="/portal/task/{id}/renewals">`.

    -   Waits for headers (`Paying Client`, `Product`, `HS Code`) to appear.

    -   Parses each row to build objects with the fields above.

-   **Progress → Popup**

    -   After Step 1: `SCRAPE_INIT` with total task count.

    -   After each task: `SCRAPE_PROGRESS` with `{ done, total, lastId, lastCount }`.

    -   When finished: `SCRAPE_DONE` with total line items.

-   **Export**

    -   Assembles all rows into **one CSV** and triggers a download.

Usage
-----

1.  Open the XDS portal **tasks** page, select the person's name under 'Assigned to', select 'Status' as Not completed and select 'Task Type' as PCOC renewals.

2.  Click the extension icon → **Start**.

3.  Watch the progress bar.

4.  When done, your browser downloads **`renewals_all.csv`** automatically.
