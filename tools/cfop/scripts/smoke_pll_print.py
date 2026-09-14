"""PLL 打印页生成器 · 浏览器回归测试。

用法：python tools/cfop/scripts/smoke_pll_print.py [base_url]
"""
import os
import re
import sys
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8099").rstrip("/")
URL = BASE + "/tools/cfop/pll.html"

fail = []


def check(name, got, want):
    ok = got == want
    print(f"  {'OK ' if ok else 'BAD'} {name}: {got} (expect {want})")
    if not ok:
        fail.append(name)


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1440, "height": 940})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        pg.goto(URL, wait_until="networkidle")
        pg.wait_for_timeout(500)

        # 1) 入口按钮存在
        check("入口按钮", pg.eval_on_selector_all(".cfop-print-open", "e => e.length"), 1)

        # 2) 打开弹窗
        pg.click(".cfop-print-open")
        pg.wait_for_selector(".pp-modal:not([hidden])", timeout=8000)
        pg.wait_for_timeout(400)
        check("列表项数", pg.eval_on_selector_all(".pp-item", "e => e.length"), 21)
        check("每项公式下拉", pg.eval_on_selector_all(".pp-item select", "e => e.length"), 21)
        opts = pg.eval_on_selector_all(
            ".pp-item select", "els => els.map(s => s.options.length)"
        )
        check("每题公式条数", sorted(set(opts)), [4])

        # 3) 默认预设 = 一页速查（3×7 → 21 格 / 1 页）
        check("默认页数", pg.eval_on_selector_all(".pp-page", "e => e.length"), 1)
        check("首页格数", pg.eval_on_selector_all(".pp-page .pp-cell", "e => e.length"), 21)
        check("首页配图数", pg.eval_on_selector_all(".pp-page .pp-cell__art svg", "e => e.length"), 21)
        check("页脚统计", pg.inner_text("#pp-count"), "已选 21 / 21 例 · 共 1 页")

        # 4) 取消勾选一个情况 → 20 格；切到「标准」预设 → 2 页
        pg.click(".pp-item:nth-child(1) input[type=checkbox]")
        pg.wait_for_timeout(250)
        check("取消 1 项后格数", pg.eval_on_selector_all(".pp-page .pp-cell", "e => e.length"), 20)
        check("取消后统计", pg.inner_text("#pp-count"), "已选 20 / 21 例 · 共 1 页")

        pg.select_option("#pp-opts select", "two")
        pg.wait_for_timeout(350)
        check("标准预设页数", pg.eval_on_selector_all(".pp-page", "e => e.length"), 2)
        check("标准预设首页格数", pg.eval_on_selector_all(".pp-page:nth-child(1) .pp-cell", "e => e.length"), 12)
        check("标准预设次页格数", pg.eval_on_selector_all(".pp-page:nth-child(2) .pp-cell", "e => e.length"), 8)

        # 5) 换公式：把第 2 项的公式切到第 3 条，纸面文案应同步
        sel = pg.query_selector_all(".pp-item select")[1]
        want = sel.evaluate("s => s.options[2].textContent.replace(/^\\d+\\.\\s*/, '')")
        sel.select_option("2")
        pg.wait_for_timeout(300)
        got = pg.eval_on_selector_all(
            ".pp-pages .pp-cell__alg", "els => els.map(e => e.textContent.trim())"
        )
        check("切换公式已同步", want in got, True)

        # 6) 关闭「配图」「页眉」→ 纸面无 svg、无页眉
        boxes = pg.query_selector_all(".pp-checks input[type=checkbox]")
        boxes[0].click()   # 配图
        pg.wait_for_timeout(250)
        check("关闭配图后 svg 数", pg.eval_on_selector_all(".pp-pages .pp-cell__art svg", "e => e.length"), 0)
        boxes[4].click()   # 页眉
        pg.wait_for_timeout(250)
        check("关闭页眉后页眉数", pg.eval_on_selector_all(".pp-page__head", "e => e.length"), 0)

        # 7) 横版预设 → 纸张横向（297mm）
        pg.select_option("#pp-opts select", "wide4")
        pg.wait_for_timeout(350)
        w = pg.eval_on_selector(
            ".pp-page", "e => Math.round(e.getBoundingClientRect().width)"
        )
        check("横版纸张宽度≈1123px", 1080 <= w <= 1130, True)
        check("横版类名", pg.eval_on_selector_all(".pp-pages.pp-land", "e => e.length"), 1)

        # 8) 全选 → 21 例 / 3 页（4×3=12 每页）
        pg.click(".pp-side__bar .seg__btn")   # 全选
        pg.wait_for_timeout(350)
        check("全选后统计", pg.inner_text("#pp-count"), "已选 21 / 21 例 · 共 2 页")

        # 9) 打印样式：模拟 print media，站点外壳应隐藏、纸张应可见
        pg.emulate_media(media="print")
        pg.wait_for_timeout(300)
        check("打印时导航隐藏", pg.eval_on_selector("[data-site-nav]", "e => getComputedStyle(e).display"), "none")
        check("打印时配置栏隐藏", pg.eval_on_selector(".pp-side", "e => getComputedStyle(e).display"), "none")
        check("打印时纸张可见", pg.eval_on_selector(".pp-page", "e => getComputedStyle(e).display"), "flex")
        check("打印时纸张无阴影", pg.eval_on_selector(".pp-page", "e => getComputedStyle(e).boxShadow"), "none")
        pg.emulate_media(media="screen")

        # 10) Esc 关闭
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(250)
        check("Esc 关闭弹窗", pg.eval_on_selector(".pp-modal", "e => e.hidden"), True)

        # 11) 导出 PDF：PDF 页数必须与预览页数一致（防「多出空白页」回归）
        outdir = os.path.join(os.getcwd(), ".workbuddy", "outputs")
        os.makedirs(outdir, exist_ok=True)
        pg.emulate_media(media="screen")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(400)
        pg.click(".cfop-print-open")
        pg.wait_for_selector(".pp-modal:not([hidden])")
        pg.click("[data-act='reset']")
        pg.wait_for_timeout(400)
        for pid, land in [("one", False), ("two", False), ("big", False), ("wide4", True)]:
            pg.select_option("#pp-opts select", pid)
            pg.wait_for_timeout(420)
            dom = pg.eval_on_selector_all(".pp-page", "e => e.length")
            pg.evaluate(
                "() => { let s=document.getElementById('pp-print-style');"
                " if(!s){s=document.createElement('style');s.id='pp-print-style';"
                " document.head.appendChild(s);}"
                " s.textContent='@page{ size: A4 %s; margin: 0; }'; }"
                % ("landscape" if land else "portrait")
            )
            out = os.path.join(outdir, "_smoke_%s.pdf" % pid)
            # page.pdf() 会沿用已显式设置过的 media 模拟，故导出前必须切到 print
            pg.emulate_media(media="print")
            pg.wait_for_timeout(250)
            if land:
                pg.pdf(path=out, width="297mm", height="210mm", print_background=True,
                       margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            else:
                pg.pdf(path=out, format="A4", print_background=True,
                       margin={"top": "0", "bottom": "0", "left": "0", "right": "0"})
            pdfn = len(re.findall(rb"/Type\s*/Page[^s]", open(out, "rb").read()))
            check("PDF 页数(%s)" % pid, pdfn, dom)
            os.remove(out)
            pg.emulate_media(media="screen")
            pg.wait_for_timeout(150)

        print("console errors:", errs if errs else "none")
        if errs:
            fail.append("console errors")
        b.close()

    print("\nRESULT:", "ALL PASS" if not fail else "FAILED -> " + ", ".join(fail))
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
