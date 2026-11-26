import {Temporal} from "@js-temporal/polyfill";
import {fixToNumber, numberToFix} from "./number.mjs";

const UNIT = {
    year: "years", years: "years", quarter: "quarters", quarters: "quarters",
    month: "months", months: "months", week: "weeks", weeks: "weeks",
    day: "days", days: "days", hour: "hours", hours: "hours",
    minute: "minutes", minutes: "minutes", second: "seconds", seconds: "seconds",
    年: "years", 季度: "quarters", 月: "months", 周: "weeks", 星期: "weeks",
    天: "days", 日: "days", 小时: "hours", 分钟: "minutes", 秒: "seconds"
};

const normalizeDateTime = text => text.trim().replace(" ", "T");
const pad = value => String(value).padStart(2, "0");

export const timeValue = text => ({kind: "time", value: Temporal.PlainTime.from(text), dayOffset: 0});
export const dateValue = text => ({kind: "date", value: Temporal.PlainDate.from(text)});
export const dateTimeValue = text => ({kind: "datetime", value: Temporal.PlainDateTime.from(normalizeDateTime(text))});
export const zonedValue = (text, timeZone) => ({
    kind: "zoned",
    value: dateTimeValue(text).value.toZonedDateTime(timeZone, {disambiguation: "reject"})
});

export const todayValue = timeZone => ({
    kind: "date",
    value: Temporal.Now.plainDateISO(timeZone || Temporal.Now.timeZoneId())
});

export const nowValue = timeZone => ({
    kind: "zoned",
    value: Temporal.Now.zonedDateTimeISO(timeZone || Temporal.Now.timeZoneId())
});

export const inZoneValue = (value, timeZone) => {
    if (value.kind !== "zoned") {
        throw new Error("inZone 需要带时区的日期时间，请先使用 zoned()");
    }
    return {kind: "zoned", value: value.value.withTimeZone(timeZone)};
};

const calendarUnit = unit => {
    const normalized = UNIT[String(unit || "days").toLowerCase()] || UNIT[unit];
    if (!normalized) {
        throw new Error("不支持的日期单位: " + unit);
    }
    return normalized;
};

export const dateAddValue = (value, amount, unit, subtract = false) => {
    if (!["date", "datetime", "zoned"].includes(value.kind)) {
        throw new Error("dateAdd 需要日期或日期时间");
    }
    const normalized = calendarUnit(unit);
    if (value.kind === "date" && ["hours", "minutes", "seconds"].includes(normalized)) {
        throw new Error("纯日期不能加减小时、分钟或秒，请使用 datetime()");
    }
    const delta = Math.abs(amount) * (subtract ? -1 : 1);
    const duration = {[normalized]: delta};
    return {kind: value.kind, value: value.value.add(duration)};
};

export const dateBetweenValue = (start, end, unit) => {
    if (start.kind !== end.kind || !["date", "datetime", "zoned"].includes(start.kind)) {
        throw new Error("dateBetween 需要两个同类型的日期或日期时间");
    }
    const normalized = calendarUnit(unit);
    const singular = normalized.slice(0, -1);
    const duration = start.value.until(end.value, {largestUnit: singular});
    return numberToFix(duration.total({unit: singular, relativeTo: start.value}));
};

export const addDurationValue = (value, seconds, subtract = false) => {
    const amount = fixToNumber(seconds) * (subtract ? -1 : 1);
    if (value.kind === "time") {
        const current = value.value.hour * 3600 + value.value.minute * 60 + value.value.second +
            value.value.millisecond / 1000;
        const total = current + amount;
        const dayOffset = value.dayOffset + Math.floor(total / 86400);
        let wrapped = total % 86400;
        if (wrapped < 0) {
            wrapped += 86400;
        }
        const hour = Math.floor(wrapped / 3600);
        const minute = Math.floor((wrapped % 3600) / 60);
        const second = Math.floor(wrapped % 60);
        const millisecond = Math.floor((wrapped - Math.floor(wrapped)) * 1000);
        return {
            kind: "time",
            value: Temporal.PlainTime.from({hour, minute, second, millisecond}),
            dayOffset
        };
    }
    if (value.kind === "date") {
        const days = amount / 86400;
        if (!Number.isInteger(days)) {
            throw new Error("纯日期只能加减整数天");
        }
        return {kind: "date", value: value.value.add({days})};
    }
    if (value.kind === "datetime" || value.kind === "zoned") {
        return {kind: value.kind, value: value.value.add({seconds: amount})};
    }
    throw new Error("该值不能加减时长");
};

export const differenceSeconds = (left, right) => {
    if (left.kind !== right.kind) {
        throw new Error("两个时间值的类型不一致");
    }
    if (left.kind === "time") {
        const seconds = value => value.value.hour * 3600 + value.value.minute * 60 + value.value.second +
            value.value.millisecond / 1000 + value.dayOffset * 86400;
        return numberToFix(seconds(left) - seconds(right));
    }
    if (left.kind === "date") {
        return numberToFix(left.value.since(right.value, {largestUnit: "days"}).days * 86400);
    }
    if (left.kind === "datetime" || left.kind === "zoned") {
        return numberToFix(left.value.since(right.value, {largestUnit: "seconds"}).total("seconds"));
    }
    throw new Error("这两个值不能相减");
};

const partsOf = value => value.value;

export const formatDateValue = (value, format) => {
    if (value.kind === "time") {
        const time = value.value;
        const suffix = value.dayOffset === 0 ? "" : (value.dayOffset === 1 ? "（次日）" : `（${value.dayOffset > 0 ? "+" : ""}${value.dayOffset}天）`);
        return `${pad(time.hour)}:${pad(time.minute)}${time.second || time.millisecond ? ":" + pad(time.second) : ""}${suffix}`;
    }
    if (!["date", "datetime", "zoned"].includes(value.kind)) {
        throw new Error("formatDate 需要日期或日期时间");
    }
    if (!format) {
        return value.value.toString().replace("T", " ");
    }
    const part = partsOf(value);
    const hour = part.hour || 0;
    const replacements = {
        YYYY: String(part.year).padStart(4, "0"),
        MM: pad(part.month),
        M: String(part.month),
        DD: pad(part.day),
        D: String(part.day),
        HH: pad(hour),
        H: String(hour),
        hh: pad(hour % 12 || 12),
        h: String(hour % 12 || 12),
        mm: pad(part.minute || 0),
        m: String(part.minute || 0),
        ss: pad(part.second || 0),
        s: String(part.second || 0),
        A: hour < 12 ? "AM" : "PM",
        a: hour < 12 ? "am" : "pm"
    };
    return String(format).replace(/YYYY|MM|DD|HH|hh|mm|ss|[MDHhmsAa]/g, token => replacements[token]);
};

const holidaysOf = options => new Set((options && options.holidays) || []);
const extraWorkdaysOf = options => new Set((options && options.extraWorkdays) || []);
const isWorkday = (date, options) => {
    if (extraWorkdaysOf(options).has(date.toString())) {
        return true;
    }
    const day = date.dayOfWeek;
    return day !== 6 && day !== 7 && !holidaysOf(options).has(date.toString());
};

export const workdaysValue = (start, end, options) => {
    if (start.kind !== "date" || end.kind !== "date") {
        throw new Error("workdays 需要两个纯日期");
    }
    const direction = Temporal.PlainDate.compare(start.value, end.value) <= 0 ? 1 : -1;
    let current = start.value;
    let count = 0;
    while (true) {
        if (isWorkday(current, options)) {
            count += direction;
        }
        if (Temporal.PlainDate.compare(current, end.value) === 0) {
            break;
        }
        current = current.add({days: direction});
    }
    return numberToFix(count);
};

export const addWorkdaysValue = (value, amount, options) => {
    if (value.kind !== "date" || !Number.isInteger(amount)) {
        throw new Error("addWorkdays 需要纯日期和整数天数");
    }
    let current = value.value;
    const direction = amount < 0 ? -1 : 1;
    let remaining = Math.abs(amount);
    while (remaining > 0) {
        current = current.add({days: direction});
        if (isWorkday(current, options)) {
            remaining--;
        }
    }
    return {kind: "date", value: current};
};

export const dateParts = value => {
    if (!["date", "datetime", "zoned"].includes(value.kind)) {
        throw new Error("需要日期或日期时间");
    }
    return value.value;
};

export {Temporal};
