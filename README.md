# XDS Custom Chrome Extensions

This repo contains multiple Chrome extensions:

- **description-checker-extension** — Extension to select multiple models in invoice tab based on the product description.
- **scoc-checker-extension** — Extension to check if the SCOC requires MIM approval or GCC.
- **xds-task-scraper** — Scrapes XDS portal task IDs and renewals into CSV.

## Load an extension (dev)
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the specific extension folder (e.g., `xds-task-scraper/`)

## Contributing
Typical flow:
```
git add .
git commit -m "feat: <what changed>"
git push
```
