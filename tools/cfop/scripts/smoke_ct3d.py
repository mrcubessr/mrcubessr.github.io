import json
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8099"
OUT = ".workbuddy/outputs/"

CHECK = r"""
() => {
  const c = window.__ct.newCube();          // 还原态：U白 R红 F绿 D黄 L橙 B蓝
  const svgTop = window.Cube3D.render(c, { yaw: 0, pitch: 90, size: 220 });
  const svgBot = window.Cube3D.render(c, { yaw: 0, pitch: -90, size: 220 });
  const svgFront = window.Cube3D.render(c, { yaw: 0, pitch: 0, size: 220 });
  const fills = svg => [...svg.querySelectorAll('polygon')]
      .filter(p => p.getAttribute('class') !== 'c3-body')
      .map(p => p.getAttribute('style'));
  const uniq = a => [...new Set(a)];
  return {
    top: uniq(fills(svgTop)),
    bottom: uniq(fills(svgBot)),
    front: uniq(fills(svgFront)),
    countTop: fills(svgTop).length
  };
}
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=2)
    errs = []
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(BASE + "/tools/cfop/cross-trainer.html", wait_until="networkidle")
    page.wait_for_selector(".c3-view", timeout=15000)
    page.wait_for_timeout(400)

    r = page.evaluate(CHECK)
    print("solved top   :", r["top"], "(expect face-u 白)")
    print("solved bottom:", r["bottom"], "(expect face-d 黄)")
    print("solved front :", r["front"], "(expect face-f 绿)")

    polys = page.eval_on_selector_all(".c3-view polygon", "els => els.length")
    body = page.eval_on_selector_all(".c3-view polygon.c3-body", "els => els.length")
    print("scrambled view polygons:", polys, "| body:", body)

    before = page.eval_on_selector(".c3-view", "el => el.outerHTML.length")
    box = page.eval_on_selector("#ct-net", "el => { const r = el.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; }")
    page.mouse.move(box["x"], box["y"]); page.mouse.down()
    page.mouse.move(box["x"] + 90, box["y"] - 40, steps=8)
    page.mouse.up(); page.wait_for_timeout(250)
    after = page.eval_on_selector(".c3-view", "el => el.outerHTML.length")
    print("drag rotate changed view:", before != after)

    page.screenshot(path=OUT + "ct3d_full.png", full_page=False)
    page.query_selector(".ct").screenshot(path=OUT + "ct3d_block.png")
    print("console errors:", errs if errs else "none")
    b.close()
