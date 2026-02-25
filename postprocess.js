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

function addIndividualTest(individualTestsMap, transpilerName, parts, ok) {
    const jsFilename = parts.find((part) => part.endsWith(".js"));
    const results = individualTestsMap.get(jsFilename);
    if (!results) {
        individualTestsMap.set(jsFilename, { babelResult: false, swcResult: false, tscResult: false });
    }
    const existingResult = individualTestsMap.get(jsFilename);
    if (transpilerName === "babel") {
        individualTestsMap.set(jsFilename, { ...existingResult, babelResult: ok });
    } else if (transpilerName === "swc") {
        individualTestsMap.set(jsFilename, { ...existingResult, swcResult: ok });
    } else if (transpilerName === "tsc") {
        individualTestsMap.set(jsFilename, { ...existingResult, tscResult: ok });
    }
}

// individual tests map = filename => { babelResult, swcResult, tscResult }
function processFile(filename, transpilerName, resultsMap, individualTestsMap) {
  const m = resultsMap[transpilerName];
  resultsMap[transpilerName] = new Map();
  contents = fs.readFileSync(filename, 'utf-8');
  const lines = contents.split('\n');
  lines.forEach((line) => {
        const ok = (line.substring(0, 2) === "ok");
        const parts = line.split(' ');
        let transpileTime = new Number(parts[parts.length - 5]);
        let runTime = new Number(parts[parts.length - 2]);
        const testCategory = findTestCategory(parts);
        if (testCategory) {
          if (!isFinite(transpileTime)) {
            transpileTime = 0;
          }
          if (!isFinite(runTime)) {
            runTime = 0;
          }
          if (!(resultsMap[transpilerName].get(testCategory))) {
            resultsMap[transpilerName].set(testCategory, new Map());
          }
          const categoryMap = resultsMap[transpilerName].get(testCategory);
          addIndividualTest(individualTestsMap, transpilerName, parts, ok);
          categoryMap.set(parts.find((part) => part.endsWith(".js")), { ok, transpileTime, runTime });
        }
  });
}

function formatTime(t) {
  return t.toPrecision(4);
}

function totalTime(babelMap, swcMap, tscMap) {
  const f = function (sum, pair) {
    const testName = pair[0];
    const { ok, transpileTime, runTime } = pair[1];
    const result = ((testsThatPassAll.has(testName) && isFinite(transpileTime)) ? sum + transpileTime : sum);
    return result;
  };
  const f1 = function (sum, pair) {
    const testName = pair[0];
    const { ok, transpileTime, runTime } = pair[1];
    const result = ((testsThatPassAll.has(testName) && isFinite(runTime)) ? sum + runTime : sum);
    return result;
  };
  const testsThatPassAll = new Set(babelMap.entries().filter(function (pair) {
    const testName = pair[0];
    const { ok, time } = pair[1];
    return ok && swcMap.get(testName).ok && tscMap.get(testName).ok
  }).map((pair) => pair[0]));
  const babelTranspileTime = babelMap.entries().reduce(f, 0);
  const swcTranspileTime = swcMap.entries().reduce(f, 0);
  const tscTranspileTime = tscMap.entries().reduce(f, 0);
  const babelRunTime = babelMap.entries().reduce(f1, 0);
  const swcRunTime = swcMap.entries().reduce(f1, 0);
  const tscRunTime = tscMap.entries().reduce(f1, 0);
  return { totalTimeBabelTranspileThis: babelTranspileTime, totalTimeSwcTranspileThis: swcTranspileTime, totalTimeTscTranspileThis: tscTranspileTime, totalTimeBabelRunThis: babelRunTime, totalTimeSwcRunThis: swcRunTime, totalTimeTscRunThis: tscRunTime, testsPassingAll: testsThatPassAll.size };
 }

function passingTests(map) {
  return map.entries().reduce((sum, pair) => {
    const { ok, _time } = pair[1];
    return (ok ? sum + 1 : sum);
  }, 0);
}

function printResults(resultsMap) {
  console.log("|Test name | Babel passes | Babel avg. transpile time | Babel avg. run time | SWC passes | SWC avg. transpile time | SWC avg. run time | TSC passes | TSC avg. transpile time | TSC avg. run time |")
  console.log("|----------|--------------|---------------------------|---------------------|------------|-------------------------|-------------------|------------|-------------------------|-------------------|");
  let totalOkBabel = 0;
  let totalTests = 0;
  let totalTranspileTimeBabel = 0;
  let totalOkSwc = 0;
  let totalTranspileTimeSwc = 0;
  let totalOkTsc = 0;
  let totalTranspileTimeTsc = 0;
  let totalRunTimeBabel = 0;
  let totalRunTimeSwc = 0;
  let totalRunTimeTsc = 0;
  let totalTestsPassingAll = 0;
  resultsMap['babel'].forEach((value, testCategory, map) => {
    if (skip(testCategory)) {
      return;
    }
    const babelResults = value;
    const swcResults = resultsMap['swc'].get(testCategory);
    const tscResults = resultsMap['tsc'].get(testCategory);
    const babelPasses = passingTests(babelResults);
    const swcPasses = passingTests(swcResults);
    const tscPasses = passingTests(tscResults);
    const totalThisCategory = babelResults.size;
    totalOkBabel += babelPasses;
    totalTests += totalThisCategory;
    const { totalTimeBabelTranspileThis, totalTimeSwcTranspileThis, totalTimeTscTranspileThis, totalTimeBabelRunThis, totalTimeSwcRunThis, totalTimeTscRunThis, testsPassingAll } = totalTime(babelResults, swcResults, tscResults);
    totalTranspileTimeBabel += totalTimeBabelTranspileThis;
    totalTranspileTimeSwc += totalTimeSwcTranspileThis;
    totalTranspileTimeTsc += totalTimeTscTranspileThis;
    totalRunTimeBabel += totalTimeBabelRunThis;
    totalRunTimeSwc += totalTimeSwcRunThis;
    totalRunTimeTsc += totalTimeTscRunThis;
    totalTestsPassingAll += testsPassingAll;
    totalOkSwc += swcPasses;
    totalOkTsc += tscPasses;
    console.log(`|${testCategory} | ${babelPasses} / ${totalThisCategory} | ${testsPassingAll ? formatTime(totalTimeBabelTranspileThis / testsPassingAll) : 0} | ${testsPassingAll ? formatTime(totalTimeBabelRunThis / testsPassingAll) : 0} | ${swcPasses} / ${totalThisCategory} | ${testsPassingAll ? formatTime(totalTimeSwcTranspileThis / testsPassingAll) : 0} | ${testsPassingAll ? formatTime(totalTimeSwcRunThis / testsPassingAll) : 0 } | ${tscPasses} / ${totalThisCategory} | ${testsPassingAll ? formatTime(totalTimeTscTranspileThis / testsPassingAll) : 0} | ${testsPassingAll ? formatTime(totalTimeTscRunThis / testsPassingAll) : 0}`);
     });
  console.log(`|Total | ${totalOkBabel} / ${totalTests} | ${formatTime(totalTranspileTimeBabel / totalTestsPassingAll)} | ${formatTime(totalRunTimeBabel / totalTestsPassingAll) } | ${totalOkSwc} / ${totalTests} | ${formatTime(totalTranspileTimeSwc / totalTestsPassingAll)} | ${formatTime(totalRunTimeSwc / totalTestsPassingAll)} | ${totalOkTsc} / ${totalTests} | ${formatTime(totalTranspileTimeTsc / totalTestsPassingAll)} | ${formatTime(totalRunTimeTsc / totalTestsPassingAll)} |`);
}

function isInterestingTSCAndBabel(babel, swc, tsc) {
  return tsc && babel && !swc;
}

function isInterestingTSCAndSWC(babel, swc, tsc) {
  return tsc && !babel && swc;
}

function isInterestingTSCOnly(babel, swc, tsc) {
  return tsc && !swc && !babel;
}

function isInterestingOnlyTSCFails(babel, swc, tsc) {
  return !tsc && swc && babel;
}

function formatResultTSCAndBabel(jsFilename, babel, swc, tsc) {
  console.log(`${jsFilename} passed in TSC and Babel, failed in SWC`);
}

function formatResultTSCAndSWC(jsFilename, babel, swc, tsc) {
  console.log(`${jsFilename} passed in TSC and SWC, failed in Babel`);
}

function formatResultTSCOnly(jsFilename, babel, swc, tsc) {
  console.log(`${jsFilename} passed in TSC, failed in SWC and Babel`);
}

function formatResultOnlyTSCFails(jsFilename, babel, swc, tsc) {
  console.log(`${jsFilename} failed in TSC, passed in SWC and Babel`);
}

function skip(filename) {
  // Skip tests with "-escaped" in the name
  return (filename.includes("built-ins") || filename.includes("staging") || filename.includes("-escaped"));
}

function testCategory(filename, individualFile) {
  const pathParts = filename.split('/');
  if (pathParts.length < 7)
    return undefined;
  if (!individualFile) {
    pathParts.pop();
  }
  // Remove $HOME/downleveling/babel-test262-runner/test262/test prefix
  pathParts.splice(0, 7);
  return pathParts.join('/');
}

function getFeatures(filename) {
  const contents = fs.readFileSync(filename, 'utf8');
  const lines = contents.split('\n');
  const features = lines.filter((line) => line.startsWith("features:"));
  if (features.length === 1) {
    const parts = features[0].split(' ');
    parts.shift();
    return (parts.join(' '));
  }
  return "";
}

function hasFeatures(featureString, featureList) {
  return featureList.reduce((result, feature) =>
    result || (featureString.includes(feature)), false);
}

function handleIndividualTests(individualTests, isInteresting, formatResult, description) {
  // Create a map from testCategory to number of interesting tests
  let categories = new Map();
  let interesting = 0;
  console.log(`| Test category | ${description} |`);
  console.log(`|---------------|----------------|`);

  const pairs1 = Array.from(individualTests.entries());
  pairs1.sort((pair1, pair2) => pair1[0] < pair2[0] ? -1 : pair1[0] === pair2[0] ? 0 : 1);
  pairs1.forEach((pair) => {
    const result = pair[1];
    const jsFilename = pair[0];
    if (skip(jsFilename)) {
      return;
    }
    const { babelResult, swcResult, tscResult} = result;
    if (isInteresting(babelResult, swcResult, tscResult)) {
      const features = getFeatures(jsFilename);
      // Don't count tests that use these features
      if (hasFeatures(features, ["async-iteration", "generators", "dynamic-import"])) {
        return;
      }
      console.log(`| ${testCategory(jsFilename, true)} | ${features}  |`);
      // formatResult(jsFilename, babelResult, swcResult, tscResult);
      const category = testCategory(jsFilename, false);
      if (!categories.get(category)) {
        categories.set(category, 0);
      }
      categories.set(testCategory(jsFilename), categories.get(category) + 1);
      interesting++;
    }
  });
  const pairs = Array.from(categories.entries());
  pairs.sort((pair1, pair2) => pair1[1] > pair2[1] ? -1 : pair1[1] === pair2[1] ? 0 : 1);
  pairs.forEach((p) => {
    console.log(`| **${p[0]}** | **${p[1]}** |`);
  });
  console.log(`| Total | ${interesting} |`);

}

/*
Note: we are collapsing strict mode and default mode results.
*/

function main() {
  const babelFile = process.argv[2];
  const swcFile = process.argv[3];
  const tscFile = process.argv[4];

  if (!babelFile || !swcFile || !tscFile) {
    throw new Error("Must provide three arguments");
  }

  console.log(`Using ${babelFile} for Babel, ${swcFile} for SWC, ${tscFile} for TSC`);

  // maps test directories onto a map from transpiler name to map from test name to { ok: boolean, time: Number }
  const results = new Map();
  // maps filenames onto { babelResult: boolean, swcResult: boolean, tscResult: boolean }
  const individualTests = new Map();

  processFile(babelFile, 'babel', results, individualTests),
  processFile(swcFile, 'swc', results, individualTests),
  processFile(tscFile, 'tsc', results, individualTests)
//  printResults(results);

//  handleIndividualTests(individualTests, isInterestingTSCAndBabel, formatResultTSCAndBabel, "TSC and Babel pass, but not SWC");
//  console.log("-----------");
//  handleIndividualTests(individualTests, isInterestingTSCAndSWC, formatResultTSCAndSWC, "TSC and SWC pass, but not Babel");

//  console.log("------------");
//    handleIndividualTests(individualTests, isInterestingTSCOnly, formatResultTSCOnly, "Only TSC passes");

//  console.log("------------");
   handleIndividualTests(individualTests, isInterestingOnlyTSCFails, formatResultOnlyTSCFails, "Only TSC fails");


}

main();
