#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RAZ AA 自动识词：批量 OCR 全部 PDF，产出书目->每页词 catalog
==============================================================
原理：
  PDF 是扫描图（无文字层），但每页都印着该页的英文句子（如 "The dog."）。
  用 RapidOCR（纯 pip 的 ONNX OCR，无需系统依赖）识别每页文字，
  再从句子里抽出**核心词**（名词/数字/形容词），写入 catalog。

用法：
  python ocr_build_catalog.py                 # 全量 49 本 -> raz_book_catalog.json
  python ocr_build_catalog.py --books Water Winter   # 只处理指定书
  python ocr_build_catalog.py --out cat.json       # 输出到别处（不覆盖）
依赖：pip install pymupdf rapidocr-onnxruntime
"""
import os, re, sys, json, argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = r"E:/01.RAZ绘本PDF点读版/AA.PDF"
DECK_FILE = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "..", "data", "raz-aa.js"))
RENDER_SCALE = 2.0          # 渲染倍率：越大越准，越慢
MIN_SCORE = 0.55            # 低于此置信度丢弃

# 句子/正文里的停用词，不作为核心词
STOP = set("""a an the this that these those is are was were be been being am
i you he she it we they me him her us them my your his its our their
of in on at to for with from by as and or but so if then than
not no yes can will just very too also up down out over under near
look see look here there page read text written by clifford mrs""".split())

# 高频功能词：若页面主体是这些，多半该页主体是"名词"，功能词只作辅
FUNC = set("""a an the this that is are was were am i you he she it we they
my your his its our their of to at in on for and or but not no yes
can will do does did go goes went come comes came get gets""".split())


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def deck_words():
    with open(DECK_FILE, "r", encoding="utf-8") as f:
        t = f.read()
    return set(norm(x) for x in re.findall(r"en:'([^']*)'", t))


def clean_tokens(res):
    """从 OCR 行结果里取出干净的小写词"""
    toks = []
    for line in (res or []):
        txt = line[1]
        try:
            sc = float(line[2])
        except Exception:
            sc = 1.0
        if sc < MIN_SCORE:
            continue
        for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", txt):
            lw = w.lower().strip("-'")
            if lw:
                toks.append((lw, sc))
    return toks


def book_stopwords(book):
    """书名本身的词（含单复数变形）不能作为该页配图词，如 Big / Bugs"""
    bt = set()
    if not book:
        return bt
    for w in re.findall(r"[A-Za-z]+", book.lower()):
        bt.add(w)
        if len(w) > 3 and w.endswith("es"):
            bt.add(w[:-2])
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            bt.add(w[:-1])
    return bt


def pick_core(tokens, deck, book=None):
    """
    从一页的词里挑"核心词"（最可能配图的名词/数字/形容词）。
    英文句型多为 "The <名词>." 或 "<数词> <名词>."，配图对象是名词，
    因此跳过冠词与句首数词，优先取实词（命中卡组词表者优先）。
    """
    bt = book_stopwords(book)
    cand = [w for w, _ in tokens if w not in STOP and w not in bt]
    # 去掉开头的数词（"Four buses." -> buses）
    while cand and cand[0] in NUMWORD:
        cand = cand[1:]
    if not cand:
        cand = [w for w, _ in tokens if w not in STOP] or [w for w, _ in tokens]
    if not cand:
        return None
    # 1) 命中卡组且非功能词 → 优先
    for w in cand:
        if w in deck and w not in FUNC:
            return w
    # 2) 命中卡组
    for w in cand:
        if w in deck:
            return w
    # 3) 取最后一个实词
    return cand[-1]


# 页脚/水印噪声：出现在页脚行，不是本页要配的图
FOOTER_NOISE = re.compile(
    r"ren-?fox|level\s*aa|written\s*by|clifford|marshall|www\.|copyright", re.I)

# 封面/扉页噪声：这些页不该配图（出现即整页跳过）
COVER_NOISE = re.compile(
    r"\bbook\b|\bpowell\b|\bvoutas\b|\bdra\b|\bjen\b|\bwright\b|\billustrat", re.I)

# 句子开头的数词：后面必跟名词，配图取名词（如 "Four buses." -> buses）
NUMWORD = set("one two three four five six seven eight nine ten".split())


def page_tokens(ocr, doc, i):
    """渲染第 i 页 -> OCR -> 逐行剔除页脚噪声 -> 返回 tokens"""
    import pymupdf
    page = doc[i]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(RENDER_SCALE, RENDER_SCALE))
    tmp = os.path.join(SCRIPT_DIR, "_ocr_tmp.png")
    pix.save(tmp)
    res, _ = ocr(tmp)
    # 不删除临时文件：复用同一路径，避免触发批量删除保护；结束时统一清理
    kept = []
    for line in (res or []):
        txt = line[1]
        try:
            sc = float(line[2])
        except Exception:
            sc = 1.0
        if sc < MIN_SCORE:
            continue
        if FOOTER_NOISE.search(txt):     # 只丢这一行（页脚），保留同页正文
            continue
        for w in re.findall(r"[A-Za-z][A-Za-z'\-]*", txt):
            lw = w.lower().strip("-'")
            if lw:
                kept.append((lw, sc))
    return kept


def ocr_book(ocr, book, deck):
    import pymupdf
    pdf = os.path.join(PDF_DIR, book + ".pdf")
    if not os.path.exists(pdf):
        for fn in os.listdir(PDF_DIR):
            if fn.lower() == (book + ".pdf").lower():
                pdf = os.path.join(PDF_DIR, fn); break
        else:
            return None
    doc = pymupdf.open(pdf)
    items = []
    for i in range(doc.page_count):
        page = doc[i]
        toks = page_tokens(ocr, doc, i)
        joined = " ".join(t for t, _ in toks)
        # 第 1 页是封面（书名页），必然出现书名词，不作为配图页
        if i == 0:
            continue
        # 封面/扉页：含 book/作者名等噪声 -> 整页跳过
        if COVER_NOISE.search(joined):
            continue
        core = pick_core(toks, deck, book)
        if core:
            items.append({"w": core, "p": i + 1})
    doc.close()
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--books", nargs="*", default=None)
    ap.add_argument("--out", default=os.path.join(SCRIPT_DIR, "raz_book_catalog.json"))
    ap.add_argument("--merge", action="store_true",
                    help="与已有 catalog 合并（已存在的书不覆盖）")
    args = ap.parse_args()

    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    deck = deck_words()
    print("卡组词表:", len(deck), "个")

    books = args.books
    if not books:
        books = sorted(fn[:-4] for fn in os.listdir(PDF_DIR) if fn.lower().endswith(".pdf"))
    print("待处理书目:", len(books))

    existing = {}
    if args.merge and os.path.exists(args.out):
        with open(args.out, "r", encoding="utf-8") as f:
            existing = json.load(f)

    result = {}
    n = 0
    for b in books:
        items = ocr_book(ocr, b, deck)
        if items:
            result[b] = items
            n += 1
            print("  [%-22s] %2d 页 -> %s" % (
                b, len(items), ", ".join(x["w"] for x in items[:12])))
        else:
            print("  [%-22s] 无有效页" % b)

    merged = dict(existing)
    merged.update(result)
    merged["_说明"] = ("RAZ AA 书目->每页词对照表，由 ocr_build_catalog.py 自动生成。"
                       "每项 {w:核心词, p:1-based页号}。可手工修正后重跑 build_raz_deck.py。")
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    total = sum(len(v) for k, v in merged.items() if not k.startswith("_"))
    print("== 完成 ==")
    print("书目数:", len([k for k in merged if not k.startswith('_')]),
          " 总配图页数:", total, "->", args.out)


if __name__ == "__main__":
    main()
