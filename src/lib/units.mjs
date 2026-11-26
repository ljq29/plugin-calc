import {
    fixFromString,
    fixToRat,
    ratAdd,
    ratDivExact as ratDiv,
    ratMul,
    ratNeg,
    ratNorm,
    ratSub,
    ratToFix,
    ratZero
} from "./number.mjs";

const rat = text => {
    const parts = String(text).split("/");
    const numerator = fixToRat(fixFromString(parts[0]));
    return parts.length === 1 ? numerator : ratDiv(numerator, fixToRat(fixFromString(parts[1])));
};

const definition = (symbol, dimensions, factor = "1", offset = "0", aliases = []) => ({
    symbol,
    dimensions,
    factor: rat(factor),
    offset: rat(offset),
    aliases,
    terms: null
});

const DEFINITIONS = [
    definition("s", {time: 1}, "1", "0", ["sec", "second", "seconds", "秒"]),
    definition("min", {time: 1}, "60", "0", ["minute", "minutes", "分钟"]),
    definition("h", {time: 1}, "3600", "0", ["hr", "hour", "hours", "小时"]),
    definition("d", {time: 1}, "86400", "0", ["day", "days", "天"]),
    definition("week", {time: 1}, "604800", "0", ["weeks", "周"]),
    definition("m", {length: 1}, "1", "0", ["meter", "meters", "米"]),
    definition("mm", {length: 1}, "0.001", "0", ["毫米"]),
    definition("cm", {length: 1}, "0.01", "0", ["厘米"]),
    definition("km", {length: 1}, "1000", "0", ["千米", "公里"]),
    definition("inch", {length: 1}, "0.0254", "0", ["inches", "英寸"]),
    definition("ft", {length: 1}, "0.3048", "0", ["foot", "feet", "英尺"]),
    definition("yd", {length: 1}, "0.9144", "0", ["yard", "yards", "码"]),
    definition("mi", {length: 1}, "1609.344", "0", ["mile", "miles", "英里"]),
    definition("nmi", {length: 1}, "1852", "0", ["海里"]),
    definition("kg", {mass: 1}, "1", "0", ["千克", "公斤"]),
    definition("g", {mass: 1}, "0.001", "0", ["gram", "grams", "克"]),
    definition("mg", {mass: 1}, "0.000001", "0", ["毫克"]),
    definition("tonne", {mass: 1}, "1000", "0", ["吨"]),
    definition("lb", {mass: 1}, "0.45359237", "0", ["lbs", "pound", "pounds", "磅"]),
    definition("oz", {mass: 1}, "0.028349523125", "0", ["ounce", "ounces", "盎司"]),
    definition("斤", {mass: 1}, "0.5"),
    definition("两", {mass: 1}, "0.05"),
    definition("m^2", {length: 2}, "1", "0", ["sqm", "平方米"]),
    definition("cm^2", {length: 2}, "0.0001", "0", ["平方厘米"]),
    definition("km^2", {length: 2}, "1000000", "0", ["平方千米", "平方公里"]),
    definition("hectare", {length: 2}, "10000", "0", ["ha", "公顷"]),
    definition("亩", {length: 2}, "2000/3"),
    definition("m^3", {length: 3}, "1", "0", ["立方米"]),
    definition("L", {length: 3}, "0.001", "0", ["l", "liter", "litre", "升"]),
    definition("mL", {length: 3}, "0.000001", "0", ["ml", "毫升"]),
    definition("bit", {data: 1}, "1", "0", ["bits", "比特"]),
    definition("B", {data: 1}, "8", "0", ["byte", "bytes", "字节"]),
    definition("KB", {data: 1}, "8000"),
    definition("MB", {data: 1}, "8000000"),
    definition("GB", {data: 1}, "8000000000"),
    definition("TB", {data: 1}, "8000000000000"),
    definition("KiB", {data: 1}, "8192"),
    definition("MiB", {data: 1}, "8388608"),
    definition("GiB", {data: 1}, "8589934592"),
    definition("TiB", {data: 1}, "8796093022208"),
    definition("K", {temperature: 1}, "1", "0", ["kelvin", "开尔文"]),
    definition("degC", {temperature: 1}, "1", "273.15", ["°C", "℃", "celsius", "摄氏度"]),
    definition("degF", {temperature: 1}, "5/9", "229835/900", ["°F", "℉", "fahrenheit", "华氏度"]),
    definition("rad", {angle: 1}, "1", "0", ["radian", "radians", "弧度"]),
    definition("deg", {angle: 1}, "0.017453292519943295", "0", ["°", "degree", "degrees", "度"])
];

const clone = unit => ({
    symbol: unit.symbol,
    dimensions: {...unit.dimensions},
    factor: unit.factor,
    offset: unit.offset,
    aliases: unit.aliases || [],
    terms: unit.terms ? {...unit.terms} : null
});

const BUILTIN_REGISTRY = new Map();
DEFINITIONS.forEach(unit => {
    BUILTIN_REGISTRY.set(unit.symbol, unit);
    unit.aliases.forEach(alias => BUILTIN_REGISTRY.set(alias, unit));
});

export const createUnitRegistry = () => new Map(BUILTIN_REGISTRY);

export const resolveUnit = (name, registry) => {
    const unit = (registry || BUILTIN_REGISTRY).get(name);
    return unit ? clone(unit) : null;
};

export const registerBaseUnit = (registry, name) => {
    const existing = resolveUnit(name, registry);
    if (existing) {
        return existing;
    }
    const unit = definition(name, {["custom_" + name]: 1});
    registry.set(name, unit);
    return clone(unit);
};

export const registerScaledUnit = (registry, name, amount, baseUnit) => {
    if (resolveUnit(name, registry)) {
        throw new Error("单位已定义: " + name);
    }
    const unit = definition(name, baseUnit.dimensions, "1");
    unit.factor = ratMul(rat(amount), baseUnit.factor);
    unit.offset = ratZero();
    registry.set(name, unit);
    return clone(unit);
};

export const currencyUnit = code => definition(code, {["currency_" + code]: 1});

export const dimensionsOf = unit => unit.dimensions;

export const sameDimensions = (left, right) => {
    const a = left.dimensions || left;
    const b = right.dimensions || right;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => (a[key] || 0) === (b[key] || 0));
};

const termsOf = unit => unit.terms || {[unit.symbol]: 1};
const symbolOf = terms => {
    const numerator = [];
    const denominator = [];
    Object.entries(terms).forEach(([symbol, exponent]) => {
        if (exponent > 0) {
            numerator.push(symbol + (exponent === 1 ? "" : "^" + exponent));
        } else if (exponent < 0) {
            denominator.push(symbol + (exponent === -1 ? "" : "^" + (-exponent)));
        }
    });
    return (numerator.join("*") || "1") + (denominator.length ? "/" + denominator.join("*") : "");
};

export const combineUnits = (left, right, divide = false) => {
    if (!ratIsZeroValue(left.offset) || !ratIsZeroValue(right.offset)) {
        throw new Error("带偏移的温度单位不能用于复合单位");
    }
    const dimensions = {...left.dimensions};
    Object.entries(right.dimensions).forEach(([key, exponent]) => {
        dimensions[key] = (dimensions[key] || 0) + (divide ? -exponent : exponent);
        if (dimensions[key] === 0) {
            delete dimensions[key];
        }
    });
    const terms = {...termsOf(left)};
    Object.entries(termsOf(right)).forEach(([symbol, exponent]) => {
        terms[symbol] = (terms[symbol] || 0) + (divide ? -exponent : exponent);
        if (terms[symbol] === 0) {
            delete terms[symbol];
        }
    });
    return {
        symbol: symbolOf(terms),
        dimensions,
        factor: divide ? ratDiv(left.factor, right.factor) : ratMul(left.factor, right.factor),
        offset: ratZero(),
        aliases: [],
        terms
    };
};

export const powerUnit = (unit, exponent) => {
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 16 || !ratIsZeroValue(unit.offset)) {
        throw new Error("单位指数必须是非零整数，且不能用于偏移温度");
    }
    const dimensions = {};
    Object.entries(unit.dimensions).forEach(([key, value]) => {
        dimensions[key] = value * exponent;
        if (dimensions[key] === 0) {
            delete dimensions[key];
        }
    });
    let factor = ratNorm([1], [1], false);
    const count = Math.abs(exponent);
    for (let i = 0; i < count; i++) {
        factor = exponent > 0 ? ratMul(factor, unit.factor) : ratDiv(factor, unit.factor);
    }
    const terms = {};
    Object.entries(termsOf(unit)).forEach(([symbol, value]) => {
        terms[symbol] = value * exponent;
        if (terms[symbol] === 0) {
            delete terms[symbol];
        }
    });
    return {symbol: symbolOf(terms), dimensions, factor, offset: ratZero(), aliases: [], terms};
};

const ratIsZeroValue = value => value.n.every(digit => digit === 0);

export const quantityFromAmount = (amount, unit) => ({
    kind: "quantity",
    base: ratAdd(ratMul(fixToRat(amount), unit.factor), unit.offset),
    unit: clone(unit)
});

export const quantityFromBase = (base, unit) => ({kind: "quantity", base, unit: clone(unit)});

export const quantityAmount = quantity => ratToFix(ratDiv(
    ratSub(quantity.base, quantity.unit.offset),
    quantity.unit.factor
));

export const convertQuantity = (quantity, target) => {
    if (!sameDimensions(quantity.unit, target)) {
        throw new Error("单位量纲不一致: " + quantity.unit.symbol + " 与 " + target.symbol);
    }
    return quantityFromBase(quantity.base, target);
};

export const addQuantities = (left, right, subtract = false) => {
    if (!sameDimensions(left.unit, right.unit)) {
        throw new Error("单位量纲不一致: " + left.unit.symbol + " 与 " + right.unit.symbol);
    }
    return quantityFromBase(subtract ? ratSub(left.base, right.base) : ratAdd(left.base, right.base), left.unit);
};

export const negateQuantity = value => quantityFromBase(ratNeg(value.base), value.unit);

export const timeUnit = name => {
    const unit = resolveUnit(name);
    return unit && Object.keys(unit.dimensions).length === 1 && unit.dimensions.time === 1 ? unit : null;
};

export const isDimensionless = unit => Object.keys(unit.dimensions).length === 0;

export const normalizeUnitNumber = value => ratToFix(rat(value));

export const __test__ = {rat, DEFINITIONS};
