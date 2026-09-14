"""对线上站点（GitHub Pages）做部署后回归验证。

用法：python tools/cfop/scripts/smoke_live.py [base_url]
默认 base_url = https://mrcubessr.github.io
"""
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://mrcubessr.github.io").rstrip("/")

SETS = {
    "f2l.html": 41,
    "advanced-f2l.html": 54,
    "oll.html": 57,
    "pll.html": 21,
}


def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(bypass_csp=False)

        # ---- 首页 ----
        pg = ctx.new_page()
        msgs = []
        pg.on("console", lambda m: msgs.append(m.text) if m.type == "error" else None)
        pg.goto(BASE + "/", wait_until="networkidle")
        pg.wait_for_timeout(600)
        nav = pg.eval_on_selector_all("[data-site-nav] a", "a => a.map(x => x.textContent.trim())")
        href_3x3 = pg.eval_on_selector_all(
            "a.card[href]", "els => (els.find(e => e.getAttribute('href').includes('/tools/3x3')) || {}).href || ''"
        )
        print(f"home: nav_cfop={'CFOP' in ''.join(nav)} | 3x3_card={href_3x3}")
        print(f"home console errors: {msgs if msgs else 'none'}")

        # ---- 三阶 hub ----
        pg.goto(BASE + "/tools/3x3/", wait_until="networkidle")
        pg.wait_for_timeout(500)
        hub = pg.eval_on_selector_all("a.card[href]", "els => els.length")
        hub_links = pg.eval_on_selector_all("a.card[href]", "els => els.map(e => e.getAttribute('href'))")
        print(f"hub: cards={hub} | links={hub_links}")

        # ---- 各公式库 ----
        for name, expect in SETS.items():
            msgs2 = []
            pg.goto(BASE + "/tools/cfop/" + name, wait_until="networkidle")
            pg.on("console", lambda m: msgs2.append(m.text) if m.type == "error" else None)
            pg.wait_for_timeout(800)
            cards = pg.eval_on_selector_all(".cfop-card", "e => e.length")
            flat = pg.eval_on_selector_all(".cfop-net--flat", "e => e.length")
            iso = pg.eval_on_selector_all(".cfop-net--iso", "e => e.length")
            shapes = pg.eval_on_selector_all(".cfop-net rect, .cfop-net polygon", "e => e.length")
            tabs = pg.eval_on_selector_all(".cfop-tab", "e => e.length")
            ok = "OK" if cards == expect and (flat + iso) == expect else "MISMATCH"
            print(
                f"{name}: cards={cards}/{expect} {ok} | flat={flat} iso={iso} shapes={shapes} tabs={tabs} err={len(msgs2)}"
            )

        # ---- 十字训练器（平面展开图）----
        msgs3 = []
        pg.goto(BASE + "/tools/cfop/cross-trainer.html", wait_until="networkidle")
        pg.on("console", lambda m: msgs3.append(m.text) if m.type == "error" else None)
        pg.wait_for_selector("#ct-net .cfop-net--cross", timeout=20000)
        pg.wait_for_timeout(500)
        rects = pg.eval_on_selector_all("#ct-net .cfop-net--cross rect", "e => e.length")
        orient = pg.eval_on_selector("#ct-orient", "e => e ? e.textContent.trim().replace(/\s+/g,' ') : '')
        scr = pg.eval_on_selector("#ct-scramble", "e => e ? e.textContent.trim() : ''")
        print(f"cross-trainer: net_rects={rects}/54 orient='{orient}' | scramble='{scr[:30]}...' | err={len(msgs3)}")

        b.close()

    if errors:
        print("FAILURES:", errors)
        sys.exit(1)
    print("live deploy check: DONE")


if __name__ == "__main__":
    main()
