/**
 * All photo-funnel copy in one place (EN-only for the MVP launch; the photo
 * product targets the EN market and RU would need a native rewrite, not a
 * translation — founder's standing rule).
 */

export const PHOTO_COPY = {
  title: "Looplore — What does your photo say in 3 seconds?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "Your photo talks.",
    h1b: "Hear what it says.",
    body: "One photo in — the outside view out: what your pose, your style and your framing tell a stranger in the first 3 seconds. Including the one thing you don't see.",
    bullets: [
      "A stranger's first read of you — spelled out, detail by detail",
      "Built only on what actually shows: pose, styling, setting, framing",
      "The Tell: the one signal you're sending without knowing it",
    ],
    uploadIdle: "Add your photo",
    uploadSub: "One clear photo of you. JPG or PNG.",
    uploadBusy: "Preparing your photo…",
    retake: "Choose another",
    cta: "Read my photo",
    note: "18+ · Your photo is deleted within 24 hours · Never used to train AI",
  },

  context: {
    kicker: "Before the read — three quick things",
    questions: [
      {
        id: "subject",
        title: "Who's in the photo?",
        options: [
          { value: "me", label: "Just me" },
          { value: "us", label: "Me with someone close" },
        ],
      },
      {
        id: "age_range",
        title: "Your age range?",
        options: [
          { value: "18-24", label: "18–24" },
          { value: "25-34", label: "25–34" },
          { value: "35-44", label: "35–44" },
          { value: "45+", label: "45+" },
        ],
      },
      {
        id: "use_case",
        title: "Where does this photo live?",
        options: [
          { value: "dating", label: "Dating apps" },
          { value: "social", label: "Social media" },
          { value: "professional", label: "Work profiles" },
          { value: "curious", label: "Nowhere yet — just curious" },
        ],
      },
    ],
    consent: "By continuing you confirm you're 18+ and this is your photo.",
  },

  scanning: {
    steps: [
      "Reading pose and posture…",
      "Decoding style and grooming signals…",
      "Weighing the setting and framing…",
      "Running the 3-second first-impression pass…",
      "Writing your read…",
    ],
    slowNote: "A careful read takes a few extra seconds.",
  },

  rejects: {
    no_person: "We couldn't find a person in that photo. Try one where you're clearly visible.",
    minor: "This photo looks like it may show someone under 18. We only read photos of adults.",
    nsfw: "That photo is a bit much for us. Try one with more clothes on.",
    declined: "The read didn't come through for this photo. Try a different one.",
    failed: "Something broke on our side. Give it another try in a moment.",
  },

  teaser: {
    kicker: "the outside view",
    title: "Your photo said more than you planned.",
    lockedTag: "sealed",
    lockedTitle: "The Tell",
    tocTitle: "In the full read",
    toc: [
      { n: "I", title: "First impression", hook: "the 3-second verdict", sealed: false },
      { n: "II", title: "Pose & presence", hook: "what your body language broadcasts", sealed: false },
      { n: "III", title: "Style signals", hook: "what your choices say about status and effort", sealed: true },
      { n: "IV", title: "The Tell", hook: "the detail you don't know you're showing", sealed: true },
      { n: "V", title: "Context read", hook: "how this lands where you actually use it", sealed: true },
      { n: "VI", title: "Green flag · Red flag", hook: "what pulls people in, what makes them pause", sealed: true },
      { n: "VII", title: "The one change", hook: "the single move that shifts the whole read", sealed: true },
    ],
    scalesNote: "Plus your perception dials: confidence · approachability · intentionality.",
    offerHolds: "price holds for",
    unlock: "Unlock my full read",
    confirming: "Confirming your payment…",
    payError: "Payment didn't go through. Try again.",
    testNote: "Test build — the full read unlocks without charge.",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about you.",
  },

  report: {
    header: "Your read",
    sections: {
      first_impression: "First impression",
      pose_presence: "Pose & presence",
      style_signals: "Style signals",
      the_tell: "The Tell",
      context_read: {
        dating: "Dating read",
        social: "Social read",
        professional: "Professional read",
        curious: "Stranger read",
      } as Record<string, string>,
      flags: "Green flag · Red flag",
      one_change: "The one change",
    },
    scalesTitle: "Perception dials",
    scales: {
      confidence: "Confidence",
      approachability: "Approachability",
      intentionality: "Intentionality",
    },
    scalesNote: "How the photo reads — not who you are.",
    writing: "Writing your read…",
    reportError: "The full read didn't come through. Try again in a moment.",
    retake: "Read another photo",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about you.",
  },

  email: {
    title: "Where should we send your read?",
    body: "Your teaser is ready now; the link lets you reopen it on any device. No newsletters, no spam — one email with your result.",
  },
} as const;
