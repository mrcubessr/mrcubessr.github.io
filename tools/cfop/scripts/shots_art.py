from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
OUT = ".workbuddy/outputs/"
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, url, n in [("new_oll", "/tools/cfop/oll.html", 4),
                         ("new_pll", "/tools/cfop/pll.html", 4),
                         ("new_f2l", "/tools/cfop/f2l.html", 4),
                         ("new_advf2l", "/tools/cfop/advanced-f2l.html", 4)]:
        pg = b.new_page(viewport={"width": 1180, "height": 900}, device_scale_factor=2)
        pg.goto(BASE + url, wait_until="networkidle")
        pg.wait_for_selector(".cfop-card", timeout=15000)
        pg.wait_for_timeout(700)
        grid = pg.query_selector(".cfop-grid")
        grid.screenshot(path=OUT + name + ".png")
        print("saved", name)
        pg.close()
    b.close()
