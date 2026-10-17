# Zach Store Label Maker

Turns `Zach_Store_Inventory.xlsx` into **Zach Store Item Labels.pdf**, saved in the same folder. The PDF has two parts:

1. An item list with photo, name, type, specs, price and stock. Stock of 5 or fewer is shown in red.
2. Cut-out shelf labels, two per row, with photo, name, specs and price.

## Start it

Double-click **Zach Store Labels** on the Desktop. The PDF rebuilds automatically whenever you save the inventory or `Item Specs.xlsx`, as long as the window is open. It can be minimised.

If the shortcut goes missing, run:

```
powershell -ExecutionPolicy Bypass -File install_shortcut.ps1
```

## Adding items

Add a row to the inventory, in the empty rows above TOTAL, and save. The app then:
- adds the item to `Item Specs.xlsx` so you can type its specs, one per line;
- finds a photo and rebuilds the PDF.

## Where photos come from (first match wins)

1. Your own photo in `Label Maker\images`, named exactly like the item, for example `boAt Airdopes 141.jpg`.
2. A file path or web link in the **Image** column of `Item Specs.xlsx`.
3. The store website's photos in `assets`.
4. A matching product photo from Wikipedia or Wikimedia Commons.
5. A representative photo of that kind of product, labelled "Representative photo" on the label.

Web photos are saved in `images\web-cache`. To make the app search again, delete the item's file there along with its entry in `index.json`.

## Requirements

Python 3 with the packages `openpyxl`, `reportlab`, `pillow` and `requests`:

```
python -m pip install openpyxl reportlab pillow requests
```
