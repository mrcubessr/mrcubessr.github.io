import os, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
OUT = r"D:\魔方站点备份\fto-site\.workbuddy\outputs"
os.makedirs(OUT, exist_ok=True)

shots = [
    ("/tools/3x3/", "hub_dark.png", "dark", None),
    ("/tools/cfop/f2l.html", "f2l_dark.png", "dark", None),
    ("/tools/cfop/oll.html", "oll_dark.png", "dark", None),
    ("/tools/3x3/", "hub_light.png", "light", None),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for path, name, theme, _ in shots:
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        pg.goto(BASE + path, wait_until="networkidle")
        pg.evaluate("t => document.documentElement.setAttribute('data-theme', t)", theme)
        pg.wait_for_timeout(500)
        pg.screenshot(path=os.path.join(OUT, name), full_page=False)
        pg.close()
        print("saved", name)
    # 一张 F2L 卡片特写
    pg = b.new_page(viewport={"width": 900, "height": 900})
    pg.goto(BASE + "/tools/cfop/f2l.html", wait_until="networkidle")
    pg.evaluate("t => document.documentElement.setAttribute('data-theme', t)", "dark")
    pg.wait_for_timeout(600)
    card = pg.query_selector(".cfop-card")
    card.screenshot(path=os.path.join(OUT, "f2l_card.png"))
    print("saved f2l_card.png")
    b.close()
