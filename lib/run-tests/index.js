"use strict";

const fs = require("fs");
const path = require("path");
const Test262Stream = require("test262-stream");
const tap = require("make-tap-output")({ count: true });
const { Worker: JestWorker } = require("jest-worker");

const relative = file => path.resolve(process.cwd(), file);

const NODE = path.join(__dirname, "../../engine/node/bin/node");
const TESTS = process.env.TEST262_PATH
  ? relative(process.env.TEST262_PATH)
  : path.join(__dirname, "../../test262");
const THREADS = Number(process.env.THREADS) || require("os").cpus().length;
const { CHUNK, CHUNKS_FILE } = process.env;

const chunk = CHUNKS_FILE
  ? new Set(require(relative(CHUNKS_FILE))[CHUNK])
  : undefined;

const filterIntermittentTests = require("./filter-intermittent-tests");

// The output of this program is processed by tap-xunit
// Using console.log on stdout will break CI output
// Use tap.diag instead.
tap.pipe(process.stdout);

function formatTime(ms) {
  if (!ms)
    return undefined;
  return ms.toPrecision(4);
}

async function main() {
  const filter = process.argv[2];
  if (!filter) {
    throw new Error(
      "If you really want to run all the tests, use\n\tnode lib/run-tests I_AM_SURE"
    );
  }

  var transpiler = process.argv[3];
  if (!transpiler)
    transpiler = 'babel';
  if (transpiler !== 'babel' && transpiler !== 'swc' && transpiler !== 'tsc') {
    throw new Error("Transpiler must be one of babel, swc, or tsc");
  }

  const worker = new JestWorker(require.resolve("./worker"), {
    numWorkers: THREADS,
//    enableWorkerThreads: true,
    exposedMethods: ["runTest"],
    setupArgs: [{ hostPath: NODE, shortName: "$262", testRoot: TESTS, transpiler: transpiler }],
  });
  worker.getStdout().pipe(process.stdout);
  worker.getStderr().pipe(process.stderr);

  const tests = new Test262Stream(TESTS, {
    paths: ["test/built-ins", "test/language", "test/harness", "test/staging"],
//    paths: [filter],
//   paths: ["test/built-ins/Number"],
//   paths: ["test/language/expressions/arrow-function"],
    omitCopyright: true,
  }).once("error", () => {
    process.exitCode = 1;
  });

  tap.diag(`Using ${THREADS} threads.`);

  let passed = 0;
  let run = 0;
  let total = 0;
  let totalTranspileTime = 0;

  const tasks = [];

  tap.diag(`${Date.now()} ===== 1=====`);

  for await (const test of tests) {
    total++;
    const file = `${test.file} ${test.scenario}`;

    if (filter !== "I_AM_SURE" && !test.file.includes(filter)) continue;
    if (filterIntermittentTests(file)) continue;
    if (chunk && !chunk.has(test.file)) continue;

//    console.log(`(2) file = ${test.file}`);
    await test.contents(async function(err, innerTests) {
//      console.log(`------- ${innerTests.length}`);
      if (err) {
        tap.fail(test.file, "error reading from file");
        return;
      }
      for (const innerTest of innerTests) {
        run++;
        innerTest.transpiler = transpiler;
        tasks.push(
        (async test => {
          const expected = getExpected(test);

          const actual = await worker.runTest(test);;
//          const actual = { result: expected };

          if (actual.result === expected) {
            passed++;
            totalTranspileTime += actual.time;
            tap.pass(file, `(${expected}) (time: ${formatTime(actual.time)} ms)`);
          } else {
            tap.fail(
              file,
              `(expected ${expected}, got ${actual.result} (time: ${formatTime(actual.time)} ms))`,
              actual.error
                ? new RethrownError(actual.error)
                : new Error("[no error]")
            );
          }
        })(innerTest)
        );
      }
    });
  }

  tap.diag(`${Date.now()} =====2===== ${tasks.length}`);
  await Promise.all(tasks);
  tap.diag(`${Date.now()} =====3=====`);

  tap.diag("\n\n");
  tap.diag(`Run ${run} out of ${total} tests.`);
  tap.diag(`Passed ${passed} out of ${run} tests.`);
  if (run > 0)
    tap.diag(`Average transpilation time (successes only): ${formatTime(totalTranspileTime/passed)} ms`);
  // Creating promises based timeouts per test prevents node from exiting
  // causing an unparseable failure in CircleCI. Here we're forcing an exit
  // with an exit code 0. tap-mocha-reporter will parse the tap output
  // and output the correct exit code.

  process.exit(0);
}
main().catch(error => {
  process.exitCode = 1;
  throw error;
});

function getExpected({ attrs }) {
  if (attrs.negative) {
    const { phase } = attrs.negative;
    if (phase === "early" || phase === "parse") {
      return "parser error";
    } else {
      return "runtime error";
    }
  } else {
    return "success";
  }
}

class ExtendedError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error(message).stack;
    }
  }
}

class RethrownError extends ExtendedError {
  constructor(error) {
    if (!error) {
      throw new Error("RethrownError requires an error with a message");
    }
    super(error.message || "[no message]");

    this.name = error.name;
    this.original = error;
    this.new_stack = this.stack;
    const errorStackString =
      error.stack &&
      (typeof error.stack === "string"
        ? error.stack
        : error.stack.map(location => location.source).join("\n"));
    let message_lines = (this.message.match(/\n/g) || []).length + 1;
    this.stack = `${this.name}: ${this.message}\n${this.stack
      .split("\n")
      .slice(0, message_lines + 1)
      .join("\n")}\n${errorStackString}`;
  }
}
