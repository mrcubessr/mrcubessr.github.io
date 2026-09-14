import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
SETS = {"f2l.html": 41, "advanced-f2l.html": 54, "oll.html": 57, "pll.html": 21}

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append("PAGEERR: " + str(e)))

    # 1) 三阶 hub
    page.goto(BASE + "/tools/3x3/", wait_until="networkidle")
    page.wait_for_timeout(400)
    hub_cards = page.eval_on_selector_all(".card-grid .card", "els => els.length")
    links = page.eval_on_selector_all(".card-grid a.card", "els => els.map(a => a.getAttribute('href'))")
    nav_ok = page.eval_on_selector_all("#siteNav .nav-link", "els => els.map(e => e.textContent.trim())")
    print(f"hub: cards={hub_cards} (expect 5) {'OK' if hub_cards==5 else 'MISMATCH'}")
    print(f"hub links: {links}")
    print(f"nav: {nav_ok}")

    # 2) 各公式库
    for pg, expect in SETS.items():
        page.goto(BASE + "/tools/cfop/" + pg, wait_until="networkidle")
        page.wait_for_timeout(700)
        cards = page.eval_on_selector_all(".cfop-card", "els => els.length")
        std = page.eval_on_selector_all(".cfop-card.card, .badge, .btn, .progress__bar", "els => els.length")
        tabs = page.eval_on_selector_all(".cfop-card", "cs => cs.map(c => c.querySelectorAll('.cfop-tab').length)")
        bad = [i for i, n in enumerate(tabs) if n not in (0, 4)]
        art = page.eval_on_selector_all(".cfop-net", "els => els.length")
        flat = page.eval_on_selector_all(".cfop-net--flat", "els => els.length")
        iso = page.eval_on_selector_all(".cfop-net--iso", "els => els.length")
        art_ok = "OK" if art == expect else "NO-ART"
        print(f"{pg}: cards={cards} (expect {expect}) {'OK' if cards==expect else 'MISMATCH'}"
              f" | std={std} | tabs_bad={len(bad)} | art={art}(flat={flat},iso={iso}) {art_ok}")

    # 3) F2L 朝向切换
    page.goto(BASE + "/tools/cfop/f2l.html", wait_until="networkidle")
    page.wait_for_timeout(700)
    card = page.query_selector(".cfop-card")
    tabs = card.query_selector_all(".cfop-tab")
    first_tab_count = len(tabs)
    tabs[2].click(); page.wait_for_timeout(150)
    active_tab = page.eval_on_selector(".cfop-card .cfop-tab.is-active", "e => e.innerText")
    active_pane = page.eval_on_selector(".cfop-card .cfop-ori.is-active", "e => e.innerText.slice(0,20)")
    print(f"f2l tabs={first_tab_count} click#2 -> tab='{active_tab}' pane='{active_pane}'")

    # 4) 标准组件存在性抽查（oll）
    page.goto(BASE + "/tools/cfop/oll.html", wait_until="networkidle")
    page.wait_for_timeout(500)
    for sel in [".toolbar", ".input", ".seg", ".seg__btn", ".progress", ".progress__bar", ".card", ".badge", ".formula-block", ".cfop-net"]:
        n = page.eval_on_selector_all(sel, "els => els.length")
        print(f"  {sel}: {n}")

    # 5) Cross trainer
    page.goto(BASE + "/tools/cfop/cross-trainer.html", wait_until="networkidle")
    page.wait_for_timeout(600)
    scr = page.eval_on_selector("#ct-scramble", "e => e.textContent")
    net = page.eval_on_selector_all("#ct-net .c3-view polygon", "els => els.length")
    faces = page.eval_on_selector_all("#ct-net .c3-face", "els => els.length")
    print(f"cross-trainer: scramble='{scr[:36]}...' 3Dpolys={net} faces={faces} {'OK' if net==30 and faces==3 else 'BAD'}")

    # 6) 浅色主题切换
    page.goto(BASE + "/tools/cfop/f2l.html", wait_until="networkidle")
    page.wait_for_timeout(400)
    page.click("#themeBtn"); page.wait_for_timeout(200)
    theme = page.eval_on_selector("html", "e => e.getAttribute('data-theme')")
    print(f"theme after toggle: {theme}")

    # 7) 首页 + cfop 旧索引仍正常
    page.goto(BASE + "/", wait_until="networkidle")
    page.wait_for_timeout(400)
    home_titles = page.eval_on_selector_all(".section-title", "els => els.map(e => e.textContent.trim())")
    x3_href = page.eval_on_selector(".card-grid a[href='/tools/3x3/']", "e => e.getAttribute('href')")
    print(f"home: sections={home_titles} | 三阶 card href={x3_href}")

    page.goto(BASE + "/tools/cfop/", wait_until="networkidle")
    page.wait_for_timeout(300)
    idx = page.eval_on_selector_all(".cfop-hub .card", "els => els.length")
    print(f"cfop index: hub cards={idx}")

    print("console errors:", errs if errs else "none")
    b.close()
