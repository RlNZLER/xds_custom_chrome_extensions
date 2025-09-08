Invoice Model Multi-Select
==========================

**Purpose:** A Chrome extension that lets you quickly **select multiple models** in an **Invoice** table by matching a **product description**. It scans the page's rows and ticks the checkboxes for every row whose description contains your search text.

* * * * *

How it works
------------

-   You type a term (e.g. `steel buffetware`) in the popup.

-   The extension injects a small script into the current tab.

-   It finds every `<tr>` in the page, looks at **column 2** (the second `<td>`), and if that cell's text **includes** your term (case-insensitive), it **checks the row's checkbox**.

Usage
-----

1.  Open your **Invoice** tab (the page with the models table and checkboxes).

2.  Click the extension icon to open the popup.

3.  Enter part of the product description (e.g., `linen`).

4.  Click **Select Matching Rows** → all matching rows will get checked.
