import {fixFromString, fixToNumber, fixToRat, numberToFix, ratDiv, ratMul, ratToFix} from "./number.mjs";
import {requireFeature} from "./features.mjs";
import {
    addDurationValue,
    addWorkdaysValue,
    dateAddValue,
    dateBetweenValue,
    dateParts,
    dateTimeValue,
    dateValue,
    formatDateValue,
    inZoneValue,
    nowValue,
    timeValue,
    todayValue,
    workdaysValue,
    zonedValue
} from "./datetime.mjs";
import {
    addValues,
    averageValues,
    convertToValue,
    formatValue,
    isCurrency,
    literalValue,
    moneyValue,
    multiplyValues,
    negateValue,
    numberValue,
    numericArgument,
    powerValue,
    stringArgument,
    sumValues,
    unitValue
} from "./value.mjs";

const T_NUM = "num";
const T_NAME = "name";
const T_STRING = "string";
const T_TIME = "time";
const T_OP = "op";
const T_LP = "(";
const T_RP = ")";
const T_SEP = ",";
const T_END = "end";

const FULLWIDTH = {
    "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
    "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
    "＋": "+", "－": "-", "＊": "*", "／": "/", "（": "(", "）": ")",
    "％": "%", "＾": "^", "．": ".", "，": ",", "；": ";", "＝": "=", "　": " "
};
const ALIAS = {"×": "*", "✕": "*", "✖": "*", "·": "*", "⋅": "*", "÷": "/", "−": "-", "–": "-", "—": "-"};
const isNameStart = ch => /^[\p{L}_°℃℉]$/u.test(ch || "");
const isNameChar = ch => /^[\p{L}\p{N}_°℃℉]$/u.test(ch || "");

const normalize = source => Array.from(source).map(ch => ALIAS[ch] || FULLWIDTH[ch] || ch).join("");

const tokenize = source => {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
        const ch = source[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const start = i;
        const time = source.slice(i).match(/^\d{1,2}:\d{2}(?::\d{2})?/);
        if (time) {
            i += time[0].length;
            tokens.push({type: T_TIME, text: time[0], start, end: i});
            continue;
        }
        if (ch === '"' || ch === "'") {
            const quote = ch;
            let text = "";
            let closed = false;
            i++;
            while (i < source.length) {
                if (source[i] === quote) {
                    i++;
                    closed = true;
                    break;
                }
                if (source[i] === "\\" && i + 1 < source.length) {
                    const escaped = source[++i];
                    text += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
                    i++;
                } else {
                    text += source[i++];
                }
            }
            if (!closed) {
                throw new Error("字符串缺少结束引号");
            }
            tokens.push({type: T_STRING, text, start, end: i});
            continue;
        }
        if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] || ""))) {
            let text = "";
            if (ch === ".") {
                text = "0";
            }
            while (i < source.length && /[0-9]/.test(source[i])) {
                text += source[i++];
                if (source[i] === "," && /^\d{3}(?!\d)/.test(source.slice(i + 1))) {
                    i++;
                }
            }
            if (source[i] === ".") {
                text += ".";
                i++;
                while (i < source.length && /[0-9]/.test(source[i])) {
                    text += source[i++];
                }
            }
            tokens.push({type: T_NUM, text, start, end: i});
            continue;
        }
        if (isNameStart(ch)) {
            let text = "";
            while (i < source.length && isNameChar(source[i])) {
                if (/\d/.test(source[i]) && /^(?:h|min|s|d|week)$/.test(text)) {
                    break;
                }
                text += source[i++];
            }
            tokens.push({type: T_NAME, text, start, end: i});
            continue;
        }
        if (ch === "(" || ch === ")") {
            tokens.push({type: ch === "(" ? T_LP : T_RP, text: ch, start, end: ++i});
            continue;
        }
        if (ch === "," || ch === ";") {
            tokens.push({type: T_SEP, text: ch, start, end: ++i});
            continue;
        }
        if ("+-*/%^=".includes(ch)) {
            if (ch === "*" && source[i + 1] === "*") {
                tokens.push({type: T_OP, text: "^", start, end: i + 2});
                i += 2;
            } else {
                tokens.push({type: T_OP, text: ch, start, end: ++i});
            }
            continue;
        }
        throw new Error("无法识别的字符: " + ch);
    }
    tokens.push({type: T_END, text: "", start: source.length, end: source.length});
    return tokens;
};

const parse = tokens => {
    let pos = 0;
    const peek = (offset = 0) => tokens[Math.min(pos + offset, tokens.length - 1)];
    const next = () => tokens[pos++];
    const isOp = (token, text) => token.type === T_OP && token.text === text;
    const isConversion = token => token.type === T_NAME && (token.text === "to" || token.text === "换算为");

    const parseStatement = () => {
        if (peek().type === T_NAME && isOp(peek(1), "=")) {
            const name = next().text;
            next();
            return {kind: "assign", name, value: parseExpression()};
        }
        return parseExpression();
    };

    const parseExpression = () => parseAdd();

    const parseUnitTarget = () => {
        const token = next();
        if (token.type !== T_NAME) {
            throw new Error("to 后需要目标单位");
        }
        let node = {kind: "name", text: token.text, args: [], isCall: false, unitContext: true};
        while (isOp(peek(), "^") || isOp(peek(), "/") || isOp(peek(), "*")) {
            const operator = next().text;
            if (operator === "^") {
                const exponent = next();
                if (exponent.type !== T_NUM) {
                    throw new Error("单位指数必须是数字");
                }
                node = {kind: "binary", op: "^", left: node, right: {kind: "num", text: exponent.text}};
            } else {
                const name = next();
                if (name.type !== T_NAME) {
                    throw new Error("复合单位写法不正确");
                }
                node = {kind: "binary", op: operator, left: node, right: {kind: "name", text: name.text, args: [], isCall: false, unitContext: true}};
            }
        }
        return node;
    };

    const parseAdd = () => {
        let node = parseMul();
        while (isOp(peek(), "+") || isOp(peek(), "-") || isConversion(peek())) {
            if (isConversion(peek())) {
                next();
                node = {kind: "convert", value: node, target: parseUnitTarget()};
            } else {
                const op = next().text;
                node = {kind: "binary", op, left: node, right: parseMul()};
            }
        }
        return node;
    };

    const parseMul = () => {
        let node = parseUnary();
        while (true) {
            if (isOp(peek(), "*") || isOp(peek(), "/") || isOp(peek(), "%")) {
                const op = next().text;
                const right = parseUnary();
                if ((op === "/" || op === "*") && right.kind === "name" && !right.isCall) {
                    right.unitContext = true;
                } else if ((op === "/" || op === "*") && right.kind === "binary" && right.op === "^" &&
                    right.left.kind === "name" && !right.left.isCall) {
                    right.left.unitContext = true;
                }
                node = {kind: "binary", op, left: node, right};
                continue;
            }
            if (node.kind === "quantity" && peek().type === T_NUM && peek(1).type === T_NAME) {
                node = {kind: "binary", op: "+", left: node, right: parseUnary()};
                continue;
            }
            break;
        }
        return node;
    };

    const parseUnary = () => {
        if (isOp(peek(), "+") || isOp(peek(), "-")) {
            const op = next().text;
            const operand = parseUnary();
            return op === "-" ? {kind: "negate", value: operand} : operand;
        }
        return parsePower();
    };

    const parsePower = () => {
        const base = parsePostfix();
        if (isOp(peek(), "^")) {
            next();
            const exponent = parseUnary();
            if (base.kind === "quantity" && !base.parenthesized) {
                return {kind: "quantityPower", amount: base.amount, unit: base.unit, exponent};
            }
            return {kind: "binary", op: "^", left: base, right: exponent};
        }
        return base;
    };

    const parsePostfix = () => {
        let node = parsePrimary();
        if (node.kind === "num" && peek().type === T_NAME && !isConversion(peek())) {
            node = {kind: "quantity", amount: node, unit: next().text};
        }
        while (isOp(peek(), "%") && ![T_NUM, T_NAME, T_LP].includes(peek(1).type)) {
            next();
            node = {kind: "percent", value: node};
        }
        return node;
    };

    const parsePrimary = () => {
        const token = next();
        if (token.type === T_NUM) {
            return {kind: "num", text: token.text};
        }
        if (token.type === T_STRING) {
            return {kind: "string", value: token.text};
        }
        if (token.type === T_TIME) {
            return {kind: "time", value: token.text};
        }
        if (token.type === T_NAME) {
            const args = [];
            let isCall = false;
            if (peek().type === T_LP) {
                next();
                isCall = true;
                if (peek().type !== T_RP) {
                    args.push(parseExpression());
                    while (peek().type === T_SEP) {
                        next();
                        args.push(parseExpression());
                    }
                }
                if (peek().type !== T_RP) {
                    throw new Error("函数缺少 )");
                }
                next();
            }
            return {kind: "name", text: token.text, args, isCall};
        }
        if (token.type === T_LP) {
            const node = parseExpression();
            if (peek().type !== T_RP) {
                throw new Error("缺少 )");
            }
            next();
            return Object.assign(node, {parenthesized: true});
        }
        throw new Error("表达式不完整");
    };

    const statements = [parseStatement()];
    while (peek().type === T_SEP) {
        next();
        statements.push(parseStatement());
    }
    if (peek().type !== T_END) {
        throw new Error("表达式存在多余内容，乘法请显式写 *");
    }
    return {kind: "program", statements};
};

const realArg = (args, index, name) => {
    if (index >= args.length) {
        throw new Error(name + "() 缺少参数");
    }
    return fixToNumber(numericArgument(args[index], name));
};

const stringArg = (args, index, name) => stringArgument(args[index], name);

const callNumeric = (name, args) => {
    const values = args.map(arg => fixToNumber(numericArgument(arg, name)));
    switch (name) {
        case "sqrt": return Math.sqrt(values[0]);
        case "abs": return Math.abs(values[0]);
        case "round": return Math.round(values[0]);
        case "floor": return Math.floor(values[0]);
        case "ceil": return Math.ceil(values[0]);
        case "trunc":
        case "int": return Math.trunc(values[0]);
        case "min": return Math.min(...values);
        case "max": return Math.max(...values);
        case "sum": return values.reduce((a, b) => a + b, 0);
        case "avg":
        case "mean": return values.reduce((a, b) => a + b, 0) / values.length;
        case "log": return values.length > 1 ? Math.log(values[0]) / Math.log(values[1]) : Math.log10(values[0]);
        case "ln": return Math.log(values[0]);
        case "exp": return Math.exp(values[0]);
        case "sin":
        case "cos":
        case "tan":
        case "asin":
        case "acos":
        case "atan": return Math[name](values[0]);
        case "pow": return Math.pow(values[0], values[1]);
        default: throw new Error("未知函数: " + name);
    }
};

const evaluate = (program, options) => {
    const variables = new Map(options.variables || []);
    const constants = {pi: numberValue("3.14159265358979323846"), e: numberValue("2.718281828459045")};

    const callFunction = (name, args) => {
        const lower = name.toLowerCase();
        if (["zoned", "inzone"].includes(lower)) {
            requireFeature(options, "timeZone", "时区功能");
        } else if (["time", "date", "datetime", "today", "now", "dateadd", "datesubtract", "datebetween",
            "formatdate", "workdays", "addworkdays", "year", "month", "day", "hour", "minute"].includes(lower)) {
            requireFeature(options, "timeDate", "时间与日期功能");
        }
        if (lower === "unit") {
            return literalValue(numericArgument(args[0], "unit"), stringArg(args, 1, "unit"), options);
        }
        if (lower === "money") {
            requireFeature(options, "currency", "货币功能");
            return moneyValue(numericArgument(args[0], "money"), stringArg(args, 1, "money").toUpperCase());
        }
        if (lower === "time") return timeValue(stringArg(args, 0, "time"));
        if (lower === "date") return dateValue(stringArg(args, 0, "date"));
        if (lower === "datetime") return dateTimeValue(stringArg(args, 0, "datetime"));
        if (lower === "zoned") return zonedValue(stringArg(args, 0, "zoned"), stringArg(args, 1, "zoned"));
        if (lower === "inzone") return inZoneValue(args[0], stringArg(args, 1, "inZone"));
        if (lower === "today") return todayValue(args.length ? stringArg(args, 0, "today") : undefined);
        if (lower === "now") return nowValue(args.length ? stringArg(args, 0, "now") : undefined);
        if (lower === "dateadd") return dateAddValue(args[0], realArg(args, 1, "dateAdd"), stringArg(args, 2, "dateAdd"));
        if (lower === "datesubtract") return dateAddValue(args[0], realArg(args, 1, "dateSubtract"), stringArg(args, 2, "dateSubtract"), true);
        if (lower === "datebetween") return numberValue(dateBetweenValue(args[0], args[1], stringArg(args, 2, "dateBetween")));
        if (lower === "formatdate") return {kind: "string", value: formatDateValue(args[0], stringArg(args, 1, "formatDate"))};
        if (lower === "format") return {kind: "string", value: formatValue(args[0], options)};
        if (lower === "workdays") return numberValue(workdaysValue(args[0], args[1], options));
        if (lower === "addworkdays") return addWorkdaysValue(args[0], realArg(args, 1, "addWorkdays"), options);
        if (lower === "year" || lower === "month" || lower === "day" || lower === "hour" || lower === "minute") {
            const part = dateParts(args[0]);
            const key = lower === "day" ? "day" : lower;
            return numberValue(part[key]);
        }
        return numberValue(callNumeric(lower, args));
    };

    const evalNode = node => {
        switch (node.kind) {
            case "program": {
                let value = numberValue("0");
                node.statements.forEach(statement => {
                    value = evalNode(statement);
                });
                return value;
            }
            case "assign": {
                const value = evalNode(node.value);
                variables.set(node.name, value);
                return value;
            }
            case "num": return numberValue(node.text);
            case "string": return {kind: "string", value: node.value};
            case "time":
                requireFeature(options, "timeDate", "时间与日期功能");
                return timeValue(node.value);
            case "quantity": return literalValue(evalNode(node.amount).value, node.unit, options);
            case "quantityPower": return multiplyValues(
                evalNode(node.amount),
                powerValue(unitValue(node.unit, options), evalNode(node.exponent)),
                false
            );
            case "name": {
                if (node.isCall) {
                    return callFunction(node.text, node.args.map(evalNode));
                }
                if (variables.has(node.text)) return variables.get(node.text);
                if (Object.prototype.hasOwnProperty.call(options.specials || {}, node.text)) return options.specials[node.text];
                if (constants[node.text]) return constants[node.text];
                if (isCurrency(node.text, options)) return moneyValue(fixFromString("1"), node.text);
                if (node.unitContext) return unitValue(node.text, options);
                throw new Error("未定义变量: " + node.text);
            }
            case "negate": return negateValue(evalNode(node.value));
            case "percent": return multiplyValues(evalNode(node.value), numberValue("100"), true);
            case "convert": return convertToValue(evalNode(node.value), evalNode(node.target), options);
            case "binary": {
                const left = evalNode(node.left);
                const right = evalNode(node.right);
                if (node.op === "+") return addValues(left, right, false, options);
                if (node.op === "-") return addValues(left, right, true, options);
                if (node.op === "*") return multiplyValues(left, right, false);
                if (node.op === "/") return multiplyValues(left, right, true);
                if (node.op === "^") return powerValue(left, right);
                if (node.op === "%") {
                    return numberValue(fixToNumber(numericArgument(left)) % fixToNumber(numericArgument(right)));
                }
                throw new Error("不支持的运算符: " + node.op);
            }
            default: throw new Error("不支持的表达式节点: " + node.kind);
        }
    };
    return evalNode(program);
};

export const isExtendedExpression = (source, options = {}) => {
    if (options.forceTyped) {
        return true;
    }
    return /["']|\d{1,2}:\d{2}|\bto\b|换算为|\b(?:date|datetime|zoned|inZone|dateAdd|dateSubtract|dateBetween|formatDate|today|now|workdays|addWorkdays|prev|total|average|unit|money)\b/i.test(source) ||
        /[\d)]\s*[\p{L}_°℃℉]/u.test(source);
};

export const calculateTyped = (source, options = {}) => {
    try {
        if (typeof source !== "string" || !source.trim() || source.length > (options.maxLength || 10000)) {
            throw new Error("表达式为空或过长");
        }
        const value = evaluate(parse(tokenize(normalize(source))), options);
        return {ok: true, value, text: formatValue(value, options), assignments: []};
    } catch (error) {
        return {ok: false, error: error && error.message ? error.message : String(error), position: -1};
    }
};

export const __test__ = {tokenize, parse, evaluate};
