#!/usr/bin/env node
/**
 * Э4 — build the canonical test files the app ships from the staged extraction.
 *
 *   node tools/tests-import/to-canonical.mjs
 *
 * Reads  out/tests, out/custom, out/weights-normalized, profile-rules.json
 * Writes src/content/tests/<test_id>.json  (one self-contained test each)
 *
 * Everything test-specific lives in these files: the engine branches on the
 * scoring mode, never on a test id.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(import.meta.dirname, "out");
const DEST = path.join(ROOT, "src/content/tests");

const RULES = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "profile-rules.json"), "utf8"));
const load = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const LAUNCH_SET = [
  "text_conflict_communication",
  "attachment_styles_v1",
  "friendship_red_flags_v1",
  "love_languages_v1",
  "toxic_patterns",
  "ipip_big_five",
  "sixteen_types",
];

/** Scenario tests keep no factor-name map in the source — these are ours. */
const SCENARIO_FACTOR_NAMES = {
  text_conflict_communication: {
    avoidance: { ru: "Избегание", en: "Avoidance" },
    aggression: { ru: "Агрессия", en: "Aggression" },
    passive_revenge: { ru: "Пассивная месть", en: "Passive revenge" },
    assertiveness: { ru: "Ассертивность", en: "Assertiveness" },
  },
};

/** Bipolar poles are what the result actually shows, so they need labels. */
const POLE_NAMES = {
  extraversion: { ru: "Экстраверсия", en: "Extraversion" },
  introversion: { ru: "Интроверсия", en: "Introversion" },
  sensing: { ru: "Сенсорика", en: "Sensing" },
  intuition: { ru: "Интуиция", en: "Intuition" },
  thinking: { ru: "Логика", en: "Thinking" },
  feeling: { ru: "Чувства", en: "Feeling" },
  judging: { ru: "Суждение", en: "Judging" },
  perceiving: { ru: "Восприятие", en: "Perceiving" },
};

/** Answer-level factors: the answer score indexes this list. */
const FACTOR_ORDER = {
  text_conflict_communication: ["avoidance", "aggression", "passive_revenge", "assertiveness"],
};

const loc = (v) => (v && typeof v === "object" && (v.ru || v.en) ? { ru: v.ru ?? v.en ?? "", en: v.en ?? v.ru ?? "" } : null);
const locList = (v) => (v && typeof v === "object" ? { ru: v.ru ?? v.en ?? [], en: v.en ?? v.ru ?? [] } : null);

function weightsByQuestion(testId) {
  const file = path.join(OUT, "weights-normalized", `${testId}.json`);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const entry of load(file).entries) {
    if (!entry.questionId) continue;
    out[entry.questionId] = { ...(out[entry.questionId] ?? {}), ...entry.axisWeights };
  }
  return out;
}

/** Weights of an `answer_factor` test are filed per style, not per question. */
function weightsByFactor(testId) {
  const file = path.join(OUT, "weights-normalized", `${testId}.json`);
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const entry of load(file).entries) {
    if (entry.questionId) out[entry.questionId] = entry.axisWeights;
  }
  return out;
}

/**
 * `sixteen_types` keeps its result copy as markdown blobs rather than profile
 * objects: a bold name, a dash, then bulleted strengths and growth areas.
 */
function parseTypeDescription(markdown) {
  const nameMatch = markdown.match(/^\*\*(.+?)\*\*\s*[—-]\s*(.*)$/m);
  const sections = {};
  let current = null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^\*\*(.+?):\*\*/);
    if (heading) {
      current = heading[1].toLowerCase();
      sections[current] = [];
      const inline = line.slice(heading[0].length).trim();
      if (inline) sections[current].push(inline);
      continue;
    }
    const bullet = line.match(/^[•\-*]\s*(.+)$/);
    if (bullet && current) sections[current].push(bullet[1].trim());
  }
  const pick = (...names) => {
    for (const n of names) {
      const key = Object.keys(sections).find((k) => k.includes(n));
      if (key) return sections[key];
    }
    return [];
  };
  return {
    name: nameMatch?.[1]?.trim() ?? "",
    description: nameMatch?.[2]?.trim() ?? "",
    strengths: pick("сильные", "strength"),
    vulnerabilities: pick("зоны развития", "development"),
    // Career advice is the only other content in the blob — keep it rather than
    // drop it; Э8 rewrites these profiles into the seven-section shape anyway.
    recommendations: pick("карьера", "career"),
  };
}

function profilesFromTypeDescriptions(block) {
  const out = {};
  for (const [code, localized] of Object.entries(block ?? {})) {
    const ru = parseTypeDescription(localized.ru ?? "");
    const en = parseTypeDescription(localized.en ?? "");
    out[code] = {
      id: code,
      icon: null,
      name: { ru: ru.name, en: en.name },
      description: { ru: ru.description, en: en.description },
      whyThisProfile: null,
      strengths: { ru: ru.strengths, en: en.strengths },
      vulnerabilities: { ru: ru.vulnerabilities, en: en.vulnerabilities },
      recommendations: { ru: ru.recommendations, en: en.recommendations },
      tryToday: null,
      inspiringConclusion: null,
    };
  }
  return out;
}

/** Localized factor labels, kept in a loose map in the source. */
function factorNamesFrom(blocks, factorIds) {
  const key = Object.keys(blocks ?? {}).find((k) => /factorname/i.test(k));
  const raw = key ? blocks[key] : {};
  const out = {};
  for (const id of factorIds) {
    const found = loc(raw?.[id]);
    if (found) out[id] = found;
  }
  return out;
}

function convertProfiles(profiles) {
  const out = {};
  for (const p of profiles) {
    if (!p.id) continue;
    out[p.id] = {
      id: p.id,
      icon: p.icon ?? null,
      name: loc(p.name) ?? { ru: p.id, en: p.id },
      description: loc(p.description) ?? { ru: "", en: "" },
      whyThisProfile: loc(p.whyThisProfile),
      strengths: locList(p.strengths),
      vulnerabilities: locList(p.vulnerabilities),
      recommendations: locList(p.recommendations),
      tryToday: loc(p.tryToday),
      inspiringConclusion: loc(p.inspiringConclusion),
    };
  }
  return out;
}

/** Standard tests: TestModel questions map across one-to-one. */
function fromStandard(testId) {
  const test = load(path.join(OUT, "tests", `${testId}.json`));
  const selection = RULES[testId];
  const bipolar = selection?.mode === "bipolar";

  return {
    id: testId,
    title: loc(test.title),
    description: loc(test.description),
    categoryId: test.categoryId ?? "personality",
    estimatedMinutes: test.estimatedTime ?? 10,
    scoring: bipolar ? "bipolar" : "likert",
    factorIds: test.factorIds ?? [],
    factorNames: bipolar
      ? POLE_NAMES
      : factorNamesFrom(test.contentBlocks, test.factorIds ?? []),
    questions: test.questions.map((q) => ({
      id: q.id,
      text: loc(q.text),
      factorId: q.factorId ?? null,
      isReversed: !!q.isReversed,
      answers: q.answers.map((a) => ({ id: a.id, text: loc(a.text), score: a.score })),
    })),
    weights: weightsByQuestion(testId),
    profiles: bipolar
      ? profilesFromTypeDescriptions(
          test.contentBlocks?.[Object.keys(test.contentBlocks ?? {}).find((k) => /typedescription/i.test(k)) ?? ""],
        )
      : convertProfiles(test.profiles ?? []),
    profileSelection: selection,
  };
}

/**
 * Scenario tests keep situation and backstory alongside the prompt, and every
 * option stands for a communication style — the answer carries the factor.
 */
function fromScenario(testId) {
  const custom = load(path.join(OUT, "custom", `${testId}.json`));
  const questionsKey = Object.keys(custom.data).find((k) => Array.isArray(custom.data[k]));
  const profilesKey = Object.keys(custom.data).find((k) => !Array.isArray(custom.data[k]));
  const raw = custom.data[questionsKey] ?? [];
  const order = FACTOR_ORDER[testId];

  const questions = raw.map((node, index) => {
    const scenario = node.named?.scenario?.named ?? {};
    const options = node.named?.options ?? [];
    return {
      id: String(scenario.id ?? index + 1),
      text: loc(scenario.question) ?? { ru: "", en: "" },
      factorId: null,
      isReversed: false,
      scenario: {
        situation: loc(scenario.situation) ?? { ru: "", en: "" },
        ...(loc(scenario.context) ? { context: loc(scenario.context) } : {}),
      },
      answers: options.map((opt, optIndex) => ({
        id: opt.named?.id ?? `${index + 1}${String.fromCharCode(97 + optIndex)}`,
        text: loc(opt.named?.text) ?? { ru: "", en: "" },
        // Position in the option list is the style — same order for every card.
        score: optIndex,
      })),
    };
  });

  const profileNodes = Object.values(custom.data[profilesKey] ?? {}).map((p) => ({
    id: p.named?.id,
    icon: p.named?.icon ?? null,
    name: p.named?.name,
    description: p.named?.description,
    whyThisProfile: p.named?.whyThisProfile,
    strengths: p.named?.strengths,
    vulnerabilities: p.named?.vulnerabilities,
    recommendations: p.named?.recommendations,
    tryToday: p.named?.tryToday,
    inspiringConclusion: p.named?.inspiringConclusion,
  }));

  return {
    id: testId,
    title: { ru: "Конфликты в переписке", en: "Texting Conflicts" },
    description: {
      ru: "20 реальных ситуаций из переписок — и то, как ты на них отвечаешь",
      en: "20 real texting situations — and how you answer them",
    },
    categoryId: "relationships",
    estimatedMinutes: 7,
    scoring: "answer_factor",
    factorIds: order,
    factorNames: SCENARIO_FACTOR_NAMES[testId] ?? {},
    factorOrder: order,
    questions,
    weights: {},
    factorWeights: weightsByFactor(testId),
    profiles: convertProfiles(profileNodes),
    profileSelection: RULES[testId],
  };
}

// ─────────────────────────────────────────────────────────── build

fs.mkdirSync(DEST, { recursive: true });
const report = [];

for (const testId of LAUNCH_SET) {
  if (!RULES[testId]) {
    report.push({ testId, error: "нет правил выбора профиля в profile-rules.json" });
    continue;
  }
  const built = fs.existsSync(path.join(OUT, "tests", `${testId}.json`))
    ? fromStandard(testId)
    : fromScenario(testId);

  const problems = [];
  if (!built.questions.length) problems.push("нет вопросов");
  if (!Object.keys(built.profiles).length) problems.push("нет профилей");
  // Bipolar tests report poles, not factors — their factorIds stay unscored.
  if (built.scoring !== "bipolar") {
    const unnamed = built.factorIds.filter((f) => !built.factorNames[f]);
    if (unnamed.length) problems.push(`факторы без названия: ${unnamed.join(", ")}`);
  }
  if (built.scoring === "answer_factor") {
    const missing = built.factorIds.filter((f) => !built.factorWeights?.[f]);
    if (missing.length) problems.push(`нет весов у факторов: ${missing.join(", ")}`);
  } else {
    const unweighted = built.questions.filter((q) => !built.weights[q.id]).length;
    if (unweighted) problems.push(`${unweighted} вопрос(ов) без весов`);
  }

  // Every profile a rule can produce must actually exist.
  if (built.profileSelection.mode === "rules") {
    const produced = new Set([built.profileSelection.fallback]);
    for (const rule of built.profileSelection.rules) {
      if (typeof rule.profile === "string") produced.add(rule.profile);
      else Object.values(rule.profile.byTop ?? rule.profile.combo ?? {}).forEach((p) => produced.add(p));
    }
    const missing = [...produced].filter((p) => !(p in built.profiles));
    if (missing.length) problems.push(`правила ссылаются на несуществующие профили: ${missing.join(", ")}`);
    const unreachable = Object.keys(built.profiles).filter((p) => !produced.has(p));
    if (unreachable.length) problems.push(`недостижимые профили: ${unreachable.join(", ")}`);
  }

  fs.writeFileSync(path.join(DEST, `${testId}.json`), JSON.stringify(built, null, 2), "utf8");
  report.push({
    testId,
    questions: built.questions.length,
    profiles: Object.keys(built.profiles).length,
    scoring: built.scoring,
    problems,
  });
}

// Catalogue for the list screen: a few hundred bytes, so it can be imported
// eagerly while the tests themselves stay behind dynamic imports.
const index = report
  .filter((r) => !r.error)
  .map((r) => {
    const test = load(path.join(DEST, `${r.testId}.json`));
    return {
      id: test.id,
      title: test.title,
      description: test.description,
      categoryId: test.categoryId,
      estimatedMinutes: test.estimatedMinutes,
      questionCount: test.questions.length,
    };
  });
fs.writeFileSync(path.join(DEST, "index.json"), JSON.stringify(index, null, 2), "utf8");

console.log(`→ ${path.relative(process.cwd(), DEST)}`);
for (const r of report) {
  if (r.error) {
    console.log(`  ${r.testId.padEnd(30)} ОШИБКА: ${r.error}`);
    continue;
  }
  const tail = r.problems.length ? `  ⚠ ${r.problems.join("; ")}` : "";
  console.log(`  ${r.testId.padEnd(30)} ${String(r.questions).padStart(3)} q · ${String(r.profiles).padStart(2)} проф · ${r.scoring}${tail}`);
}
