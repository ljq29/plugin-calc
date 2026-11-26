import {calculate} from "./expr.mjs";
import {createUnitRegistry, registerBaseUnit, registerScaledUnit, resolveUnit} from "./units.mjs";
import {averageValues, fromLegacyValue, sumValues} from "./value.mjs";
import {isExtendedExpression} from "./typed-expr.mjs";
import {featureEnabled, requireFeature} from "./features.mjs";

const DEFINITION_PATTERN = /^((?:[\p{L}_]|\d+(?=[\p{L}_]))[\p{L}\p{N}_]*)\s*=\s*(.*)$/u;
const UNIT_PATTERN = /^unit\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*([0-9]+(?:\.[0-9]+)?)\s+([\p{L}_][\p{L}\p{N}_]*)$/u;
const CALC_OPTIONS = {maxLength: 10000};

const createEvaluator = options => {
    const unitRegistry = createUnitRegistry();
    const definitionNames = [];
    const typedVariables = new Map();
    const legacyVariables = new Map();
    let hasExtendedDefinitions = false;
    let previous = null;
    let group = [];

    const resultOf = (expression, localOptions = {}) => {
        if (!featureEnabled(options, "aggregation") && /\b(?:prev|total|average)\b/.test(expression)) {
            return {ok: false, error: "分组汇总功能已在设置中禁用"};
        }
        const specials = {};
        if (previous) {
            specials.prev = previous;
        }
        if (/\btotal\b/.test(expression)) {
            try {
                specials.total = sumValues(group);
            } catch (error) {
                return {ok: false, error: error.message};
            }
        }
        if (/\baverage\b/.test(expression)) {
            try {
                specials.average = averageValues(group);
            } catch (error) {
                return {ok: false, error: error.message};
            }
        }
        const useTyped = hasExtendedDefinitions || isExtendedExpression(expression, options);
        const result = calculate(expression, Object.assign({}, options, CALC_OPTIONS, localOptions, {
            unitRegistry,
            specials,
            variables: useTyped ? typedVariables : legacyVariables,
            variableHistory: typedVariables,
            forceTyped: useTyped
        }));
        if (!result.ok) {
            return {ok: false, error: result.error};
        }
        let value = null;
        if (result.value) {
            try {
                value = fromLegacyValue(result.value);
            } catch {
                value = null;
            }
        }
        return {ok: true, value: result.text, rawValue: value, engineValue: result.value};
    };

    const record = (result, includeInGroup = true) => {
        if (!result.ok || !result.rawValue) {
            return;
        }
        previous = result.rawValue;
        if (includeInGroup) {
            group.push(result.rawValue);
        }
    };

    const parseInline = line => {
        const parts = [];
        let cursor = 0;
        const appendText = end => {
            if (end > cursor) {
                parts.push({kind: "text", text: line.slice(cursor, end)});
            }
        };
        while (cursor < line.length) {
            const open = line.indexOf("{{", cursor);
            const close = line.indexOf("}}", cursor);
            if (close > -1 && (open === -1 || close < open)) {
                appendText(close);
                parts.push({kind: "error", error: "缺少 {{"});
                cursor = close + 2;
                continue;
            }
            if (open === -1) {
                appendText(line.length);
                break;
            }
            appendText(open);
            const end = line.indexOf("}}", open + 2);
            if (end === -1) {
                parts.push({kind: "error", error: "缺少 }}"});
                break;
            }
            const expression = line.slice(open + 2, end).trim();
            const result = expression ? resultOf(expression) : {ok: false, error: "公式为空"};
            parts.push(Object.assign({kind: "calculation", source: line.slice(open, end + 2), expression}, result));
            record(result, !/\b(?:total|average|prev)\b/.test(expression));
            cursor = end + 2;
        }
        return parts;
    };

    const looksLikeFormula = line => {
        if (/^[0-9./*^%()]/.test(line) || (/^[+-]/.test(line) && !/^[+-]\s/.test(line)) ||
            (/\d/.test(line) && /[+\-*/^%]/.test(line)) ||
            /^[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line) ||
            /^[A-Za-z_][A-Za-z0-9_]*(?:\s*[+\-*/^%]\s*[A-Za-z_][A-Za-z0-9_]*)+$/.test(line)) {
            return true;
        }
        return definitionNames.some(name => {
            return new RegExp("(?<![\\p{L}\\p{N}_])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
                "(?![\\p{L}\\p{N}_])", "u").test(line);
        });
    };

    const parseLabelled = line => {
        for (let i = 0; i < line.length; i++) {
            if (line[i] !== "：" && line[i] !== ":") {
                continue;
            }
            if (line[i] === ":" && /\d/.test(line[i - 1] || "") && /\d/.test(line[i + 1] || "")) {
                continue;
            }
            let expressionStart = i + 1;
            while (/\s/.test(line[expressionStart] || "")) {
                expressionStart++;
            }
            const label = line.slice(0, expressionStart);
            const expression = line.slice(expressionStart).trim();
            if (!label.trim().replace(/[：:]\s*$/, "") || !expression) {
                continue;
            }
            const result = resultOf(expression);
            if (!result.ok && !looksLikeFormula(expression)) {
                return null;
            }
            record(result, !/\b(?:total|average|prev)\b/.test(expression));
            return {
                kind: "inline",
                source: line,
                parts: [
                    {kind: "text", text: label},
                    Object.assign({kind: "calculation", source: line.slice(expressionStart), expression}, result)
                ]
            };
        }
        return null;
    };

    const defineUnit = match => {
        const [, name, amount, baseName] = match;
        try {
            requireFeature(options, "customUnits", "自定义单位功能");
            const base = resolveUnit(baseName, unitRegistry) || registerBaseUnit(unitRegistry, baseName);
            registerScaledUnit(unitRegistry, name, amount, base);
            return {
                kind: "definition",
                name: "unit " + name,
                expression: amount + " " + baseName,
                result: {ok: true, value: amount + baseName}
            };
        } catch (error) {
            return {kind: "definition", name: "unit " + name, expression: amount + " " + baseName,
                result: {ok: false, error: error.message}};
        }
    };

    const evaluateLine = line => {
        const trimmed = line.trim();
        if (!trimmed) {
            group = [];
            return {kind: "blank", source: line};
        }
        if (/^【[^】]+】$/.test(trimmed)) {
            return {kind: "text", source: line};
        }
        const unit = trimmed.match(UNIT_PATTERN);
        if (unit) {
            return Object.assign(defineUnit(unit), {source: line});
        }
        const numericDefinition = trimmed.match(/^(\d+)\s*=\s*(.*)$/);
        if (numericDefinition) {
            return {kind: "definition", source: line, name: numericDefinition[1], expression: numericDefinition[2],
                result: {ok: false, error: "变量名不能是纯数字"}};
        }
        const definition = trimmed.match(DEFINITION_PATTERN);
        if (definition) {
            const name = definition[1];
            const expression = definition[2].trim();
            const numericUnit = name.match(/^\d+(.+)$/u);
            if (numericUnit && resolveUnit(numericUnit[1], unitRegistry)) {
                return {kind: "definition", source: line, name, expression,
                    result: {ok: false, error: "数字开头变量不能与数字+单位重名: " + name}};
            }
            const result = expression ? resultOf(expression) : {ok: false, error: "缺少变量值或公式"};
            if (result.ok) {
                definitionNames.push(name);
                if (result.rawValue) {
                    typedVariables.set(name, result.rawValue);
                }
                if (result.engineValue && result.engineValue.re) {
                    legacyVariables.set(name, result.engineValue);
                }
                hasExtendedDefinitions = hasExtendedDefinitions || /^\d/.test(name) || isExtendedExpression(expression, options);
                record(result, false);
            }
            return {kind: "definition", source: line, name, expression, result};
        }
        if (trimmed.includes("{{") || trimmed.includes("}}")) {
            return {kind: "inline", source: line, parts: parseInline(line)};
        }
        const labelled = parseLabelled(line);
        if (labelled) {
            return labelled;
        }
        const expression = trimmed;
        const result = resultOf(expression);
        if (result.ok || looksLikeFormula(trimmed)) {
            record(result, !/\b(?:total|average|prev)\b/.test(expression));
            return {kind: "formula", source: line, expression: trimmed, result};
        }
        return {kind: "text", source: line};
    };

    return evaluateLine;
};

export const evaluateNotebook = (source, options = {}) => {
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
    const evaluateLine = createEvaluator(options);
    return lines.map(evaluateLine);
};
