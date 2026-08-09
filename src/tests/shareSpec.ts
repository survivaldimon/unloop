/**
 * Turns a finished test into a share card spec.
 *
 * Two decisions live here and nowhere else:
 *
 *  * **Which instrument a test gets.** Bars where the numbers are already free
 *    (`showsFreeBreakdown`), the four-letter code for the bipolar test, an
 *    engraved monogram seal for everything whose breakdown is part of the paid
 *    read. The card is therefore incapable of leaking a paid figure: it asks the
 *    same function the result screen asks.
 *  * **What the card says about the person.** Nothing we wrote for it — the
 *    profile's own `name` and `description`, which are free-tier copy already
 *    approved in both languages and already phrased as behaviour rather than a
 *    verdict ("You don't answer. Not because there's nothing to say…"). Level
 *    tests never get a band number or a rank on the card; the named profile is
 *    the whole result that travels.
 */

import type { Lang } from "../i18n";
import type { Accent } from "../lib/cardKit";
import type { CardSpec } from "../lib/resultCard";
import { buildBreakdown } from "./breakdown";
import { testsCopy } from "./copy";
import { showsFreeBreakdown } from "./freeTier";
import type { PsychTest, TestOutcome } from "./types";

const PALETTE = {
  ember: { base: "#cd6b4e", bright: "#e08a6a" },
  clay: { base: "#b8845c", bright: "#d2a077" },
  brass: { base: "#c89a4e", bright: "#e0b869" },
  rose: { base: "#a86478", bright: "#c98a9c" },
  violet: { base: "#9d84b8", bright: "#bba4d4" },
  steel: { base: "#7d99b8", bright: "#9db8d4" },
  slate: { base: "#8f9aa3", bright: "#aeb9c2" },
  teal: { base: "#6fa08e", bright: "#8fbfa9" },
  sage: { base: "#a3b18a", bright: "#bfcaa4" },
  moss: { base: "#86a06f", bright: "#a4bb8d" },
} satisfies Record<string, Accent>;

/**
 * One accent per test, hand-assigned rather than derived from the category:
 * a card is seen alone, so the colour's job is to make *this* test's card
 * recognizable, not to encode the shelf's taxonomy.
 */
const TEST_ACCENT: Record<string, Accent> = {
  text_conflict_communication: PALETTE.steel,
  attachment_styles_v1: PALETTE.rose,
  friendship_red_flags_v1: PALETTE.ember,
  love_languages_v1: PALETTE.clay,
  toxic_patterns: PALETTE.ember,
  ipip_big_five: PALETTE.brass,
  sixteen_types: PALETTE.violet,
  friendship_psychology_v1: PALETTE.moss,
  values_priorities_v1: PALETTE.sage,
  imposter_syndrome: PALETTE.violet,
  social_battery_v1: PALETTE.teal,
  boundaries_people_pleasing: PALETTE.sage,
  fomo_social_comparison_v1: PALETTE.steel,
  burnout_diagnostic_v1: PALETTE.clay,
  digital_detox_test: PALETTE.slate,
  romantic_potential_v1: PALETTE.rose,
  relationship_compatibility_v1: PALETTE.teal,
  emotional_intelligence: PALETTE.moss,
  self_confidence_multiscale_v1: PALETTE.brass,
};

export const accentFor = (testId: string): Accent => TEST_ACCENT[testId] ?? PALETTE.brass;

/** Five bars is the most the card can hold before the labels start shrinking. */
const MAX_BARS = 5;

/**
 * Tests whose profile copy speaks in symptoms and states rather than behaviour
 * — "the lead symptom is attachment to the device itself", "no phone means
 * anxiety", "love often looks like struggle or dependency".
 *
 * That copy is right where it lives: on the result screen, under a support note
 * and a disclaimer, read by the person it is about. It is wrong on an image that
 * travels into a feed alone, where the same sentence reads as an assertion about
 * whoever is holding it — the personal-attributes line in
 * marketing/creative-brief.md §5, and the one thing a share card must not do.
 *
 * These cards carry a line about the *test* instead. The named profile still
 * travels — "Пустой бак" is a metaphor the sharer chose to post about
 * themselves — but the diagnosis-shaped sentence stays on the result screen.
 * The copy is here rather than in copy.ts because it exists only to satisfy
 * this rule and has to be read next to it.
 *
 * `npm run tests:share-lint` fails if a test outside this table starts carrying
 * that vocabulary, or if a line in it does.
 */
const CARD_LINE_FROM_TEST: Record<string, { ru: string; en: string }> = {
  burnout_diagnostic_v1: {
    ru: "54 вопроса о том, сколько тебя остаётся после работы. 12 профилей — от «ресурс на месте» до «на пределе».",
    en: '54 questions about how much of you is left after work. 12 profiles — from "fuel in the tank" to "at the limit".',
  },
  digital_detox_test: {
    ru: "50 вопросов о том, кто у кого в руках — ты у телефона или он у тебя. Внимание, сон, живые люди против экрана.",
    en: "50 questions about who's holding whom — you the phone, or the phone you. Attention, sleep, real people versus the screen.",
  },
  romantic_potential_v1: {
    ru: "36 вопросов о том, по какой истории ты любишь: что считаешь нормой в близости и каких сюжетов ждёшь от любви.",
    en: "36 questions about the story you love by: what you treat as normal in closeness, and which plots you expect from love.",
  },
};

export function buildTestCardSpec(
  test: PsychTest,
  outcome: TestOutcome,
  lang: Lang,
): CardSpec | null {
  const profile = outcome.profileId ? test.profiles[outcome.profileId] : undefined;
  // No profile means no named identity, and a card with only a test title on it
  // is an ad, not a result — the plain-text share still works in that case.
  if (!profile) return null;

  const ui = testsCopy(lang).share;
  const accent = accentFor(test.id);

  return {
    lang,
    overline: test.title[lang],
    name: profile.name[lang],
    code: outcome.typeCode ?? null,
    line: CARD_LINE_FROM_TEST[test.id]?.[lang] ?? profile.description[lang],
    accent,
    instrument: instrumentFor(test, outcome, lang),
    cta: ui.cardCta,
    storyCta: ui.storyCta,
  };
}

function instrumentFor(test: PsychTest, outcome: TestOutcome, lang: Lang): CardSpec["instrument"] {
  if (test.profileSelection.mode === "bipolar" && outcome.typeCode) {
    // The code is free and the balances behind it are not (freeTier.ts), so the
    // plates carry the letters and the name of the pole each letter stands for
    // — a legend, not this person's numbers.
    const letters = [...outcome.typeCode];
    const captions = test.profileSelection.dimensions.map((dim, i) => {
      const side = dim.letters[0] === letters[i] ? 0 : 1;
      return test.factorNames[dim.poles[side]]?.[lang] ?? dim.letters[side];
    });
    return { kind: "code", letters, captions };
  }

  if (showsFreeBreakdown(test.id)) {
    const rows = buildBreakdown(test, outcome, lang)
      .slice(0, MAX_BARS)
      .map((row) => ({ label: row.label, value: row.value }));
    if (rows.length > 0) return { kind: "bars", rows };
  }

  return { kind: "seal", monogram: monogramOf(test.profiles[outcome.profileId!].name[lang]) };
}

/**
 * The seal's letter: the first letter of the profile name, skipping a leading
 * article so "The Arsenal" reads A and not T. Cyrillic has no articles, so the
 * RU card takes the first letter as written.
 */
function monogramOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const head = words.length > 1 && /^(the|a|an)$/i.test(words[0]) ? words[1] : words[0];
  return [...(head ?? name)][0]?.toUpperCase() ?? "L";
}

/**
 * The link that travels with a share.
 *
 * It invites taking the test, never viewing this result, and never carries the
 * session UUID: owning that UUID grants write access to the row. The path form
 * resolves to the per-test OG page, so an unfurl names the test.
 *
 * `ref` is the seam for G2 ("invite a friend to compare") — a referral code
 * appended here reaches the catalogue with the campaign tags already in place.
 */
export function buildTestShareUrl(testId: string, opts?: { ref?: string | null }): string {
  const params = new URLSearchParams({
    utm_source: "share",
    utm_medium: "test_result",
    utm_campaign: testId,
  });
  if (opts?.ref) params.set("ref", opts.ref);
  return `https://looplore.app/tests/${testId}/?${params.toString()}`;
}
