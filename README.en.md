[中文](./README.md)

# Equals Calc

A SiYuan plugin: type an expression ending with `=` and **press Enter** to get the result
appended right after the equals sign.

## Installation

Download `plugin-calc.zip` from [this fork's Releases](https://github.com/ljq29/plugin-calc/releases/latest), extract it into the workspace's `data/plugins/`, and confirm that `data/plugins/plugin-calc/plugin.json` exists. Reload SiYuan and enable **Equals Calc** under **Settings → Bazaar → Downloaded**.

For the official Docker image, the workspace is usually `/workspace`, so the plugin path is `/workspace/data/plugins/plugin-calc/`. A custom `--workspace` or volume mapping takes precedence. Install once on the server; browsers connecting to that instance do not need separate copies.

The official Bazaar already lists `pisceswb/plugin-calc`. Enhancements in this fork are contributed through an upstream pull request rather than a duplicate Bazaar entry.

## Features

| Type | After Enter |
| --- | --- |
| `12*5=` | `12*5=60` |
| `测试12*5=` | `测试12*5=60` |
| `12×5=` | `12×5=60` |
| `12×5=60*3=` | `12×5=60*3=180` |

Only text **before the caret** that ends with a complete expression plus `=` is evaluated.
Any leading words or units are left untouched.

## Calc notebooks

Requires SiYuan **3.8.10 or later**. Type `/计算` (or filter with `/calc`) to insert a calc block. Changes are saved automatically about 300 ms after typing stops.

```text
单价=68
数量=2
运费=10

商品金额：{{单价*数量}}
含运费总价：{{单价*数量+运费}}
单价*数量*0.8
```

- Define variables with `name=formula`. Unicode names, including Chinese, are supported; later lines can use earlier definitions
- Variables are scoped to the current block. Editing a definition recalculates every dependent result
- A standalone formula appears as `result (formula)`; ordinary text and blank lines stay unchanged
- Use `{{formula}}` inside ordinary text. Undefined variables, division by zero, empty formulas and unclosed delimiters show errors
- Toggle **隐藏公式 / 显示公式** to hide or show formulas while keeping results
- Only the source template is stored in the custom block. Results are rendered live, and the source remains readable if the plugin is disabled or uninstalled

### Three views

The upper-right corner offers **上下** (vertical), **左右** (horizontal) and **逐行** (line-by-line) views. Horizontal is the default, with source on the left and results on the right.

The selected view is stored in the block's `custom-plugin-calc-view` attribute. Each block remembers its own view across reloads, reopening and document synchronization.

In line-by-line mode, every line shows results until clicked. Only the active line exposes its source; all other results update while typing. Enter splits a line, Backspace/Delete at the edges merge lines, Arrow Up/Down changes the active line, and Escape returns to results. Focus and caret survive autosave.

### One-click learning demo

Use the **示例** button in the notebook header to append a runnable learning template to the current block. It covers arithmetic, time, dates, units, custom units, time zones and grouped aggregation.

- Existing source is preserved; the demo is appended and autosaved
- All demo variables and custom units use an `示例` prefix to avoid changing existing formulas
- Results render immediately in every view, without changing the selected view
- Repeated clicks locate the existing `【plugin-calc 学习示例】` marker instead of inserting duplicates
- Currency is shown as a setup hint rather than an offline-failing formula

For a first run, insert `/计算`, click **示例**, then edit the demo values and watch the preview update.

### Automatic and manual recalculation

**计算笔记本自动重算** works like automatic calculation in Excel and is enabled by default. Automatic mode updates the preview after a 150 ms debounce. Manual mode computes once when a block opens, then saves edits without changing the previous preview. Use **立即计算** to recalculate explicitly. Source autosave always remains enabled.

Changing a feature switch refreshes open blocks immediately. Online rates do not silently change a manual-mode preview in the background. During IME composition, preview calculation and autosave pause until composition ends, so intermediate pinyin such as `mi` does not repeatedly evaluate the whole notebook.

Evaluation is sequential: each variable is computed once and later formulas reuse its typed value instead of reparsing every definition. Ordinary previews update changed rows only.

## Time, dates, units and currency

Types are inferred from values; variables do not need declarations.

```text
start=08:30
duration=90min
End: {{start+duration}}

day=date("2026-11-26")
Next week: {{dateAdd(day,1,"week")}}
Days between: {{dateBetween(day,date("2026-12-03"),"days")}}
```

- Time and duration: `08:30+90min` → `10:00`; `23:50+20min` → `00:10（次日）`
- Dates: `date()`, `datetime()`, `dateAdd`, `dateSubtract`, `dateBetween`, `formatDate`, `today`, `now`
- Workdays: `workdays(start,end)` and `addWorkdays(date,n)` honor the holidays and extra workdays configured in settings
- Time zones: `zoned("2026-11-26 15:00","Asia/Shanghai")`, then `inZone(value,"Asia/Tokyo")`; IANA names and complete dates are required
- Units: `5km to m`, `1m+20cm`, `32degF to degC`, `1GiB to MiB`
- Compound units: `100km/2h` → `50km/h`; `50km/h*2h` → `100km`; `25USD/h*14h` → `350USD`
- Explicit construction: `unit(2,"m")`; `2m^2` means two square metres while `(2m)^2` means four
- Bare names such as `mi`, `m`, and `h` do not become one-unit quantities. Units are recognized after numbers, in compound units and conversion targets, or through `unit()`, so `mi` and 明天 remain text while `5mi` is five miles
- Block-scoped custom units: `unit 打 = 12 个`, then `unit 盒 = 6 打`, so `2盒 to 个` → `144个`

### Function and unit reference

| Function | Purpose |
| --- | --- |
| `date(text)` / `datetime(text)` | Construct a date or date-time without a zone |
| `zoned(text,zone)` / `inZone(value,zone)` | Construct and convert an IANA-zoned date-time |
| `dateAdd` / `dateSubtract` | Add or subtract calendar years, months, weeks, days, hours, minutes or seconds |
| `dateBetween(start,end,unit)` | Difference between two values in the requested unit |
| `formatDate(value,format)` | Format a date, for example `YYYY-MM-DD` or `YYYY年M月D日` |
| `workdays` / `addWorkdays` | Count or add workdays using configured holidays and extra workdays |
| `today()` / `now()` | Current date or zoned date-time; results may change when reopened |

Common units include `s`, `min`, `h`, `d`, `week`; `mm`, `cm`, `m`, `km`, `inch`, `ft`, `mi`; `mg`, `g`, `kg`, `lb`, `oz`; `m^2`, `hectare`, `亩`; `m^3`, `L`, `mL`; `bit`, `B`, `KB`, `GB`, `KiB`, `GiB`; `K`, `degC`, `degF`; and `rad`, `deg`. Common Chinese aliases are supported too. `min` means minutes while `m` means metres, and decimal `MB` differs from binary `MiB`.

Values are typed automatically. Incompatible dimensions and mixed currencies are rejected instead of being silently coerced. Source templates are saved in the custom block; calculated results remain previews. Use fixed dates or manual rates when reproducible accounting output matters. Implicit multiplication is not supported.

`prev` returns the nearest previous result. `total` and `average` aggregate standalone and inline results in the current blank-line-delimited group; variable definitions are excluded. Compatible units are converted automatically, while incompatible dimensions and mixed currencies report errors.

Currency conversion uses explicit `to`, for example `100USD to CNY`. Manual JSON rates such as `{"USD/CNY":7.2}` take precedence. Optional online reference rates come from [Frankfurter](https://frankfurter.dev/), are cached, and display their source and date in settings. They are not live trading quotes.

## Linear equations

When the same unknown appears on both sides of `=`, the expression is solved as an
equation (terms are moved to one side and solved with exact rational coefficients):

| Type | After Enter |
| --- | --- |
| `x+3=5=` | `x+3=5=2` |
| `a+3=5;a=` | `a+3=5;a=2` |
| `2*x=10=` | `2*x=10=5` |
| `2*x+3=7=` | `2*x+3=7=2` |
| `x/2=3=` | `x/2=3=6` |
| `x^2=4=` | `x^2=4=-2 或 2` |
| `x^2+1=0=` | `x^2+1=0=1i 或 -1i` (complex roots) |
| `x^3=2=` | `x^3=2=1.25992105` (numeric) |

- **Linear**: solved exactly by moving terms
- **Quadratic**: root formula; negative discriminant yields conjugate complex roots
- **Cubic and higher**: one real root via Newton iteration
- Multiplication must be explicit: `2*x`, `2*(x+1)`, `(x+1)*(x-1)`; implicit multiplication is not supported
- Inline assignments combine with equations: `n=2;n*x=6=` -> `n=2;n*x=6=3`
- Equations with no solution report it (e.g. `3=5`)

## Result precision

The settings panel controls how results are displayed:

- **Exact** (default): terminating values print as-is — `12*5=` -> `60`, `1/8=` -> `0.125`
- **Decimal places**: round to N places, trailing zeros dropped
- **Significant digits**: round to N significant digits; `1234.5678` with 2 -> `1200`

Range 0–15 (1–15 for significant digits). The setting also applies to equation
solutions: with 2 decimal places, `3*x=1=` -> `3*x=1=0.33`.

Rounding is **exact in decimal**: `1.005` to 2 places gives `1.01`, not `1.00`
as binary floating point would.

## Supported syntax

- **Arithmetic**: `+` `-` `*` `/`, plus `×` `÷` `·`
- **Precedence**: standard precedence (multiplication before addition) with parentheses
- **Power and modulo**: `2^10`, `2**8`, `7%2`
- **Percent**: `50%` = 0.5, `200*10%` = 20
- **Thousand separators**: `1,000+1=` -> `1,000+1=1001`
- **Full-width symbols**: `１２＋３=`, `（２＋３）＊４=`
- **Constants**: `pi`, `e`
- **Functions**: `sqrt` `abs` `round` `floor` `ceil` `trunc` `min` `max` `sum` `avg` `log` `ln` `exp` `sin` `cos` `tan` `asin` `acos` `atan` `pow`
- **Inline assignment**: `a=3;a*2=` -> `a=3;a*2=6`
- **Negatives and complex numbers**: `-5+3=` -> `-5+3=-2`; `sqrt(-4)=` -> `sqrt(-4)=2i`

## Precision

The plugin never uses `eval` / `new Function`; it implements its own expression parser and
**decimal, high-precision arithmetic**:

- `0.1+0.2=` yields a clean `0.3` (not `0.30000000000000004`)
- Large integers keep full precision: `99999999999999999999+1=`
- Non-terminating divisions keep 40 fractional digits

## Settings

The plugin does not occupy a top bar slot. Settings live in the plugin menu at the right end
of the top bar: **plugin icon → 等号计算 (Equals Calc)**.

- **Auto-settle equals expressions** — master switch for ordinary editor settlement
- **Notebook automatic recalculation** — manual mode saves edits and uses **立即计算** to refresh
- **Time/date, time zone, standard/compound units, custom units, aggregation, and currency** — independent feature switches
- **Online rates** — separate from currency conversion; manual and cached rates still work when disabled
- **Demo button** — show or hide **示例**; all switches refresh open blocks immediately
- **Also trigger on Space** — off by default (Space is a common typing key)
- **Support Ctrl/Cmd + Enter** — on by default, for forcing a calculation while auto mode is off
- **Result precision** — exact / decimal places / significant digits
- **Manual exchange rates**, **holidays**, and **extra workdays**
- **Online reference rates** — refresh and inspect the source and rate date

> `Setting` must be constructed with a `confirmCallback`: SiYuan's implementation
> looks up `.b3-dialog__action .b3-button` and calls `btnsElement[0].addEventListener`.
> Without `confirmCallback` that button row is hidden, the lookup yields `undefined`,
> and the resulting TypeError stops the dialog from ever appearing — which looks
> like "clicking settings does nothing".

## Behaviour notes

- The plugin only acts when the text before the caret ends with `=` preceded by a complete
  expression; otherwise Enter keeps its normal new-block behaviour.
- The caret lands after the result. Changes are written back through SiYuan's transaction API,
  so they are **undoable** and stay in sync with the kernel.
- Comparison operators such as `==`, `>=`, `<=` are ignored.
- A bare `a=` is not evaluated (no value typed yet).
- Code blocks, tables and read-only documents are never modified.

## Development

```bash
npm ci                        # install Temporal polyfill and esbuild
node build.mjs                 # build index.js from src/
node test/number.probe.mjs     # arithmetic self-tests
node test/precision.test.mjs   # result precision
node test/polynomial.test.mjs  # polynomials and equation solving
node test/calc.test.mjs        # expression-layer tests
node test/typed.test.mjs       # time, dates, time zones, units and currency
node test/notebook.test.mjs    # calc notebook, variables and mixed-content tests
node test/view.test.mjs        # three views and line-by-line editing tests
node test/plugin.test.mjs      # plugin integration tests (minimal DOM / SiYuan stubs)
node tools/pack.mjs            # build manual-install and Bazaar ZIPs
node tools/verify-zip.mjs      # verify both ZIPs
node tools/preflight.mjs       # check against bazaar rules
```

Source layout:

```
src/index.js              plugin body (lifecycle, custom blocks, slash command, keys, settings)
src/notebook-view.js      three views, line-by-line editing, preview and autosave
src/lib/notebook.mjs      scoped variables, standalone formulas and inline evaluation model
src/lib/number.mjs        decimal arithmetic (digit arrays, rationals, fixed point, complex)
src/lib/precision.mjs     display precision (exact decimal rounding to places/digits)
src/lib/polynomial.mjs    polynomial arithmetic and univariate equation solving
src/lib/expr.mjs          numeric evaluator, extended-syntax dispatch and settlement
src/lib/typed-expr.mjs    parser for dates, times, units and money
src/lib/value.mjs         typed arithmetic, conversion, aggregation and formatting
src/lib/units.mjs         unit registry, dimensions and compound/custom units
src/lib/datetime.mjs      calendar, workdays, time zones and date formatting
build.mjs                 esbuild CommonJS bundle
```

## Packaging

`package.zip` must contain:

- `plugin.json`
- `index.js`
- `index.css`
- `i18n/*`
- `icon.png`
- `README.md`, `README.en.md`

See [PUBLISH.md](./PUBLISH.md) for the release process.

## License

MIT
