import {build} from "esbuild";

await build({
    entryPoints: ["src/index.js"],
    outfile: "index.js",
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: ["chrome110", "node16"],
    external: ["siyuan"],
    footer: {js: "if (module.exports && module.exports.default) module.exports = module.exports.default;"},
    banner: {
        js: `/*!\n * 等号计算 (Equals Calc) —— 思源笔记插件\n * 本文件由 build.mjs 从 src/ 生成，请直接修改 src/ 下的源码。\n * 计算不使用 eval / new Function；数字、单位、日期与汇率类型在本地求值。\n * MIT License\n */`
    }
});

console.log("已生成 index.js");
