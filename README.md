# ToolVault Full App

ToolVault is a free, offline-first personal tool inventory app for insurance and employer documentation.

## Included
- Inventory dashboard
- Add/edit/delete tools
- Tool photos, serial/model plate photos, and receipt photos
- Brand, category, model, serial, barcode/UPC
- Purchase and replacement values
- Storage location, condition, and status
- Search, filters, and sorting
- Categories dashboard
- Receipts gallery
- Reports section
- Black-and-white insurance PDF/print report with color evidence photos
- Optional receipt pages in the report
- Signature/date lines
- CSV export
- Full JSON backup/restore including photos
- Settings for owner/company/default location
- Barcode scanning where the browser supports BarcodeDetector
- Manual barcode fallback
- Installable iPhone web app
- Offline cache after first load

## GitHub Pages
Upload these 7 files directly to the repository root:
index.html
app.js
styles.css
manifest.json
sw.js
icon.svg
README.md

Then enable GitHub Pages from the main branch and root folder.

## iPhone install
Open the GitHub Pages site in Safari, tap Share, then Add to Home Screen.

## Important
Records are stored locally on the device in IndexedDB. Export JSON backups regularly and keep them in a separate cloud/storage location. Clearing Safari website data can remove local records.

Barcode camera support depends on the browser/device. If automatic barcode detection is unavailable, ToolVault provides manual barcode entry.
