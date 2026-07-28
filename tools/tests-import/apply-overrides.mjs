/**
 * Э8 — the copy-override layer.
 *
 * `src/content/tests/*.json` is generated, so any text edited there is lost on
 * the next `npm run tests:build`. Rewritten copy lives in `overrides/<test_id>.json`
 * instead and is merged in at build time, after the source has been converted.
 *
 * An override file is sparse: it carries only the strings that differ from the
 * import, keyed the same way the canonical test is. Everything absent is left
 * exactly as the source produced it.
 *
 * Two rules the validator enforces, both of them about not losing work quietly:
 *
 *  1. **Every key must resolve.** A profile, question or answer id that does not
 *     exist in the built test fails the build. A rewritten profile that silently
 *     lands nowhere because a test id was renamed is the one failure mode this
 *     layer must not have.
 *  2. **Copy only.** `score`, `factorId`, `isReversed` and the weight maps are
 *     unreachable from here. Question wording can be sharpened; what a question
 *     measures cannot be changed by an editor working on voice.
 */

import fs from "node:fs";
import path from "node:path";

const OVERRIDES = path.join(import.meta.dirname, "overrides");

/** Sections of a result profile an override may replace. */
const PROFILE_TEXT = new Set(["name", "description", "whyThisProfile", "tryToday", "inspiringConclusion", "supportNote"]);
const PROFILE_LIST = new Set(["strengths", "vulnerabilities", "recommendations"]);
const TEST_TEXT = new Set(["title", "description"]);

const isLocalized = (v) =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  typeof v.ru === "string" && typeof v.en === "string" && v.ru.trim() !== "" && v.en.trim() !== "";

const isLocalizedList = (v) =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  [v.ru, v.en].every((l) => Array.isArray(l) && l.length > 0 && l.every((s) => typeof s === "string" && s.trim() !== ""));

/**
 * Merge `overrides/<testId>.json` into a freshly built test, in place.
 * Returns { applied, errors } — `applied` counts replaced strings, so the build
 * log can show that an override file actually reached the content.
 */
export function applyOverrides(test) {
  const file = path.join(OVERRIDES, `${test.id}.json`);
  if (!fs.existsSync(file)) return { applied: 0, errors: [] };

  let override;
  try {
    override = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { applied: 0, errors: [`overrides/${test.id}.json: не парсится — ${e.message}`] };
  }

  const errors = [];
  let applied = 0;
  const at = (where) => `overrides/${test.id}.json → ${where}`;

  for (const [key, value] of Object.entries(override)) {
    if (key === "$comment") continue;

    if (TEST_TEXT.has(key)) {
      if (!isLocalized(value)) errors.push(`${at(key)}: нужен {ru, en} с непустыми строками`);
      else (test[key] = value), applied++;
      continue;
    }

    if (key === "factorNames") {
      for (const [factorId, label] of Object.entries(value)) {
        if (!test.factorNames[factorId]) errors.push(`${at(`factorNames.${factorId}`)}: такого фактора в тесте нет`);
        else if (!isLocalized(label)) errors.push(`${at(`factorNames.${factorId}`)}: нужен {ru, en}`);
        else (test.factorNames[factorId] = label), applied++;
      }
      continue;
    }

    if (key === "profiles") {
      for (const [profileId, patch] of Object.entries(value)) {
        const profile = test.profiles[profileId];
        if (!profile) {
          errors.push(`${at(`profiles.${profileId}`)}: такого профиля в тесте нет`);
          continue;
        }
        for (const [field, replacement] of Object.entries(patch)) {
          if (field === "icon") {
            if (replacement !== null && typeof replacement !== "string") errors.push(`${at(`profiles.${profileId}.icon`)}: строка или null`);
            else (profile.icon = replacement), applied++;
          } else if (PROFILE_TEXT.has(field)) {
            if (!isLocalized(replacement)) errors.push(`${at(`profiles.${profileId}.${field}`)}: нужен {ru, en} с непустыми строками`);
            else (profile[field] = replacement), applied++;
          } else if (PROFILE_LIST.has(field)) {
            if (!isLocalizedList(replacement)) errors.push(`${at(`profiles.${profileId}.${field}`)}: нужен {ru: [...], en: [...]} с непустыми строками`);
            else (profile[field] = replacement), applied++;
          } else {
            errors.push(`${at(`profiles.${profileId}.${field}`)}: поле нельзя переопределять`);
          }
        }
      }
      continue;
    }

    if (key === "questions") {
      const byId = new Map(test.questions.map((q) => [q.id, q]));
      for (const [questionId, patch] of Object.entries(value)) {
        const question = byId.get(questionId);
        if (!question) {
          errors.push(`${at(`questions.${questionId}`)}: такого вопроса в тесте нет`);
          continue;
        }
        for (const [field, replacement] of Object.entries(patch)) {
          if (field === "text") {
            if (!isLocalized(replacement)) errors.push(`${at(`questions.${questionId}.text`)}: нужен {ru, en}`);
            else (question.text = replacement), applied++;
          } else if (field === "scenario") {
            for (const [part, localized] of Object.entries(replacement)) {
              if (part !== "situation" && part !== "context") errors.push(`${at(`questions.${questionId}.scenario.${part}`)}: только situation и context`);
              else if (!isLocalized(localized)) errors.push(`${at(`questions.${questionId}.scenario.${part}`)}: нужен {ru, en}`);
              else (question.scenario = { ...question.scenario, [part]: localized }), applied++;
            }
          } else if (field === "answers") {
            for (const [answerId, answerPatch] of Object.entries(replacement)) {
              const answer = question.answers.find((a) => a.id === answerId);
              if (!answer) {
                errors.push(`${at(`questions.${questionId}.answers.${answerId}`)}: такого варианта нет`);
                continue;
              }
              const fields = Object.keys(answerPatch);
              const forbidden = fields.filter((f) => f !== "text");
              // `score` is the factor index or the Likert points — voice work must not reach it.
              if (forbidden.length) errors.push(`${at(`questions.${questionId}.answers.${answerId}`)}: нельзя менять ${forbidden.join(", ")} — это скоринг`);
              if (fields.includes("text")) {
                if (!isLocalized(answerPatch.text)) errors.push(`${at(`questions.${questionId}.answers.${answerId}.text`)}: нужен {ru, en}`);
                else (answer.text = answerPatch.text), applied++;
              }
            }
          } else {
            errors.push(`${at(`questions.${questionId}.${field}`)}: правится только текст (text, scenario, answers.*.text)`);
          }
        }
      }
      continue;
    }

    errors.push(`${at(key)}: неизвестный раздел`);
  }

  return { applied, errors };
}

/** Override files that match no test in the launch set — almost always a typo in the filename. */
export function orphanOverrides(builtIds) {
  if (!fs.existsSync(OVERRIDES)) return [];
  return fs
    .readdirSync(OVERRIDES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => !builtIds.includes(id));
}
