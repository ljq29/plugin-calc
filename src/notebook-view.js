import {evaluateNotebook} from "./lib/notebook.mjs";

const viewStates = new WeakMap();
const VIEW_ATTRIBUTE = "custom-plugin-calc-view";
const VIEW_MODES = [
    {id: "vertical", label: "上下"},
    {id: "horizontal", label: "左右"},
    {id: "live", label: "逐行"}
];
const DEMO_MARKER = "【plugin-calc 学习示例】";
const DEMO_SOURCE = `${DEMO_MARKER}

【基础计算】
示例单价=68
示例数量=2
示例总价：{{示例单价*示例数量}}

【时间】
示例开始=08:30
示例耗时=90min
结束：{{示例开始+示例耗时}}

【日期】
示例日期=date("2026-11-26")
一周后：{{dateAdd(示例日期,1,"week")}}
中文日期：{{formatDate(示例日期,"YYYY年M月D日")}}

【单位】
示例距离=5km
换算：{{示例距离 to m}}
速度：{{100km/2h}}
面积：{{2m^2 to cm^2}}

【自定义单位】
unit 示例打 = 12 示例个
unit 示例盒 = 6 示例打
两盒：{{2示例盒 to 示例个}}

【时区】
示例会议=zoned("2026-11-26 15:00","Asia/Shanghai")
东京时间：{{inZone(示例会议,"Asia/Tokyo")}}

【分组汇总】
午餐：{{35}}
交通：{{12}}
咖啡：{{18}}
合计：{{total}}
平均：{{average}}

【货币】
在插件设置中配置手工或在线汇率后，使用“金额 to 币种”语法，例如 100USD to CNY。`;

export const renderCalcNotebook = (options, precisionOptions, calcOptions = {}) => {
    const document = options.element.ownerDocument;
    const blockElement = options.element.closest("[data-type=\"NodeCustomBlock\"]");
    const stateElement = blockElement || options.element;
    const state = viewStates.get(stateElement) || {showFormula: true, mode: "horizontal", activeLine: null};
    const savedMode = blockElement?.getAttribute(VIEW_ATTRIBUTE);
    if (VIEW_MODES.some(item => item.id === savedMode)) {
        state.mode = savedMode;
    }
    viewStates.set(stateElement, state);
    let source = options.content;
    let saveTimer = null;
    let disposed = false;
    let activeLine = Number.isInteger(state.activeLine) ? state.activeLine : null;
    let root;
    let status;
    let previewLines = state.previewLines || null;
    let previewTimer = null;
    let previewDirty = Boolean(state.previewDirty);
    let composing = false;

    const autoCalculate = () => calcOptions.notebookAutoCalculate !== false;
    if (autoCalculate() && previewDirty) {
        previewLines = null;
    }
    const updateStatus = text => {
        if (status) {
            status.textContent = text;
        }
    };
    const appendFormula = (row, expression) => {
        if (!state.showFormula || !expression) {
            return;
        }
        const formula = document.createElement("span");
        formula.className = "plugin-calc-notebook__formula";
        formula.textContent = "(" + expression + ")";
        row.append(formula);
    };
    const appendResult = (row, expression, result, definition = false) => {
        if (!result.ok) {
            const error = document.createElement("span");
            error.className = "plugin-calc-notebook__error";
            error.textContent = "错误：" + result.error;
            row.append(error);
            return;
        }
        const value = document.createElement("strong");
        value.className = "plugin-calc-notebook__result";
        value.textContent = result.value;
        row.append(value);
        if (!definition || expression !== result.value) {
            appendFormula(row, expression);
        }
    };
    const renderLine = (row, line) => {
        row.className = "plugin-calc-notebook__line plugin-calc-notebook__line--" + line.kind;
        if (line.kind === "blank" || line.kind === "text") {
            row.textContent = line.kind === "blank" ? "" : line.source;
            return;
        }
        if (line.kind === "definition") {
            const name = document.createElement("span");
            name.className = "plugin-calc-notebook__name";
            name.textContent = line.name + " = ";
            row.append(name);
            appendResult(row, line.expression, line.result, true);
            return;
        }
        if (line.kind === "formula") {
            appendResult(row, line.expression, line.result);
            return;
        }
        line.parts.forEach(part => {
            if (part.kind === "text") {
                row.append(document.createTextNode(part.text));
            } else if (part.kind === "error") {
                const error = document.createElement("span");
                error.className = "plugin-calc-notebook__error";
                error.textContent = "错误：" + part.error;
                row.append(error);
            } else {
                appendResult(row, part.expression, part);
            }
        });
    };
    const currentEditor = () => root.querySelector("textarea");
    const focusEditor = (editor, caret) => {
        if (!editor) {
            return;
        }
        editor.focus();
        const position = Math.min(caret ?? editor.value.length, editor.value.length);
        editor.setSelectionRange(position, position);
    };
    const scheduleSave = () => {
        if (autoCalculate() || !previewDirty) {
            updateStatus("");
        }
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(() => {
            if (disposed) {
                return;
            }
            const editor = currentEditor();
            const active = document.activeElement === editor;
            const selectionStart = editor ? editor.selectionStart : 0;
            state.activeLine = activeLine;
            state.saving = true;
            if (!options.setContent(source)) {
                state.saving = false;
                updateStatus("内容暂未保存，请检查只读状态或输入内容");
                return;
            }
            if (active) {
                queueMicrotask(() => {
                    const nextEditor = (blockElement || options.element).querySelector("textarea");
                    focusEditor(nextEditor, selectionStart);
                    state.saving = false;
                });
            } else {
                state.saving = false;
            }
        }, 300);
    };
    const resize = editor => {
        editor.style.height = "auto";
        editor.style.height = Math.max(120, editor.scrollHeight) + "px";
    };
    const evaluatedLines = () => {
        if (!previewLines) {
            previewLines = evaluateNotebook(source, Object.assign({}, precisionOptions, calcOptions));
            state.previewLines = previewLines;
            previewDirty = false;
            state.previewDirty = false;
        }
        if (previewDirty && !autoCalculate()) {
            return source.split("\n").map((text, index) => Object.assign({},
                previewLines[index] || {kind: "text"}, {source: text}));
        }
        return previewLines;
    };
    const updatePreviewElement = preview => {
        const evaluated = evaluatedLines();
        evaluated.forEach((line, index) => {
            const row = document.createElement("div");
            renderLine(row, line);
            const signature = line.source + "\n" + row.textContent;
            const existing = preview.childNodes[index];
            if (!existing) {
                preview.append(row);
            } else if (existing.dataset?.signature !== signature) {
                existing.replaceWith(row);
            }
            row.dataset.signature = signature;
        });
        while (preview.childNodes.length > evaluated.length) {
            const last = preview.childNodes[preview.childNodes.length - 1];
            if (typeof last.remove === "function") {
                last.remove();
            } else {
                preview.childNodes.pop();
            }
        }
        return preview;
    };
    const createPreview = () => {
        const preview = document.createElement("div");
        preview.className = "plugin-calc-notebook__preview";
        return updatePreviewElement(preview);
    };
    const refreshPreview = () => {
        if (state.mode === "live") {
            renderLive();
        } else {
            const preview = root.querySelector(".plugin-calc-notebook__preview");
            if (preview) {
                updatePreviewElement(preview);
            }
        }
    };
    const calculateNow = () => {
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        previewLines = null;
        previewDirty = false;
        state.previewDirty = false;
        updateStatus("");
        refreshPreview();
        maybeRefreshRates(true);
    };
    const schedulePreview = () => {
        previewDirty = true;
        state.previewDirty = true;
        if (!autoCalculate()) {
            updateStatus("结果未更新（自动重算已关闭，可点击立即计算）");
            return;
        }
        if (previewTimer) {
            clearTimeout(previewTimer);
        }
        previewTimer = setTimeout(() => {
            previewTimer = null;
            if (disposed || composing) {
                return;
            }
            previewLines = null;
            refreshPreview();
            maybeRefreshRates(false);
        }, 150);
    };
    const bindComposition = editor => {
        editor.addEventListener("compositionstart", () => {
            composing = true;
            if (previewTimer) {
                clearTimeout(previewTimer);
                previewTimer = null;
            }
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
        });
        editor.addEventListener("compositionend", () => {
            composing = false;
            schedulePreview();
            scheduleSave();
        });
    };
    let refreshingRates = false;
    const maybeRefreshRates = (force = false) => {
        if ((!force && !autoCalculate()) || refreshingRates || calcOptions.rates || typeof calcOptions.refreshRates !== "function" ||
            !/(?:\d\s*[A-Z]{3}\b|\bto\s+[A-Z]{3}\b)/.test(source)) {
            return;
        }
        refreshingRates = true;
        updateStatus("正在更新在线汇率…");
        calcOptions.refreshRates().then(() => {
            if (disposed || !root.isConnected) {
                return;
            }
            previewLines = null;
            refreshPreview();
            updateStatus(calcOptions.rates && calcOptions.rates.date ?
                `汇率：Frankfurter · ${calcOptions.rates.date}` : "汇率已更新");
        }).catch(error => {
            updateStatus("在线汇率更新失败，可用手工汇率：" + error.message);
        }).finally(() => {
            refreshingRates = false;
        });
    };
    const persistMode = () => {
        if (!blockElement) {
            return;
        }
        const id = blockElement.getAttribute("data-node-id");
        blockElement.setAttribute(VIEW_ATTRIBUTE, state.mode);
        fetch("/api/attr/setBlockAttrs", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({id, attrs: {[VIEW_ATTRIBUTE]: state.mode}})
        }).then(response => response.json()).then(result => {
            if (result.code !== 0) {
                throw new Error(result.msg || "setBlockAttrs failed");
            }
        }).catch(error => {
            console.error("[plugin-calc] 保存视图模式失败", error);
            updateStatus("视图选择暂未保存");
        });
    };
    const setActiveLine = (index, caret) => {
        activeLine = index;
        state.activeLine = index;
        renderLive();
        focusEditor(currentEditor(), caret);
    };
    const updateLiveSource = (lines, index, caret) => {
        source = lines.join("\n");
        activeLine = index;
        state.activeLine = index;
        previewDirty = true;
        if (autoCalculate()) {
            previewLines = null;
        }
        renderLive();
        focusEditor(currentEditor(), caret);
        schedulePreview();
        scheduleSave();
    };
    const bindLiveEditor = (editor, index) => {
        editor.addEventListener("input", event => {
            const chunks = editor.value.split("\n");
            if (chunks.length > 1) {
                const lines = source.split("\n");
                lines.splice(index, 1, ...chunks);
                updateLiveSource(lines, index + chunks.length - 1, chunks[chunks.length - 1].length);
                return;
            }
            const lines = source.split("\n");
            lines[index] = editor.value;
            source = lines.join("\n");
            editor.style.height = "auto";
            editor.style.height = Math.max(30, editor.scrollHeight) + "px";
            if (event.isComposing || composing) {
                return;
            }
            schedulePreview();
            scheduleSave();
        });
        bindComposition(editor);
        editor.addEventListener("keydown", event => {
            if (event.isComposing) {
                return;
            }
            const lines = source.split("\n");
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            if (event.key === "Enter") {
                event.preventDefault();
                const before = editor.value.slice(0, start);
                const after = editor.value.slice(end);
                lines[index] = before;
                lines.splice(index + 1, 0, after);
                updateLiveSource(lines, index + 1, 0);
            } else if (event.key === "ArrowUp" && index > 0) {
                event.preventDefault();
                setActiveLine(index - 1, Math.min(start, lines[index - 1].length));
            } else if (event.key === "ArrowDown" && index < lines.length - 1) {
                event.preventDefault();
                setActiveLine(index + 1, Math.min(start, lines[index + 1].length));
            } else if (event.key === "Backspace" && start === 0 && end === 0 && index > 0) {
                event.preventDefault();
                const caret = lines[index - 1].length;
                lines[index - 1] += lines[index];
                lines.splice(index, 1);
                updateLiveSource(lines, index - 1, caret);
            } else if (event.key === "Delete" && start === editor.value.length && end === start && index < lines.length - 1) {
                event.preventDefault();
                const caret = lines[index].length;
                lines[index] += lines[index + 1];
                lines.splice(index + 1, 1);
                updateLiveSource(lines, index, caret);
            } else if (event.key === "Escape") {
                event.preventDefault();
                activeLine = null;
                state.activeLine = null;
                renderLive();
            }
        });
        editor.addEventListener("blur", () => {
            setTimeout(() => {
                if (disposed || state.saving || !root.isConnected || root.contains(document.activeElement)) {
                    return;
                }
                activeLine = null;
                state.activeLine = null;
                renderLive();
            }, 0);
        });
    };
    function renderLive() {
        const live = root.querySelector(".plugin-calc-notebook__live");
        const evaluated = evaluatedLines();
        if (activeLine !== null) {
            activeLine = Math.max(0, Math.min(activeLine, evaluated.length - 1));
            state.activeLine = activeLine;
        }
        live.replaceChildren();
        evaluated.forEach((line, index) => {
            const row = document.createElement("div");
            renderLine(row, line);
            row.dataset.lineIndex = String(index);
            if (index === activeLine) {
                row.classList.add("plugin-calc-notebook__line--editing");
                row.replaceChildren();
                const editor = document.createElement("textarea");
                editor.className = "plugin-calc-notebook__live-editor";
                editor.setAttribute("aria-label", `计算笔记本第 ${index + 1} 行原文`);
                editor.spellcheck = false;
                editor.rows = 1;
                editor.value = line.source;
                row.append(editor);
                bindLiveEditor(editor, index);
            } else {
                row.addEventListener("click", () => setActiveLine(index, line.source.length));
            }
            live.append(row);
        });
        const editor = currentEditor();
        if (editor) {
            editor.style.height = "auto";
            editor.style.height = Math.max(30, editor.scrollHeight) + "px";
        }
    }
    const appendOrLocateDemo = () => {
        const existing = source.indexOf(DEMO_MARKER);
        if (existing >= 0) {
            if (state.mode === "live") {
                const index = source.slice(0, existing).split("\n").length - 1;
                setActiveLine(index, 0);
            } else {
                const editor = currentEditor();
                focusEditor(editor, existing + DEMO_MARKER.length);
                editor.setSelectionRange(existing, existing + DEMO_MARKER.length);
            }
            updateStatus("示例已存在，已定位到示例；不会重复追加");
            return;
        }
        const separator = !source ? "" : source.endsWith("\n\n") ? "" : source.endsWith("\n") ? "\n" : "\n\n";
        source += separator + DEMO_SOURCE;
        if (autoCalculate()) {
            previewLines = null;
        } else {
            previewDirty = true;
        }
        if (state.mode === "live") {
            activeLine = autoCalculate() ? source.split("\n").length - 1 : null;
            state.activeLine = activeLine;
        }
        renderShell();
        const editor = currentEditor();
        if (editor) {
            focusEditor(editor, editor.value.length);
        }
        if (!autoCalculate()) {
            schedulePreview();
        }
        scheduleSave();
    };
    const renderShell = () => {
        root.replaceChildren();
        root.className = `plugin-calc-notebook plugin-calc-notebook--${state.mode}`;
        root.dataset.view = state.mode;
        const header = document.createElement("div");
        header.className = "plugin-calc-notebook__header";
        const title = document.createElement("strong");
        title.textContent = "计算笔记本";
        const controls = document.createElement("div");
        controls.className = "plugin-calc-notebook__controls";
        VIEW_MODES.forEach(item => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "b3-button b3-button--text plugin-calc-notebook__view-button";
            button.textContent = item.label;
            button.dataset.view = item.id;
            button.setAttribute("aria-pressed", String(state.mode === item.id));
            button.title = {vertical: "上下编辑与预览", horizontal: "左右编辑与预览", live: "仅编辑光标所在行"}[item.id];
            button.addEventListener("click", () => {
                state.mode = item.id;
                activeLine = null;
                state.activeLine = null;
                persistMode();
                renderShell();
            });
            controls.append(button);
        });
        const calculate = document.createElement("button");
        calculate.type = "button";
        calculate.className = "b3-button b3-button--text";
        calculate.textContent = "立即计算";
        calculate.dataset.action = "calculate";
        calculate.title = "使用当前原文重新计算预览";
        calculate.addEventListener("click", calculateNow);
        controls.append(calculate);
        if (calcOptions.showDemoButton !== false) {
            const demo = document.createElement("button");
            demo.type = "button";
            demo.className = "b3-button b3-button--text";
            demo.textContent = "示例";
            demo.dataset.action = "demo";
            demo.title = "在末尾追加学习示例；已有示例时定位到示例";
            demo.addEventListener("click", appendOrLocateDemo);
            controls.append(demo);
        }
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "b3-button b3-button--text";
        toggle.textContent = state.showFormula ? "隐藏公式" : "显示公式";
        toggle.setAttribute("aria-pressed", String(state.showFormula));
        toggle.addEventListener("click", () => {
            state.showFormula = !state.showFormula;
            renderShell();
        });
        controls.append(toggle);
        header.append(title, controls);
        root.append(header);
        status = document.createElement("div");
        status.className = "plugin-calc-notebook__status";
        status.setAttribute("role", "status");
        if (previewDirty && !autoCalculate()) {
            updateStatus("结果未更新（自动重算已关闭，可点击立即计算）");
        }
        if (state.mode === "live") {
            const live = document.createElement("div");
            live.className = "plugin-calc-notebook__live";
            root.append(live, status);
            renderLive();
            maybeRefreshRates();
            return;
        }
        const body = document.createElement("div");
        body.className = "plugin-calc-notebook__body";
        const editor = document.createElement("textarea");
        editor.className = "plugin-calc-notebook__editor";
        editor.setAttribute("aria-label", "计算笔记本原文");
        editor.spellcheck = false;
        editor.value = source;
        editor.addEventListener("input", event => {
            source = editor.value;
            resize(editor);
            if (event.isComposing || composing) {
                return;
            }
            schedulePreview();
            scheduleSave();
        });
        bindComposition(editor);
        body.append(editor, createPreview());
        root.append(body, status);
        resize(editor);
        maybeRefreshRates();
    };
    root = document.createElement("section");
    options.element.replaceChildren(root);
    renderShell();
    const dispose = () => {
        disposed = true;
        if (saveTimer) {
            clearTimeout(saveTimer);
        }
        if (previewTimer) {
            clearTimeout(previewTimer);
        }
    };
    dispose.refresh = () => {
        source = options.content;
        previewLines = null;
        previewDirty = false;
        state.previewDirty = false;
        renderShell();
    };
    return dispose;
};
