#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RAZ AA 卡组配图管线（可复用 / 可持续更新）
================================================
功能：
  1. 读取现有 data/raz-aa.js（含 en/zh/theme/emoji，可能已有 img）
  2. 读取 raz_book_catalog.json（书目 -> 每页词序对照表）
  3. 从 E:\\01.RAZ绘本PDF点读版\\AA.PDF 下对应 PDF 抽取指定页图片
  4. 压缩为 600px JPEG 写入 data/img/，并把 img 路径回填到 raz-aa.js
  5. 输出统计：本次新增图片数、未匹配（catalog 有但卡组无）词列表

设计要点：
  - 无 OCR：靠人工/子代理维护的 catalog 决定「哪一页是哪个词」，机器只做机械抽取+压缩+回填。
  - 幂等：词已有 img 则跳过（first-wins），重跑安全。
  - 仅当 catalog 词能精确匹配卡组 en（大小写不敏感）才配图，避免误配。

用法：
  python build_raz_deck.py                 # 默认路径
  python build_raz_deck.py --dry-run       # 只打印计划，不写文件
  python build_raz_deck.py --pdf-dir "X:/..." --catalog cat.json
依赖：
  pip install pymupdf pillow
"""
import os, re, sys, shutil, argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_SRS   = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))   # tools/srs
DEFAULT_PDF_DIR = r"E:/01.RAZ绘本PDF点读版/AA.PDF"
DEFAULT_CATALOG = os.path.join(SCRIPT_DIR, "raz_book_catalog.json")
OUT_FILE   = os.path.join(REPO_SRS, "data", "raz-aa.js")
IMG_DIR    = os.path.join(REPO_SRS, "data", "img")
TARGET_W   = 600
JPEG_QUAL  = 85

# ---------- 工具 ----------
def slug(name):
    return re.sub(r"[^\w\-]+", "-", name.lower()).strip("-") or "x"

def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def singular(w):
    """英文单数化：wagons->wagon, dogs->dog, glasses->glass, boxes->box,
    tomatoes->tomato, potatoes->potato（-oes 结尾）"""
    w = w.lower()
    if len(w) > 3 and w.endswith("ies"):
        return w[:-3] + "y"                     # babies->baby
    if len(w) > 4 and w.endswith("oes"):
        return w[:-3] + "o"                     # tomatoes->tomato, potatoes->potato
    if len(w) > 3 and w.endswith("es") and w[-3] in "sxz":
        return w[:-2]                           # boxes->box, dishes->dish
    if len(w) > 3 and w.endswith("es") and w[-4:-2] in ("ch", "sh"):
        return w[:-2]                           # brushes->brush
    if len(w) > 2 and w.endswith("s") and not w.endswith("ss"):
        return w[:-1]                           # dogs->dog, cars->car
    return w

def parse_raz_aa(path):
    """返回 [(en, zh, theme, emoji, img)] 保持原顺序"""
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    pat = re.compile(
        r"en:'([^']*)'\s*,\s*zh:'([^']*)'\s*,\s*theme:'([^']*)'"
        r"(?:\s*,\s*emoji:'([^']*)')?(?:\s*,\s*img:'([^']*)')?"
    )
    out = []
    for m in pat.finditer(text):
        en, zh, theme, emoji, img = m.group(1), m.group(2), m.group(3), m.group(4) or "", m.group(5) or ""
        out.append([en, zh, theme, emoji, img])
    return out

def write_raz_aa(path, entries):
    lines = ["/* RAZ AA 核心词汇 · 自动生成，请勿手改",
             "   来源：RAZ AA 级别公开词卡/书目综合整理（去重核心词）",
             "   字段：en=英文  zh=中文  theme=主题分类  emoji=emoji配图  img=RAZ原图路径 */",
             "window.RAZ_AA = ["]
    for en, zh, theme, emoji, img in entries:
        s = "  {en:'" + en + "', zh:'" + zh + "', theme:'" + theme + "'"
        if emoji:
            s += ", emoji:'" + emoji + "'"
        if img:
            s += ", img:'" + img + "'"
        s += "},"
        lines.append(s)
    lines.append("];\n")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def crop_footer(path, extra=0.0):
    """
    裁掉页面底部的文字带（句子 "The dog." + 页脚 "Farm Animals Level aa" + 页码），
    只保留干净插图，卡面更清晰。
    从下往上找"连续近白行"（插图底部留白）作为裁切点。
    extra: 在检测到的裁切点基础上再上移的比例（0.01=再上移1%页高），用于吃掉残余笔画。
    """
    from PIL import Image
    im = Image.open(path).convert("RGB")
    w, h = im.size
    px = im.load()
    step = max(1, h // 300)
    near_white_rows = 0
    cut = None
    for y in range(h - 1, -1, -step):
        row_white = True
        for x in range(0, w, max(1, w // 60)):
            r, g, b = px[x, y]
            if not (r > 235 and g > 235 and b > 235):
                row_white = False
                break
        if row_white:
            near_white_rows += 1
            if near_white_rows >= 8:
                cut = y + near_white_rows * step
                break
        else:
            if near_white_rows:
                break
            near_white_rows = 0
    if cut and h - cut > h * 0.35:
        bottom = min(h, cut - int(h * extra))
        im = im.crop((0, 0, w, bottom))
    else:
        im = im.crop((0, 0, w, int(h * (0.86 - extra))))
    im.save(path, "JPEG", quality=JPEG_QUAL, optimize=True)


def render_page(pdf_path, page_no, out_path):
    import fitz
    doc = fitz.open(pdf_path)
    if page_no < 1 or page_no > doc.page_count:
        doc.close()
        raise IndexError("page %d out of range (%d)" % (page_no, doc.page_count))
    page = doc[page_no - 1]
    scale = TARGET_W / max(page.rect.width, 1)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
    pix.save(out_path, "jpeg", jpg_quality=JPEG_QUAL)
    doc.close()
    try:
        crop_footer(out_path, extra=0.012)
    except Exception:
        pass          # 裁剪失败保留原图，不影响流程

# ---------- 主流程 ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", default=DEFAULT_PDF_DIR)
    ap.add_argument("--catalog", default=DEFAULT_CATALOG)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.catalog):
        sys.exit("catalog 不存在: " + args.catalog)
    import json
    with open(args.catalog, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    entries = parse_raz_aa(OUT_FILE)
    deck_by_norm = {}
    deck_by_sing = {}
    for e in entries:
        deck_by_norm.setdefault(norm(e[0]), e)        # 精确匹配
        deck_by_sing.setdefault(norm(singular(e[0])), e)  # 单数化匹配（复数兜底）

    assigned = {}          # norm(en) -> img path
    for e in entries:
        if e[4]:
            assigned[norm(e[0])] = e[4]

    plan = []              # (book, page, word, out_rel, deck_en)
    unmatched = []         # catalog 有但卡组无
    missing_pdf = []

    for book, items in catalog.items():
        if book.startswith("_"):          # 跳过 _说明 等注释键
            continue
        pdf = os.path.join(args.pdf_dir, book + ".pdf")
        if not os.path.exists(pdf):
            # 尝试大小写不敏感匹配
            cand = None
            for fn in os.listdir(args.pdf_dir):
                if fn.lower() == (book + ".pdf").lower():
                    cand = os.path.join(args.pdf_dir, fn); break
            if cand:
                pdf = cand
            else:
                missing_pdf.append(book); continue
        for it in items:
            w = it.get("w") or it.get("word")
            p = int(it.get("p") or it.get("page"))
            n = norm(w)
            if n in assigned:
                continue                      # 已有图，跳过
            # 1) 精确匹配
            entry = deck_by_norm.get(n)
            # 2) 单数化匹配（catalog 是复数，卡组是单数）
            if entry is None:
                entry = deck_by_sing.get(norm(singular(w)))
            if entry is None:
                unmatched.append((book, p, w)); continue
            deck_en = entry[0]
            if norm(deck_en) in assigned:
                continue
            out_rel = "data/img/" + slug(deck_en) + ".jpg"
            plan.append((book, p, w, os.path.join(REPO_SRS, out_rel), deck_en))

    print("== 计划 ==")
    print("卡组词数:", len(entries))
    print("待抽取图片:", len(plan))
    if missing_pdf:
        print("找不到 PDF 的书目:", missing_pdf)
    if unmatched:
        print("catalog 有但卡组无（不配图，可作扩充候选）:",
              sorted(set("%s/%s" % (b, w) for b, p, w in unmatched)))

    if args.dry_run:
        for book, p, w, _, deck_en in plan:
            mark = "" if norm(w) == norm(deck_en) else "  (复数->%s)" % deck_en
            print("  + %-20s p%-3d %-14s -> %s%s" % (book, p, w, deck_en, mark))
        return

    os.makedirs(IMG_DIR, exist_ok=True)
    done = 0
    for book, p, w, out_abs, deck_en in plan:
        pdf = os.path.join(args.pdf_dir, book + ".pdf")
        if not os.path.exists(pdf):
            for fn in os.listdir(args.pdf_dir):
                if fn.lower() == (book + ".pdf").lower():
                    pdf = os.path.join(args.pdf_dir, fn); break
        try:
            render_page(pdf, p, out_abs)
            assigned[norm(deck_en)] = "data/img/" + slug(deck_en) + ".jpg"
            done += 1
        except Exception as ex:
            print("FAIL", book, "p%d" % p, w, "->", ex)

    # 回填
    for e in entries:
        if norm(e[0]) in assigned:
            e[4] = assigned[norm(e[0])]
    write_raz_aa(OUT_FILE, entries)

    n_img = sum(1 for e in entries if e[4])
    print("== 完成 ==")
    print("本次新增图片:", done)
    print("卡组配图覆盖率: %d/%d (%.0f%%)" % (n_img, len(entries), 100.0*n_img/len(entries)))

if __name__ == "__main__":
    main()
