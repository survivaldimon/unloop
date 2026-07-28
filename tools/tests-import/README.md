# tests-import

One-way extractor for the `tests_app` Flutter project (the psychological-test
library built with the partner) into portable JSON, plus the build and
verification tooling around it. This is the pipeline behind the `/tests`
surface: it produces the canonical content in `src/content/tests/` (via
`npm run tests:build`) and the golden fixtures in `fixtures/` that
`npm run tests:verify` checks the scoring engine against.

## Run

```bash
node tools/tests-import/extract.mjs --src /path/to/tests_app
```

Then, to normalise the psychological scales the weights point at (Э2):

```bash
node tools/tests-import/apply-scale-map.mjs
```

To eyeball a test without loading its whole JSON:

```bash
node tools/tests-import/digest.mjs --table
node tools/tests-import/digest.mjs attachment_styles_v1
```

`--out` overrides the output directory (default `tools/tests-import/out`, which
is git-ignored — the raw extraction is bulky and fully regenerable, so only the
distilled artifacts are committed: `src/content/tests/` and `fixtures/`).

## Golden fixtures

`fixtures/<test_id>.json` is committed: deterministic answer patterns and the
factor percentages / scale scores the reference implementation produced for
them — ids and numbers only, no test content. `npm run tests:verify` compares
the TypeScript engine (`src/tests/engine.ts`) against them using only the
committed content in `src/content/tests/`, so it runs from a bare checkout (and
in CI) without the `tests_app` clone.

Regenerate the fixtures only when the reference scoring itself changes — a new
test enters the launch set, weights or the scale map change, or a scoring rule
is fixed:

```bash
git clone https://github.com/nekitaasiankungfu/tests_app.git /tmp/tests_app
node tools/tests-import/extract.mjs --src /tmp/tests_app
node tools/tests-import/apply-scale-map.mjs
node tools/tests-import/reference-scoring.mjs   # rewrites fixtures/
npm run tests:verify
```

Engine-only changes never touch `fixtures/`: the point of the golden copy is
that the engine has to reproduce it, not the other way round.

## Why a parser

Every question, answer scale and result profile in `tests_app` lives inside Dart
source under `lib/data/`, with the cross-test scale weights under
`lib/config/summary/question_weights/`. There is no export path, so
`dart-lite.mjs` reads the data subset of Dart directly: literals, collections,
constructor calls, static members (including ones that take arguments), and
file-level declarations. Anything it cannot resolve becomes a symbolic node and
is reported in the audit rather than silently turning into `null`.

## Output

```
out/
  tests/<test_id>.json       one file per standard test: questions, answers, factors, profiles
  weights/<test_id>.json     question → psychological scale weights, exactly as in the source
  weights-normalized/…       the same after scale-map.json is applied — use these for the port
  custom/<test_id>.json      tests with a bespoke data shape (colour, forced choice, scenarios, visual)
  scales.json                the hierarchical scale registry + bipolar poles
  scales-normalized.json     the registry with the scales added by scale-map.json
  stubs.json                 test catalogue metadata
  audit.json                 machine-readable audit
  AUDIT.md                   the extraction report
  SCALE_MAP.md               the normalisation report
```

## Overrides (Э8)

`src/content/tests/*.json` is generated, so copy edited there is lost on the next
build. Rewritten text goes in `overrides/<test_id>.json` and is merged in by
`apply-overrides.mjs` during `npm run tests:build`. The file is sparse — only the
strings that differ from the import — and the build fails rather than writing if
an override names a profile, question or answer that does not exist, or tries to
reach a scoring field. See `docs/tests-integration.md` (Э8) for the full contract.

`scale-map.json` is hand-authored and reviewed — see `docs/tests-integration.md` (Э2) for the rules
it follows, in particular that weight signs are meaningful and that colliding synonyms take the
stronger contribution rather than the sum.

## What the audit checks

- extracted question count vs the count the test stub declares
- duplicate question ids, questions with fewer than two answers, non-numeric scores
- questions referencing factors the test never declares
- `ru`/`en` completeness of every localised string, plus unresolved `${…}` interpolation
- result profiles: presence and completeness of all seven sections in both languages
- weights: coverage of the test's questions, weight keys pointing at unknown
  questions, duplicate keys, negative weights on bipolar poles, and — the big one —
  scales that no entry in `hierarchical_scales.dart` defines
- registry membership: stubs that exist but were never registered in `TestRegistry`
