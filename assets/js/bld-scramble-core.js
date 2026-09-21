/*!
 * bld-scramble-core.js — 三盲定向打乱共享引擎（唯一数据源）
 * 内容：min2phase 求解器 + spooncuber 读码引擎（彳亍法 A-Z 去 U/V 口径）+ 参数化定向生成器。
 * 由 tools/bldscramble/index.html 抽出（2026-09-21），tools/bldscramble 与 tools/practice 共用同一份，
 * 禁止在页面内再复制第二套字母表/读码逻辑。改动后请回归 .workbuddy/outputs/t4.js t5.js t8.js。
 */

var min2phase = (function() {
	var USE_TWST_FLIP_PRUN = true;
	var PARTIAL_INIT_LEVEL = 2;

	var MAX_PRE_MOVES = 20;
	var TRY_INVERSE = true;
	var TRY_THREE_AXES = true;

	var USE_CONJ_PRUN = USE_TWST_FLIP_PRUN;
	var MIN_P1LENGTH_PRE = 7;
	var MAX_DEPTH2 = 13;

	var INVERSE_SOLUTION = 0x2;

	function Search() {
		this.move = [];
		this.moveSol = [];

		this.nodeUD = [];

		this.valid1 = 0;
		this.allowShorter = false;
		this.cc = new CubieCube();
		this.urfCubieCube = [];
		this.urfCoordCube = [];
		this.phase1Cubie = [];

		this.preMoveCubes = [];
		this.preMoves = [];
		this.preMoveLen = 0;
		this.maxPreMoves = 0;

		this.isRec = false;
		for (var i = 0; i < 21; i++) {
			this.nodeUD[i] = new CoordCube();
			this.phase1Cubie[i] = new CubieCube();
		}
		for (var i = 0; i < 6; i++) {
			this.urfCubieCube[i] = new CubieCube();
			this.urfCoordCube[i] = new CoordCube();
		}
		for (var i = 0; i < MAX_PRE_MOVES; i++) {
			this.preMoveCubes[i + 1] = new CubieCube();
		}
	}

	var Ux1 = 0;
	var Ux2 = 1;
	var Ux3 = 2;
	var Rx1 = 3;
	var Rx2 = 4;
	var Rx3 = 5;
	var Fx1 = 6;
	var Fx2 = 7;
	var Fx3 = 8;
	var Dx1 = 9;
	var Dx2 = 10;
	var Dx3 = 11;
	var Lx1 = 12;
	var Lx2 = 13;
	var Lx3 = 14;
	var Bx1 = 15;
	var Bx2 = 16;
	var Bx3 = 17;

	var N_MOVES = 18;
	var N_MOVES2 = 10;
	var N_FLIP = 2048;
	var N_FLIP_SYM = 336;
	var N_TWST = 2187;
	var N_TWST_SYM = 324;
	var N_PERM = 40320;
	var N_PERM_SYM = 2768;
	var N_MPERM = 24;
	var N_SLICE = 495;
	var N_COMB = 140;

	var SYM_E2C_MAGIC = 0x00DDDD00;
	var Cnk = [];
	var fact = [1];
	var move2str = [
		"U ", "U2", "U'", "R ", "R2", "R'", "F ", "F2", "F'",
		"D ", "D2", "D'", "L ", "L2", "L'", "B ", "B2", "B'"
	];
	var ud2std = [Ux1, Ux2, Ux3, Rx2, Fx2, Dx1, Dx2, Dx3, Lx2, Bx2, Rx1, Rx3, Fx1, Fx3, Lx1, Lx3, Bx1, Bx3];
	var std2ud = [];
	var ckmv2bit = [];
	var urfMove = [
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
		[6, 7, 8, 0, 1, 2, 3, 4, 5, 15, 16, 17, 9, 10, 11, 12, 13, 14],
		[3, 4, 5, 6, 7, 8, 0, 1, 2, 12, 13, 14, 15, 16, 17, 9, 10, 11],
		[2, 1, 0, 5, 4, 3, 8, 7, 6, 11, 10, 9, 14, 13, 12, 17, 16, 15],
		[8, 7, 6, 2, 1, 0, 5, 4, 3, 17, 16, 15, 11, 10, 9, 14, 13, 12],
		[5, 4, 3, 8, 7, 6, 2, 1, 0, 14, 13, 12, 17, 16, 15, 11, 10, 9]
	];

	{ // init util
		for (var i = 0; i < 18; i++) {
			std2ud[ud2std[i]] = i;
		}
		for (var i = 0; i < 10; i++) {
			var ix = ~~(ud2std[i] / 3);
			ckmv2bit[i] = 0;
			for (var j = 0; j < 10; j++) {
				var jx = ~~(ud2std[j] / 3);
				ckmv2bit[i] |= ((ix == jx) || ((ix % 3 == jx % 3) && (ix >= jx)) ? 1 : 0) << j;
			}
		}
		ckmv2bit[10] = 0;
		for (var i = 0; i < 13; i++) {
			Cnk[i] = [];
			fact[i + 1] = fact[i] * (i + 1);
			Cnk[i][0] = Cnk[i][i] = 1;
			for (var j = 1; j < 13; j++) {
				Cnk[i][j] = j <= i ? Cnk[i - 1][j - 1] + Cnk[i - 1][j] : 0;
			}
		}
	}

	function setPruning(table, index, value) {
		table[index >> 3] ^= value << (index << 2); // index << 2 <=> (index & 7) << 2
	}

	function getPruning(table, index) {
		return table[index >> 3] >> (index << 2) & 0xf; // index << 2 <=> (index & 7) << 2
	}

	function getPruningMax(maxValue, table, index) {
		return Math.min(maxValue, table[index >> 3] >> (index << 2) & 0xf);
	}

	function hasZero(val) {
		return ((val - 0x11111111) & ~val & 0x88888888) != 0;
	}

	function ESym2CSym(idx) {
		return idx ^ (SYM_E2C_MAGIC >> ((idx & 0xf) << 1) & 3);
	}

	function getPermSymInv(idx, sym, isCorner) {
		var idxi = PermInvEdgeSym[idx];
		if (isCorner) {
			idxi = ESym2CSym(idxi);
		}
		return idxi & 0xfff0 | SymMult[idxi & 0xf][sym];
	}

	function CubieCube() {
		this.ca = [0, 1, 2, 3, 4, 5, 6, 7];
		this.ea = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
	}

	function setNPerm(arr, idx, n) {
		n--;
		var val = 0x76543210;
		for (var i = 0; i < n; ++i) {
			var p = fact[n - i];
			var v = ~~(idx / p);
			idx %= p;
			v <<= 2;
			arr[i] = arr[i] & 0xf0 | val >> v & 0xf;
			var m = (1 << v) - 1;
			val = (val & m) + (val >> 4 & ~m);
		}
		arr[n] = arr[n] & 0xf0 | val & 0xf;
	}

	function getNPerm(arr, n) {
		var idx = 0,
			val = 0x76543210;
		for (var i = 0; i < n - 1; ++i) {
			var v = (arr[i] & 0xf) << 2;
			idx = (n - i) * idx + (val >> v & 0xf);
			val -= 0x11111110 << v;
		}
		return idx;
	}

	function setNPermFull(arr, idx, n) {
		arr[n - 1] = arr[n - 1] & 0xf0;
		for (var i = n - 2; i >= 0; --i) {
			arr[i] = arr[i] & 0xf0 | idx % (n - i);
			idx = ~~(idx / (n - i));
			for (var j = i + 1; j < n; ++j) {
				if ((arr[j] & 0xf) >= (arr[i] & 0xf)) {
					arr[j] += 1;
				}
			}
		}
	}

	function getNPermFull(arr, n) {
		var idx = 0;
		for (var i = 0; i < n; ++i) {
			idx *= n - i;
			for (var j = i + 1; j < n; ++j) {
				if ((arr[j] & 0xf) < (arr[i] & 0xf)) {
					++idx;
				}
			}
		}
		return idx;
	}

	function getComb(arr, mask) {
		var end = arr.length - 1;
		var idxC = 0,
			r = 4;
		for (var i = end; i >= 0; i--) {
			var perm = arr[i] & 0xf;
			if ((perm & 0xc) == mask) {
				idxC += Cnk[i][r--];
			}
		}
		return idxC;
	}

	function setComb(arr, idxC, mask) {
		var end = arr.length - 1;
		var r = 4,
			fill = end;
		for (var i = end; i >= 0; i--) {
			if (idxC >= Cnk[i][r]) {
				idxC -= Cnk[i][r--];
				arr[i] = arr[i] & 0xf0 | r | mask;
			} else {
				if ((fill & 0xc) == mask) {
					fill -= 4;
				}
				arr[i] = arr[i] & 0xf0 | fill--;
			}
		}
	}

	function getNParity(idx, n) {
		var p = 0;
		for (var i = n - 2; i >= 0; i--) {
			p ^= idx % (n - i);
			idx = ~~(idx / (n - i));
		}
		return p & 1;
	}
	CubieCube.EdgeMult = function(a, b, prod) {
		for (var ed = 0; ed < 12; ed++) {
			prod.ea[ed] = a.ea[b.ea[ed] & 0xf] ^ (b.ea[ed] & 0x10);
		}
	}
	CubieCube.CornMult = function(a, b, prod) {
		for (var corn = 0; corn < 8; corn++) {
			var ori = ((a.ca[b.ca[corn] & 0xf] >> 4) + (b.ca[corn] >> 4)) % 3;
			prod.ca[corn] = a.ca[b.ca[corn] & 0xf] & 0xf | ori << 4;
		}
	}
	CubieCube.CornMultFull = function(a, b, prod) {
		for (var corn = 0; corn < 8; corn++) {
			var oriA = a.ca[b.ca[corn] & 0xf] >> 4;
			var oriB = b.ca[corn] >> 4;
			var ori = oriA + ((oriA < 3) ? oriB : 6 - oriB);
			ori = ori % 3 + ((oriA < 3) == (oriB < 3) ? 0 : 3);
			prod.ca[corn] = a.ca[b.ca[corn] & 0xf] & 0xf | ori << 4;
		}
	}
	CubieCube.CornConjugate = function(a, idx, b) {
		var sinv = SymCube[SymMultInv[0][idx]];
		var s = SymCube[idx];
		for (var corn = 0; corn < 8; corn++) {
			var oriA = sinv.ca[a.ca[s.ca[corn] & 0xf] & 0xf] >> 4;
			var oriB = a.ca[s.ca[corn] & 0xf] >> 4;
			var ori = (oriA < 3) ? oriB : (3 - oriB) % 3;
			b.ca[corn] = sinv.ca[a.ca[s.ca[corn] & 0xf] & 0xf] & 0xf | ori << 4;
		}
	}
	CubieCube.EdgeConjugate = function(a, idx, b) {
		var sinv = SymCube[SymMultInv[0][idx]];
		var s = SymCube[idx];
		for (var ed = 0; ed < 12; ed++) {
			b.ea[ed] = sinv.ea[a.ea[s.ea[ed] & 0xf] & 0xf] ^ (a.ea[s.ea[ed] & 0xf] & 0x10) ^ (s.ea[ed] & 0x10);
		}
	}
	CubieCube.prototype.init = function(ca, ea) {
		this.ca = ca.slice();
		this.ea = ea.slice();
		return this;
	}
	CubieCube.prototype.initCoord = function(cperm, twst, eperm, flip) {
		setNPerm(this.ca, cperm, 8);
		this.setTwst(twst);
		setNPermFull(this.ea, eperm, 12);
		this.setFlip(flip);
		return this;
	}
	CubieCube.prototype.isEqual = function(c) {
		for (var i = 0; i < 8; i++) {
			if (this.ca[i] != c.ca[i]) {
				return false;
			}
		}
		for (var i = 0; i < 12; i++) {
			if (this.ea[i] != c.ea[i]) {
				return false;
			}
		}
		return true;
	}
	CubieCube.prototype.setFlip = function(idx) {
		var parity = 0;
		for (var i = 10; i >= 0; i--, idx >>= 1) {
			this.ea[i] = this.ea[i] & 0xf | (idx & 1) << 4;
			parity ^= this.ea[i];
		}
		this.ea[11] = this.ea[11] & 0xf | parity & 0x10;
	}
	CubieCube.prototype.getFlip = function() {
		var idx = 0;
		for (var i = 0; i < 11; i++) {
			idx = idx << 1 | this.ea[i] >> 4 & 1;
		}
		return idx;
	}
	CubieCube.prototype.getFlipSym = function() {
		return FlipR2S[this.getFlip()];
	}
	CubieCube.prototype.setTwst = function(idx) {
		var twst = 15;
		for (var i = 6; i >= 0; i--, idx = ~~(idx / 3)) {
			this.ca[i] = this.ca[i] & 0xf | idx % 3 << 4;
			twst -= this.ca[i] >> 4;
		}
		this.ca[7] = this.ca[7] & 0xf | (twst % 3) << 4;
	}
	CubieCube.prototype.getTwst = function() {
		var idx = 0;
		for (var i = 0; i < 7; i++) {
			idx += (idx << 1) + (this.ca[i] >> 4);
		}
		return idx;
	}
	CubieCube.prototype.getTwstSym = function() {
		return TwstR2S[this.getTwst()];
	}
	CubieCube.prototype.setCPerm = function(idx) {
		setNPerm(this.ca, idx, 8);
	}
	CubieCube.prototype.getCPerm = function() {
		return getNPerm(this.ca, 8);
	}
	CubieCube.prototype.getCPermSym = function() {
		return ESym2CSym(EPermR2S[getNPerm(this.ca, 8)]);
	}
	CubieCube.prototype.setEPerm = function(idx) {
		setNPerm(this.ea, idx, 8);
	}
	CubieCube.prototype.getEPerm = function() {
		return getNPerm(this.ea, 8);
	}
	CubieCube.prototype.getEPermSym = function() {
		return EPermR2S[getNPerm(this.ea, 8)];
	}
	CubieCube.prototype.getSlice = function() {
		return 494 - getComb(this.ea, 8);
	}
	CubieCube.prototype.setSlice = function(idx) {
		setComb(this.ea, 494 - idx, 8);
	}
	CubieCube.prototype.getMPerm = function() {
		return getNPermFull(this.ea, 12) % 24;
	}
	CubieCube.prototype.setMPerm = function(idx) {
		setNPermFull(this.ea, idx, 12);
	}
	CubieCube.prototype.getCComb = function() {
		return getComb(this.ca, 0);
	}
	CubieCube.prototype.setCComb = function(idx) {
		setComb(this.ca, idx, 0);
	}
	CubieCube.prototype.URFConjugate = function() {
		var temps = new CubieCube();
		CubieCube.CornMult(CubieCube.urf2, this, temps);
		CubieCube.CornMult(temps, CubieCube.urf1, this);
		CubieCube.EdgeMult(CubieCube.urf2, this, temps);
		CubieCube.EdgeMult(temps, CubieCube.urf1, this);
	}
	var cornerFacelet = [
		[8, 9, 20],
		[6, 18, 38],
		[0, 36, 47],
		[2, 45, 11],
		[29, 26, 15],
		[27, 44, 24],
		[33, 53, 42],
		[35, 17, 51]
	];
	var edgeFacelet = [
		[5, 10],
		[7, 19],
		[3, 37],
		[1, 46],
		[32, 16],
		[28, 25],
		[30, 43],
		[34, 52],
		[23, 12],
		[21, 41],
		[50, 39],
		[48, 14]
	];
	CubieCube.prototype.toFaceCube = function(cFacelet, eFacelet) {
		cFacelet = cFacelet || cornerFacelet;
		eFacelet = eFacelet || edgeFacelet;
		var ts = "URFDLB";
		var f = [];
		for (var i = 0; i < 54; i++) {
			f[i] = ts[~~(i / 9)];
		}
		for (var c = 0; c < 8; c++) {
			var j = this.ca[c] & 0xf; // cornercubie with index j is at
			var ori = this.ca[c] >> 4; // Orientation of this cubie
			for (var n = 0; n < 3; n++)
				f[cFacelet[c][(n + ori) % 3]] = ts[~~(cFacelet[j][n] / 9)];
		}
		for (var e = 0; e < 12; e++) {
			var j = this.ea[e] & 0xf; // edgecubie with index j is at edgeposition
			var ori = this.ea[e] >> 4; // Orientation of this cubie
			for (var n = 0; n < 2; n++)
				f[eFacelet[e][(n + ori) % 2]] = ts[~~(eFacelet[j][n] / 9)];
		}
		return f.join("");
	}
	CubieCube.prototype.invFrom = function(cc) {
		for (var edge = 0; edge < 12; edge++) {
			this.ea[cc.ea[edge] & 0xf] = edge & 0xf | cc.ea[edge] & 0x10;
		}
		for (var corn = 0; corn < 8; corn++) {
			this.ca[cc.ca[corn] & 0xf] = corn | 0x40 >> (cc.ca[corn] >> 4) & 0x30;
		}
		return this;
	}
	CubieCube.prototype.fromFacelet = function(facelet, cFacelet, eFacelet) {
		cFacelet = cFacelet || cornerFacelet;
		eFacelet = eFacelet || edgeFacelet;
		var count = 0;
		var f = [];
		var centers = facelet[4] + facelet[13] + facelet[22] + facelet[31] + facelet[40] + facelet[49];
		for (var i = 0; i < 54; ++i) {
			f[i] = centers.indexOf(facelet[i]);
			if (f[i] == -1) {
				return -1;
			}
			count += 1 << (f[i] << 2);
		}
		if (count != 0x999999) {
			return -1;
		}
		var col1, col2, i, j, ori;
		for (i = 0; i < 8; ++i) {
			for (ori = 0; ori < 3; ++ori)
				if (f[cFacelet[i][ori]] == 0 || f[cFacelet[i][ori]] == 3)
					break;
			col1 = f[cFacelet[i][(ori + 1) % 3]];
			col2 = f[cFacelet[i][(ori + 2) % 3]];
			for (j = 0; j < 8; ++j) {
				if (col1 == ~~(cFacelet[j][1] / 9) && col2 == ~~(cFacelet[j][2] / 9)) {
					this.ca[i] = j | ori % 3 << 4;
					break;
				}
			}
		}
		for (i = 0; i < 12; ++i) {
			for (j = 0; j < 12; ++j) {
				if (f[eFacelet[i][0]] == ~~(eFacelet[j][0] / 9) && f[eFacelet[i][1]] == ~~(eFacelet[j][1] / 9)) {
					this.ea[i] = j;
					break;
				}
				if (f[eFacelet[i][0]] == ~~(eFacelet[j][1] / 9) && f[eFacelet[i][1]] == ~~(eFacelet[j][0] / 9)) {
					this.ea[i] = j | 0x10;
					break;
				}
			}
		}
	}

	function CoordCube() {
		this.twst = 0;
		this.flip = 0;
		this.slice = 0;
		this.prun = 0;
		this.twstc = 0;
		this.flipc = 0;
	}
	CoordCube.prototype.set = function(node) {
		this.twst = node.twst;
		this.flip = node.flip;
		this.slice = node.slice;
		this.prun = node.prun;
		if (USE_CONJ_PRUN) {
			this.twstc = node.twstc;
			this.flipc = node.flipc;
		}
	}
	CoordCube.prototype.calcPruning = function(isPhase1) {
		this.prun = Math.max(
			getPruningMax(SliceTwstPrunMax, SliceTwstPrun,
				(this.twst >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.twst & 7]),
			getPruningMax(SliceFlipPrunMax, SliceFlipPrun,
				(this.flip >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.flip & 7]),
			USE_CONJ_PRUN ? getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
				(this.twstc >> 3) << 11 | FlipS2RF[this.flipc ^ (this.twstc & 7)]) : 0,
			USE_TWST_FLIP_PRUN ? getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
				(this.twst >> 3) << 11 | FlipS2RF[this.flip ^ (this.twst & 7)]) : 0
		);
	}
	CoordCube.prototype.setWithPrun = function(cc, depth) {
		this.twst = cc.getTwstSym();
		this.flip = cc.getFlipSym();
		this.prun = USE_TWST_FLIP_PRUN ? getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
			(this.twst >> 3) << 11 | FlipS2RF[this.flip ^ (this.twst & 7)]) : 0;
		if (this.prun > depth) {
			return false;
		}
		this.slice = cc.getSlice();
		this.prun = Math.max(this.prun,
			getPruningMax(SliceTwstPrunMax, SliceTwstPrun,
				(this.twst >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.twst & 7]),
			getPruningMax(SliceFlipPrunMax, SliceFlipPrun,
				(this.flip >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.flip & 7]));
		if (this.prun > depth) {
			return false;
		}
		if (USE_CONJ_PRUN) {
			var pc = new CubieCube();
			CubieCube.CornConjugate(cc, 1, pc);
			CubieCube.EdgeConjugate(cc, 1, pc);
			this.twstc = pc.getTwstSym();
			this.flipc = pc.getFlipSym();
			this.prun = Math.max(this.prun,
				getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
					(this.twstc >> 3) << 11 | FlipS2RF[this.flipc ^ (this.twstc & 7)]));
		}
		return this.prun <= depth;
	}
	CoordCube.prototype.doMovePrun = function(cc, m, isPhase1) {
		this.slice = SliceMove[cc.slice * N_MOVES + m];
		this.flip = FlipMove[(cc.flip >> 3) * N_MOVES + Sym8Move[m << 3 | cc.flip & 7]] ^ (cc.flip & 7);
		this.twst = TwstMove[(cc.twst >> 3) * N_MOVES + Sym8Move[m << 3 | cc.twst & 7]] ^ (cc.twst & 7);
		this.prun = Math.max(
			getPruningMax(SliceTwstPrunMax, SliceTwstPrun,
				(this.twst >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.twst & 7]),
			getPruningMax(SliceFlipPrunMax, SliceFlipPrun,
				(this.flip >> 3) * N_SLICE + SliceConj[this.slice << 3 | this.flip & 7]),
			USE_TWST_FLIP_PRUN ? getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
				(this.twst >> 3) << 11 | FlipS2RF[this.flip ^ (this.twst & 7)]) : 0);
		return this.prun;
	}
	CoordCube.prototype.doMovePrunConj = function(cc, m) {
		m = SymMove[3][m];
		this.flipc = FlipMove[(cc.flipc >> 3) * N_MOVES + Sym8Move[m << 3 | cc.flipc & 7]] ^ (cc.flipc & 7);
		this.twstc = TwstMove[(cc.twstc >> 3) * N_MOVES + Sym8Move[m << 3 | cc.twstc & 7]] ^ (cc.twstc & 7);
		return getPruningMax(TwstFlipPrunMax, TwstFlipPrun,
			(this.twstc >> 3) << 11 | FlipS2RF[this.flipc ^ (this.twstc & 7)]);
	}
	Search.prototype.solution = function(facelets, maxDepth, probeMax, probeMin, verbose, firstAxisFilter, lastAxisFilter) {
		initPrunTables();
		var check = this.verify(facelets);
		if (check != 0) {
			return "Error " + Math.abs(check);
		}
		if (maxDepth === undefined) {
			maxDepth = 21;
		}
		if (probeMax === undefined) {
			probeMax = 1e9;
		}
		if (probeMin === undefined) {
			probeMin = 0;
		}
		if (verbose === undefined) {
			verbose = 0;
		}
		this.sol = maxDepth + 1;
		this.probe = 0;
		this.probeMax = probeMax;
		this.probeMin = Math.min(probeMin, probeMax);
		this.verbose = verbose;
		this.moveSol = null;
		this.isRec = false;
		this.firstFilters = [0, 0, 0, 0, 0, 0];
		this.lastFilters = [0, 0, 0, 0, 0, 0];
		for (var i = 0; i < 3; i++) {
			if (firstAxisFilter !== undefined) {
				this.firstFilters[i] |= 0xe07 << (~~(urfMove[(3 - i) % 3][firstAxisFilter * 3] / 3)) * 3;
				this.lastFilters[i + 3] |= 0xe07 << (~~(urfMove[(3 - i) % 3][firstAxisFilter * 3] / 3)) * 3;
			}
			if (lastAxisFilter !== undefined) {
				this.lastFilters[i] |= 0xe07 << (~~(urfMove[(3 - i) % 3][lastAxisFilter * 3] / 3)) * 3;
				this.firstFilters[i + 3] |= 0xe07 << (~~(urfMove[(3 - i) % 3][lastAxisFilter * 3] / 3)) * 3;
			}
		}
		this.initSearch();
		return this.search();
	}

	Search.prototype.initSearch = function() {
		this.conjMask = (TRY_INVERSE ? 0 : 0x38) | (TRY_THREE_AXES ? 0 : 0x36);
		this.maxPreMoves = this.conjMask > 7 ? 0 : MAX_PRE_MOVES;

		for (var i = 0; i < 6; i++) {
			this.urfCubieCube[i].init(this.cc.ca, this.cc.ea);
			this.urfCoordCube[i].setWithPrun(this.urfCubieCube[i], 20);
			this.cc.URFConjugate();
			if (i % 3 == 2) {
				var tmp = new CubieCube().invFrom(this.cc);
				this.cc.init(tmp.ca, tmp.ea);
			}
		}
	}

	Search.prototype.next = function(probeMax, probeMin, verbose) {
		this.probe = 0;
		this.probeMax = probeMax;
		this.probeMin = Math.min(probeMin, probeMax);
		this.moveSol = null;
		this.isRec = true;
		this.verbose = verbose;
		return this.search();
	}

	Search.prototype.verify = function(facelets) {
		if (this.cc.fromFacelet(facelets) == -1) {
			return -1;
		}
		var sum = 0;
		var edgeMask = 0;
		for (var e = 0; e < 12; e++) {
			edgeMask |= 1 << (this.cc.ea[e] & 0xf);
			sum ^= this.cc.ea[e] >> 4;
		}
		if (edgeMask != 0xfff) {
			return -2; // missing edges
		}
		if (sum != 0) {
			return -3;
		}
		var cornMask = 0;
		sum = 0;
		for (var c = 0; c < 8; c++) {
			cornMask |= 1 << (this.cc.ca[c] & 0xf);
			sum += this.cc.ca[c] >> 4;
		}
		if (cornMask != 0xff) {
			return -4; // missing corners
		}
		if (sum % 3 != 0) {
			return -5; // twisted corner
		}
		if ((getNParity(getNPermFull(this.cc.ea, 12), 12) ^ getNParity(this.cc.getCPerm(), 8)) != 0) {
			return -6; // parity error
		}
		return 0; // cube ok
	}

	Search.prototype.phase1PreMoves = function(maxl, lm, cc) {
		if (maxl == this.maxPreMoves - 1 && (this.lastFilter >> lm & 1) != 0) {
			return 1;
		}
		this.preMoveLen = this.maxPreMoves - maxl;
		if (this.isRec ? (this.depth1 == this.length1 - this.preMoveLen) :
			(this.preMoveLen == 0 || (0x36FB7 >> lm & 1) == 0)) {
			this.depth1 = this.length1 - this.preMoveLen;
			this.phase1Cubie[0].init(cc.ca, cc.ea) /* = cc*/ ;
			this.allowShorter = this.depth1 == MIN_P1LENGTH_PRE && this.preMoveLen != 0;

			if (this.nodeUD[this.depth1 + 1].setWithPrun(cc, this.depth1) &&
				this.phase1(this.nodeUD[this.depth1 + 1], this.depth1, -1) == 0) {
				return 0;
			}
		}

		if (maxl == 0 || this.preMoveLen + MIN_P1LENGTH_PRE >= this.length1) {
			return 1;
		}

		var skipMoves = 0;
		if (maxl == 1 || this.preMoveLen + 1 + MIN_P1LENGTH_PRE >= this.length1) { //last pre move
			skipMoves |= 0x36FB7; // 11 0110 1111 1011 0111
		}

		lm = ~~(lm / 3) * 3;
		for (var m = 0; m < 18; m++) {
			if (m == lm || m == lm - 9 || m == lm + 9) {
				m += 2;
				continue;
			}
			if (this.isRec && m != this.preMoves[this.maxPreMoves - maxl] || (skipMoves & 1 << m) != 0) {
				continue;
			}
			CubieCube.CornMult(moveCube[m], cc, this.preMoveCubes[maxl]);
			CubieCube.EdgeMult(moveCube[m], cc, this.preMoveCubes[maxl]);
			this.preMoves[this.maxPreMoves - maxl] = m;
			var ret = this.phase1PreMoves(maxl - 1, m, this.preMoveCubes[maxl]);
			if (ret == 0) {
				return 0;
			}
		}
		return 1;
	}

	Search.prototype.search = function() {
		for (this.length1 = this.isRec ? this.length1 : 0; this.length1 < this.sol; this.length1++) {
			for (this.urfIdx = this.isRec ? this.urfIdx : 0; this.urfIdx < 6; this.urfIdx++) {
				if ((this.conjMask & 1 << this.urfIdx) != 0) {
					continue;
				}
				this.firstFilter = this.firstFilters[this.urfIdx];
				this.lastFilter = this.lastFilters[this.urfIdx];
				if (this.phase1PreMoves(this.maxPreMoves, -30, this.urfCubieCube[this.urfIdx], 0) == 0) {
					return this.moveSol == null ? "Error 8" : this.moveSol;
				}
			}
		}
		return this.moveSol == null ? "Error 7" : this.moveSol;
	}

	Search.prototype.initPhase2Pre = function() {
		this.isRec = false;
		if (this.probe >= (this.moveSol == null ? this.probeMax : this.probeMin)) {
			return 0;
		}
		++this.probe;

		for (var i = this.valid1; i < this.depth1; i++) {
			CubieCube.CornMult(this.phase1Cubie[i], moveCube[this.move[i]], this.phase1Cubie[i + 1]);
			CubieCube.EdgeMult(this.phase1Cubie[i], moveCube[this.move[i]], this.phase1Cubie[i + 1]);
		}
		this.valid1 = this.depth1;

		var ret = this.initPhase2(this.phase1Cubie[this.depth1]);
		if (ret == 0 || this.preMoveLen == 0 || ret == 2) {
			return ret;
		}

		var m = ~~(this.preMoves[this.preMoveLen - 1] / 3) * 3 + 1;
		CubieCube.CornMult(moveCube[m], this.phase1Cubie[this.depth1], this.phase1Cubie[this.depth1 + 1]);
		CubieCube.EdgeMult(moveCube[m], this.phase1Cubie[this.depth1], this.phase1Cubie[this.depth1 + 1]);

		this.preMoves[this.preMoveLen - 1] += 2 - this.preMoves[this.preMoveLen - 1] % 3 * 2;
		ret = this.initPhase2(this.phase1Cubie[this.depth1 + 1]);
		this.preMoves[this.preMoveLen - 1] += 2 - this.preMoves[this.preMoveLen - 1] % 3 * 2;
		return ret;
	}
	Search.prototype.initPhase2 = function(phase2Cubie) {
		var p2corn = phase2Cubie.getCPermSym();
		var p2csym = p2corn & 0xf;
		p2corn >>= 4;
		var p2edge = phase2Cubie.getEPermSym();
		var p2esym = p2edge & 0xf;
		p2edge >>= 4;
		var p2mid = phase2Cubie.getMPerm();
		var prun = Math.max(
			getPruningMax(EPermCCombPPrunMax, EPermCCombPPrun,
				p2edge * N_COMB + CCombPConj[(Perm2CombP[p2corn] & 0xff) << 4 | SymMultInv[p2esym][p2csym]]),
			getPruningMax(MCPermPrunMax, MCPermPrun,
				p2corn * N_MPERM + MPermConj[p2mid << 4 | p2csym]));
		var maxDep2 = Math.min(MAX_DEPTH2, this.sol - this.length1);
		if (prun >= maxDep2) {
			return prun > maxDep2 ? 2 : 1;
		}
		var depth2;
		for (depth2 = maxDep2 - 1; depth2 >= prun; depth2--) {
			var ret = this.phase2(p2edge, p2esym, p2corn, p2csym, p2mid, depth2, this.depth1, 10);
			if (ret < 0) {
				break;
			}
			depth2 -= ret;
			this.moveSol = [];
			for (var i = 0; i < this.depth1 + depth2; i++) {
				this.appendSolMove(this.move[i]);
			}
			for (var i = this.preMoveLen - 1; i >= 0; i--) {
				this.appendSolMove(this.preMoves[i]);
			}
			this.sol = this.moveSol.length;
			this.moveSol = this.solutionToString();
		}
		if (depth2 != maxDep2 - 1) { //At least one solution has been found.
			return this.probe >= this.probeMin ? 0 : 1;
		} else {
			return 1;
		}
	}
	Search.prototype.phase1 = function(node, maxl, lm) {
		if (maxl == this.depth1 - 1 && (this.firstFilter >> lm & 1) != 0) {
			return 1;
		}
		if (node.prun == 0 && maxl < 5) {
			if (this.allowShorter || maxl == 0) {
				this.depth1 -= maxl;
				var ret = this.initPhase2Pre();
				this.depth1 += maxl;
				return ret;
			} else {
				return 1;
			}
		}
		for (var axis = 0; axis < 18; axis += 3) {
			if (axis == lm || axis == lm - 9) {
				continue;
			}
			for (var power = 0; power < 3; power++) {
				var m = axis + power;

				if (this.isRec && m != this.move[this.depth1 - maxl]) {
					continue;
				}

				var prun = this.nodeUD[maxl].doMovePrun(node, m, true);
				if (prun > maxl) {
					break;
				} else if (prun == maxl) {
					continue;
				}

				if (USE_CONJ_PRUN) {
					prun = this.nodeUD[maxl].doMovePrunConj(node, m);
					if (prun > maxl) {
						break;
					} else if (prun == maxl) {
						continue;
					}
				}
				this.move[this.depth1 - maxl] = m;
				this.valid1 = Math.min(this.valid1, this.depth1 - maxl);
				var ret = this.phase1(this.nodeUD[maxl], maxl - 1, axis);
				if (ret == 0) {
					return 0;
				} else if (ret == 2) {
					break;
				}
			}
		}
		return 1;
	}
	Search.prototype.appendSolMove = function(curMove) {
		if (this.moveSol.length == 0) {
			this.moveSol.push(curMove);
			return;
		}
		var axisCur = ~~(curMove / 3);
		var axisLast = ~~(this.moveSol.at(-1) / 3);
		if (axisCur == axisLast) {
			var pow = (curMove % 3 + this.moveSol.at(-1) % 3 + 1) % 4;
			if (pow == 3) {
				this.moveSol.pop();
			} else {
				this.moveSol.splice(-1, 1, axisCur * 3 + pow);
			}
			return;
		}
		if (this.moveSol.length > 1 &&
			axisCur % 3 == axisLast % 3 &&
			axisCur == ~~(this.moveSol.at(-2) / 3)) {
			var pow = (curMove % 3 + this.moveSol.at(-2) % 3 + 1) % 4;
			if (pow == 3) {
				this.moveSol.splice(-2, 1, this.moveSol.at(-1));
				this.moveSol.pop();
			} else {
				this.moveSol.splice(-2, 1, axisCur * 3 + pow);
			}
			return;
		}
		this.moveSol.push(curMove);
	}
	Search.prototype.phase2 = function(edge, esym, corn, csym, mid, maxl, depth, lm) {
		if (this.depth1 == 0 && depth == 1 && (this.firstFilter >> ud2std[lm] & 1) != 0) {
			return -1;
		}
		if (edge == 0 && corn == 0 && mid == 0 && (this.preMoveLen > 0 || (this.lastFilter >> ud2std[lm] & 1) == 0)) {
			return maxl;
		}
		var moveMask = ckmv2bit[lm];
		for (var m = 0; m < 10; m++) {
			if ((moveMask >> m & 1) != 0) {
				m += 0x42 >> m & 3;
				continue;
			}
			var midx = MPermMove[mid * N_MOVES2 + m];
			var cornx = CPermMove[corn * N_MOVES2 + SymMoveUD[csym][m]];
			var csymx = SymMult[cornx & 0xf][csym];
			cornx >>= 4;
			if (getPruningMax(MCPermPrunMax, MCPermPrun,
					cornx * N_MPERM + MPermConj[midx << 4 | csymx]) >= maxl) {
				continue;
			}
			var edgex = EPermMove[edge * N_MOVES2 + SymMoveUD[esym][m]];
			var esymx = SymMult[edgex & 0xf][esym];
			edgex >>= 4;
			if (getPruningMax(EPermCCombPPrunMax, EPermCCombPPrun,
					edgex * N_COMB + CCombPConj[(Perm2CombP[cornx] & 0xff) << 4 | SymMultInv[esymx][csymx]]) >= maxl) {
				continue;
			}
			var edgei = getPermSymInv(edgex, esymx, false);
			var corni = getPermSymInv(cornx, csymx, true);
			if (getPruningMax(EPermCCombPPrunMax, EPermCCombPPrun,
					(edgei >> 4) * N_COMB + CCombPConj[(Perm2CombP[corni >> 4] & 0xff) << 4 | SymMultInv[edgei & 0xf][corni & 0xf]]) >= maxl) {
				continue;
			}

			var ret = this.phase2(edgex, esymx, cornx, csymx, midx, maxl - 1, depth + 1, m);
			if (ret >= 0) {
				this.move[depth] = ud2std[m];
				return ret;
			}
		}
		return -1;
	}
	Search.prototype.solutionToString = function() {
		var sb = '';
		var urf = (this.verbose & INVERSE_SOLUTION) != 0 ? (this.urfIdx + 3) % 6 : this.urfIdx;
		if (urf < 3) {
			for (var s = 0; s < this.moveSol.length; ++s) {
				sb += move2str[urfMove[urf][this.moveSol[s]]] + ' ';
			}
		} else {
			for (var s = this.moveSol.length - 1; s >= 0; --s) {
				sb += move2str[urfMove[urf][this.moveSol[s]]] + ' ';
			}
		}
		return sb;
	}

	var moveCube = [];
	var SymCube = [];
	var SymMult = [];
	var SymMultInv = [];
	var SymMove = [];
	var SymMoveUD = [];
	var Sym8Move = [];
	var FlipS2R = [];
	var FlipR2S = [];
	var FlipSelfSym = [];
	var FlipS2RF = [];
	var TwstS2R = [];
	var TwstR2S = [];
	var TwstSelfSym = [];
	var EPermS2R = [];
	var EPermR2S = [];
	var PermSelfSym = [];
	var Perm2CombP = [];
	var PermInvEdgeSym = [];
	var TwstMove = [];
	var FlipMove = [];
	var SliceMove = [];
	var SliceConj = [];
	var SliceTwstPrun = [];
	var SliceFlipPrun = [];
	var TwstFlipPrun = [];

	//phase2
	var CPermMove = [];
	var EPermMove = [];
	var MPermMove = [];
	var MPermConj = [];
	var CCombPMove = [];
	var CCombPConj = [];
	var MCPermPrun = [];
	var EPermCCombPPrun = [];

	var TwstFlipPrunMax = 15;
	var SliceTwstPrunMax = 15;
	var SliceFlipPrunMax = 15;
	var MCPermPrunMax = 15;
	var EPermCCombPPrunMax = 15;

	{ //init move cubes
		for (var i = 0; i < 18; i++) {
			moveCube[i] = new CubieCube()
		}
		moveCube[0].initCoord(15120, 0, 119750400, 0);
		moveCube[3].initCoord(21021, 1494, 323403417, 0);
		moveCube[6].initCoord(8064, 1236, 29441808, 550);
		moveCube[9].initCoord(9, 0, 5880, 0);
		moveCube[12].initCoord(1230, 412, 2949660, 0);
		moveCube[15].initCoord(224, 137, 328552, 137);
		for (var a = 0; a < 18; a += 3) {
			for (var p = 0; p < 2; p++) {
				CubieCube.EdgeMult(moveCube[a + p], moveCube[a], moveCube[a + p + 1]);
				CubieCube.CornMult(moveCube[a + p], moveCube[a], moveCube[a + p + 1]);
			}
		}
		CubieCube.urf1 = new CubieCube().initCoord(2531, 1373, 67026819, 1367);
		CubieCube.urf2 = new CubieCube().initCoord(2089, 1906, 322752913, 2040);
	}

	function initBasic() {
		//init sym cubes
		var c = new CubieCube();
		var d = new CubieCube();
		var t;

		var f2 = new CubieCube().initCoord(28783, 0, 259268407, 0);
		var u4 = new CubieCube().initCoord(15138, 0, 119765538, 7);
		var lr2 = new CubieCube().initCoord(5167, 0, 83473207, 0);
		for (var i = 0; i < 8; i++) {
			lr2.ca[i] |= 3 << 4;
		}
		for (var i = 0; i < 16; i++) {
			SymCube[i] = new CubieCube().init(c.ca, c.ea);
			CubieCube.CornMultFull(c, u4, d);
			CubieCube.EdgeMult(c, u4, d);
			c.init(d.ca, d.ea);
			if (i % 4 == 3) {
				CubieCube.CornMultFull(c, lr2, d);
				CubieCube.EdgeMult(c, lr2, d);
				c.init(d.ca, d.ea);
			}
			if (i % 8 == 7) {
				CubieCube.CornMultFull(c, f2, d);
				CubieCube.EdgeMult(c, f2, d);
				c.init(d.ca, d.ea);
			}
		}

		// gen sym tables
		for (var i = 0; i < 16; i++) {
			SymMult[i] = [];
			SymMultInv[i] = [];
			SymMove[i] = [];
			Sym8Move[i] = [];
			SymMoveUD[i] = [];
		}
		for (var i = 0; i < 16; i++) {
			for (var j = 0; j < 16; j++) {
				SymMult[i][j] = i ^ j ^ (0x14ab4 >> j & i << 1 & 2); // SymMult[i][j] = (i ^ j ^ (0x14ab4 >> j & i << 1 & 2)));
				SymMultInv[SymMult[i][j]][j] = i;
			}
		}

		c = new CubieCube();
		for (var s = 0; s < 16; s++) {
			for (var j = 0; j < 18; j++) {
				CubieCube.CornConjugate(moveCube[j], SymMultInv[0][s], c);
				outloop: for (var m = 0; m < 18; m++) {
					for (var k = 0; k < 8; k++) {
						if (moveCube[m].ca[k] != c.ca[k]) {
							continue outloop;
						}
					}
					SymMove[s][j] = m;
					SymMoveUD[s][std2ud[j]] = std2ud[m];
					break;
				}
				if (s % 2 == 0) {
					Sym8Move[j << 3 | s >> 1] = SymMove[s][j];
				}
			}
		}

		// init sym 2 raw tables
		function initSym2Raw(N_RAW, Sym2Raw, Raw2Sym, SelfSym, coord, setFunc, getFunc) {
			var N_RAW_HALF = (N_RAW + 1) >> 1;
			var c = new CubieCube();
			var d = new CubieCube();
			var count = 0;
			var sym_inc = coord >= 2 ? 1 : 2;
			var conjFunc = coord != 1 ? CubieCube.EdgeConjugate : CubieCube.CornConjugate;

			for (var i = 0; i < N_RAW; i++) {
				if (Raw2Sym[i] !== undefined) {
					continue;
				}
				setFunc.call(c, i);
				for (var s = 0; s < 16; s += sym_inc) {
					conjFunc(c, s, d);
					var idx = getFunc.call(d);
					if (USE_TWST_FLIP_PRUN && coord == 0) {
						FlipS2RF[count << 3 | s >> 1] = idx;
					}
					if (idx == i) {
						SelfSym[count] |= 1 << (s / sym_inc);
					}
					Raw2Sym[idx] = (count << 4 | s) / sym_inc;
				}
				Sym2Raw[count++] = i;
			}
			return count;
		}

		initSym2Raw(N_FLIP, FlipS2R, FlipR2S, FlipSelfSym, 0, CubieCube.prototype.setFlip, CubieCube.prototype.getFlip);
		initSym2Raw(N_TWST, TwstS2R, TwstR2S, TwstSelfSym, 1, CubieCube.prototype.setTwst, CubieCube.prototype.getTwst);
		initSym2Raw(N_PERM, EPermS2R, EPermR2S, PermSelfSym, 2, CubieCube.prototype.setEPerm, CubieCube.prototype.getEPerm);

		var cc = new CubieCube();
		for (var i = 0; i < N_PERM_SYM; i++) {
			setNPerm(cc.ea, EPermS2R[i], 8);
			Perm2CombP[i] = getComb(cc.ea, 0) + getNParity(EPermS2R[i], 8) * 70;
			c.invFrom(cc);
			PermInvEdgeSym[i] = EPermR2S[c.getEPerm()];
		}

		// init coord tables
		c = new CubieCube();
		d = new CubieCube();
		function initSymMoveTable(moveTable, SymS2R, N_SIZE, N_MOVES, setFunc, getFunc, multFunc, ud2std) {
			for (var i = 0; i < N_SIZE; i++) {
				setFunc.call(c, SymS2R[i]);
				for (var j = 0; j < N_MOVES; j++) {
					multFunc(c, moveCube[ud2std ? ud2std[j] : j], d);
					moveTable[i * N_MOVES + j] = getFunc.call(d);
				}
			}
		}

		initSymMoveTable(FlipMove, FlipS2R, N_FLIP_SYM, N_MOVES,
			CubieCube.prototype.setFlip, CubieCube.prototype.getFlipSym, CubieCube.EdgeMult);
		initSymMoveTable(TwstMove, TwstS2R, N_TWST_SYM, N_MOVES,
			CubieCube.prototype.setTwst, CubieCube.prototype.getTwstSym, CubieCube.CornMult);
		initSymMoveTable(EPermMove, EPermS2R, N_PERM_SYM, N_MOVES2,
			CubieCube.prototype.setEPerm, CubieCube.prototype.getEPermSym, CubieCube.EdgeMult, ud2std);
		initSymMoveTable(CPermMove, EPermS2R, N_PERM_SYM, N_MOVES2,
			CubieCube.prototype.setCPerm, CubieCube.prototype.getCPermSym, CubieCube.CornMult, ud2std);

		for (var i = 0; i < N_SLICE; i++) {
			c.setSlice(i);
			for (var j = 0; j < N_MOVES; j++) {
				CubieCube.EdgeMult(c, moveCube[j], d);
				SliceMove[i * N_MOVES + j] = d.getSlice();
			}
			for (var j = 0; j < 16; j += 2) {
				CubieCube.EdgeConjugate(c, SymMultInv[0][j], d);
				SliceConj[i << 3 | j >> 1] = d.getSlice();
			}
		}

		for (var i = 0; i < N_MPERM; i++) {
			c.setMPerm(i);
			for (var j = 0; j < N_MOVES2; j++) {
				CubieCube.EdgeMult(c, moveCube[ud2std[j]], d);
				MPermMove[i * N_MOVES2 + j] = d.getMPerm();
			}
			for (var j = 0; j < 16; j++) {
				CubieCube.EdgeConjugate(c, SymMultInv[0][j], d);
				MPermConj[i << 4 | j] = d.getMPerm();
			}
		}

		for (var i = 0; i < N_COMB; i++) {
			c.setCComb(i % 70);
			for (var j = 0; j < N_MOVES2; j++) {
				CubieCube.CornMult(c, moveCube[ud2std[j]], d);
				CCombPMove[i * N_MOVES2 + j] = d.getCComb() + 70 * ((0xA5 >> j & 1) ^ ~~(i / 70));
			}
			for (var j = 0; j < 16; j++) {
				CubieCube.CornConjugate(c, SymMultInv[0][j], d);
				CCombPConj[i << 4 | j] = d.getCComb() + 70 * ~~(i / 70);
			}
		}
	}

	//init pruning tables
	var InitPrunProgress = -1;

	function initRawSymPrun(PrunTable, N_RAW, N_SYM, RawMove, RawConj, SymMove, SelfSym, PrunFlag) {
		var SYM_SHIFT = PrunFlag & 0xf;
		var SYM_E2C_MAGIC = ((PrunFlag >> 4) & 1) == 1 ? 0x00DDDD00 : 0x00000000;
		var IS_PHASE2 = ((PrunFlag >> 5) & 1) == 1;
		var INV_DEPTH = PrunFlag >> 8 & 0xf;
		var MAX_DEPTH = PrunFlag >> 12 & 0xf;
		var MIN_DEPTH = PrunFlag >> 16 & 0xf;

		var SYM_MASK = (1 << SYM_SHIFT) - 1;
		var ISTFP = RawMove == null;
		var N_SIZE = N_RAW * N_SYM;
		var N_MOVES = IS_PHASE2 ? 10 : 18;
		var NEXT_AXIS_MAGIC = N_MOVES == 10 ? 0x42 : 0x92492;

		var depth = getPruning(PrunTable, N_SIZE) - 1;

		if (depth == -1) {
			for (var i = 0; i < (N_SIZE >> 3) + 1; i++) {
				PrunTable[i] = -1;
			}
			setPruning(PrunTable, 0, 0 ^ 0xf);
			depth = 0;
		} else {
			setPruning(PrunTable, N_SIZE, 0xf ^ (depth + 1));
		}

		var SEARCH_DEPTH = PARTIAL_INIT_LEVEL > 0 ?
			Math.min(Math.max(depth + 1, MIN_DEPTH), MAX_DEPTH) : MAX_DEPTH;

		while (depth < SEARCH_DEPTH) {
			var inv = depth > INV_DEPTH;
			var select = inv ? 0xf : depth;
			var selArrMask = select * 0x11111111;
			var check = inv ? depth : 0xf;
			depth++;
			InitPrunProgress++;
			var xorVal = depth ^ 0xf;
			var done = 0;
			var val = 0;
			for (var i = 0; i < N_SIZE; i++, val >>= 4) {
				if ((i & 7) == 0) {
					val = PrunTable[i >> 3];
					if (!hasZero(val ^ selArrMask)) {
						i += 7;
						continue;
					}
				}
				if ((val & 0xf) != select) {
					continue;
				}
				var raw = i % N_RAW;
				var sym = ~~(i / N_RAW);
				var flip = 0,
					fsym = 0;
				if (ISTFP) {
					flip = FlipR2S[raw];
					fsym = flip & 7;
					flip >>= 3;
				}

				for (var m = 0; m < N_MOVES; m++) {
					var symx = SymMove[sym * N_MOVES + m];
					var rawx;
					if (ISTFP) {
						rawx = FlipS2RF[
							FlipMove[flip * N_MOVES + Sym8Move[m << 3 | fsym]] ^
							fsym ^ (symx & SYM_MASK)];
					} else {
						rawx = RawConj[RawMove[raw * N_MOVES + m] << SYM_SHIFT | symx & SYM_MASK];
					}
					symx >>= SYM_SHIFT;
					var idx = symx * N_RAW + rawx;
					var prun = getPruning(PrunTable, idx);
					if (prun != check) {
						if (prun < depth - 1) {
							m += NEXT_AXIS_MAGIC >> m & 3;
						}
						continue;
					}
					done++;
					if (inv) {
						setPruning(PrunTable, i, xorVal);
						break;
					}
					setPruning(PrunTable, idx, xorVal);
					for (var j = 1, selfSym = SelfSym[symx];
							(selfSym >>= 1) != 0; j++) {
						if ((selfSym & 1) != 1) {
							continue;
						}
						var idxx = symx * N_RAW;
						if (ISTFP) {
							idxx += FlipS2RF[FlipR2S[rawx] ^ j];
						} else {
							idxx += RawConj[rawx << SYM_SHIFT | (j ^ (SYM_E2C_MAGIC >> (j << 1) & 3))];
						}
						if (getPruning(PrunTable, idxx) == check) {
							setPruning(PrunTable, idxx, xorVal);
							done++;
						}
					}
				}
			}
			// console.log(depth, done, InitPrunProgress);
		}
		setPruning(PrunTable, N_SIZE, (depth + 1) ^ 0xf);
		return depth + 1;
	}

	function doInitPrunTables(targetProgress) {
		if (USE_TWST_FLIP_PRUN) {
			TwstFlipPrunMax = initRawSymPrun(
				TwstFlipPrun, N_FLIP, N_TWST_SYM,
				null, null,
				TwstMove, TwstSelfSym, 0x19603
			);
		}
		if (InitPrunProgress > targetProgress) {
			return;
		}
		SliceTwstPrunMax = initRawSymPrun(
			SliceTwstPrun, N_SLICE, N_TWST_SYM,
			SliceMove, SliceConj,
			TwstMove, TwstSelfSym, 0x69603
		);
		if (InitPrunProgress > targetProgress) {
			return;
		}
		SliceFlipPrunMax = initRawSymPrun(
			SliceFlipPrun, N_SLICE, N_FLIP_SYM,
			SliceMove, SliceConj,
			FlipMove, FlipSelfSym, 0x69603
		);
		if (InitPrunProgress > targetProgress) {
			return;
		}
		MCPermPrunMax = initRawSymPrun(
			MCPermPrun, 24, N_PERM_SYM,
			MPermMove, MPermConj,
			CPermMove, PermSelfSym, 0x8ea34
		);
		if (InitPrunProgress > targetProgress) {
			return;
		}
		EPermCCombPPrunMax = initRawSymPrun(
			EPermCCombPPrun, N_COMB, N_PERM_SYM,
			CCombPMove, CCombPConj,
			EPermMove, PermSelfSym, 0x7d824
		);
	}

	function initPrunTables() {
		if (InitPrunProgress < 0) {
			initBasic();
			InitPrunProgress = 0;
		}
		if (InitPrunProgress == 0) {
			doInitPrunTables(99);
		} else if (InitPrunProgress < 54) {
			doInitPrunTables(InitPrunProgress);
		} else {
			return true;
		}
		return false;
	}

	function randomCube() {
		var ep, cp;
		var eo = ~~(Math.random() * 2048);
		var co = ~~(Math.random() * 2187);
		do {
			ep = ~~(Math.random() * fact[12]);
			cp = ~~(Math.random() * fact[8]);
		} while (getNParity(cp, 8) != getNParity(ep, 12));
		var cc = new CubieCube().initCoord(cp, co, ep, eo);
		return cc.toFaceCube();
	}
	function fromScramble(s) {
		var j = 0;
		var axis = -1;
		var c1 = new CubieCube();
		var c2 = new CubieCube();
		for (var i = 0; i < s.length; i++) {
			switch (s[i]) {
				case 'U':
				case 'R':
				case 'F':
				case 'D':
				case 'L':
				case 'B':
					axis = "URFDLB".indexOf(s[i]) * 3;
					break;
				case ' ':
					if (axis != -1) {
						CubieCube.CornMult(c1, moveCube[axis], c2);
						CubieCube.EdgeMult(c1, moveCube[axis], c2);
						c1.init(c2.ca, c2.ea);
					}
					axis = -1;
					break;
				case '2':
					axis++;
					break;
				case '\'':
					axis += 2;
					break;
				default:
					continue;
			}
		}
		if (axis != -1) {
			CubieCube.CornMult(c1, moveCube[axis], c2);
			CubieCube.EdgeMult(c1, moveCube[axis], c2);
			c1.init(c2.ca, c2.ea);
		}
		return c2.toFaceCube();
	}

	return {
		Search: Search,
		solve: function(facelet) {
			return new Search().solution(facelet);
		},
		randomCube: randomCube,
		fromScramble: fromScramble,
		initFull: function() {
			PARTIAL_INIT_LEVEL = 0;
			initPrunTables();
		},
		INVERSE_SOLUTION: INVERSE_SOLUTION,
		CubieCube: CubieCube
	}
})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
	module.exports = min2phase;
}

// ========== spooncuber 读码引擎：任意棱/角缓冲 + H/L 高低色标记（继承自 spoon_module.js） ==========
// spooncuber 读码引擎模块：任意棱/角缓冲，完整移植原版 readEdge/readCorner（含翻色/跳编）
const SPOON = (function () {
let cornerCh = " JKLGHIABCDEFXYZWMNRSTOPQ",
    edgeCh = " GHABCDEFOPKLQRSTYZIJWXMN";

const arra = [[0], [0], [0], [0], [0], [0], [0]];
const arrc = [[0], [0], [0], [0], [0], [0], [0]];
function transformation1(transa, transb, transc, transd) {
    arrc[transa][transb] = arra[transa][transb];
    arra[transa][transb] = arrc[transc][transd];
}

function transformation2(transa, transb, transc, transd) {
    arrc[transa][transb] = arra[transa][transb];
    arra[transa][transb] = arra[transc][transd];
}

function movef() {
    for (let i = 1; i <= 9; i++) {
        arrc[5][i] = arra[5][i];
    }
    arra[5][1] = arra[5][7];
    arra[5][7] = arra[5][9];
    arra[5][9] = arra[5][3];
    arra[5][3] = arrc[5][1];
    arra[5][2] = arra[5][4];
    arra[5][4] = arra[5][8];
    arra[5][8] = arra[5][6];
    arra[5][6] = arrc[5][2];
    for (let i = 1; i <= 3; i++) {
        transformation2(3, 3 * i, 2, i);
    }
    for (let i = 1; i <= 3; i++) {
        transformation2(2, i, 4, 10 - 3 * i);
    }
    for (let i = 1; i <= 3; i++) {
        transformation2(4, 3 * i - 2, 1, 6 + i);
    }
    for (let i = 1; i <= 3; i++) {
        transformation1(1, 6 + i, 3, 12 - 3 * i);
    }
}

function movex() {
    for (let i = 1; i <= 9; i++) {
        arrc[3][i] = arra[3][i];
        arrc[4][i] = arra[4][i];
    }
    arra[3][1] = arra[3][3];
    arra[3][3] = arra[3][9];
    arra[3][9] = arra[3][7];
    arra[3][7] = arrc[3][1];
    arra[3][2] = arra[3][6];
    arra[3][6] = arra[3][8];
    arra[3][8] = arra[3][4];
    arra[3][4] = arrc[3][2];
    arra[4][1] = arra[4][7];
    arra[4][7] = arra[4][9];
    arra[4][9] = arra[4][3];
    arra[4][3] = arrc[4][1];
    arra[4][2] = arra[4][4];
    arra[4][4] = arra[4][8];
    arra[4][8] = arra[4][6];
    arra[4][6] = arrc[4][2];
    for (let i = 1; i <= 9; i++) {
        transformation2(6, i, 1, 10 - i);
    }
    for (let i = 1; i <= 9; i++) {
        transformation1(2, i, 6, 10 - i);
    }
    for (let i = 1; i <= 9; i++) {
        transformation1(5, i, 2, i);
    }
    for (let i = 1; i <= 9; i++) {
        transformation1(1, i, 5, i);
    }
}

function movey() {
    for (let i = 1; i <= 9; i++) {
        arrc[1][i] = arra[1][i];
        arrc[2][i] = arra[2][i];
    }
    arra[2][1] = arra[2][3];
    arra[2][3] = arra[2][9];
    arra[2][9] = arra[2][7];
    arra[2][7] = arrc[2][1];
    arra[2][2] = arra[2][6];
    arra[2][6] = arra[2][8];
    arra[2][8] = arra[2][4];
    arra[2][4] = arrc[2][2];
    arra[1][1] = arra[1][7];
    arra[1][7] = arra[1][9];
    arra[1][9] = arra[1][3];
    arra[1][3] = arrc[1][1];
    arra[1][2] = arra[1][4];
    arra[1][4] = arra[1][8];
    arra[1][8] = arra[1][6];
    arra[1][6] = arrc[1][2];
    for (let i = 1; i <= 9; i++) {
        transformation2(6, i, 3, i);
    }
    for (let i = 1; i <= 9; i++) {
        transformation2(3, i, 5, i);
    }
    for (let i = 1; i <= 9; i++) {
        transformation2(5, i, 4, i);
    }
    for (let i = 1; i <= 9; i++) {
        arra[4][i] = arrc[6][i];
    }
}

function initialize() {
    arra[1][1] = "D";
    arra[1][2] = "E";
    arra[1][3] = "G";
    arra[1][4] = "C";
    arra[1][5] = "U";
    arra[1][6] = "G";
    arra[1][7] = "A";
    arra[1][8] = "A";
    arra[1][9] = "J";
    arra[2][1] = "W";
    arra[2][2] = "I";
    arra[2][3] = "X";
    arra[2][4] = "K";
    arra[2][5] = "D";
    arra[2][6] = "O";
    arra[2][7] = "O";
    arra[2][8] = "M";
    arra[2][9] = "R";
    arra[3][1] = "E";
    arra[3][2] = "D";
    arra[3][3] = "C";
    arra[3][4] = "X";
    arra[3][5] = "L";
    arra[3][6] = "T";
    arra[3][7] = "Q";
    arra[3][8] = "L";
    arra[3][9] = "M";
    arra[4][1] = "K";
    arra[4][2] = "H";
    arra[4][3] = "I";
    arra[4][4] = "R";
    arra[4][5] = "R";
    arra[4][6] = "Z";
    arra[4][7] = "Z";
    arra[4][8] = "P";
    arra[4][9] = "S";
    arra[5][1] = "B";
    arra[5][2] = "B";
    arra[5][3] = "L";
    arra[5][4] = "S";
    arra[5][5] = "F";
    arra[5][6] = "Q";
    arra[5][7] = "N";
    arra[5][8] = "J";
    arra[5][9] = "Y";
    arra[6][1] = "H";
    arra[6][2] = "F";
    arra[6][3] = "F";
    arra[6][4] = "Y";
    arra[6][5] = "B";
    arra[6][6] = "W";
    arra[6][7] = "T";
    arra[6][8] = "N";
    arra[6][9] = "P";
}

function movez() {
    movex();
    movey();
    movex();
    movex();
    movex();
}
function movel() {
    movey();
    movey();
    movey();
    movef();
    movey();
}
function moveu() {
    movex();
    movex();
    movex();
    movef();
    movex();
}
function moveb() {
    movex();
    movex();
    movef();
    movex();
    movex();
}
function mover() {
    movey();
    movef();
    movey();
    movey();
    movey();
}
function moved() {
    movex();
    movef();
    movex();
    movex();
    movex();
}
function movedi() {
    moved();
    moved();
    moved();
}
function moveli() {
    movel();
    movel();
    movel();
}
function moveri() {
    mover();
    mover();
    mover();
}
function movefi() {
    movef();
    movef();
    movef();
}
function moveui() {
    moveu();
    moveu();
    moveu();
}
function movebi() {
    moveb();
    moveb();
    moveb();
}
function moved2() {
    moved();
    moved();
}
function movel2() {
    movel();
    movel();
}
function mover2() {
    mover();
    mover();
}
function movef2() {
    movef();
    movef();
}
function moveu2() {
    moveu();
    moveu();
}
function moveb2() {
    moveb();
    moveb();
}
function movexr() {
    movel();
    movex();
}
function movexf() {
    moveb();
    movez();
}
function movexu() {
    moved();
    movey();
}
function movexd() {
    moveu();
    movey();
    movey();
    movey();
}
function movexl() {
    mover();
    movex();
    movex();
    movex();
}
function movexb() {
    movef();
    movez();
    movez();
    movez();
}
function movex2() {
    movex();
    movex();
}
function movey2() {
    movey();
    movey();
}
function movez2() {
    movez();
    movez();
}
function movexi() {
    movex();
    movex();
    movex();
}
function moveyi() {
    movey();
    movey();
    movey();
}
function movezi() {
    movez();
    movez();
    movez();
}
function movem() {
    mover();
    moveli();
    movex();
    movex();
    movex();
}
function movem2() {
    mover2();
    movel2();
    movex2();
}
function movemi() {
    movex();
    movel();
    mover();
    mover();
    mover();
}
function moves() {
    movef();
    movef();
    movef();
    moveb();
    movez();
}
function moves2() {
    movef2();
    moveb2();
    movez2();
}
function movesi() {
    movez();
    movez();
    movez();
    moveb();
    moveb();
    moveb();
    movef();
}
function movee() {
    moveu();
    moved();
    moved();
    moved();
    movey();
    movey();
    movey();
}
function movee2() {
    moveu2();
    moved2();
    movey2();
}
function moveei() {
    movey();
    moved();
    moveu();
    moveu();
    moveu();
}
function movexr2() {
    movexr();
    movexr();
}
function movexf2() {
    movexf();
    movexf();
}
function movexu2() {
    movexu();
    movexu();
}
function movexd2() {
    movexd();
    movexd();
}
function movexl2() {
    movexl();
    movexl();
}
function movexb2() {
    movexb();
    movexb();
}
function movexri() {
    movexr();
    movexr();
    movexr();
}
function movexfi() {
    movexf();
    movexf();
    movexf();
}
function movexui() {
    movexu();
    movexu();
    movexu();
}
function movexdi() {
    movexd();
    movexd();
    movexd();
}
function movexli() {
    movexl();
    movexl();
    movexl();
}
function movexbi() {
    movexb();
    movexb();
    movexb();
}

function operate(operateChar) {
    switch (operateChar) {
        case "R":
            mover();
            break;
        case "L":
            movel();
            break;
        case "F":
            movef();
            break;
        case "B":
            moveb();
            break;
        case "U":
            moveu();
            break;
        case "D":
            moved();
            break;
        case "R2":
            mover2();
            break;
        case "L2":
            movel2();
            break;
        case "F2":
            movef2();
            break;
        case "B2":
            moveb2();
            break;
        case "U2":
            moveu2();
            break;
        case "D2":
            moved2();
            break;
        case "R'":
            moveri();
            break;
        case "L'":
            moveli();
            break;
        case "F'":
            movefi();
            break;
        case "B'":
            movebi();
            break;
        case "U'":
            moveui();
            break;
        case "D'":
            movedi();
            break;
        case "x":
            movex();
            break;
        case "x2":
            movex2();
            break;
        case "x'":
            movexi();
            break;
        case "y":
            movey();
            break;
        case "y2":
            movey2();
            break;
        case "y'":
            moveyi();
            break;
        case "z":
            movez();
            break;
        case "z2":
            movez2();
            break;
        case "z'":
            movezi();
            break;
        case "r":
            movexr();
            break;
        case "r2":
            movexr2();
            break;
        case "r'":
            movexri();
            break;
        case "f":
            movexf();
            break;
        case "f2":
            movexf2();
            break;
        case "f'":
            movexfi();
            break;
        case "u":
            movexu();
            break;
        case "u2":
            movexu2();
            break;
        case "u'":
            movexui();
            break;
        case "d":
            movexd();
            break;
        case "d2":
            movexd2();
            break;
        case "d'":
            movexdi();
            break;
        case "l":
            movexl();
            break;
        case "l2":
            movexl2();
            break;
        case "l'":
            movexli();
            break;
        case "b":
            movexb();
            break;
        case "b2":
            movexb2();
            break;
        case "b'":
            movexbi();
            break;
        case "S":
            moves();
            break;
        case "S2":
            moves2();
            break;
        case "S'":
            movesi();
            break;
        case "M":
            movem();
            break;
        case "M2":
            movem2();
            break;
        case "M'":
            movemi();
            break;
        case "E":
            movee();
            break;
        case "E2":
            movee2();
            break;
        case "E'":
            moveei();
            break;
        case "Rw":
            movexr();
            break;
        case "Rw2":
            movexr2();
            break;
        case "Rw'":
            movexri();
            break;
        case "Fw":
            movexf();
            break;
        case "Fw2":
            movexf2();
            break;
        case "Fw'":
            movexfi();
            break;
        case "Uw":
            movexu();
            break;
        case "Uw2":
            movexu2();
            break;
        case "Uw'":
            movexui();
            break;
        case "Dw":
            movexd();
            break;
        case "Dw2":
            movexd2();
            break;
        case "Dw'":
            movexdi();
            break;
        case "Lw":
            movexl();
            break;
        case "Lw2":
            movexl2();
            break;
        case "Lw'":
            movexli();
            break;
        case "Bw":
            movexb();
            break;
        case "Bw2":
            movexb2();
            break;
        case "Bw'":
            movexbi();
            break;
        default:
            break;
    }
}

function operatealg(s1) {
    initialize();
    const arr = s1.split(" ");
    const validMoves = [
        "R", "L", "F", "B", "U", "D", "R2", "L2", "F2", "B2", "U2", "D2", "R'", "L'", "F'", "B'", "U'", "D'",
        "x", "x2", "x'", "y", "y2", "y'", "z", "z2", "z'",
        "r", "r2", "r'", "f", "f2", "f'", "u", "u2", "u'", "d", "d2", "d'", "l", "l2", "l'", "b", "b2", "b'",
        "S", "S2", "S'", "M", "M2", "M'", "E", "E2", "E'",
        "Rw", "Rw2", "Rw'", "Fw", "Fw2", "Fw'", "Uw", "Uw2", "Uw'", "Dw", "Dw2", "Dw'", "Lw", "Lw2", "Lw'", "Bw", "Bw2", "Bw'"
    ];
    for (let i = 0; i < arr.length; i++) {
        if (validMoves.indexOf(arr[i]) > -1) {
            operate(arr[i]);
        } else {
            //initialize();
            //return false;
        }
    }
    let outarr = arra;
    return outarr;
}

function track1(track1Str) {
    switch (track1Str) {
        case "A": return arra[1][8];
        case "B": return arra[5][2];
        case "C": return arra[1][4];
        case "D": return arra[3][2];
        case "E": return arra[1][2];
        case "F": return arra[6][2];
        case "G": return arra[1][6];
        case "H": return arra[4][2];
        case "I": return arra[2][2];
        case "J": return arra[5][8];
        case "K": return arra[2][4];
        case "L": return arra[3][8];
        case "M": return arra[2][8];
        case "N": return arra[6][8];
        case "O": return arra[2][6];
        case "P": return arra[4][8];
        case "Q": return arra[5][6];
        case "R": return arra[4][4];
        case "S": return arra[5][4];
        case "T": return arra[3][6];
        case "W": return arra[6][6];
        case "X": return arra[3][4];
        case "Y": return arra[6][4];
        case "Z": return arra[4][6];
        default: return 0;
    }
}

function track2(track2Str) {
    switch (track2Str) {
        case "A": return arra[1][7];
        case "B": return arra[5][1];
        case "C": return arra[3][3];
        case "D": return arra[1][1];
        case "E": return arra[3][1];
        case "F": return arra[6][3];
        case "G": return arra[1][3];
        case "H": return arra[6][1];
        case "I": return arra[4][3];
        case "J": return arra[1][9];
        case "K": return arra[4][1];
        case "L": return arra[5][3];
        case "W": return arra[2][1];
        case "M": return arra[3][9];
        case "N": return arra[5][7];
        case "O": return arra[2][7];
        case "P": return arra[6][9];
        case "Q": return arra[3][7];
        case "R": return arra[2][9];
        case "S": return arra[4][9];
        case "T": return arra[6][7];
        case "X": return arra[2][3];
        case "Y": return arra[5][9];
        case "Z": return arra[4][7];
        default: return 0;
    }
}



  // ---- 同块邻贴纸（固定常量表，与原版一致） ----
  function nearcorner(s1) {
    const cornerChtemp = " JKLGHIABCDEFXYZWMNRSTOPQ";
    if (cornerChtemp.indexOf(s1) % 3 === 0) {
        return cornerChtemp[cornerChtemp.indexOf(s1) - 2];
    }
    return cornerChtemp[cornerChtemp.indexOf(s1) + 1];
  }
  function nearedge(s1) {
    const edgeChtemp = " GHABCDEFOPKLQRSTYZIJWXMN";
    if (edgeChtemp.indexOf(s1) % 2 === 1) {
        return edgeChtemp[edgeChtemp.indexOf(s1) + 1];
    }
    return edgeChtemp[edgeChtemp.indexOf(s1) - 1];
  }

  // ---- 块映射（spooncuber 物理贴纸位，经 track1/track2 验证） ----
  // 棱：组内两字母 = 同棱两贴纸；组首字母 = U/D 高级色贴纸
  const EDGE_BLOCKS = {UR:['G','H'],UF:['A','B'],UL:['C','D'],UB:['E','F'],DR:['O','P'],DL:['K','L'],FR:['Q','R'],FL:['S','T'],BL:['Y','Z'],DF:['I','J'],BR:['W','X'],DB:['M','N']};
  // 角：组内三字母 = 同角三贴纸；组首字母 = U/D 高级色贴纸
  const CORNER_BLOCKS = {UFR:['J','K','L'],UBR:['G','H','I'],UFL:['A','B','C'],UBL:['D','E','F'],DFR:['X','Y','Z'],DFL:['W','M','N'],DBR:['R','S','T'],DBL:['O','P','Q']};
  const EDGE_ORDER = ['UR','UF','UL','UB','DR','DL','FR','FL','BL','DF','BR','DB'];
  const CORNER_ORDER = ['UFR','UBR','UFL','UBL','DFR','DFL','DBR','DBL'];

  // 高级色贴纸集合（组首字母，即 U/D 面贴纸）
  const ADV_EDGE = new Set(['G','A','C','E','O','K','Q','S','Y','I','W','M']);
  const ADV_CORNER = new Set(['J','G','A','D','X','W','R','O']);

  // 「摆正」置换工厂（separate 编码口径用）：把原地翻转的棱 / 原地扭转的角在位置上
  // 摆正之后再去读码 ⇒ 读码只描述位置置换，翻色信息不进读码，由 flipPairs（卷面
  // 「翻色」行）交给翻色公式单独解决。这样两种口径读码的差别就只是「翻色在不在码里」。
  // groups: 各块的位置字母组（组首字母 = 高级色位）；trackFn: 字母 → 该位置现放的贴纸
  function wrapOrientFix(trackFn, groups, div) {
    const adv = div === 2 ? ADV_EDGE : ADV_CORNER;
    const next = div === 2 ? nearedge : nearcorner;
    const fix = {};
    for (let n = 0; n < groups.length; n++) {
      const slot = groups[n].slice(0, div);
      const at = slot.map(function (p) { return trackFn(p); });
      if (adv.has(at[0])) continue;      // 高级色贴纸已在高级色位 ⇒ 色相正确，不用动
      let hi = '';
      for (let k = 0; k < div; k++) { if (adv.has(at[k])) { hi = at[k]; } }
      if (!hi) continue;                 // 兜底：找不到高级色贴纸则保持原样
      for (let i = 0; i < div; i++) {
        let want = hi;
        for (let k = 0; k < i; k++) { want = next(want); }
        const j = at.indexOf(want);
        if (j >= 0) { fix[slot[i]] = slot[j]; }
      }
    }
    return function (x) { const y = fix[x]; return trackFn(y === undefined ? x : y); };
  }

  // 缓冲参数归一：'UF'/'A' 均可 → 返回块名
  function normEdgeBuf(buf) {
    const b = String(buf || '').trim().toUpperCase();
    if (EDGE_BLOCKS[b]) return b;
    for (const k in EDGE_BLOCKS) {
      if (EDGE_BLOCKS[k][0] === b) return k;
    }
    return 'UF'; // 默认
  }
  function normCornerBuf(buf) {
    const b = String(buf || '').trim().toUpperCase();
    if (CORNER_BLOCKS[b]) return b;
    for (const k in CORNER_BLOCKS) {
      if (CORNER_BLOCKS[k][0] === b) return k;
    }
    return 'UFR';
  }

  // 构建缓冲对应的字母表（缓冲组置首，其余按固定序）
  function edgeChOf(buf) {
    const k = normEdgeBuf(buf);
    const p = EDGE_BLOCKS[k];
    let ch = ' ' + p[0] + p[1];
    for (const b of EDGE_ORDER) {
      if (b === k) continue;
      ch += EDGE_BLOCKS[b][0] + EDGE_BLOCKS[b][1];
    }
    return ch;
  }
  function cornerChOf(buf) {
    const k = normCornerBuf(buf);
    const p = CORNER_BLOCKS[k];
    let ch = ' ' + p[0] + p[1] + p[2];
    for (const b of CORNER_ORDER) {
      if (b === k) continue;
      ch += CORNER_BLOCKS[b][0] + CORNER_BLOCKS[b][1] + CORNER_BLOCKS[b][2];
    }
    return ch;
  }

  // 高级色对应字母（同块回归到组首字母；传入低色字母返回同组高色）
  const EDGE_GROUP = {}; for (const k in EDGE_BLOCKS) { const p = EDGE_BLOCKS[k]; EDGE_GROUP[p[0]] = p[0]; EDGE_GROUP[p[1]] = p[0]; }
  const CORNER_GROUP = {}; for (const k in CORNER_BLOCKS) { const p = CORNER_BLOCKS[k]; CORNER_GROUP[p[0]] = p[0]; CORNER_GROUP[p[1]] = p[0]; CORNER_GROUP[p[2]] = p[0]; }

  // 读棱编码（需先 operatealg）
  // opts: {orientFlag: 0/1, skipCycleNum: 0.., flipMode: 'merge'|'separate'}
  function readEdge(buf, opts) {
    opts = opts || {};
    const orientFlag = opts.orientFlag === undefined ? 1 : Number(opts.orientFlag);
    const skipCycleNum = opts.skipCycleNum === undefined ? 0 : Number(opts.skipCycleNum);
    // flipMode: 'merge'（默认 = 消翻色：翻色并入读码，读码单独就能解掉含翻色的全部，
    //                 学员不需要再做翻色公式）
    //         | 'separate'（读码只描述位置置换，「翻色」行单独给要翻的块，用翻色公式解决）
    const flipMode = opts.flipMode === 'separate' ? 'separate' : 'merge';
    const ch = edgeChOf(buf);
    // separate：先把原地翻转的棱在位置上摆正再读码，读码里自然就不含翻色信息
    const tk = flipMode === 'separate'
      ? wrapOrientFix(track1, EDGE_ORDER.map(function (b) { return EDGE_BLOCKS[b]; }), 2)
      : track1;
    const cycleList = [], cycleOrders = [];
    let readChar = '', sumorient = 0;
    for (let i = 1; i <= 24; i += 2) {
      if (readChar.indexOf(ch[i]) === -1 && readChar.indexOf(ch[i + 1]) === -1) {
        let part = ch[i];
        while (tk(part[part.length - 1]) !== part[0]
            && nearedge(tk(part[part.length - 1])) !== part[0]) {
          part += tk(part[part.length - 1]);
        }
        // 恒等：块归位（AA）与原地翻棱（CD）都会被追踪成长度 2 的环，统一补齐终点后再区分
        part += tk(part[part.length - 1]);
        readChar += part;
        // 归位块（"CC"）不产生编码；原地翻棱（"CD"）必须入列，否则整块漏编码——旧实现在此漏码
        if (part.length > 2 || part[0] !== part[1] || i === 1) {
          cycleList.push(part);
          cycleOrders.push(~~((i - 1) / 2));
        }
        sumorient += ch.indexOf(part[part.length - 1]) - ch.indexOf(part[0]);
      }
    }
    // 输出阶段（与原版一致：缓冲循环去回归字母、小循环翻色、跳编）
    // 修正：缓冲块已归位（缓冲循环仅 'AA' 两字母）时编码为空
    // 长度 2 的环（块归位 / 原地翻棱）在 separate 口径下已由 wrapOrientFix 摆正而消失，
    // 无需在这里再过滤：两者都只是「读码用的环表」
    const seq = [];
    for (let k = 0; k < cycleList.length; k++) { seq.push({ part: cycleList[k], order: cycleOrders[k] }); }
    const code = [], colors = [], roles = [];   // roles: '' | 'borrow'(借位) | 'return'(归还)
    let orientLast = 0, endList = '', bufFlipTail = '';
    // 缓冲块原地翻转（AB，区别于归位 AA）：彳亍法首尾各编码一次该贴纸字母
    if (seq.length && seq[0].part.length === 2 && seq[0].part[0] !== seq[0].part[1]) {
      const b = seq[0].part[1];
      code.push(b);
      colors.push(ch.indexOf(b) % 2 === 1 ? 'H' : 'L');
      roles.push('');
      bufFlipTail = b;
    }
    for (let i = 0; i < seq.length; i++) {
      const part = seq[i].part;
      // 缓冲块归位（AA）或原地翻转（AB，已单独处理）都不再逐字母编码
      if (i === 0 && part.length === 2) continue;
      if (i > 0) {
        const prev = seq[i - 1].part;
        orientLast += ch.indexOf(prev[prev.length - 1]) - ch.indexOf(prev[0]);
      }
      for (let j = 0; j < part.length; j++) {
        let c = part[j];
        if (i === 0 && j === 0) continue; // 标准彳亍：大循环不编码缓冲字母（缓冲只作起点，不参与编码）
        if (i > 0 && (orientFlag === 1 || (orientFlag === 0 && seq[i].order <= skipCycleNum))) {
          for (let k = 0; k < orientLast; k++) c = nearedge(c);
        }
        if (i === 0 && j === part.length - 1) continue; // 缓冲环末位（回到缓冲）不编码
        if (j === part.length - 1 && seq[i].order <= skipCycleNum) {
          let lastcode = EDGE_GROUP[c];
          for (let k = 0; k < sumorient % 2; k++) lastcode = nearedge(lastcode);
          endList += lastcode;
        } else {
          code.push(c);
          colors.push(ch.indexOf(c) % 2 === 1 ? 'H' : 'L'); // 组首(奇数位)=高色
          // 借位/归还：小循环首字母=借位（起新循环时借的块），小循环收尾字母=归还（回到借的块）
          roles.push(i > 0 ? (j === 0 ? 'borrow' : (j === part.length - 1 ? 'return' : '')) : '');
        }
      }
    }
    // 翻棱统计：高级色位放非高级色贴纸
    let flip = 0;
    for (let i = 1; i <= 24; i += 2) {
      if (!ADV_EDGE.has(track1(ch[i]))) flip++;
    }
    // 翻色明细（位置化写法）：每个翻了的棱位给出「高色字母+低色字母」（如 UF=AB、BR=WX），
    // 与本站字母表口径一致，学员照字母对即可找到要翻的棱块。
    const flipPairs = [];
    for (let i = 1; i <= 23; i += 2) {
      if (!ADV_EDGE.has(track1(ch[i]))) flipPairs.push(ch[i] + ch[i + 1]);
    }
    if (skipCycleNum > 0) {
      const tail = endList.split('').reverse();
      code.push(...tail);
      for (const tc of tail) { colors.push(ch.indexOf(tc) % 2 === 1 ? 'H' : 'L'); roles.push('return'); }
    }
    // 缓冲原地翻转的收尾字母，追加在所有小循环之后
    if (bufFlipTail) {
      code.push(bufFlipTail);
      colors.push(ch.indexOf(bufFlipTail) % 2 === 1 ? 'H' : 'L');
      roles.push('');
    }
    return { code, colors, roles, cycles: cycleList, flipCount: flip, flipPairs, sumorient, orientLast };
  }

  // 读角编码（需先 operatealg）
  // opts 同 readEdge：{orientFlag, skipCycleNum, flipMode}
  function readCorner(buf, opts) {
    opts = opts || {};
    const orientFlag = opts.orientFlag === undefined ? 1 : Number(opts.orientFlag);
    const skipCycleNum = opts.skipCycleNum === undefined ? 0 : Number(opts.skipCycleNum);
    // flipMode: 'merge'（默认 = 消翻色，扭角并入读码）| 'separate'（扭角交给翻色公式）
    const flipMode = opts.flipMode === 'separate' ? 'separate' : 'merge';
    const ch = cornerChOf(buf);
    // separate：先把原地扭转的角在位置上摆正再读码
    const tk = flipMode === 'separate'
      ? wrapOrientFix(track2, CORNER_ORDER.map(function (b) { return CORNER_BLOCKS[b]; }), 3)
      : track2;
    const cycleList = [], cycleOrders = [];
    let readChar = '', sumorient = 0;
    for (let i = 1; i <= 24; i += 3) {
      if (readChar.indexOf(ch[i]) === -1 && readChar.indexOf(ch[i + 1]) === -1 && readChar.indexOf(ch[i + 2]) === -1) {
        let part = ch[i];
        while (tk(part[part.length - 1]) !== part[0]
            && nearcorner(tk(part[part.length - 1])) !== part[0]
            && tk(part[part.length - 1]) !== nearcorner(part[0])) {
          part += tk(part[part.length - 1]);
        }
        // 同 readEdge：原地扭角（JK / JL）与归位（JJ）都是长度 2 的环，补齐终点后再区分
        part += tk(part[part.length - 1]);
        readChar += part;
        // 归位块（"JJ"）不产生编码；原地扭角必须入列，否则整块漏编码
        if (part.length > 2 || part[0] !== part[1] || i === 1) {
          cycleList.push(part);
          cycleOrders.push(~~((i - 1) / 3));
        }
        sumorient += ch.indexOf(part[part.length - 1]) - ch.indexOf(part[0]);
      }
    }
    const seq = [];
    for (let k = 0; k < cycleList.length; k++) { seq.push({ part: cycleList[k], order: cycleOrders[k] }); }
    const code = [], colors = [], roles = [];   // roles: '' | 'borrow'(借位) | 'return'(归还)
    let orientLast = 0, endList = '', bufTwistTail = '';
    // 角缓冲原地扭转（JK / JL，区别于归位 JJ）：首尾各编码一次
    if (seq.length && seq[0].part.length === 2 && seq[0].part[0] !== seq[0].part[1]) {
      const b = seq[0].part[1];
      code.push(b);
      colors.push(ch.indexOf(b) % 3 === 1 ? 'H' : 'L');
      roles.push('');
      bufTwistTail = [ch[1], ch[2], ch[3]].find(x => x !== seq[0].part[0] && x !== b) || b;
    }
    for (let i = 0; i < seq.length; i++) {
      const part = seq[i].part;
      // 角缓冲归位（JJ）或原地扭转（JK/JL，已单独处理）都不再逐字母编码
      if (i === 0 && part.length === 2) continue;
      if (i > 0) {
        const prev = seq[i - 1].part;
        orientLast += ch.indexOf(prev[prev.length - 1]) - ch.indexOf(prev[0]);
      }
      for (let j = 0; j < part.length; j++) {
        let c = part[j];
        if (i === 0 && j === 0) continue; // 标准彳亍：大循环不编码缓冲字母（缓冲只作起点，不参与编码）
        if (i > 0 && (orientFlag === 1 || (orientFlag === 0 && seq[i].order <= skipCycleNum))) {
          for (let k = 0; k < orientLast; k++) c = nearcorner(c);
        }
        if (i === 0 && j === part.length - 1) continue; // 角缓冲环末位不编码
        if (j === part.length - 1 && seq[i].order <= skipCycleNum) {
          let lastcode = CORNER_GROUP[c];
          for (let k = 0; k < sumorient % 3; k++) lastcode = nearcorner(lastcode);
          endList += lastcode;
        } else {
          code.push(c);
          colors.push(ch.indexOf(c) % 3 === 1 ? 'H' : 'L'); // 每组首字母(位置%3==1)=高色
          // 借位/归还：小循环首字母=借位，小循环收尾字母=归还
          roles.push(i > 0 ? (j === 0 ? 'borrow' : (j === part.length - 1 ? 'return' : '')) : '');
        }
      }
    }
    let flip = 0;
    for (let i = 1; i <= 24; i += 3) {
      if (!ADV_CORNER.has(track2(ch[i]))) flip++;
    }
    // 翻色明细（位置化写法）：每个扭了的角位给出「高色字母 + 朝向字母」
    // 朝向字母取实际落在高色位上的那一个（后一位=中色 / 后两位=低色），与读码循环前两个字母一致
    const flipPairs = [];
    for (let i = 1; i <= 22; i += 3) {
      const t = track2(ch[i]);
      if (!ADV_CORNER.has(t)) flipPairs.push(ch[i] + (t === ch[i + 2] ? ch[i + 2] : ch[i + 1]));
    }
    if (skipCycleNum > 0) {
      const tail = endList.split('').reverse();
      code.push(...tail);
      for (const tc of tail) { colors.push(ch.indexOf(tc) % 3 === 1 ? 'H' : 'L'); roles.push('return'); }
    }
    // 缓冲角原地扭转的收尾字母
    if (bufTwistTail) {
      code.push(bufTwistTail);
      colors.push(ch.indexOf(bufTwistTail) % 3 === 1 ? 'H' : 'L');
      roles.push('');
    }
    return { code, colors, roles, cycles: cycleList, flipCount: flip, flipPairs, sumorient, orientLast };
  }

  // 主入口：一次模拟同时读棱/角
  // opts 两种写法都支持：
  //   扁平 { orientFlag, skipCycleNum }             → 棱/角同一口径（旧调用方，行为不变）
  //   分侧 { edge: {...}, corner: {...} }           → 棱/角分别设定编码方案
  function readMoves(movesStr, edgeBuf, cornerBuf, opts) {
    opts = opts || {};
    const eo = opts.edge || opts;
    const co = opts.corner || opts;
    operatealg(movesStr);
    return {
      edge: readEdge(edgeBuf, eo),
      corner: readCorner(cornerBuf, co)
    };
  }

  return { readMoves, readEdge, readCorner, edgeChOf, cornerChOf, EDGE_BLOCKS, CORNER_BLOCKS, normEdgeBuf, normCornerBuf };
})();
if (typeof module !== 'undefined') module.exports = SPOON;



// ========== 状态 → facelet（min2phase 求解用） ==========
// 页面贴纸→面：角 UBL(0,1,2)=U,B,L UBR(3,4,5)=U,B,R UFR(6,7,8)=U,F,R UFL(9,10,11)=U,F,L DFL(12,13,14)=D,F,L DFR(15,16,17)=D,F,R DBR(18,19,20)=D,B,R DBL(21,22,23)=D,B,L
const CORNER_FACE = [0,5,4, 0,5,1, 0,2,1, 0,2,4, 3,2,4, 3,2,1, 3,5,1, 3,5,4];
// 棱 UF(0,1)=U,F UR(2,3)=U,R UB(4,5)=U,B UL(6,7)=U,L FR(8,9)=F,R FL(10,11)=F,L BL(12,13)=B,L BR(14,15)=B,R DF(16,17)=D,F DR(18,19)=D,R DB(20,21)=D,B DL(22,23)=D,L
const EDGE_FACE = [0,2, 0,1, 0,5, 0,4, 2,1, 2,4, 5,4, 5,1, 3,2, 3,1, 3,5, 3,4];
// Kociemba 角/棱位 → 页面块起始贴纸
const KC_START = [6, 9, 0, 3, 15, 12, 21, 18];   // URF,UFL,ULB,UBR,DFR,DLF,DBL,DRB
const KE_START = [2, 0, 6, 4, 18, 16, 22, 20, 8, 10, 12, 14];  // UR,UF,UL,UB,DR,DF,DL,DB,FR,FL,BL,BR
const K_CORNER = [[8,9,20],[6,18,38],[0,36,47],[2,45,11],[29,26,15],[27,44,24],[33,53,42],[35,17,51]];
const K_EDGE = [[5,10],[7,19],[3,37],[1,46],[32,16],[28,25],[30,43],[34,52],[23,12],[21,41],[50,39],[48,14]];
function toFacelet(corner, edge) {
  const f = [];
  const ts = 'URFDLB';
  for (let i = 0; i < 54; i++) f[i] = ts[Math.floor(i / 9)];
  for (let c = 0; c < 8; c++) {
    for (let n = 0; n < 3; n++) {
      const idx = K_CORNER[c][n];
      const face = Math.floor(idx / 9);
      let p = -1;
      for (let q = 0; q < 3; q++) if (CORNER_FACE[KC_START[c] + q] === face) { p = q; break; }
      f[idx] = ts[CORNER_FACE[corner[KC_START[c] + p]]];
    }
  }
  for (let e = 0; e < 12; e++) {
    for (let n = 0; n < 2; n++) {
      const idx = K_EDGE[e][n];
      const face = Math.floor(idx / 9);
      let p = -1;
      for (let q = 0; q < 2; q++) if (EDGE_FACE[KE_START[e] + q] === face) { p = q; break; }
      f[idx] = ts[EDGE_FACE[edge[KE_START[e] + p]]];
    }
  }
  return f.join('');
}
// ========== 最短解法压缩：状态 → 最短解法逆序（打乱） ==========
function shortestScramble(corner, edge) {
  const facelet = toFacelet(corner, edge);
  const sol = min2phase.solve(facelet, 21, 1e9, 0, 0).trim().split(/\s+/).filter(Boolean);
  return invertMoves(sol);
}
// ========== 贴纸位编号约定（供下方贴纸级转动 MAP_* 使用） ==========
// 贴纸位编号：棱 24 位（每棱 2 贴纸），角 24 位（每角 3 贴纸）
// 棱贴纸位：UF(U=0,F=1) UR(2,3) UB(4,5) UL(6,7) FR(8,9) FL(10,11) BL(12,13) BR(14,15) DF(16,17) DR(18,19) DB(20,21) DL(22,23)
// 角贴纸位：UBL(U=0,B=1,L=2) UBR(3,4,5) UFR(6,7,8) UFL(9,10,11) DFL(12,13,14) DFR(15,16,17) DBR(18,19,20) DBL(21,22,23)

// 读码/编码一律走 SPOON 引擎（cornerCh / edgeCh），本文件不再维护第二套字母表。

// ========== 三阶魔方贴纸级转动（CW 映射：newState[i] = state[map[i]]） ==========
const MAP_U_C = [9,11,10, 0,2,1, 3,5,4, 6,8,7, 12,13,14, 15,16,17, 18,19,20, 21,22,23];
const MAP_U_E = [2,3, 4,5, 6,7, 0,1, 8,9, 10,11, 12,13, 14,15, 16,17, 18,19, 20,21, 22,23];
const MAP_D_C = [0,1,2, 3,4,5, 6,7,8, 9,10,11, 21,23,22, 12,14,13, 15,17,16, 18,20,19];
const MAP_D_E = [0,1, 2,3, 4,5, 6,7, 8,9, 10,11, 12,13, 14,15, 22,23, 16,17, 18,19, 20,21];
const MAP_F_C = [0,1,2, 3,4,5, 11,10,9, 14,13,12, 17,16,15, 8,7,6, 18,19,20, 21,22,23];
const MAP_F_E = [11,10, 2,3, 4,5, 6,7, 1,0, 17,16, 12,13, 14,15, 9,8, 18,19, 20,21, 22,23];
const MAP_B_C = [5,4,3, 20,19,18, 6,7,8, 9,10,11, 12,13,14, 15,16,17, 23,22,21, 2,1,0];
const MAP_B_E = [0,1, 2,3, 15,14, 6,7, 8,9, 10,11, 5,4, 21,20, 16,17, 18,19, 13,12, 22,23];
const MAP_R_C = [0,1,2, 7,6,8, 16,15,17, 9,10,11, 12,13,14, 19,18,20, 4,3,5, 21,22,23];
const MAP_R_E = [0,1, 8,9, 4,5, 6,7, 18,19, 10,11, 12,13, 2,3, 16,17, 14,15, 20,21, 22,23];
const MAP_L_C = [22,21,23, 3,4,5, 6,7,8, 1,0,2, 10,9,11, 15,16,17, 18,19,20, 13,12,14];
const MAP_L_E = [0,1, 2,3, 4,5, 12,13, 8,9, 6,7, 22,23, 14,15, 16,17, 18,19, 20,21, 10,11];

// 中层转动（M/E/S）仅影响棱块，角块完全不动（角映射用恒等）
const MAP_M_E = [5,4, 2,3, 21,20, 6,7, 8,9, 10,11, 12,13, 14,15, 1,0, 18,19, 17,16, 22,23];
const MAP_E_E = [0,1, 2,3, 4,5, 6,7, 15,14, 9,8, 11,10, 13,12, 16,17, 18,19, 20,21, 22,23];
const MAP_S_E = [0,1, 7,6, 4,5, 23,22, 8,9, 10,11, 12,13, 14,15, 16,17, 3,2, 20,21, 19,18];
const ID_C = Array.from({length: 24}, (_, i) => i);

function applyMap(arr, map) {
  const ns = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) ns[i] = arr[map[i]];
  return ns;
}

const FACE_MAPS = {
  U: [MAP_U_C, MAP_U_E], D: [MAP_D_C, MAP_D_E], F: [MAP_F_C, MAP_F_E],
  B: [MAP_B_C, MAP_B_E], R: [MAP_R_C, MAP_R_E], L: [MAP_L_C, MAP_L_E],
  M: [ID_C, MAP_M_E], E: [ID_C, MAP_E_E], S: [ID_C, MAP_S_E]
};

function applyMove(corner, edge, face, count) {
  let c = corner, e = edge;
  const n = ((count % 4) + 4) % 4;
  if (n === 0) return [corner, edge];
  const [mc, me] = FACE_MAPS[face];
  for (let k = 0; k < n; k++) { c = applyMap(c, mc); e = applyMap(e, me); }
  return [c, e];
}

// ========== WCA 风格随机打乱 ==========
function randInt(n) { return Math.floor(Math.random() * n); }

// WCA 风格随机打乱：只用六面转动。
// 注意：不能掺入 M/E/S —— 中层转动会移动中心块，而本站贴纸模型以「中心固定」为坐标系，
// 单独的中层置换会得到奇偶非法的棱角状态，求解器无法处理（实测会返回空解）。
function generateScramble(len) {
  const faces = ['U','D','F','B','R','L'];
  const suffix = ['', "'", '2'];
  const moves = [];
  let lastFace = '', lastFace2 = '';
  const axis = { U:'D', D:'U', F:'B', B:'F', R:'L', L:'R' };
  for (let i = 0; i < len; i++) {
    let f;
    let guard = 0;
    do {
      f = faces[randInt(6)];
      guard++;
    } while ((f === lastFace) || (f === lastFace2 && f === axis[lastFace]) || guard > 20);
    lastFace2 = lastFace;
    lastFace = f;
    moves.push(f + suffix[randInt(3)]);
  }
  return moves;
}

// ========== 角不动共轭打乱（纯六面，WCA 标准） ==========
// 需求角编码=0（角块完全复原）时，六面随机转动必然扰动角块几乎无法命中。
// 方案：共轭公式 X·A·X' 串联，其中 A = R2 U2 R2 U2 R2 U2 是角块完全复原的纯六面公式。
// 共轭保持"角块复原"性质（X 先动角、A 复原、X' 还原），棱块被 X/A 扰动产生目标编码。
// 输出仅含 U/D/F/B/R/L，符合 WCA 打乱规范（无 M/E/S）。
// 长度控制：X 长度序列 [1,1,2] 比原 [2,2,2,2] 平均步数由约 37 降至约 24，
// 且实测棱编码 len=8/10/12 × 翻色 0/2/4 各组合命中率均可达（平均尝试 <120 次）。
// (X2 Y2)^3 一族：角块完全复原、棱块 2-2 交换。随机取用其中一个，避免模板固定
const CONJ_SET = [
  ['R2','U2','R2','U2','R2','U2'],
  ['R2','F2','R2','F2','R2','F2'],
  ['R2','B2','R2','B2','R2','B2'],
  ['R2','D2','R2','D2','R2','D2'],
  ['F2','U2','F2','U2','F2','U2']
];

function invertMoves(moves) {
  const inv = { U:'U\'', D:'D\'', F:'F\'', B:'B\'', R:'R\'', L:'L\'', U2:'U2', D2:'D2', F2:'F2', B2:'B2', R2:'R2', L2:'L2', "U'":'U', "D'":'D', "F'":'F', "B'":'B', "R'":'R', "L'":'L' };
  const res = [];
  for (let i = moves.length - 1; i >= 0; i--) res.push(inv[moves[i]]);
  return res;
}

function simplifyMoves(moves) {
  const cnt = m => m.endsWith("'") ? 3 : (m.endsWith('2') ? 2 : 1);
  const fmt = (f, v) => v === 1 ? f : (v === 2 ? f + '2' : f + "'");
  const out = [];
  for (const mv of moves) {
    const f = mv[0];
    if (out.length && out[out.length - 1][0] === f) {
      const nv = (out[out.length - 1][1] + cnt(mv)) % 4;
      out.pop();
      if (nv !== 0) out.push([f, nv]);
    } else {
      out.push([f, cnt(mv)]);
    }
  }
  return out.map(([f, v]) => fmt(f, v));
}

function generateConjScramble(xLens) {
  const seq = [];
  for (const xLen of xLens) {
    const X = generateScramble(xLen);
    const A = CONJ_SET[randInt(CONJ_SET.length)];
    seq.push(...X, ...A, ...invertMoves(X));
  }
  return simplifyMoves(seq);
}

// ========== 参数解析：单值 / 区间 / 枚举（任意写法都能识别） ==========
// 区间分隔符（横线族，含中文全角）：- ‐ ‑ ‒ – — ― − － ～ ~ ∼ 〜 ；连接词：到 / 至
// 枚举分隔符：, ，、; ；: ： | ／ / 空格
//   "10"           → 定值 10
//   "10-12"        → 10、11、12（含端点，宽度不限）
//   "6~20" / "6—20" / "6－20" / "6到20" / "6至20" → 同上
//   "10,12,15"     → 只取这三个值
//   "5-10,15"      → 混合写法：5..10 加 15
//   "" / "不限" / "任意" / "any" / "*" → 不限制（返回 null）
// 返回 { min, max, list, raw }；写法无法识别时返回 { invalid:true, raw, reason }，
// 由调用方明确报错——绝不能把「识别不了的输入」静默当成「不限」。
const RANGE_MAX_VALUE = 999;   // 单项数值上限（各参数实际远小于此）
const RANGE_MAX_WIDTH = 999;   // 区间宽度上限，防止枚举数组爆炸

function normRangeStr(str) {
  let s = String(str === null || str === undefined ? '' : str);
  s = s.replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); // 全角数字
  s = s.replace(/[\u2010-\u2015\u2212\uFF0D\uFF5E\u301C\u223C\u30FC~]/g, '-');                              // 横线族 → '-'
  s = s.replace(/[到至]/g, '-');                                                                             // 中文连接词 → '-'
  s = s.replace(/\s*-\s*/g, '-');                                                                            // 去掉横线两侧空格（"10 - 12"）
  s = s.replace(/[,\uFF0C\u3001;\uFF1B:\uFF1A|\uFF5C\/\uFF0F\s]+/g, ',');                                    // 其余分隔符 → ','
  return s.trim();
}

function parseRange(str) {
  const raw = String(str === null || str === undefined ? '' : str).trim();
  if (!raw) return null;
  const s = normRangeStr(raw);
  if (!s || /^(不限|任意|无|any|all|\*|-)$/i.test(s)) return null;
  const tokens = s.split(',').filter(function (t) { return t !== ''; });
  if (!tokens.length) return null;
  const list = [];
  const push = function (v) { if (list.indexOf(v) === -1) list.push(v); };
  for (let i = 0; i < tokens.length; i++) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(tokens[i]);
    if (!m) return { invalid: true, raw: raw, reason: '看不懂，请用 10-12 / 10,12 / 8 这类写法' };
    const a = parseInt(m[1], 10);
    const b = m[2] === undefined ? a : parseInt(m[2], 10);
    if (a > RANGE_MAX_VALUE || b > RANGE_MAX_VALUE) {
      return { invalid: true, raw: raw, reason: '数值超出上限 ' + RANGE_MAX_VALUE };
    }
    if (m[2] !== undefined && Math.abs(b - a) > RANGE_MAX_WIDTH) {
      return { invalid: true, raw: raw, reason: '区间过大（跨度上限 ' + RANGE_MAX_WIDTH + '）' };
    }
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let v = lo; v <= hi; v++) push(v);
  }
  if (!list.length) return { invalid: true, raw: raw, reason: '没有解析出任何数值' };
  list.sort(function (a, b) { return a - b; });
  return { min: list[0], max: list[list.length - 1], list: list, raw: raw };
}

// 供 UI 回显：把解析结果说成人话
function describeRange(range) {
  if (range && range.invalid) return '无法识别';
  if (!range || !range.list || !range.list.length) return '不限';
  const list = range.list;
  if (list.length === 1) return String(list[0]);
  // 连续段压成 a-b（5,6,7,8,9,10,15 → 5-10,15），读起来更清楚
  const segs = [];
  let start = list[0], prev = list[0];
  for (let i = 1; i < list.length; i++) {
    if (list[i] === prev + 1) { prev = list[i]; continue; }
    segs.push(start === prev ? String(start) : (start + '-' + prev));
    start = prev = list[i];
  }
  segs.push(start === prev ? String(start) : (start + '-' + prev));
  return segs.join(',') + '（共 ' + list.length + ' 个取值）';
}

// 三阶彳亍法下的实测可达范围（12000 次随机状态采样），用于「超出范围」提示；只提示不拦截
const BLD_LIMITS = {
  eLen: [0, 20], cLen: [0, 16], eFlip: [0, 16], cFlip: [0, 14],
  eBig: [0, 13], cBig: [0, 9], eSmall: [0, 6], cSmall: [0, 6]
};

// 八个数量类参数与其中文名（解析回显 / 体检 / 统计共用一份）
const PICK_FIELDS = [
  { key: 'eLen', label: '棱编码长度' }, { key: 'eFlip', label: '棱翻色数' },
  { key: 'eBig', label: '棱大循环长' }, { key: 'eSmall', label: '棱小循环数' },
  { key: 'cLen', label: '角编码长度' }, { key: 'cFlip', label: '角翻色数' },
  { key: 'cBig', label: '角大循环长' }, { key: 'cSmall', label: '角小循环数' }
];

// 参数体检：返回 [{ key, label, level:'error'|'warn', message }]
function validateBldCfg(cfg) {
  cfg = cfg || {};
  const out = [];
  PICK_FIELDS.forEach(function (f) {
    const key = f.key, label = f.label;
    const r = parseRange(cfg[key]);
    if (!r) return;
    if (r.invalid) {
      out.push({ key: key, label: label, level: 'error', message: label + '「' + r.raw + '」' + r.reason });
      return;
    }
    const lim = BLD_LIMITS[key];
    if (!lim) return;
    if (r.min > lim[1]) {
      out.push({ key: key, label: label, level: 'warn', message: label + ' ' + describeRange(r) + ' 全部超出三阶实测可达范围（' + lim[0] + '-' + lim[1] + '），大概率为空结果' });
    } else if (r.max > lim[1]) {
      out.push({ key: key, label: label, level: 'warn', message: label + ' ' + describeRange(r) + '：超出 ' + lim[1] + ' 的部分不可达，会自动跳过' });
    }
  });
  return out;
}

// 生成结束后的人话提示：区间里试了很多次都没命中的取值（多半是不可达值）
function formatNeverHit(list) {
  if (!list || !list.length) return '';
  const text = list.slice(0, 4).map(function (n) {
    return n.label + ' ' + n.value + '（试了 ' + n.tries + ' 次'
      + (n.seen ? '没凑成，与其它参数冲突' : '从未出现，可能超出可达范围') + '）';
  }).join('；');
  return text + (list.length > 4 ? ' 等 ' + list.length + ' 个取值' : '');
}

function getRange(id) {
  const el = document.getElementById(id);
  return el ? parseRange(el.value) : null;
}

// 区间内取数（区间多宽都能跑）：
//  1) 已产出越少的取值权重越高 → 批量生成时区间内自动摊匀，不堆在一端；
//  2) 同一目标值连续尝试 HOLD 次仍未命中就记一次「未命中」，其权重随未命中次数衰减
//     → 区间里不可达/极难的取值会被自动跳过，不会白耗尝试次数。
const PICKER_HOLD = 24;

// hintMax：可选，该参数的实测可达上限。区间里超出它的取值先给个低权重当先验，
// 免得一上手就在不可能的值上耗尝试次数（命中一次后即恢复正常权重）。
function makePicker(range, hintMax) {
  const noop = {
    pick: function () { return null; }, hit: function () {}, note: function () {},
    stats: function () { return { hits: {}, attempts: {}, neverHit: {} }; }
  };
  if (!range || range.invalid || !range.list || !range.list.length) return noop;
  const list = range.list;
  const softMax = (typeof hintMax === 'number' && hintMax > 0) ? hintMax : null;
  const tally = {}, miss = {}, fail = {}, att = {}, seen = {};
  list.forEach(function (v) {
    tally[v] = 0; att[v] = 0; seen[v] = 0; fail[v] = 0;
    miss[v] = (softMax !== null && v > softMax) ? 12 : 0;
  });
  const stats = function () {
    // 报告门槛是自适应的：对比「已产出取值的平均尝试次数」——
    // 只出了 4 条而区间有 15 个值时，很多取值只是还没轮到，不该被说成「未命中」；
    // 而某个值被反复抽中（远超其它值的代价）却始终没产出，才值得提示。
    const hitAtt = [];
    list.forEach(function (v) { if (tally[v] > 0) hitAtt.push(att[v]); });
    hitAtt.sort(function (a, b) { return a - b; });
    const base = hitAtt.length ? hitAtt[Math.floor(hitAtt.length / 2)] : 0;
    const threshold = Math.max(400, base * 3);
    const neverHit = {};
    list.forEach(function (v) {
      if (tally[v] === 0 && att[v] >= threshold) neverHit[v] = { attempts: att[v], seen: !!seen[v] };
    });
    return { hits: tally, attempts: att, neverHit: neverHit, threshold: threshold };
  };
  const note = function (v) {
    if (v === null || v === undefined || tally[v] === undefined) return;
    seen[v] = 1; miss[v] = 0;   // 该取值确实出现过（只是整体没同时满足）→ 视为可达
  };
  if (list.length === 1) {
    return {
      pick: function () { att[list[0]]++; return list[0]; },
      hit: function (v) { if (tally[v] !== undefined) { tally[v]++; note(v); } },
      note: note,
      stats: stats
    };
  }
  let cur = null, left = 0;
  return {
    pick: function () {
      if (cur !== null) {
        if (left > 0) { left--; att[cur]++; return cur; }
        // 整轮尝试结束仍未产出：从没出现过的值判定为「可能不可达」，出现过的值判定为「难凑」
        if (seen[cur]) fail[cur]++; else miss[cur]++;
      }
      let total = 0;
      const w = list.map(function (v) {
        const x = 1 / (Math.pow(1 + tally[v], 2)
          * (1 + (seen[v] ? 0 : miss[v]) * 0.35)
          * (1 + fail[v] * 0.15));
        total += x; return x;
      });
      const r = Math.random() * total;
      let acc = 0;
      cur = list[list.length - 1];
      for (let i = 0; i < list.length; i++) {
        acc += w[i];
        if (r <= acc) { cur = list[i]; break; }
      }
      left = PICKER_HOLD - 1;
      att[cur]++;
      return cur;
    },
    hit: function (v) {
      if (tally[v] !== undefined) { tally[v]++; note(v); fail[v] = 0; }  // 证明可达可凑 → 权重恢复正常
      cur = null; left = 0;                // 命中即换下一个目标值，保证区间取值分散
    },
    note: note,
    stats: stats
  };
}

function parseContain(str) {
  if (!str) return null;
  return str.trim().toUpperCase().split(/[,\s]+/).filter(Boolean);
}

// p = 参数（含区间），t = 本次尝试抽到的目标值（null 表示该项不限）
// 逐项判定并返回明细：生成器要按维度单独记录「该取值到底出现过没有」——
// 只看整体是否命中会把「可达、但被其它维度挡住」的值误判为不可达（进而错误压低其权重）。
// flipFromPairs（消翻色=不用时传 true）：读码不含翻色 ⇒ 编码里低色字母恒为 0，
// 此时「翻色数」改按卷面「翻色」行里的块数（flipPairs.length）判定 —— 那才是学生要翻的块数。
function sideMatches(info, p, t, flipFromPairs) {
  const len = info.code.length;
  // 彳亍编码翻色数 = 编码中低色字母（L）数量；盲拧翻色参数按编码判定，与物理 flipCount 解耦
  const codeFlip = flipFromPairs
    ? (info.flipPairs ? info.flipPairs.length : info.flipCount)
    : (info.colors ? info.colors.filter(c => c === 'L').length : info.flipCount);
  const r = {
    len: t.len == null || len === t.len,
    parity: p.parity === 'any' || (len % 2 === (p.parity === 'odd' ? 1 : 0)),
    flip: t.flip == null || codeFlip === t.flip,
    big: true, small: true, contain: true
  };
  if (p.orient === 'all' && codeFlip !== 0) r.flip = false;
  if (p.orient === 'none' && codeFlip !== len) r.flip = false;
  if (t.big != null) {
    r.big = info.cycles.reduce((m, cy) => Math.max(m, cy.length), 0) === t.big;
  }
  if (t.small != null) {
    r.small = Math.max(0, info.cycles.length - 1) === t.small;
  }
  if (p.contain) {
    const smallCycles = info.cycles.slice(1);
    r.contain = p.contain.every(ch => smallCycles.some(cy => cy.indexOf(ch) >= 0));
  }
  r.ok = r.len && r.parity && r.flip && r.big && r.small && r.contain;
  return r;
}

function checkSide(info, p, t, flipFromPairs) { return sideMatches(info, p, t, flipFromPairs).ok; }

// ========== 生成 ==========
const MAX_TRIES = 6000;

function simulateScramble(moves, coord) {
  let corner = Array.from({length: 24}, (_, i) => i);
  let edge = Array.from({length: 24}, (_, i) => i);
  for (const m of moves) {
    const face = m[0];
    const count = m.endsWith("'") ? 3 : (m.endsWith('2') ? 2 : 1);
    const r = applyMove(corner, edge, face, count);
    corner = r[0]; edge = r[1];
  }
  // 彳亍编码是魔方状态的物理属性，与观察视角无关；坐标选择仅影响显示，不影响编码计算
  return [corner, edge];
}

// 每次尝试都重新随机一个打乱长度（旧实现固定长度，是"每条公式长得都像"的主因之一）。
// 翻色需求含 0 时用短打乱——长打乱翻色必然多，几乎不可能命中。
function pickScrambleLen(te, tc) {
  const flips = [te.flip, tc.flip].filter(v => typeof v === 'number');
  const lens = [te.len, tc.len].filter(v => typeof v === 'number');
  const maxLen = lens.length ? Math.max.apply(null, lens) : 16;
  if (flips.length && flips.indexOf(0) >= 0) return 6 + randInt(7);           // 6..12
  const base = Math.min(26, Math.max(14, Math.round(maxLen * 1.1) + 2));
  return Math.max(8, base - 3 + randInt(7));                                    // base-3..base+3
}

// 角编码 = 0 时的共轭计划：X 段数与每段长度都随机，避免公式模板化
function randomConjPlan() {
  const n = 1 + randInt(3);
  const plan = [];
  for (let i = 0; i < n; i++) plan.push(1 + randInt(4));
  return plan;
}

// opts（可选）= { edgeBuf, cornerBuf, optimize,
//                 eOrientFlag, eSkipCycleNum, eFlipMode,
//                 cOrientFlag, cSkipCycleNum, cFlipMode }
// 默认 UF / UFR / 开启最优解压缩 / 保持色相借位 / 不用跳编法（= 通用彳亍口径）。
// 本函数不读写 DOM，供 bldscramble 与 practice（练习题纸）共用。
function tryGenerate(coord, ep, cp, wideTail, maxTries, pickers, opts) {
  // 角编码要求恒为 0：角块必须完全复原，改用共轭/交换子构造，输出前统一压成最优六面解
  const cornerZeroMode = !!(cp.len && cp.len.min === 0 && cp.len.max === 0);
  const o = opts || {};
  const edgeBuf = SPOON.normEdgeBuf(o.edgeBuf || 'UF');
  const cornerBuf = SPOON.normCornerBuf(o.cornerBuf || 'UFR');
  const optimize = o.optimize !== false;
  // 编码方案（棱/角分别可选）：色相借位是否修正 + 跳编法（固定借位法）。
  // 只改「读码字母 / 借还标记 / 由编码判定的翻色数」，不改打乱本身。
  // 不传时 readEdge/readCorner 落回默认值（orientFlag=1、skipCycleNum=0）。
  const encOpts = {
    edge: { orientFlag: o.eOrientFlag, skipCycleNum: o.eSkipCycleNum, flipMode: o.eFlipMode },
    corner: { orientFlag: o.cOrientFlag, skipCycleNum: o.cSkipCycleNum, flipMode: o.cFlipMode }
  };
  const limit = maxTries || MAX_TRIES;
  const P = pickers || {};
  const pk = function (k) { return P[k] ? P[k].pick() : null; };   // 未传 pickers 时视为「不限」
  const hk = function (k, v) { if (P[k]) P[k].hit(v); };            // 整条产出（用于区间摊匀）
  const nk = function (k, v) { if (P[k] && P[k].note) P[k].note(v); }; // 该取值出现过（可达性证据）
  for (let t = 0; t < limit; t++) {
    // 区间参数：本次尝试先锁定一组目标值（picker 内部保持若干次），命中即产出
    const te = { len: pk('eLen'), flip: pk('eFlip'), big: pk('eBig'), small: pk('eSmall') };
    const tc = { len: pk('cLen'), flip: pk('cFlip'), big: pk('cBig'), small: pk('cSmall') };
    let moves;
    if (cornerZeroMode) {
      moves = generateConjScramble(randomConjPlan());
    } else {
      moves = generateScramble(pickScrambleLen(te, tc));
    }
    // spooncuber 读码引擎：任意棱/角缓冲 + H/L 高低色标记 + 所选编码方案
    const info = SPOON.readMoves(moves.join(' '), edgeBuf, cornerBuf, encOpts);
    // 逐维度判定：先把「该取值出现过」记下来（可达性证据），再看整体是否命中
    // 消翻色=不用：读码不含翻色，翻色数按「翻色行块数」判定；=用：按编码低色字母数判定
    const eFromPairs = encOpts.edge.flipMode === 'separate';
    const cFromPairs = encOpts.corner.flipMode === 'separate';
    const eR = sideMatches(info.edge, ep, te, eFromPairs);
    const cR = sideMatches(info.corner, cp, tc, cFromPairs);
    if (eR.len) nk('eLen', te.len);
    if (eR.flip) nk('eFlip', te.flip);
    if (eR.big) nk('eBig', te.big);
    if (eR.small) nk('eSmall', te.small);
    if (cR.len) nk('cLen', tc.len);
    if (cR.flip) nk('cFlip', tc.flip);
    if (cR.big) nk('cBig', tc.big);
    if (cR.small) nk('cSmall', tc.small);
    if (!eR.ok || !cR.ok) continue;
    // 命中登记统一放在这里（调用方不要再重复 hit，否则权重会被记两次）
    hk('eLen', te.len); hk('eFlip', te.flip); hk('eBig', te.big); hk('eSmall', te.small);
    hk('cLen', tc.len); hk('cFlip', tc.flip); hk('cBig', tc.big); hk('cSmall', tc.small);
    let out = moves;
    if (optimize) {
      // 命中后统一走求解器取最优解再逆序：步数更短、形态差异更大（避免"随机游走"的同质观感）
      const st = simulateScramble(moves, coord);
      const short = shortestScramble(st[0], st[1]);
      if (short && short.length) out = short;
    }
    if (wideTail) out.push(wideTail);
    return { ok: true, moves: out, edgeInfo: info.edge, cornerInfo: info.corner, tries: t + 1, te: te, tc: tc };
  }
  return { ok: false, tries: limit };
}

// ========== 共享导出（tools/practice 等页面） ==========
// 参数归一：字符串（"10-12" / "10,12" / "10" / 留空=不限）→ checkSide 用的参数对象
// 注意：「翻色数」的判定口径随消翻色开关走（见 sideMatches）：
//   消翻色=用  → 编码中低色字母数（传统彳亍口径）
//   消翻色=不用 → 卷面「翻色」行块数（棱为偶数个、角为实际扭角数）
function bldNormSide(lenStr, flipStr, bigStr, smallStr, parity, orient, containStr) {
  return {
    len: parseRange(lenStr),
    flip: parseRange(flipStr),
    big: parseRange(bigStr),
    small: parseRange(smallStr),
    parity: parity || 'any',
    orient: orient || 'any',
    contain: parseContain(containStr)
  };
}

// 定向生成器工厂：每次 next() 产出条，可用尽尝试次数时返回 null。
// cfg = {
//   eLen/eFlip/eBig/eSmall/eParity/eOrient/eContain,
//   cLen/cFlip/cBig/cSmall/cParity/cOrient/cContain,   参数（字符串，支持区间）
//   edgeBuf, cornerBuf, optimize, maxTries,
//   eOrientFlag/eSkipCycleNum/eFlipMode/cOrientFlag/cSkipCycleNum/cFlipMode  编码方案（可选，见 tryGenerate）
// }
function createTargeted(cfg) {
  cfg = cfg || {};
  // 参数体检：写法识别不了就直接抛错（不静默当成「不限」）
  const bad = validateBldCfg(cfg).filter(function (i) { return i.level === 'error'; });
  if (bad.length) throw new Error(bad.map(function (i) { return i.message; }).join('；'));
  const ep = bldNormSide(cfg.eLen, cfg.eFlip, cfg.eBig, cfg.eSmall, cfg.eParity, cfg.eOrient, cfg.eContain);
  const cp = bldNormSide(cfg.cLen, cfg.cFlip, cfg.cBig, cfg.cSmall, cfg.cParity, cfg.cOrient, cfg.cContain);
  // 建 picker 时带上各参数的实测可达上限（先验，只影响权重不影响判定）
  const pickers = {};
  PICK_FIELDS.forEach(function (f) {
    const side = f.key.charAt(0) === 'e' ? ep : cp;
    const short = f.key.slice(1);            // Len / Flip / Big / Small
    const key = short.charAt(0).toLowerCase() + short.slice(1);
    pickers[f.key] = makePicker(side[key], BLD_LIMITS[f.key] ? BLD_LIMITS[f.key][1] : null);
  });
  const opts = {
    edgeBuf: cfg.edgeBuf || 'UF',
    cornerBuf: cfg.cornerBuf || 'UFR',
    optimize: cfg.optimize !== false,
    // 编码方案：页面可分别设定棱/角是否「保持色相借位」、是否用「跳编法（固定借位法）」
    eOrientFlag: cfg.eOrientFlag,
    eSkipCycleNum: cfg.eSkipCycleNum,
    eFlipMode: cfg.eFlipMode,
    cOrientFlag: cfg.cOrientFlag,
    cSkipCycleNum: cfg.cSkipCycleNum,
    cFlipMode: cfg.cFlipMode
  };
  const perItem = cfg.maxTries || MAX_TRIES;
  const seen = {};
  let tries = 0, fails = 0;
  return {
    next: function () {
      const r = tryGenerate(null, ep, cp, null, perItem, pickers, opts);
      tries += r.tries;
      if (!r.ok) { fails++; return null; }
      const text = r.moves.join(' ');
      if (seen[text]) return { dup: true, tries: r.tries };
      seen[text] = 1;
      return {
        text: text,
        moves: r.moves,
        edge: r.edgeInfo,
        corner: r.cornerInfo,
        // 消翻色口径（读码里是否已含翻色）：题纸答案区据此决定要不要再印「翻色」行
        edgeFlipMode: opts.eFlipMode === 'separate' ? 'separate' : 'merge',
        cornerFlipMode: opts.cFlipMode === 'separate' ? 'separate' : 'merge',
        steps: r.moves.length,
        tries: r.tries
      };
    },
    // neverHit = 区间内试了 ≥400 次仍未命中的取值（多半不可达），供页面提示
    stats: function () {
      const neverHit = [];
      PICK_FIELDS.forEach(function (f) {
        const p = pickers[f.key];
        const st = p && p.stats ? p.stats() : null;
        if (!st || !st.neverHit) return;
        Object.keys(st.neverHit).forEach(function (v) {
          const info = st.neverHit[v];
          neverHit.push({ key: f.key, label: f.label, value: Number(v), tries: info.attempts, seen: info.seen });
        });
      });
      neverHit.sort(function (a, b) { return b.tries - a.tries; });
      return { tries: tries, fails: fails, neverHit: neverHit };
    }
  };
}

// 同步批量：一次生成 count 条（页面想不卡 UI 请用 createTargeted 自行分帧）
function generateTargeted(cfg) {
  cfg = cfg || {};
  const count = Math.max(1, Math.min(200, cfg.count || 1));
  const gen = createTargeted(cfg);
  const budget = (cfg.maxTries || MAX_TRIES) * count * 3;
  const items = [];
  let used = 0, dupStreak = 0;
  while (items.length < count && used < budget) {
    const it = gen.next();
    used = gen.stats().tries;
    if (!it) break;
    if (it.dup) { dupStreak++; if (dupStreak > 300) break; continue; }
    dupStreak = 0;
    items.push(it);
    if (cfg.onProgress) cfg.onProgress(items.length, count);
  }
  return { items: items, complete: items.length >= count, tries: used };
}

// 编码摘要：棱/角编码串（供题纸答案区打印）
function summarize(item) {
  if (!item || !item.edge) return null;
  return {
    edge: item.edge.code.join(''),
    edgeRoles: item.edge.roles ? item.edge.roles.slice() : [],
    edgeFlipPairs: item.edge.flipPairs ? item.edge.flipPairs.slice() : [],
    corner: item.corner.code.join(''),
    cornerRoles: item.corner.roles ? item.corner.roles.slice() : [],
    cornerFlipPairs: item.corner.flipPairs ? item.corner.flipPairs.slice() : [],
    edgeFlip: item.edge.colors ? item.edge.colors.filter(function (c) { return c === 'L'; }).length : 0,
    cornerFlip: item.corner.colors ? item.corner.colors.filter(function (c) { return c === 'L'; }).length : 0,
    // 消翻色口径：'merge' = 翻色已并入读码（不印翻色行）；'separate' = 翻色单独给（印翻色行）
    edgeFlipMode: item.edgeFlipMode || 'merge',
    cornerFlipMode: item.cornerFlipMode || 'merge',
    steps: item.steps
  };
}

// 编码字母每 2 个一组（末尾落单的单独成组）
function chunkCode(letters) {
  const out = [];
  for (let i = 0; i < letters.length; i += 2) out.push(letters.slice(i, i + 2));
  return out;
}

// 读码四行（题纸答案区 / 复制文本共用）
// 返回 [{ key, label, letters: [{ ch, role }] }]，role: '' | 'borrow'(借位) | 'return'(归还)
// 按「棱 / 角」分区块省略：某区块主读码与需要的翻色行都为空 → 该区块整体不显示
// （角编码为 0 时角块两行消失）。
// 消翻色口径（flipMode）决定「翻色」行印不印：
//   'separate' = 读码只描述位置置换 ⇒ 必须印「翻色」行（空行也是「无翻色」的明确信号）；
//   'merge'    = 翻色已并入读码 ⇒ 不印「翻色」行（照做会重复解，等于多做一遍）。
function readLines(s) {
  if (!s) return [];
  const fromStr = function (str, roles) {
    const t = String(str || ''), out = [];
    for (let i = 0; i < t.length; i++) out.push({ ch: t[i], role: (roles && roles[i]) || '' });
    return out;
  };
  const fromPairs = function (list) {
    const out = [];
    (list || []).forEach(function (p) {
      for (let i = 0; i < p.length; i++) out.push({ ch: p[i], role: '' });
    });
    return out;
  };
  const out = [];
  const edge = fromStr(s.edge, s.edgeRoles);
  const corner = fromStr(s.corner, s.cornerRoles);
  const edgeFlip = fromPairs(s.edgeFlipPairs);
  const cornerFlip = fromPairs(s.cornerFlipPairs);
  // 消翻色（merge）口径下翻色已写进读码字母里，再印翻色行会让学生重复解 ⇒ 该行不显示
  const eMerge = s.edgeFlipMode !== 'separate';
  const cMerge = s.cornerFlipMode !== 'separate';
  // 区块内有任何内容（主读码，或需要单独给的翻色）就成对显示；两者皆空才整块隐藏
  if (edge.length || (!eMerge && edgeFlip.length)) {
    out.push({ key: 'edgeRead', label: '棱块读码', letters: edge });
    if (!eMerge) out.push({ key: 'edgeFlip', label: '棱块翻色', letters: edgeFlip });
  }
  if (corner.length || (!cMerge && cornerFlip.length)) {
    out.push({ key: 'cornerRead', label: '角块读码', letters: corner });
    if (!cMerge) out.push({ key: 'cornerFlip', label: '角块翻色', letters: cornerFlip });
  }
  return out;
}

// 借位 / 归还字母（去重，供题纸图例与复制文本使用）
function borrowReturn(s) {
  const of = function (str, roles, kind) {
    const out = [];
    (roles || []).forEach(function (r, i) { if (r === kind && out.indexOf(str[i]) === -1) out.push(str[i]); });
    return out;
  };
  return {
    edgeBorrow: of(s.edge || '', s.edgeRoles, 'borrow'),
    edgeReturn: of(s.edge || '', s.edgeRoles, 'return'),
    cornerBorrow: of(s.corner || '', s.cornerRoles, 'borrow'),
    cornerReturn: of(s.corner || '', s.cornerRoles, 'return')
  };
}

// 纯文本读码（复制用）：每 2 字母一组用 sep 连接
function formatReadLines(s, opts) {
  opts = opts || {};
  const sep = opts.sep === undefined ? '-' : opts.sep;
  const indent = opts.indent === undefined ? '   ' : opts.indent;
  const out = readLines(s).map(function (r) {
    const body = chunkCode(r.letters).map(function (g) {
      return g.map(function (x) { return x.ch; }).join('');
    }).join(sep);
    return indent + r.label + '：' + body;
  });
  // 借还说明按「棱 / 角」分开写：两套字母表共用同一批字形，
  // 合并成一行会出现「借位 H … 归还 H」这种看似矛盾的情况。
  const br = borrowReturn(s);
  const side = function (name, bw, rt) {
    if (!bw.length && !rt.length) return;
    out.push(indent + name + '借位：' + (bw.join('、') || '无') + '　' + name + '归还：' + (rt.join('、') || '无'));
  };
  side('棱块', br.edgeBorrow, br.edgeReturn);
  side('角块', br.cornerBorrow, br.cornerReturn);
  return out;
}

const BldCore = {
  min2phase: min2phase,
  SPOON: SPOON,
  parseRange: parseRange,
  normRangeStr: normRangeStr,
  describeRange: describeRange,
  validateBldCfg: validateBldCfg,
  formatNeverHit: formatNeverHit,
  BLD_LIMITS: BLD_LIMITS,
  PICK_FIELDS: PICK_FIELDS,
  parseContain: parseContain,
  checkSide: checkSide,
  sideMatches: sideMatches,
  makePicker: makePicker,
  simulateScramble: simulateScramble,
  shortestScramble: shortestScramble,
  generateScramble: generateScramble,
  generateConjScramble: generateConjScramble,
  invertMoves: invertMoves,
  simplifyMoves: simplifyMoves,
  tryGenerate: tryGenerate,
  createTargeted: createTargeted,
  generateTargeted: generateTargeted,
  summarize: summarize,
  chunkCode: chunkCode,
  readLines: readLines,
  borrowReturn: borrowReturn,
  formatReadLines: formatReadLines,
  DEFAULT_EDGE_BUF: 'UF',
  DEFAULT_CORNER_BUF: 'UFR'
};
if (typeof window !== 'undefined') window.BldCore = BldCore;
if (typeof module !== 'undefined' && module.exports) module.exports = BldCore;
