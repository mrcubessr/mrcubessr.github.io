#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Add the 80 missing (G/H) A-entries to the site's info-style library.

Only the 'info' style has a complete 440 source locally (the user's
全量表440_正确版). manmade/nightmare are left untouched (no source data).
"""
import json

SITE_LIB = "D:/魔方站点备份/fto-site/tools/scramble-uf/edgeAlgToInfo.json"
LIB440 = "D:/魔方站点备份/fto-site/tools/scramble-uf/_edgeAlgToInfo440.json"

site = json.load(open(SITE_LIB, encoding='utf-8'))
lib440 = json.load(open(LIB440, encoding='utf-8'))

added = []
for key, algs in lib440.items():
    if key not in site:
        site[key] = algs  # info format: list of formula strings
        added.append(key)

json.dump(site, open(SITE_LIB, 'w', encoding='utf-8'), ensure_ascii=False)

A = [k for k in site if k.startswith('A')]
G = [k for k in site if k.startswith('G')]
print('added', len(added), 'A-entries:', added)
print('site A count now:', len(A), '| G count:', len(G))
print('has ACG?', 'ACG' in site, '| AFG?', 'AFG' in site, '| ACH?', 'ACH' in site)
