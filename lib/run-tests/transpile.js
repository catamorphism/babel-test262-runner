"use strict";

const requireBabel = require("./contextualize-require");
/**
 * @type {import("typescript")}
 */
const { transpileModule } = require("typescript");
/**
 * @type {import("@swc/core")}
 */
const Swc = require("@swc/core");
/**
 * @type {import("@babel/core")}
 */
const Babel = requireBabel("@babel/core");
/**
 * @type {import("@babel/preset-env")}
 */
const presetEnv = requireBabel("@babel/preset-env");

const getBabelPlugins = require("./get-babel-plugins");

const configCaches = new Map();

function getOptions(features, isModule, transpiler) {
  const configKey = JSON.stringify({ features, isModule, transpiler });
  let config = configCaches.get(configKey);
  if (config !== undefined) {
    return config;
  }

  if (transpiler === "tsc") {
      config = {
          target: "es5"
      };
  } else if (transpiler === "swc") {
      config = { "jsc": {
      "parser": {
          "syntax": "ecmascript",
          "jsx": false,
          "dynamicImport": false,
          "privateMethod": false,
          "functionBind": false,
          "exportDefaultFrom": false,
          "exportNamespaceFrom": false,
          "decorators": false,
          "decoratorsBeforeExport": false,
          "topLevelAwait": false,
          "importMeta": false,
          "preserveAllComments": false
      },
      "transform": null,
      "target": "es5",
      "loose": false,
      "externalHelpers": false,
      "keepClassNames": false
  },
  "isModule": isModule};
  } else {
  config = Babel.loadOptionsSync({
    configFile: false,
    babelrc: false,
    targets: ">= 0%",
    presets: [presetEnv],
    // spec
    assumptions: {
      noNewArrows: false,
    },
    plugins: getBabelPlugins(features),
    sourceType: isModule ? "module" : "script",
    highlightCode: false,
    generatorOpts: { compact: true },
  });
  }

  configCaches.set(configKey, config);
  return config;
}

exports.transpile = function(
  code,
  { features, isModule, isStrict } = {},
  transpiler,
) {
  if (isStrict && !isModule && !/^\s*['"]use strict['"]/.test(code)) {
    // eval("") === undefined
    code = `"use strict";\nundefined;\n${code}`;
  }

//  console.log(`**** transpiler = ${transpiler}`);
//  console.trace();

  // Babel calls transpile() recursively, so the default here is 'babel'
  const transpileFn = transpiler === 'tsc' ? transpileModule
    : transpiler === 'swc' ? Swc.transformSync
    : Babel.transformSync;

  const options = getOptions(features || [], Boolean(isModule), transpiler);

//  console.log(`${Date.now()} calling transpileFn`);
  const timeBegin = performance.now();
//  console.log(`calling transpileFn on ${code}`);
  const retval = transpileFn(
    code,
    options
  );
  const timeEnd = performance.now();
//  console.log(`${Date.now()} called transpileFn`);

//  console.log(`retval = ${JSON.stringify(retval)}`);
  const transpileTime = timeEnd - timeBegin;

  if (transpiler === 'tsc')
      return { code: retval.outputText, time: transpileTime };
  if (transpiler === undefined) { // this means we were called recursively from Babel
    return retval.code;
  }
  return { code: retval.code, time: transpileTime };
};
