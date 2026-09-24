import glob, os, re
from playwright.sync_api import sync_playwright
OUT = "/home/user/DTF-Druckdatei-pr-fen-/logo-reha-werkstatt"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
    for f in sorted(glob.glob(OUT + "/*.svg")):
        s = open(f).read()
        w, h = map(int, re.search(r'viewBox="0 0 (\d+) (\d+)"', s).groups())
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=4)
        pg.set_content(f"<html><body style='margin:0;background:transparent'>{s}</body></html>")
        pg.locator("svg").screenshot(path=f[:-4] + ".png", omit_background=True)
        pg.close()
    b.close()
