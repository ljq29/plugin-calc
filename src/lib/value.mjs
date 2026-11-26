import {
    cIsReal,
    fixFromString,
    fixIsZero,
    fixNeg,
    fixToNumber,
    fixToRat,
    fixToString,
    numberToFix,
    ratAdd,
    ratDivExact as ratDiv,
    ratIsZero,
    ratMul,
    ratNeg,
    ratNorm,
    ratSub,
    ratToFix
} from "./number.mjs";
import {applyPrecision, normalizePolicy} from "./precision.mjs";
import {
    addQuantities,
    combineUnits,
    convertQuantity,
    currencyUnit,
    negateQuantity,
    powerUnit,
    quantityAmount,
    quantityFromAmount,
    quantityFromBase,
    resolveUnit,
    sameDimensions,
    timeUnit
} from "./units.mjs";
import {
    addDurationValue,
    differenceSeconds,
    formatDateValue
} from "./datetime.mjs";

const ONE = ratNorm([1], [1], false);
const COMMON_CURRENCIES = new Set([
    "USD", "CNY", "EUR", "JPY", "GBP", "HKD", "TWD", "KRW", "AUD", "CAD", "CHF", "SGD",
    "NZD", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "INR", "THB", "MYR", "IDR", "PHP",
    "VND", "BRL", "MXN", "ZAR", "AED", "SAR", "TRY", "RUB", "BTC", "ETH", "SOL", "XRP", "USDT", "USDC"
]);

export const numberValue = value => ({
    kind: "number",
    value: typeof value === "string" ? fixFromString(value) : typeof value === "number" ? numberToFix(value) : value
});
export const moneyValue = (amount, currency) => ({kind: "money", amount, currency});
export const durationFromSeconds = (seconds, displayUnit = null) => ({kind: "duration", seconds, displayUnit});

export const isCurrency = (name, options = {}) => COMMON_CURRENCIES.has(name) ||
    (options.currencies || []).includes(name) || Boolean(options.rates && options.rates.values && options.rates.values[name]);

export const fromLegacyValue = value => {
    if (value && value.kind) {
        return value;
    }
    if (value && value.re && cIsReal(value)) {
        return numberValue(value.re);
    }
    throw new Error("该结果不能参与汇总");
};

export const literalValue = (amount, name, options = {}) => {
    if (isCurrency(name, options)) {
        return moneyValue(amount, name);
    }
    const unit = resolveUnit(name, options.unitRegistry);
    if (!unit) {
        throw new Error("未知单位: " + name);
    }
    const time = timeUnit(unit.symbol) || (unit.dimensions.time === 1 ? unit : null);
    if (time) {
        return {
            kind: "duration",
            seconds: ratToFix(ratMul(fixToRat(amount), time.factor)),
            displayUnit: time
        };
    }
    return quantityFromAmount(amount, unit);
};

export const unitValue = (name, options = {}) => {
    const unit = resolveUnit(name, options.unitRegistry);
    if (!unit) {
        throw new Error("未知单位: " + name);
    }
    return quantityFromAmount(fixFromString("1"), unit);
};

const durationAsQuantity = value => {
    const unit = value.displayUnit || resolveUnit("s");
    return quantityFromBase(fixToRat(value.seconds), unit);
};

const moneyAsQuantity = value => quantityFromAmount(value.amount, currencyUnit(value.currency));

const numericResult = rational => numberValue(ratToFix(rational));

export const addValues = (left, right, subtract = false, options = {}) => {
    if (left.kind === "number" && right.kind === "number") {
        return numericResult(subtract ? ratSub(fixToRat(left.value), fixToRat(right.value)) : ratAdd(fixToRat(left.value), fixToRat(right.value)));
    }
    if (left.kind === "duration" && right.kind === "duration") {
        return durationFromSeconds(numberValue(ratToFix(subtract ? ratSub(fixToRat(left.seconds), fixToRat(right.seconds)) : ratAdd(fixToRat(left.seconds), fixToRat(right.seconds)))).value);
    }
    if (["time", "date", "datetime", "zoned"].includes(left.kind) && right.kind === "duration") {
        return addDurationValue(left, right.seconds, subtract);
    }
    if (!subtract && left.kind === "duration" && ["time", "date", "datetime", "zoned"].includes(right.kind)) {
        return addDurationValue(right, left.seconds, false);
    }
    if (subtract && ["time", "date", "datetime", "zoned"].includes(left.kind) && left.kind === right.kind) {
        return durationFromSeconds(differenceSeconds(left, right));
    }
    if (left.kind === "money" && right.kind === "money") {
        if (left.currency !== right.currency) {
            throw new Error("不同货币不能直接加减，请先使用 to 转换");
        }
        return moneyValue(numericResult(subtract ? ratSub(fixToRat(left.amount), fixToRat(right.amount)) : ratAdd(fixToRat(left.amount), fixToRat(right.amount))).value, left.currency);
    }
    if (left.kind === "quantity" && right.kind === "quantity") {
        return addQuantities(left, right, subtract);
    }
    if (left.kind === "money" && right.kind === "quantity") {
        return addQuantities(moneyAsQuantity(left), right, subtract);
    }
    if (left.kind === "quantity" && right.kind === "money") {
        return addQuantities(left, moneyAsQuantity(right), subtract);
    }
    if ((left.kind === "quantity" && right.kind === "duration") || (left.kind === "duration" && right.kind === "quantity")) {
        const quantity = left.kind === "quantity" ? left : right;
        const duration = left.kind === "duration" ? left : right;
        return addQuantities(quantity, durationAsQuantity(duration), subtract);
    }
    throw new Error((subtract ? "不能相减: " : "不能相加: ") + left.kind + " 与 " + right.kind);
};

export const negateValue = value => {
    if (value.kind === "number") {
        return numberValue(fixNeg(value.value));
    }
    if (value.kind === "duration") {
        return durationFromSeconds(fixNeg(value.seconds), value.displayUnit);
    }
    if (value.kind === "quantity") {
        return negateQuantity(value);
    }
    if (value.kind === "money") {
        return moneyValue(fixNeg(value.amount), value.currency);
    }
    throw new Error("该值不能取负数");
};

export const multiplyValues = (left, right, divide = false) => {
    if (left.kind === "number" && right.kind === "number") {
        return numericResult(divide ? ratDiv(fixToRat(left.value), fixToRat(right.value)) : ratMul(fixToRat(left.value), fixToRat(right.value)));
    }
    if (left.kind === "number" && right.kind === "duration" && !divide) {
        return durationFromSeconds(ratToFix(ratMul(fixToRat(left.value), fixToRat(right.seconds))), right.displayUnit);
    }
    if (left.kind === "duration" && right.kind === "number") {
        return durationFromSeconds(ratToFix((divide ? ratDiv : ratMul)(fixToRat(left.seconds), fixToRat(right.value))), left.displayUnit);
    }
    if (left.kind === "number" && right.kind === "money" && !divide) {
        return moneyValue(ratToFix(ratMul(fixToRat(left.value), fixToRat(right.amount))), right.currency);
    }
    if (left.kind === "money" && right.kind === "number") {
        return moneyValue(ratToFix((divide ? ratDiv : ratMul)(fixToRat(left.amount), fixToRat(right.value))), left.currency);
    }
    if (left.kind === "money" && right.kind === "money" && divide) {
        if (left.currency !== right.currency) {
            throw new Error("不同货币不能直接相除");
        }
        return numericResult(ratDiv(fixToRat(left.amount), fixToRat(right.amount)));
    }
    if (left.kind === "number" && right.kind === "quantity") {
        if (divide) {
            throw new Error("暂不支持数字除以带单位的量");
        }
        return quantityFromBase(ratMul(fixToRat(left.value), right.base), right.unit);
    }
    if (left.kind === "quantity" && right.kind === "number") {
        return quantityFromBase((divide ? ratDiv : ratMul)(left.base, fixToRat(right.value)), left.unit);
    }
    if (left.kind === "money" && (right.kind === "duration" || right.kind === "quantity")) {
        left = moneyAsQuantity(left);
        if (right.kind === "duration") {
            right = durationAsQuantity(right);
        }
    }
    if (left.kind === "duration") {
        left = durationAsQuantity(left);
    }
    if (right.kind === "duration") {
        right = durationAsQuantity(right);
    }
    if (left.kind === "quantity" && right.kind === "quantity") {
        const unit = combineUnits(left.unit, right.unit, divide);
        const base = divide ? ratDiv(left.base, right.base) : ratMul(left.base, right.base);
        if (Object.keys(unit.dimensions).length === 0) {
            return numericResult(base);
        }
        return quantityFromBase(base, unit);
    }
    throw new Error((divide ? "不能相除: " : "不能相乘: ") + left.kind + " 与 " + right.kind);
};

export const powerValue = (left, right) => {
    if (right.kind !== "number") {
        throw new Error("指数必须是普通数字");
    }
    const exponent = fixToNumber(right.value);
    if (left.kind === "number") {
        if (Number.isInteger(exponent) && Math.abs(exponent) <= 64) {
            let result = ONE;
            for (let i = 0; i < Math.abs(exponent); i++) {
                result = exponent >= 0 ? ratMul(result, fixToRat(left.value)) : ratDiv(result, fixToRat(left.value));
            }
            return numericResult(result);
        }
        return numberValue(Math.pow(fixToNumber(left.value), exponent));
    }
    if (left.kind === "quantity") {
        const unit = powerUnit(left.unit, exponent);
        let base = ONE;
        for (let i = 0; i < Math.abs(exponent); i++) {
            base = exponent >= 0 ? ratMul(base, left.base) : ratDiv(base, left.base);
        }
        return quantityFromBase(base, unit);
    }
    throw new Error("该值不能进行幂运算");
};

const rateNumber = value => typeof value === "number" ? numberToFix(value) : fixFromString(String(value));

const exchangeRate = (from, to, options) => {
    if (from === to) {
        return ONE;
    }
    const manual = options.exchangeRates || {};
    if (manual[from + "/" + to] !== undefined) {
        return fixToRat(rateNumber(manual[from + "/" + to]));
    }
    if (manual[to + "/" + from] !== undefined) {
        return ratDiv(ONE, fixToRat(rateNumber(manual[to + "/" + from])));
    }
    const rates = options.rates;
    if (rates && rates.values && rates.values[from] !== undefined && rates.values[to] !== undefined) {
        return ratDiv(fixToRat(rateNumber(rates.values[to])), fixToRat(rateNumber(rates.values[from])));
    }
    throw new Error("缺少汇率: " + from + "/" + to + "，请设置手工汇率或更新在线汇率");
};

export const convertValue = (value, targetName, options = {}) => {
    if (value.kind === "money" && isCurrency(targetName, options)) {
        const amount = ratToFix(ratMul(fixToRat(value.amount), exchangeRate(value.currency, targetName, options)));
        return moneyValue(amount, targetName);
    }
    if (value.kind === "duration") {
        const target = timeUnit(targetName) || (resolveUnit(targetName, options.unitRegistry) || {}).dimensions?.time === 1 ? resolveUnit(targetName, options.unitRegistry) : null;
        if (!target) {
            throw new Error("时长只能转换为秒、分钟、小时、天或周");
        }
        return durationFromSeconds(value.seconds, target);
    }
    if (value.kind === "quantity" && isCurrency(targetName, options)) {
        const keys = Object.keys(value.unit.dimensions);
        if (keys.length === 1 && keys[0].startsWith("currency_") && value.unit.dimensions[keys[0]] === 1) {
            const from = keys[0].slice(9);
            const amount = ratToFix(ratMul(value.base, exchangeRate(from, targetName, options)));
            return quantityFromAmount(amount, currencyUnit(targetName));
        }
    }
    if (value.kind === "quantity") {
        const target = resolveUnit(targetName, options.unitRegistry);
        if (!target) {
            throw new Error("未知单位: " + targetName);
        }
        return convertQuantity(value, target);
    }
    throw new Error("该值不能进行单位换算");
};

export const convertToValue = (value, target, options = {}) => {
    if (target.kind === "money") {
        return convertValue(value, target.currency, options);
    }
    if (target.kind === "quantity") {
        if (value.kind === "quantity") {
            return convertQuantity(value, target.unit);
        }
        if (value.kind === "duration" && target.unit.dimensions.time === 1) {
            return durationFromSeconds(value.seconds, target.unit);
        }
    }
    throw new Error("无法换算成目标单位");
};

const rounded = (rational, policy) => ratToFix(applyPrecision(rational, policy));

const formatCompositeDuration = (seconds, policy) => {
    const negative = seconds.neg;
    let remaining = Math.abs(fixToNumber(seconds));
    const days = Math.floor(remaining / 86400);
    remaining -= days * 86400;
    const hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    const minutes = Math.floor(remaining / 60);
    remaining -= minutes * 60;
    let text = "";
    if (days) text += days + "d";
    if (hours) text += hours + "h";
    if (minutes) text += minutes + "min";
    if (remaining || !text) {
        const secondText = fixToString(rounded(fixToRat(numberToFix(remaining)), policy));
        text += secondText + "s";
    }
    return (negative ? "-" : "") + text;
};

export const formatValue = (value, options = {}) => {
    const policy = normalizePolicy(options);
    if (value.kind === "number") {
        return fixToString(rounded(fixToRat(value.value), policy));
    }
    if (value.kind === "quantity") {
        return fixToString(rounded(fixToRat(quantityAmount(value)), policy)) + value.unit.symbol;
    }
    if (value.kind === "money") {
        return fixToString(rounded(fixToRat(value.amount), policy)) + value.currency;
    }
    if (value.kind === "duration") {
        if (value.displayUnit) {
            const amount = ratDiv(fixToRat(value.seconds), value.displayUnit.factor);
            return fixToString(rounded(amount, policy)) + value.displayUnit.symbol;
        }
        return formatCompositeDuration(value.seconds, policy);
    }
    if (["time", "date", "datetime", "zoned"].includes(value.kind)) {
        return formatDateValue(value);
    }
    if (value.kind === "string") {
        return value.value;
    }
    throw new Error("无法显示该结果");
};

export const sumValues = values => {
    if (!values.length) {
        return numberValue("0");
    }
    return values.slice(1).reduce((total, value) => addValues(total, value), values[0]);
};

export const averageValues = values => {
    if (!values.length) {
        throw new Error("当前分组没有可求平均的结果");
    }
    return multiplyValues(sumValues(values), numberValue(String(values.length)), true);
};

export const numericArgument = (value, name = "参数") => {
    if (value.kind !== "number") {
        throw new Error(name + "必须是普通数字");
    }
    return value.value;
};

export const stringArgument = (value, name = "参数") => {
    if (value.kind !== "string") {
        throw new Error(name + "必须是字符串");
    }
    return value.value;
};

export const realNumber = value => numberToFix(fixToNumber(numericArgument(value)));

export {ONE};
