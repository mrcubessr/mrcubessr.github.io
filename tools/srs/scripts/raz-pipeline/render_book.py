#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
辅助：把某本（或某几本）RAZ PDF 的每页渲染成一张拼图 PNG，
便于人工/子代理肉眼判断「哪一页是哪个词」，再写进 raz_book_catalog.json。

用法：
  python render_book.py "Farm Animals"        # 单本
  python render_book.py --all                 # 批量渲染 PDF_DIR 下全部书
  python render_book.py "Water" "Winter"      # 多本
依赖：pip install pymupdf pillow
"""
import os, sys, argparse
import fitz
from PIL import Image

PDF_DIR = r"E:/01.RAZ绘本PDF点读版/AA.PDF"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "montages")

def render_one(book, out_dir):
    pdf = os.path.join(PDF_DIR, book + ".pdf")
    if not os.path.exists(pdf):
        for fn in os.listdir(PDF_DIR):
            if fn.lower() == (book + ".pdf").lower():
                pdf = os.path.join(PDF_DIR, fn); break
        else:
            print("跳过（无 PDF）:", book); return
    doc = fitz.open(pdf)
    pages = []
    for i in range(doc.page_count):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(1.4, 1.4))
        tmp = os.path.join(out_dir, "_p%d.png" % (i + 1))
        pix.save(tmp)
        pages.append(Image.open(tmp).convert("RGB"))
    doc.close()
    # 拼成 2 列
    cols = 2
    w = max(p.width for p in pages)
    h = max(p.height for p in pages)
    rows = (len(pages) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, h * rows), (255, 255, 255))
    for idx, p in enumerate(pages):
        r, c = divmod(idx, cols)
        sheet.paste(p, (c * w, r * h))
    out = os.path.join(out_dir, "montage_%s.png" % book.replace(" ", "_"))
    sheet.save(out)
    for i in range(len(pages)):
        os.remove(os.path.join(out_dir, "_p%d.png" % (i + 1)))
    print("生成拼图:", out, "(%d 页)" % len(pages))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("books", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    if args.all:
        names = [fn[:-4] for fn in os.listdir(PDF_DIR) if fn.lower().endswith(".pdf")]
        for n in names:
            render_one(n, OUT_DIR)
    else:
        for b in args.books:
            render_one(b, OUT_DIR)

if __name__ == "__main__":
    main()
