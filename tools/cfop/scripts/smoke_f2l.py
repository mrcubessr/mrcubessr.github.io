import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099/tools/cfop/f2l.html"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))

    page.goto(BASE, wait_until="networkidle")
    page.wait_for_timeout(900)

    cards = page.eval_on_selector_all(".cfop-card", "els => els.length")
    print(f"f2l.html: cards={cards} (expect 41) {'OK' if cards == 41 else 'MISMATCH'}")

    # check tabs on every card (each F2L case has 4 orientations => 4 tabs)
    tab_counts = page.eval_on_selector_all(".cfop-card", "cards => cards.map(c => c.querySelectorAll('.cfop-tab').length)")
    bad = [i for i, n in enumerate(tab_counts) if n != 4]
    print(f"tab counts: total cards={len(tab_counts)}, cards_with_!=4_tabs={len(bad)} {('OK' if not bad else 'BAD '+str(bad[:5]))}")

    # verify tab switching changes visible algs
    first = page.query_selector(".cfop-card")
    tabs = first.query_selector_all(".cfop-tab")
    panes = first.query_selector_all(".cfop-ori")
    before = panes[0].inner_text
    tabs[2].click()
    page.wait_for_timeout(150)
    active = page.eval_on_selector(".cfop-card .cfop-ori.is-active", "e => e.innerText.slice(0,30)")
    active_tab = page.eval_on_selector(".cfop-card .cfop-tab.is-active", "e => e.innerText")
    print(f"after click tab[2]: activeTab='{active_tab}' activePaneStart='{active[:25]}'")
    print("console errors:", errs if errs else "none")
    b.close()
