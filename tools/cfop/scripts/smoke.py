import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099/tools/cfop"
PAGE_CARDS = {"oll.html": 57, "pll.html": 21, "advanced-f2l.html": 54}

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))

    for pg, expect in PAGE_CARDS.items():
        page.goto(BASE + "/" + pg, wait_until="networkidle")
        page.wait_for_timeout(800)
        cards = page.eval_on_selector_all(".cfop-card", "els => els.length")
        print(f"{pg}: cards={cards} (expect {expect}) {'OK' if cards==expect else 'MISMATCH'}")

    # Cross trainer
    page.goto(BASE + "/cross-trainer.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    scr = page.eval_on_selector("#ct-scramble", "e => e.textContent")
    net = page.eval_on_selector_all("#ct-net rect", "els => els.length")
    print(f"cross-trainer: scramble='{scr[:40]}...' netRects={net} {'OK' if net==54 else 'BAD'}")

    # theme + copy interaction on oll
    page.goto(BASE + "/oll.html", wait_until="networkidle")
    page.wait_for_timeout(500)
    page.click(".cfop-alg__moves")
    page.wait_for_timeout(200)
    print("console errors:", errs if errs else "none")
    b.close()
