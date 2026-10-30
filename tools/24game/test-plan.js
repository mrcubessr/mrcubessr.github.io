var Suan24 = require('../../assets/vendor/suan24/suan24.js');

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

function F(n, d) { if (d < 0) { n = -n; d = -d; } var g = gcd(Math.abs(n), Math.abs(d)) || 1; return { n: n / g, d: d / g }; }

function fracStr(f) { return f.d === 1 ? String(f.n) : f.n + '/' + f.d; }

function fadd(a, b) { return F(a.n * b.d + b.n * a.d, a.d * b.d); }
function fsub(a, b) { return F(a.n * b.d - b.n * a.d, a.d * b.d); }
function fmul(a, b) { return F(a.n * b.n, a.d * b.d); }
function fdiv(a, b) { if (!b || b.n === 0) return null; return F(a.n * b.d, a.d * b.n); }

function calc(a, b, op) {
  var res;
  if (op === '+') res = fadd(a, b);
  else if (op === '-') res = fsub(a, b);
  else if (op === '*') res = fmul(a, b);
  else if (op === '/') res = fdiv(a, b);
  else throw new Error('未知操作符: ' + op);
  if (!res) throw new Error('计算失败（除以 0？）');
  return res;
}

function assert(cond, msg) { if (!cond) { throw new Error(msg); } }

function executeSteps(nums, steps) {
  var current = nums.map(function (n) { return Suan24.F(n, 1); });
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var idxA = -1, idxB = -1;
    for (var j = 0; j < current.length; j++) {
      if (idxA === -1 && fracStr(current[j]) === step.a) { idxA = j; continue; }
      if (idxB === -1 && fracStr(current[j]) === step.b) { idxB = j; }
    }
    if (idxA === -1 || idxB === -1 || idxA === idxB) throw new Error('步骤不自洽: 第' + i + '步找不到两张不同的卡');
    var res = calc(current[idxA], current[idxB], step.op);
    var hi = Math.max(idxA, idxB), lo = Math.min(idxA, idxB);
    current.splice(hi, 1);
    current.splice(lo, 1);
    current.push(res);
  }
  assert(current.length === 1 && fracStr(current[0]) === '24', '执行步骤后结果不为 24');
}

function test(nums) {
  var steps = Suan24.planSteps(nums);
  if (steps === null) {
    assert(JSON.stringify(nums) === '[1,1,1,1]', '无解断言失败');
    return;
  }
  assert(steps.length === 3, '步骤长度不为 3');
  executeSteps(nums, steps);
  console.log('测试通过: ' + JSON.stringify(nums));
  for (var i = 0; i < steps.length; i++) {
    console.log(JSON.stringify(steps[i]));
  }
}

try {
  test([3, 3, 8, 8]);
  test([1, 1, 1, 1]);
  test([4, 4, 4, 4]);
  test([2, 6, 8, 10]);
  test([6, 6, 6, 6]);
  test([1, 5, 5, 5]);
  test([8, 8, 3, 3]);
  test([1, 2, 10, 12]);
  test([5, 6, 7, 8]);
  test([2, 2, 8, 8]);
  test([3, 3, 3, 3]);
  test([4, 1, 8, 8]);
  // 自己补的 3 道有解的题
  test([3, 5, 7, 9]);
  test([2, 3, 6, 7]);
  test([1, 4, 5, 6]);
} catch (e) {
  console.error('测试失败: ' + e.message);
  process.exit(1);
}
