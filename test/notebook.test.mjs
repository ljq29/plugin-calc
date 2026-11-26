import {calculate, settleText} from "../src/lib/expr.mjs";
import {evaluateNotebook} from "../src/lib/notebook.mjs";

let passed = 0;
let failed = 0;
const eq = (actual, expected, label) => {
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        console.log(`FAIL  ${label}\n      actual   = ${JSON.stringify(actual)}\n      expected = ${JSON.stringify(expected)}`);
    }
};

const sample = evaluateNotebook(`单价=68
数量=2
运费=10

商品金额：{{单价*数量}}
含运费总价：{{单价*数量+运费}}
单价*数量
单价*数量*0.8`);

eq(sample[0].kind, "definition", "中文变量定义");
eq(sample[0].result.value, "68", "单价为 68");
eq(sample[1].result.value, "2", "数量为 2");
eq(sample[2].result.value, "10", "运费为 10");
eq(sample[3].kind, "blank", "空行保留");
eq(sample[4].parts[0].text, "商品金额：", "行内公式前的文字保留");
eq(sample[4].parts[1].value, "136", "行内公式计算商品金额");
eq(sample[4].parts[1].expression, "单价*数量", "行内公式保留原公式");
eq(sample[5].parts[1].value, "146", "行内公式计算含运费总价");
eq(sample[6].kind, "formula", "独立变量公式行");
eq(sample[6].result.value, "136", "独立公式计算结果");
eq(sample[7].result.value, "108.8", "小数乘法结果");

const dependent = evaluateNotebook("a=3\nb=a*2\na+b");
eq(dependent[1].result.value, "6", "后面的变量可引用前面的变量");
eq(dependent[2].result.value, "9", "独立公式使用顺序依赖");

const changed = evaluateNotebook("单价=70\n数量=2\n运费=10\n商品金额：{{单价*数量}}\n含运费总价：{{单价*数量+运费}}\n单价*数量*0.8");
eq(changed[3].parts[1].value, "140", "修改变量后商品金额自动更新");
eq(changed[4].parts[1].value, "150", "修改变量后总价自动更新");
eq(changed[5].result.value, "112", "修改变量后独立公式自动更新");

const text = evaluateNotebook("这是一段普通文字\n\n今天完成采购\n购物-交通");
eq(text[0].kind, "text", "普通中文不被当成公式");
eq(text[0].source, "这是一段普通文字", "普通文字原样保留");
eq(text[1].kind, "blank", "连续内容中的空行保留");
eq(text[2].kind, "text", "无运算符文字保持原样");
eq(text[3].kind, "text", "含连字符的普通中文保持原样");

const mixed = evaluateNotebook("a=2\n结果 {{a+1}} 与 {{a*4}}。\n0.1+0.2");
eq(mixed[1].parts.length, 5, "多个行内公式与文字按顺序混排");
eq(mixed[1].parts[1].value, "3", "第一个混排公式");
eq(mixed[1].parts[2].text, " 与 ", "公式之间的文字保留");
eq(mixed[1].parts[3].value, "8", "第二个混排公式");
eq(mixed[1].parts[4].text, "。", "公式后的标点保留");
eq(mixed[2].result.value, "0.3", "十进制精确计算");

eq(evaluateNotebook("未定义+1")[0].result.ok, false, "未定义变量显示错误");
eq(evaluateNotebook("1/0")[0].result.ok, false, "除零显示错误");
eq(evaluateNotebook("a=")[0].result.ok, false, "变量值为空显示错误");
eq(evaluateNotebook("{{}}")[0].parts[0].error, "公式为空", "空行内公式显示错误");
eq(evaluateNotebook("总价 {{1+2")[0].parts.some(part => part.error === "缺少 }}"), true, "未闭合行内公式显示错误");
eq(evaluateNotebook("前 {{1+2}} 后 {{3+4")[0].parts.some(part => part.error === "缺少 }}"), true, "部分公式未闭合也能识别");
eq(evaluateNotebook("文字 }}")[0].parts.some(part => part.error === "缺少 {{"), true, "多余结束标记显示错误");
eq(evaluateNotebook("a=3\na")[1].result.value, "3", "独立变量名显示变量值");
eq(evaluateNotebook("sqrt(16)")[0].result.value, "4", "独立函数公式");

eq(calculate("单价=68;单价*2").text, "136", "表达式引擎支持中文变量");
eq(settleText("测试12*5=").text, "测试12*5=60", "原等号结算不受 Unicode 变量支持影响");

const numericVariables = evaluateNotebook(`1号=10
2号=20
1A=5
2026收入=100
编号合计=1号+2号+1A
2027收入=2026收入*2`);
eq(numericVariables[4].result.value, "35", "数字开头变量可直接参与计算");
eq(numericVariables[5].result.value, "200", "数字开头的年份变量可引用");
eq(evaluateNotebook("123=10")[0].result.error, "变量名不能是纯数字", "纯数字不能作为变量名");
eq(evaluateNotebook("1m=10")[0].result.error.includes("数字+单位"), true, "数字变量不能与数字加单位重名");
eq(evaluateNotebook("1组=3\n1组A=4\n合计=1组+1组A")[2].result.value, "7", "数字变量按最长名称识别");
eq(evaluateNotebook("1号=10\n1号*2")[1].result.value, "20", "独立公式识别数字变量");
eq(evaluateNotebook("1号=10\n1号：{{1号*2}}")[1].parts[1].value, "20", "行内公式识别数字变量");

const labelled = evaluateNotebook(`AA=5
BB=7
CC=8
A B C ： AA + BB + CC
English label: AA*BB
注意：明天
网址：https://example.com
08:30+90min
错误公式：AA+未定义`);
eq(labelled[3].kind, "inline", "带空格说明和全角冒号识别为文字公式");
eq(labelled[3].parts[0].text, "A B C ： ", "文字公式保留说明和空白");
eq(labelled[3].parts[1].value, "20", "全角冒号后的裸公式求值");
eq(labelled[4].parts[1].value, "35", "英文冒号后的裸公式求值");
eq(labelled[5].kind, "text", "冒号后的普通文字保持文本");
eq(labelled[6].kind, "text", "普通网址保持文本");
eq(labelled[7].result.value, "10:00", "时间冒号不被当成说明分隔符");
eq(labelled[8].parts[1].ok, false, "说明后的公式错误正常显示");

const variableSums = evaluateNotebook(`费用_A=1
费用_B=2
其他_A=4
费用合计=sum("费用_*")
A合计=sum("*_A")
空合计=sum("无_*")
费用_A=10
更新后费用=sum("费用_*")
全部数字=sum("*")`);
eq(variableSums[3].result.value, "3", "sum 按前缀汇总此前变量");
eq(variableSums[4].result.value, "5", "sum 按后缀汇总此前变量");
eq(variableSums[5].result.value, "0", "sum 空匹配返回零");
eq(variableSums[7].result.value, "12", "同名变量重定义只取最新值一次");
eq(variableSums[8].result.value, "36", "sum 星号汇总此前全部数字变量");
eq(evaluateNotebook("后续=sum(\"费用_*\")\n费用_A=10")[0].result.value, "0", "sum 不统计当前行之后的变量");
eq(evaluateNotebook("A=1\na=2\n大小写=sum(\"A*\")")[2].result.value, "1", "sum 变量匹配区分大小写");
eq(evaluateNotebook("a=1\nb=sum(\"a*b\")")[1].result.ok, false, "sum 拒绝中间通配符");
eq(calculate("sum(1,2,3)").text, "6", "原有 sum 数字参数保持不变");
eq(evaluateNotebook("a=1\nb=sum(\"*\")", {features: {aggregation: false}})[1].result.error.includes("分组汇总"), true, "变量筛选求和受分组汇总开关控制");

console.log(`\n计算笔记本: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
