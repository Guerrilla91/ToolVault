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

## Online Tool Lookup
The Settings screen now includes Online Tool Lookup. Search by tool name, brand, model number, UPC, EAN, or barcode, then tap Add to Inventory to prefill the new-tool form.

The lookup uses UPCitemdb's free trial API. Availability and product details depend on that third-party database and internet access. Your own tool/receipt photos remain the strongest proof for insurance documentation.

## Find My Tool
When adding a tool, type a plain-English search such as `Milwaukee M18 Fuel grinder`.
ToolVault shows possible matches with product name, brand, model number, and current online price.
Choosing a result fills the inventory form automatically. The online price is saved as the replacement/current value rather than the historical purchase price.

## Search Any Tool Online
The Add Tool screen now includes a general web search bar. You can search any tool by name, brand, or model, or jump directly to site-restricted searches for Home Depot, Harbor Freight, Snap-on, Lowe's, Acme Tools, and Amazon.

This is separate from the automatic Tool Finder. The Tool Finder attempts to prefill model and current replacement price; the general web search is there when you want to research any tool manually.

## Unified Find Tool Online
The Add Tool workflow now uses one search box. Enter a brand + tool name, model, UPC, or barcode. ToolVault first tries to identify a matching product and fill its model/current replacement price. The same panel includes Web, Home Depot, Harbor Freight, Snap-on, Lowe's, and Acme Tools fallback searches when automatic matching is not enough. All populated fields remain editable.
