const S = require('../../assets/vendor/suan24/suan24.js');

function show(label, nums) {
  const r = S.solve(nums);
  console.log(`\n[${label}] ${nums.join(',')}`);
  console.log('  hasSolution=', r.hasSolution, 'count=', r.count,
    'integerOnly=', r.integerOnly, 'noDivision=', r.noDivision,
    'requiresFraction=', r.requiresFraction, 'anyNegative=', r.anyNegative);
  if (r.hasSolution) console.log('  sample:', r.solutions[0].text);
  return r;
}

// 经典用例
show('唯一分数解(3,3,8,8)', [3, 3, 8, 8]);
show('无解(1,1,1,1)', [1, 1, 1, 1]);
show('纯整数(4,4,4,4)', [4, 4, 4, 4]);
show('5*(5-1/5)(1,5,5,5)', [1, 5, 5, 5]);
show('(10*10-4)/4(10,10,4,4)', [10, 10, 4, 4]);
show('需整除(3,3,7,7)', [3, 3, 7, 7]);

// checkAnswer 校验
console.log('\n--- checkAnswer 校验 ---');
function ca(nums, expr) {
  const r = S.checkAnswer(nums, expr);
  console.log(`  ${nums.join(',')} 输入 "${expr}" =>`, JSON.stringify(r));
}
ca([3, 3, 8, 8], '(8/(3-(8/3)))');   // 应为 true
ca([3, 3, 8, 8], '8/(3-8/3)');        // 应为 true
ca([4, 4, 4, 4], '4*4+4+4');          // 应为 true
ca([4, 4, 4, 4], '4*4+4+5');          // 结果错
ca([4, 4, 4, 4], '4*4+4');            // 数字少用一个
ca([3, 3, 8, 8], '3+3+8+8');          // 结果错

// 去重检查：4,4,4,4 不应出现大量结合律重复
const r4 = S.solve([4, 4, 4, 4]);
console.log('\n[去重] 4,4,4,4 不同解数量 =', r4.count, '(应为合理的小数字，不应上千)');
console.log(r4.solutions.map(s => s.text).join(' | '));
