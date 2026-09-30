/** alg440-data.js - 440 单式训练公式清单（与连拧组页一一对应） */
window.ALG440 = {
  groupOrder: ["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "W", "X", "Y", "Z"],
  groups: {
    "C": ["CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL", "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CW", "CX", "CY", "CZ"],
    "D": ["DE", "DF", "DG", "DH", "DI", "DJ", "DK", "DL", "DM", "DN", "DO", "DP", "DQ", "DR", "DS", "DT", "DW", "DX", "DY", "DZ"],
    "E": ["EC", "ED", "EG", "EH", "EI", "EJ", "EK", "EL", "EM", "EN", "EO", "EP", "EQ", "ER", "ES", "ET", "EW", "EX", "EY", "EZ"],
    "F": ["FC", "FD", "FG", "FH", "FI", "FJ", "FK", "FL", "FM", "FN", "FO", "FP", "FQ", "FR", "FS", "FT", "FW", "FX", "FY", "FZ"],
    "G": ["GC", "GD", "GE", "GF", "GI", "GJ", "GK", "GL", "GM", "GN", "GO", "GP", "GQ", "GR", "GS", "GT", "GW", "GX", "GY", "GZ"],
    "H": ["HC", "HD", "HE", "HF", "HI", "HJ", "HK", "HL", "HM", "HN", "HO", "HP", "HQ", "HR", "HS", "HT", "HW", "HX", "HY", "HZ"],
    "I": ["IC", "ID", "IE", "IF", "IG", "IH", "IK", "IL", "IM", "IN", "IO", "IP", "IQ", "IR", "IS", "IT", "IW", "IX", "IY", "IZ"],
    "J": ["JC", "JD", "JE", "JF", "JG", "JH", "JK", "JL", "JM", "JN", "JO", "JP", "JQ", "JR", "JS", "JT", "JW", "JX", "JY", "JZ"],
    "K": ["KC", "KD", "KE", "KF", "KG", "KH", "KI", "KJ", "KM", "KN", "KO", "KP", "KQ", "KR", "KS", "KT", "KW", "KX", "KY", "KZ"],
    "L": ["LC", "LD", "LE", "LF", "LG", "LH", "LI", "LJ", "LM", "LN", "LO", "LP", "LQ", "LR", "LS", "LT", "LW", "LX", "LY", "LZ"],
    "M": ["MC", "MD", "ME", "MF", "MG", "MH", "MI", "MJ", "MK", "ML", "MO", "MP", "MQ", "MR", "MS", "MT", "MW", "MX", "MY", "MZ"],
    "N": ["NC", "ND", "NE", "NF", "NG", "NH", "NI", "NJ", "NK", "NL", "NO", "NP", "NQ", "NR", "NS", "NT", "NW", "NX", "NY", "NZ"],
    "O": ["OC", "OD", "OE", "OF", "OG", "OH", "OI", "OJ", "OK", "OL", "OM", "ON", "OQ", "OR", "OS", "OT", "OW", "OX", "OY", "OZ"],
    "P": ["PC", "PD", "PE", "PF", "PG", "PH", "PI", "PJ", "PK", "PL", "PM", "PN", "PQ", "PR", "PS", "PT", "PW", "PX", "PY", "PZ"],
    "Q": ["QC", "QD", "QE", "QF", "QG", "QH", "QI", "QJ", "QK", "QL", "QM", "QN", "QO", "QP", "QS", "QT", "QW", "QX", "QY", "QZ"],
    "R": ["RC", "RD", "RE", "RF", "RG", "RH", "RI", "RJ", "RK", "RL", "RM", "RN", "RO", "RP", "RS", "RT", "RW", "RX", "RY", "RZ"],
    "S": ["SC", "SD", "SE", "SF", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SP", "SQ", "SR", "SW", "SX", "SY", "SZ"],
    "T": ["TC", "TD", "TE", "TF", "TG", "TH", "TI", "TJ", "TK", "TL", "TM", "TN", "TO", "TP", "TQ", "TR", "TW", "TX", "TY", "TZ"],
    "W": ["WC", "WD", "WE", "WF", "WG", "WH", "WI", "WJ", "WK", "WL", "WM", "WN", "WO", "WP", "WQ", "WR", "WS", "WT", "WY", "WZ"],
    "X": ["XC", "XD", "XE", "XF", "XG", "XH", "XI", "XJ", "XK", "XL", "XM", "XN", "XO", "XP", "XQ", "XR", "XS", "XT", "XY", "XZ"],
    "Y": ["YC", "YD", "YE", "YF", "YG", "YH", "YI", "YJ", "YK", "YL", "YM", "YN", "YO", "YP", "YQ", "YR", "YS", "YT", "YW", "YX"],
    "Z": ["ZC", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ", "ZK", "ZL", "ZM", "ZN", "ZO", "ZP", "ZQ", "ZR", "ZS", "ZT", "ZW", "ZX"],
  },
  all: ["CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL", "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CW", "CX", "CY", "CZ", "DE", "DF", "DG", "DH", "DI", "DJ", "DK", "DL", "DM", "DN", "DO", "DP", "DQ", "DR", "DS", "DT", "DW", "DX", "DY", "DZ", "EC", "ED", "EG", "EH", "EI", "EJ", "EK", "EL", "EM", "EN", "EO", "EP", "EQ", "ER", "ES", "ET", "EW", "EX", "EY", "EZ", "FC", "FD", "FG", "FH", "FI", "FJ", "FK", "FL", "FM", "FN", "FO", "FP", "FQ", "FR", "FS", "FT", "FW", "FX", "FY", "FZ", "GC", "GD", "GE", "GF", "GI", "GJ", "GK", "GL", "GM", "GN", "GO", "GP", "GQ", "GR", "GS", "GT", "GW", "GX", "GY", "GZ", "HC", "HD", "HE", "HF", "HI", "HJ", "HK", "HL", "HM", "HN", "HO", "HP", "HQ", "HR", "HS", "HT", "HW", "HX", "HY", "HZ", "IC", "ID", "IE", "IF", "IG", "IH", "IK", "IL", "IM", "IN", "IO", "IP", "IQ", "IR", "IS", "IT", "IW", "IX", "IY", "IZ", "JC", "JD", "JE", "JF", "JG", "JH", "JK", "JL", "JM", "JN", "JO", "JP", "JQ", "JR", "JS", "JT", "JW", "JX", "JY", "JZ", "KC", "KD", "KE", "KF", "KG", "KH", "KI", "KJ", "KM", "KN", "KO", "KP", "KQ", "KR", "KS", "KT", "KW", "KX", "KY", "KZ", "LC", "LD", "LE", "LF", "LG", "LH", "LI", "LJ", "LM", "LN", "LO", "LP", "LQ", "LR", "LS", "LT", "LW", "LX", "LY", "LZ", "MC", "MD", "ME", "MF", "MG", "MH", "MI", "MJ", "MK", "ML", "MO", "MP", "MQ", "MR", "MS", "MT", "MW", "MX", "MY", "MZ", "NC", "ND", "NE", "NF", "NG", "NH", "NI", "NJ", "NK", "NL", "NO", "NP", "NQ", "NR", "NS", "NT", "NW", "NX", "NY", "NZ", "OC", "OD", "OE", "OF", "OG", "OH", "OI", "OJ", "OK", "OL", "OM", "ON", "OQ", "OR", "OS", "OT", "OW", "OX", "OY", "OZ", "PC", "PD", "PE", "PF", "PG", "PH", "PI", "PJ", "PK", "PL", "PM", "PN", "PQ", "PR", "PS", "PT", "PW", "PX", "PY", "PZ", "QC", "QD", "QE", "QF", "QG", "QH", "QI", "QJ", "QK", "QL", "QM", "QN", "QO", "QP", "QS", "QT", "QW", "QX", "QY", "QZ", "RC", "RD", "RE", "RF", "RG", "RH", "RI", "RJ", "RK", "RL", "RM", "RN", "RO", "RP", "RS", "RT", "RW", "RX", "RY", "RZ", "SC", "SD", "SE", "SF", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SP", "SQ", "SR", "SW", "SX", "SY", "SZ", "TC", "TD", "TE", "TF", "TG", "TH", "TI", "TJ", "TK", "TL", "TM", "TN", "TO", "TP", "TQ", "TR", "TW", "TX", "TY", "TZ", "WC", "WD", "WE", "WF", "WG", "WH", "WI", "WJ", "WK", "WL", "WM", "WN", "WO", "WP", "WQ", "WR", "WS", "WT", "WY", "WZ", "XC", "XD", "XE", "XF", "XG", "XH", "XI", "XJ", "XK", "XL", "XM", "XN", "XO", "XP", "XQ", "XR", "XS", "XT", "XY", "XZ", "YC", "YD", "YE", "YF", "YG", "YH", "YI", "YJ", "YK", "YL", "YM", "YN", "YO", "YP", "YQ", "YR", "YS", "YT", "YW", "YX", "ZC", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ", "ZK", "ZL", "ZM", "ZN", "ZO", "ZP", "ZQ", "ZR", "ZS", "ZT", "ZW", "ZX"]
};
