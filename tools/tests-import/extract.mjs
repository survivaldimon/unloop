#!/usr/bin/env node
/**
 * Extract the tests_app (Flutter) psychological-test library into portable JSON
 * and audit what came out.
 *
 * Nothing here touches Looplore code — the output is a staging directory we can
 * inspect before deciding what is worth porting.
 *
 *   node tools/tests-import/extract.mjs --src <path-to-tests_app> [--out <dir>]
 */

import fs from "node:fs";
import path from "node:path";
import { parseFile, Evaluator, collectCtors, ctorHistogram } from "./dart-lite.mjs";

// ─────────────────────────────────────────────────────────── cli

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const SRC = path.resolve(arg("src", process.env.TESTS_APP_DIR ?? "./tests_app"));
const OUT = path.resolve(arg("out", path.join(import.meta.dirname, "out")));

if (!fs.existsSync(path.join(SRC, "lib", "data"))) {
  console.error(`No lib/data under ${SRC}. Pass --src <path-to-tests_app clone>.`);
  process.exit(1);
}

const read = (p) => fs.readFileSync(p, "utf8").replace(/^﻿/, "");
const listDart = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".dart")).map((f) => path.join(dir, f))
    : [];

function evalDartFile(file) {
  const classes = parseFile(read(file));
  const ev = new Evaluator(classes);
  const values = ev.evalAll();
  return { classes, values, issues: ev.issues };
}

// ─────────────────────────────────────────────────────────── helpers

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !v.__ctor && !v.__node;
const isUnresolved = (v) => v !== null && typeof v === "object" && (v.__node === "unresolved" || v.__node === "unknown");

/** Localised map → {ru, en}; records what is missing instead of guessing. */
function localized(value, where, problems) {
  if (!isPlainObject(value)) {
    if (value !== undefined && value !== null) problems.push(`${where}: not a localized map`);
    return null;
  }
  const out = {};
  for (const lang of ["ru", "en"]) {
    const v = value[lang];
    if (v === undefined) {
      problems.push(`${where}: missing '${lang}'`);
      continue;
    }
    if (typeof v === "string") {
      if (!v.trim()) problems.push(`${where}.${lang}: empty`);
      if (v.includes("${") || /\$[A-Za-z_]/.test(v)) problems.push(`${where}.${lang}: unresolved interpolation`);
      out[lang] = v;
    } else if (Array.isArray(v)) {
      const strs = v.filter((x) => typeof x === "string");
      if (strs.length !== v.length) problems.push(`${where}.${lang}: ${v.length - strs.length} non-string item(s)`);
      out[lang] = strs;
    } else {
      problems.push(`${where}.${lang}: unsupported value`);
    }
  }
  return Object.keys(out).length ? out : null;
}

const KNOWN_QUESTION_KEYS = new Set(["id", "text", "answers", "factorId", "isReversed"]);
const KNOWN_ANSWER_KEYS = new Set(["id", "text", "score"]);
const KNOWN_TEST_KEYS = new Set([
  "id", "title", "description", "category", "categoryId", "disclaimer",
  "estimatedTime", "type", "factorIds", "questions",
]);
const PROFILE_TEXT_KEYS = ["name", "description", "whyThisProfile", "tryToday", "inspiringConclusion"];
const PROFILE_LIST_KEYS = ["strengths", "vulnerabilities", "recommendations"];

function extraKeys(named, known) {
  const out = {};
  for (const [k, v] of Object.entries(named)) {
    if (known.has(k)) continue;
    if (isUnresolved(v)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function convertAnswer(node, where, problems) {
  const n = node.named ?? {};
  const id = typeof n.id === "string" ? n.id : null;
  if (!id) problems.push(`${where}: answer without id`);
  const score = typeof n.score === "number" ? n.score : null;
  if (score === null) problems.push(`${where}[${id}]: non-numeric score`);
  return {
    id,
    text: localized(n.text, `${where}[${id}].text`, problems),
    score,
    ...(extraKeys(n, KNOWN_ANSWER_KEYS) ? { extra: extraKeys(n, KNOWN_ANSWER_KEYS) } : {}),
  };
}

function convertQuestion(node, where, problems) {
  const n = node.named ?? {};
  const id = typeof n.id === "string" ? n.id : null;
  if (!id) problems.push(`${where}: question without id`);
  const answersRaw = Array.isArray(n.answers) ? n.answers : [];
  if (!Array.isArray(n.answers)) problems.push(`${where}[${id}]: answers unresolved`);
  const answers = answersRaw
    .filter((a) => a?.__ctor === "AnswerModel")
    .map((a, i) => convertAnswer(a, `${where}[${id}].answers[${i}]`, problems));
  if (answersRaw.length && answers.length !== answersRaw.length) {
    problems.push(`${where}[${id}]: ${answersRaw.length - answers.length} answer(s) not AnswerModel`);
  }
  return {
    id,
    text: localized(n.text, `${where}[${id}].text`, problems),
    factorId: typeof n.factorId === "string" ? n.factorId : null,
    isReversed: n.isReversed === true,
    answers,
    ...(extraKeys(n, KNOWN_QUESTION_KEYS) ? { extra: extraKeys(n, KNOWN_QUESTION_KEYS) } : {}),
  };
}

/**
 * Result content that is not a `TestProfile`: several tests define their own
 * profile classes (CareerProfile, RomanticProfile, …). Keep whatever localized
 * fields they carry rather than reporting the test as having no results.
 */
function convertCustomProfile(node, problems) {
  const n = node.named ?? {};
  const fields = {};
  for (const [k, v] of Object.entries(n)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") fields[k] = v;
    else if (isPlainObject(v) && ("ru" in v || "en" in v)) fields[k] = localized(v, `${node.__ctor}.${k}`, problems);
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) fields[k] = v;
  }
  return { id: typeof n.id === "string" ? n.id : null, kind: node.__ctor, fields };
}

function convertProfile(node, where, problems) {
  const n = node.named ?? {};
  const id = typeof n.id === "string" ? n.id : null;
  const out = { id, icon: typeof n.icon === "string" ? n.icon : null };
  for (const key of PROFILE_TEXT_KEYS) {
    out[key] = n[key] === undefined ? null : localized(n[key], `${where}[${id}].${key}`, problems);
    if (n[key] === undefined) problems.push(`${where}[${id}]: missing section '${key}'`);
  }
  for (const key of PROFILE_LIST_KEYS) {
    out[key] = n[key] === undefined ? null : localized(n[key], `${where}[${id}].${key}`, problems);
    if (n[key] === undefined) problems.push(`${where}[${id}]: missing section '${key}'`);
  }
  return out;
}

function convertTest(node, source, problems) {
  const n = node.named ?? {};
  const id = typeof n.id === "string" ? n.id : null;
  const questionsRaw = Array.isArray(n.questions) ? n.questions : [];
  if (!Array.isArray(n.questions)) problems.push("questions: unresolved");
  const questions = questionsRaw
    .filter((q) => q?.__ctor === "QuestionModel")
    .map((q, i) => convertQuestion(q, "questions", problems));
  if (questionsRaw.length !== questions.length) {
    problems.push(`questions: ${questionsRaw.length - questions.length} entr(ies) not QuestionModel`);
  }
  const factorIds = Array.isArray(n.factorIds) ? n.factorIds.filter((f) => typeof f === "string") : [];
  return {
    id,
    source,
    title: localized(n.title, "title", problems),
    description: localized(n.description, "description", problems),
    category: localized(n.category, "category", problems),
    categoryId: typeof n.categoryId === "string" ? n.categoryId : null,
    disclaimer: n.disclaimer === undefined ? null : localized(n.disclaimer, "disclaimer", problems),
    estimatedTime: typeof n.estimatedTime === "number" ? n.estimatedTime : null,
    type: n.type?.__node === "unresolved" ? n.type.name : typeof n.type === "string" ? n.type : null,
    factorIds,
    questions,
    profiles: [],
    ...(extraKeys(n, KNOWN_TEST_KEYS) ? { extra: extraKeys(n, KNOWN_TEST_KEYS) } : {}),
  };
}

// ─────────────────────────────────────────────────────────── 1. scales

console.log("· scales");
const scalesFile = path.join(SRC, "lib/config/summary/hierarchical_scales.dart");
const scalesEval = evalDartFile(scalesFile);
const scalesMap = scalesEval.values["HierarchicalScalesConfig.hierarchicalScales"];
const validScales = new Set(isPlainObject(scalesMap) ? Object.keys(scalesMap) : []);

const poleFile = path.join(SRC, "lib/config/summary/personality_type_scales.dart");
const poleEval = evalDartFile(poleFile);
const poleMapKey = Object.keys(poleEval.values).find((k) => isPlainObject(poleEval.values[k]));
const bipolarPoles = new Set(isPlainObject(poleEval.values[poleMapKey]) ? Object.keys(poleEval.values[poleMapKey]) : []);

const scaleDetails = {};
if (isPlainObject(scalesMap)) {
  for (const [id, node] of Object.entries(scalesMap)) {
    const n = node?.named ?? {};
    scaleDetails[id] = {
      id,
      name: isPlainObject(n.name) ? { ru: n.name.ru ?? null, en: n.name.en ?? null } : null,
      categoryId: typeof n.categoryId === "string" ? n.categoryId : null,
      parentScaleId: typeof n.parentScaleId === "string" ? n.parentScaleId : null,
    };
  }
}
console.log(`  ${validScales.size} hierarchical scales, ${bipolarPoles.size} personality poles`);

// ─────────────────────────────────────────────────────────── 2. stubs + registry

console.log("· stubs");
const stubs = {};
const stubByClass = {};
for (const file of listDart(path.join(SRC, "lib/data/tests"))) {
  if (path.basename(file) === "test_stub.dart") continue;
  const { classes, values } = evalDartFile(file);
  for (const cls of classes.keys()) {
    const get = (name) => values[`${cls}.${name}`];
    const id = get("id");
    if (typeof id !== "string") continue;
    const stub = {
      id,
      class: cls,
      file: path.relative(SRC, file).replaceAll("\\", "/"),
      category: typeof get("category") === "string" ? get("category") : null,
      name: isPlainObject(get("name")) ? get("name") : null,
      questionCount: typeof get("questionCount") === "number" ? get("questionCount") : null,
      estimatedMinutes: typeof get("estimatedMinutes") === "number" ? get("estimatedMinutes") : null,
      type: typeof get("type") === "string" ? get("type") : null,
      tags: Array.isArray(get("tags")) ? get("tags").filter((t) => typeof t === "string") : [],
    };
    stubs[id] = stub;
    stubByClass[cls] = stub;
  }
}
console.log(`  ${Object.keys(stubs).length} stubs`);

const registryEval = evalDartFile(path.join(SRC, "lib/data/test_registry.dart"));
const registryList = registryEval.values["TestRegistry.allTests"];
const registeredClasses = Array.isArray(registryList)
  ? registryList.filter((n) => n?.__ctor).map((n) => n.__ctor)
  : [];
const registeredIds = new Set(registeredClasses.map((c) => stubByClass[c]?.id).filter(Boolean));
console.log(`  ${registeredIds.size} registered in TestRegistry`);

// ─────────────────────────────────────────────────────────── 3. test data

console.log("· test data");
const tests = {};
const customTests = {};
const fileReports = [];

// `foo_data.dart` ↔ `tests/foo_test.dart` — the only link between a custom-shaped
// data file and its stub.
const stubByBase = {};
for (const stub of Object.values(stubs)) {
  stubByBase[path.basename(stub.file).replace(/_test\.dart$/, "")] = stub;
}

for (const file of listDart(path.join(SRC, "lib/data"))) {
  const rel = path.relative(SRC, file).replaceAll("\\", "/");
  const base = path.basename(file);
  if (["test_registry.dart", "test_data.dart", "test_data_legacy.dart"].includes(base)) continue;

  let evaluated;
  try {
    evaluated = evalDartFile(file);
  } catch (e) {
    fileReports.push({ file: rel, ok: false, error: e.message });
    continue;
  }
  const { values, issues } = evaluated;
  const all = Object.values(values);
  const testNodes = collectCtors(all, "TestModel");
  const profileNodes = collectCtors(all, "TestProfile");
  const histogram = Object.fromEntries(ctorHistogram(all));
  const customProfileNodes = Object.keys(histogram)
    .filter((name) => name !== "TestProfile" && /Profile$/.test(name))
    .flatMap((name) => collectCtors(all, name));
  // Per-factor interpretations and type descriptions live in loose maps, not in
  // profile objects — for tests like sixteen_types that is the entire result copy.
  const contentBlocks = Object.fromEntries(
    Object.entries(values).filter(
      ([k, v]) =>
        /interpretation|description|typename|factorname/i.test(k) &&
        (isPlainObject(v) || Array.isArray(v)) &&
        !ctorHistogram(v).size,
    ),
  );

  fileReports.push({
    file: rel,
    ok: true,
    evalIssues: issues,
    testModels: testNodes.length,
    profiles: profileNodes.length,
    ctors: histogram,
  });

  if (!testNodes.length) {
    // Special tests (colour picking, forced choice, scenarios, visual) use their
    // own models. Keep the parsed data so we can judge portability by hand.
    const base = path.basename(file).replace(/_data\.dart$/, "");
    const contentful = Object.entries(values).filter(
      ([, v]) => (Array.isArray(v) && v.length) || (isPlainObject(v) && Object.keys(v).length),
    );
    if (!contentful.length) continue;
    const stub = stubByBase[base];
    customTests[stub?.id ?? base] = {
      id: stub?.id ?? null,
      base,
      file: rel,
      stubQuestionCount: stub?.questionCount ?? null,
      ctors: histogram,
      statics: Object.fromEntries(
        contentful.map(([k, v]) => [k, Array.isArray(v) ? `array(${v.length})` : `object(${Object.keys(v).length})`]),
      ),
      data: Object.fromEntries(contentful),
    };
    continue;
  }

  for (const node of testNodes) {
    const problems = [];
    const test = convertTest(node, rel, problems);
    if (!test.id) continue;
    // A file may expose the same profile map twice (`_profiles` plus a
    // `getAllProfiles()` that returns it) — same object, not duplicate content.
    const seenProfiles = new Set();
    test.profiles = profileNodes
      .map((p) => convertProfile(p, "profiles", problems))
      .filter((p) => {
        if (p.id && seenProfiles.has(p.id)) return false;
        if (p.id) seenProfiles.add(p.id);
        return true;
      });
    test.customProfiles = customProfileNodes.map((p) => convertCustomProfile(p, problems));
    test.contentBlocks = contentBlocks;
    test.problems = problems;
    if (tests[test.id]) {
      test.problems.push(`duplicate TestModel id, also defined in ${tests[test.id].source}`);
    }
    tests[test.id] = test;
  }
}
console.log(`  ${Object.keys(tests).length} TestModel extracted`);

// ─────────────────────────────────────────────────────────── 4. weights

console.log("· weights");
const weightsByTest = {};
const weightFileReports = [];

for (const file of listDart(path.join(SRC, "lib/config/summary/question_weights"))) {
  const rel = path.relative(SRC, file).replaceAll("\\", "/");
  if (path.basename(file) === "question_weight_models.dart") continue;
  let evaluated;
  try {
    evaluated = evalDartFile(file);
  } catch (e) {
    weightFileReports.push({ file: rel, ok: false, error: e.message });
    continue;
  }
  const maps = Object.entries(evaluated.values).filter(([, v]) => isPlainObject(v));
  let entryCount = 0;
  const dupKeys = [];
  for (const [, map] of maps) {
    if (map.__dupKeys) dupKeys.push(...map.__dupKeys);
    for (const [key, node] of Object.entries(map)) {
      if (node?.__ctor !== "QuestionWeight") continue;
      const n = node.named ?? {};
      const testId = typeof n.testId === "string" ? n.testId : key.split(":")[0];
      const questionId = typeof n.questionId === "string" ? n.questionId : key.split(":")[1];
      const axisWeights = {};
      if (isPlainObject(n.axisWeights)) {
        for (const [scale, w] of Object.entries(n.axisWeights)) {
          if (typeof w === "number") axisWeights[scale] = w;
        }
      }
      const axisDirections = {};
      if (isPlainObject(n.axisDirections)) {
        for (const [scale, d] of Object.entries(n.axisDirections)) {
          if (typeof d === "number") axisDirections[scale] = d;
        }
      }
      (weightsByTest[testId] ??= { testId, file: rel, entries: [], dupKeys: [] }).entries.push({
        key,
        questionId,
        axisWeights,
        ...(Object.keys(axisDirections).length ? { axisDirections } : {}),
      });
      entryCount++;
    }
  }
  for (const bucket of Object.values(weightsByTest)) {
    if (bucket.file === rel && dupKeys.length) bucket.dupKeys = [...new Set(dupKeys)];
  }
  weightFileReports.push({ file: rel, ok: true, entries: entryCount, dupKeys: [...new Set(dupKeys)] });
}
console.log(`  ${Object.keys(weightsByTest).length} tests carry weights`);

// ─────────────────────────────────────────────────────────── 5. audit

console.log("· audit");
const audit = [];

for (const [id, test] of Object.entries(tests)) {
  const stub = stubs[id];
  const errors = [];
  const warnings = [...test.problems];

  const qIds = test.questions.map((q) => q.id);
  const dupQ = qIds.filter((q, i) => q && qIds.indexOf(q) !== i);
  if (dupQ.length) errors.push(`duplicate question ids: ${[...new Set(dupQ)].join(", ")}`);

  if (!stub) warnings.push("no TestStub with this id");
  else if (stub.questionCount !== null && stub.questionCount !== test.questions.length) {
    errors.push(`question count ${test.questions.length} ≠ stub.questionCount ${stub.questionCount}`);
  }

  const noAnswers = test.questions.filter((q) => q.answers.length < 2).length;
  if (noAnswers) errors.push(`${noAnswers} question(s) with <2 answers`);

  if (test.factorIds.length) {
    const bad = test.questions.filter((q) => q.factorId && !test.factorIds.includes(q.factorId));
    if (bad.length) {
      const list = [...new Set(bad.map((q) => q.factorId))].join(", ");
      errors.push(`${bad.length} question(s) reference undeclared factor(s): ${list}`);
    }
    const noFactor = test.questions.filter((q) => !q.factorId).length;
    if (noFactor) warnings.push(`${noFactor} question(s) without factorId`);
  }

  // Weights
  const w = weightsByTest[id];
  const weightStats = { entries: 0, coverage: 0, invalidScales: [], negativeOnPoles: [], unknownQuestions: [] };
  if (w) {
    weightStats.entries = w.entries.length;
    const covered = new Set(w.entries.map((e) => e.questionId));
    weightStats.coverage = qIds.length ? Math.round((qIds.filter((q) => covered.has(q)).length / qIds.length) * 100) : 0;
    const invalid = new Set();
    const negPoles = new Set();
    const unknownQ = new Set();
    for (const e of w.entries) {
      if (e.questionId && qIds.length && !qIds.includes(e.questionId)) unknownQ.add(e.questionId);
      for (const [scale, weight] of Object.entries(e.axisWeights)) {
        if (!validScales.has(scale) && !bipolarPoles.has(scale)) invalid.add(scale);
        if (bipolarPoles.has(scale) && weight < 0) negPoles.add(`${e.key}:${scale}`);
      }
    }
    weightStats.invalidScales = [...invalid];
    weightStats.negativeOnPoles = [...negPoles];
    weightStats.unknownQuestions = [...unknownQ];
    if (invalid.size) errors.push(`${invalid.size} weight scale(s) not in the 195: ${[...invalid].slice(0, 6).join(", ")}${invalid.size > 6 ? "…" : ""}`);
    if (negPoles.size) errors.push(`${negPoles.size} negative weight(s) on bipolar poles`);
    if (unknownQ.size) errors.push(`weights reference ${unknownQ.size} unknown question id(s)`);
    if (w.dupKeys.length) errors.push(`${w.dupKeys.length} duplicate weight key(s)`);
  } else {
    const stray = Object.values(weightsByTest).find(
      (b) => path.basename(b.file).replace(/_weights\.dart$/, "") === path.basename(test.source).replace(/_data\.dart$/, ""),
    );
    if (stray) errors.push(`weights are filed under testId '${stray.testId}' — id mismatch with '${id}'`);
    else warnings.push("no question weights — test cannot feed the cross-test profile");
  }

  // Localisation / content readiness
  const i18nProblems = warnings.filter((p) => /missing '(ru|en)'|empty|interpolation/.test(p)).length;
  const profilesComplete = test.profiles.filter((p) =>
    [...PROFILE_TEXT_KEYS, ...PROFILE_LIST_KEYS].every((k) => p[k]?.ru && p[k]?.en),
  ).length;

  audit.push({
    id,
    file: test.source,
    registered: registeredIds.has(id),
    stubQuestionCount: stub?.questionCount ?? null,
    questions: test.questions.length,
    factors: test.factorIds.length,
    profiles: test.profiles.length,
    customProfiles: test.customProfiles.length,
    contentBlocks: Object.keys(test.contentBlocks),
    profilesComplete,
    i18nProblems,
    weights: weightStats,
    errors,
    warnings,
    verdict: errors.length ? "FAIL" : warnings.length > 5 ? "WARN" : "OK",
  });
}

// Stubs that produced no TestModel at all.
for (const [id, stub] of Object.entries(stubs)) {
  if (tests[id]) continue;
  const custom = customTests[id];
  const errors = [];
  const warnings = [];
  let items = 0;
  if (custom) {
    items = Math.max(0, ...Object.values(custom.data).map((v) => (Array.isArray(v) ? v.length : 0)));
    warnings.push(`custom data shape: ${Object.entries(custom.ctors).map(([k, v]) => `${k}×${v}`).join(", ")}`);
    if (stub.questionCount !== null && items !== stub.questionCount) {
      warnings.push(`largest parsed collection is ${items}, stub declares ${stub.questionCount} questions`);
    }
  } else {
    errors.push("no test data extracted — neither TestModel nor a parseable custom shape");
  }
  const w = weightsByTest[id];
  audit.push({
    id,
    file: custom?.file ?? stub.file,
    registered: registeredIds.has(id),
    stubQuestionCount: stub.questionCount,
    questions: items,
    custom: !!custom,
    factors: 0,
    profiles: 0,
    profilesComplete: 0,
    i18nProblems: 0,
    weights: {
      entries: w?.entries.length ?? 0,
      coverage: 0,
      invalidScales: w ? [...new Set(w.entries.flatMap((e) => Object.keys(e.axisWeights).filter((s) => !validScales.has(s) && !bipolarPoles.has(s))))] : [],
      negativeOnPoles: [],
      unknownQuestions: [],
    },
    errors,
    warnings,
    verdict: errors.length ? "FAIL" : "CUSTOM",
  });
}

audit.sort((a, b) => a.id.localeCompare(b.id));

// ─────────────────────────────────────────────────────────── 6. write

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "tests"), { recursive: true });
fs.mkdirSync(path.join(OUT, "weights"), { recursive: true });

for (const [id, test] of Object.entries(tests)) {
  fs.writeFileSync(path.join(OUT, "tests", `${id}.json`), JSON.stringify(test, null, 2), "utf8");
}
for (const [id, w] of Object.entries(weightsByTest)) {
  fs.writeFileSync(path.join(OUT, "weights", `${id}.json`), JSON.stringify(w, null, 2), "utf8");
}
if (Object.keys(customTests).length) {
  fs.mkdirSync(path.join(OUT, "custom"), { recursive: true });
  for (const [id, c] of Object.entries(customTests)) {
    fs.writeFileSync(path.join(OUT, "custom", `${id}.json`), JSON.stringify(c, null, 2), "utf8");
  }
}
fs.writeFileSync(
  path.join(OUT, "scales.json"),
  JSON.stringify({ hierarchical: scaleDetails, bipolarPoles: [...bipolarPoles] }, null, 2),
  "utf8",
);
fs.writeFileSync(path.join(OUT, "stubs.json"), JSON.stringify(stubs, null, 2), "utf8");
fs.writeFileSync(
  path.join(OUT, "audit.json"),
  JSON.stringify({ audit, fileReports, weightFileReports }, null, 2),
  "utf8",
);

// ─────────────────────────────────────────────────────────── 7. report

const totalQuestions = Object.values(tests).reduce((s, t) => s + t.questions.length, 0);
const totalProfiles = Object.values(tests).reduce((s, t) => s + t.profiles.length, 0);
const ok = audit.filter((a) => a.verdict === "OK");
const warn = audit.filter((a) => a.verdict === "WARN");
const fail = audit.filter((a) => a.verdict === "FAIL");
const custom = audit.filter((a) => a.verdict === "CUSTOM");

const md = [];
md.push("# tests_app → JSON: extraction audit", "");
md.push(`Source: \`${SRC}\``);
md.push(`Generated by \`tools/tests-import/extract.mjs\`. Re-run to refresh.`, "");
md.push("## Totals", "");
md.push("| | |");
md.push("|---|---|");
md.push(`| Test stubs | ${Object.keys(stubs).length} (${registeredIds.size} registered) |`);
md.push(`| TestModel extracted | ${Object.keys(tests).length} |`);
md.push(`| Questions | ${totalQuestions} |`);
md.push(`| Result profiles | ${totalProfiles} |`);
md.push(`| Hierarchical scales | ${validScales.size} |`);
md.push(`| Bipolar poles | ${bipolarPoles.size} |`);
md.push(`| Tests with weights | ${Object.keys(weightsByTest).length} |`);
md.push(`| Verdicts | OK ${ok.length} · WARN ${warn.length} · CUSTOM ${custom.length} · FAIL ${fail.length} |`);
md.push("");
md.push("## Per test", "");
md.push("| Test | Reg | Q (stub) | Fact | Profiles (full) | Alt | i18n | Weights | Cov | Verdict |");
md.push("|---|---|---|---|---|---|---|---|---|---|");
for (const a of audit) {
  md.push(
    `| \`${a.id}\` | ${a.registered ? "✓" : "—"} | ${a.questions}${
      a.stubQuestionCount !== null && a.stubQuestionCount !== a.questions ? ` (${a.stubQuestionCount})` : ""
    } | ${a.factors} | ${a.profiles} (${a.profilesComplete}) | ${
      [
        a.customProfiles ? `${a.customProfiles} custom` : null,
        a.contentBlocks?.length ? `${a.contentBlocks.length} blocks` : null,
      ]
        .filter(Boolean)
        .join(", ") || "—"
    } | ${a.i18nProblems || "—"} | ${
      a.weights.entries || "—"
    } | ${a.weights.entries ? a.weights.coverage + "%" : "—"} | ${a.verdict} |`,
  );
}
md.push("");

// Which scales the weights reference but the registry never defines. These are
// silently dropped by the app, so every one is a lost cross-test contribution.
const missingScaleFreq = new Map();
const missingScaleTests = new Map();
for (const bucket of Object.values(weightsByTest)) {
  for (const e of bucket.entries) {
    for (const scale of Object.keys(e.axisWeights)) {
      if (validScales.has(scale) || bipolarPoles.has(scale)) continue;
      missingScaleFreq.set(scale, (missingScaleFreq.get(scale) ?? 0) + 1);
      (missingScaleTests.get(scale) ?? missingScaleTests.set(scale, new Set()).get(scale)).add(bucket.testId);
    }
  }
}
const totalWeightRefs = Object.values(weightsByTest).reduce(
  (s, b) => s + b.entries.reduce((n, e) => n + Object.keys(e.axisWeights).length, 0),
  0,
);
const missingRefs = [...missingScaleFreq.values()].reduce((a, b) => a + b, 0);

md.push("## Scale-registry violations", "");
md.push(
  `${missingScaleFreq.size} distinct scales are referenced by question weights but absent from ` +
    `\`hierarchical_scales.dart\` — ${missingRefs} of ${totalWeightRefs} weight references ` +
    `(${Math.round((missingRefs / totalWeightRefs) * 100)}%) point at scales that do not exist.`,
  "",
);
md.push("| Scale referenced | Refs | Tests |");
md.push("|---|---|---|");
for (const [scale, count] of [...missingScaleFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  md.push(`| \`${scale}\` | ${count} | ${missingScaleTests.get(scale).size} |`);
}
if (missingScaleFreq.size > 40) md.push(`| …${missingScaleFreq.size - 40} more | | |`);
md.push("");

md.push("## Findings", "");
for (const a of audit) {
  if (!a.errors.length && a.warnings.length <= 5) continue;
  md.push(`### \`${a.id}\` — ${a.verdict}`, "");
  md.push(`\`${a.file}\``, "");
  for (const e of a.errors) md.push(`- **ERROR** ${e}`);
  const shown = a.warnings.slice(0, 12);
  for (const w of shown) md.push(`- warn: ${w}`);
  if (a.warnings.length > shown.length) md.push(`- warn: …${a.warnings.length - shown.length} more (see audit.json)`);
  md.push("");
}

const badFiles = fileReports.filter((f) => !f.ok || f.evalIssues?.length);
if (badFiles.length) {
  md.push("## Files with evaluation issues", "");
  for (const f of badFiles) {
    md.push(`- \`${f.file}\`: ${f.ok ? f.evalIssues.slice(0, 4).join("; ") : "PARSE FAILED — " + f.error}`);
  }
  md.push("");
}

fs.writeFileSync(path.join(OUT, "AUDIT.md"), md.join("\n"), "utf8");

console.log("");
console.log(`tests ${Object.keys(tests).length} · questions ${totalQuestions} · profiles ${totalProfiles}`);
console.log(`verdicts: OK ${ok.length} · WARN ${warn.length} · CUSTOM ${custom.length} · FAIL ${fail.length}`);
console.log(`→ ${path.relative(process.cwd(), path.join(OUT, "AUDIT.md"))}`);
