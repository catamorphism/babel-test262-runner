const fs = require("fs");

function findTestCategory(parts) {
  const jsFileName = parts.find((part) => part.endsWith(".js"))
  if (!jsFileName)
    return undefined; // Ignore this line

  const pathParts = jsFileName.split('/');
  if (pathParts.length < 3)
    return undefined; // Ignore this line
  while (pathParts[0] != 'test262') {
    pathParts.shift();
    if (pathParts.length < 1)
      return undefined; // Ignore this line
  }
  pathParts.shift(2);
  pathParts.pop();

  return pathParts.join('/');
}

function update(ok, time) {
  return function (info) {
    return {
      oks: info.oks + (ok ? 1 : 0),
      total: info.total + 1,
      time: ok.time + (ok ? time : 0)
    };
  }
}

function processFile(filename, transpilerName, resultsMap) {
  const m = resultsMap[transpilerName];
  resultsMap[transpilerName] = new Map();
  contents = fs.readFileSync(filename, 'utf-8');
  const lines = contents.split('\n');
  lines.forEach((line) => {
        const ok = (line.substring(0, 2) === "ok");
        const parts = line.split(' ');
        const newTime = new Number(parts[parts.length - 2]);
        const testCategory = findTestCategory(parts);
        if (testCategory) {
          if (!(resultsMap[transpilerName].get(testCategory))) {
            resultsMap[transpilerName].set(testCategory, { oks: 0, total: 0, time: 0 });
          }
          const { oks, total, time } = resultsMap[transpilerName].get(testCategory);
          resultsMap[transpilerName].set(testCategory, {oks: oks + (ok ? 1 : 0), total: total + 1, time: time + (ok ? newTime : 0)});
        }
  });
}

function formatTime(t) {
  return t.toPrecision(4);
}

function printResults(resultsMap) {
  console.log("|Test name | Babel passes | Babel avg. time | SWC passes | SWC avg. time | TSC passes | TSC avg. time |")
  console.log("|----------|--------------|-----------------|------------|---------------|------------|---------------|");
  let totalOkBabel = 0;
  let totalTests = 0;
  let totalTimeBabel = 0;
  let totalOkSwc = 0;
  let totalTimeSwc = 0;
  let totalOkTsc = 0;
  let totalTimeTsc = 0;
  resultsMap['babel'].forEach((value, testCategory, map) => {
    const babelResults = value;
    const swcResults = resultsMap['swc'].get(testCategory);
    const tscResults = resultsMap['tsc'].get(testCategory);
    totalOkBabel += babelResults.oks;
    totalTests += babelResults.total;
    totalTimeBabel += babelResults.time;
    totalOkSwc += swcResults.oks;
    totalTimeSwc += swcResults.time;
    totalOkTsc += tscResults.oks;
    totalTimeTsc += tscResults.time;
    console.log(`|${testCategory} | ${babelResults.oks} / ${babelResults.total} | ${formatTime(babelResults.time / babelResults.total)} | ${swcResults.oks} / ${swcResults.total} | ${formatTime(swcResults.time / swcResults.total)} | ${tscResults.oks} / ${tscResults.total} | ${formatTime(tscResults.time / tscResults.total)} |`);
     });
  console.log(`|Total | ${totalOkBabel} / ${totalTests} | ${formatTime(totalTimeBabel / totalOkBabel)} | ${totalOkSwc} / ${totalTests} | ${formatTime(totalTimeSwc / totalOkSwc)} | ${totalOkTsc} / ${totalTests} | ${formatTime(totalTimeTsc / totalOkTsc)} |`);
}

function main() {
  const babelFile = process.argv[2];
  const swcFile = process.argv[3];
  const tscFile = process.argv[4];

  if (!babelFile || !swcFile || !tscFile) {
    throw new Error("Must provide three arguments");
  }

  console.log(`Using ${babelFile} for Babel, ${swcFile} for SWC, ${tscFile} for TSC`);

  // maps test directories onto a map from transpiler name to { ok: boolean, time: Number }
  const results = new Map();

  processFile(babelFile, 'babel', results),
  processFile(swcFile, 'swc', results),
  processFile(tscFile, 'tsc', results)
  printResults(results);
}

main();
