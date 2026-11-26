import {calculate} from "../src/lib/expr.mjs";
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
const calc = (source, options) => calculate(source, options).text;
const text = (line, options) => evaluateNotebook(line, options).map(row => {
    if (row.result) return row.result.value || row.result.error;
    return (row.parts || []).map(part => part.value || part.error || part.text).join("");
});

const timeCases = [
    ["08:30+90min", "10:00"],
    ["23:50+20min", "00:10（次日）"],
    ["17:20-08:30", "8h50min"],
    ["08:30+1.5h", "10:00"],
    ["1h30min to min", "90min"],
    ["90min to h", "1.5h"]
];
timeCases.forEach(([source, expected]) => eq(calc(source), expected, source));

const unitCases = [
    ["5km to m", "5000m"],
    ["1m+20cm", "1.2m"],
    ["2inch to cm", "5.08cm"],
    ["32degF to degC", "0degC"],
    ["100degC to degF", "212degF"],
    ["1GiB to MiB", "1024MiB"],
    ["100km/2h", "50km/h"],
    ["50km/h*2h", "100km"],
    ["100km/2h*2h", "100km"],
    ["60kg/m^2", "60kg/m^2"],
    ["2m^2 to cm^2", "20000cm^2"],
    ["(2m)^2 to cm^2", "40000cm^2"],
    ["7%2*1m", "1m"],
    ["25USD/h*14h", "350USD"],
    ["unit(2,\"m\") to cm", "200cm"],
    ["2m", "2m"]
];
unitCases.forEach(([source, expected]) => eq(calc(source), expected, source));
eq(calculate("1m+1kg").ok, false, "不同量纲不能相加");
eq(calculate("100USD+20EUR").ok, false, "不同币种不能直接相加");
eq(calculate("2x").ok, false, "隐式乘法不再支持");
eq(calculate("2*x=10").text, "5", "显式乘法方程");

eq(calc("100USD to CNY", {exchangeRates: {"USD/CNY": 7.2}}), "720CNY", "手工汇率");
eq(calc("100USD to CNY", {rates: {values: {EUR: 1, USD: 2, CNY: 8}}}), "400CNY", "在线交叉汇率");
eq(calculate("100USD to CNY").ok, false, "缺少汇率时明确报错");

const dateCases = [
    ["dateAdd(date(\"2026-01-31\"),1,\"months\")", "2026-02-28"],
    ["dateAdd(date(\"2028-01-31\"),1,\"months\")", "2028-02-29"],
    ["dateSubtract(date(\"2026-11-26\"),5,\"days\")", "2026-11-21"],
    ["dateBetween(date(\"2026-11-26\"),date(\"2026-12-03\"),\"days\")", "7"],
    ["date(\"2026-11-26\")+7d", "2026-12-03"],
    ["datetime(\"2026-11-26 23:50\")+20min", "2026-11-27 00:10:00"],
    ["formatDate(date(\"2026-11-26\"),\"YYYY年M月D日\")", "2026年11月26日"],
    ["year(date(\"2026-11-26\"))", "2026"],
    ["inZone(zoned(\"2026-11-26 15:00\",\"Asia/Shanghai\"),\"Asia/Tokyo\")", "2026-11-26 16:00:00+09:00[Asia/Tokyo]"]
];
dateCases.forEach(([source, expected]) => eq(calc(source), expected, source));

eq(calc("workdays(date(\"2026-11-26\"),date(\"2026-11-30\"))"), "3", "工作日含起止日期");
eq(calc("workdays(date(\"2026-11-26\"),date(\"2026-11-30\"))", {holidays: ["2026-11-27"]}), "2", "节假日排除");
eq(calc("addWorkdays(date(\"2026-11-26\"),1)"), "2026-11-27", "增加一个工作日");
eq(calc("addWorkdays(date(\"2026-11-26\"),1)", {holidays: ["2026-11-27"]}), "2026-11-30", "增加工作日跳过节假日");
eq(calc("workdays(date(\"2026-11-26\"),date(\"2026-11-30\"))", {extraWorkdays: ["2026-11-29"]}), "4", "调休周末计为工作日");

const typedNotebook = `开始时间=08:30
耗时=90min
结束：{{开始时间+耗时}}
日期=date("2026-11-26")
一周后：{{dateAdd(日期,1,"week")}}
unit 打 = 12 个
unit 盒 = 6 打
两盒：{{2盒 to 个}}`;
eq(JSON.stringify(text(typedNotebook)), JSON.stringify([
    "08:30", "90min", "结束：10:00", "2026-11-26", "一周后：2026-12-03", "12个", "6打", "两盒：144个"
]), "笔记本时间、日期与自定义单位");

eq(evaluateNotebook('日期=date("2026-11-26")\n【日期】')[1].kind, "text", "全角括号标题不被变量名误判为公式");

const summary = `午餐：{{35}}
交通：{{12}}
咖啡：{{18}}
上一项：{{prev}}
合计：{{total}}
平均：{{average}}

路程一：{{5km}}
路程二：{{500m}}
合计：{{total}}`;
eq(JSON.stringify(text(summary)), JSON.stringify([
    "午餐：35", "交通：12", "咖啡：18", "上一项：18", "合计：65",
    "平均：21.6666666666666666666666666666666666666667", "",
    "路程一：5km", "路程二：500m", "合计：5.5km"
]), "分组汇总、上一结果与单位汇总");

console.log(`\n时间日期与单位: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
