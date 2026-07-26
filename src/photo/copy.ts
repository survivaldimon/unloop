/**
 * All photo-funnel copy in one place (EN-only for the MVP launch; the photo
 * product targets the EN market and RU would need a native rewrite, not a
 * translation — founder's standing rule). Voice decision 26.07: the analysis
 * itself is written in third person ("the person in this photo", "they").
 */

export const PHOTO_COPY = {
  title: "Looplore — What does your photo say in 3 seconds?",
  folioTag: "PHOTO READ",

  landing: {
    h1a: "A photo talks.",
    h1b: "Hear what it says.",
    body: "Upload up to six photos and get the outside view: what pose, style and framing tell a stranger in the first 3 seconds — including the one thing nobody notices about their own photos.",
    bullets: [
      "A stranger's first read — spelled out, detail by detail",
      "Built only on what actually shows: pose, styling, setting, framing",
      "The Tell: the one signal the photo sends without anyone knowing",
    ],
    uploadIdle: "Add a photo",
    uploadSub: "A clear photo of a person. JPG or PNG.",
    uploadBusy: "Preparing the photo…",
    addMore: "Add another photo",
    addMoreSub: (left: number) => `optional — up to ${left} more`,
    mainTag: "main",
    cta: (count: number) => (count > 1 ? `Read these ${count} photos` : "Read this photo"),
    // TODO: restore the "deleted within 24 hours" promise once the storage
    // TTL cleanup ships — never advertise a guarantee the backend doesn't keep.
    note: "18+ · Photos stay private · Never used to train AI",
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
          { value: "other", label: "Someone else" },
        ],
      },
      {
        id: "age_range",
        title: "Age range of the person in the photo?",
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
    thirdParty: {
      title: "One confirmation first",
      body: "This photo shows someone else. By continuing you confirm you have their permission to run this read, and you take responsibility for the upload. The read describes how the photo comes across — impressions, not facts about them.",
      confirm: "I confirm — continue",
      back: "Go back",
    },
    consent: "By continuing you confirm you're 18+ and have the right to use this photo.",
  },

  scanning: {
    steps: [
      "Reading pose and posture…",
      "Decoding style and grooming signals…",
      "Weighing the setting and framing…",
      "Running the 3-second first-impression pass…",
      "Writing the read…",
    ],
    slowNote: "A careful read takes a few extra seconds.",
  },

  rejects: {
    no_person: "We couldn't find a person in the main photo. Try one where they're clearly visible.",
    minor: "One of these photos looks like it may show someone under 18. We only read photos of adults.",
    nsfw: "One of these photos is a bit much for us. Try ones with more clothes on.",
    declined: "The read didn't come through for this photo. Try a different one.",
    failed: "Something broke on our side. Give it another try in a moment.",
  },

  teaser: {
    kicker: "the outside view",
    title: "This photo said more than it planned.",
    photosNote: (count: number) => `${count} photos in this reading — the teaser reads the main one.`,
    lockedTag: "sealed",
    lockedTitle: "The Tell",
    tocTitle: "In the full read",
    toc: [
      { n: "I", title: "First impression", hook: "the 3-second verdict", sealed: false },
      { n: "II", title: "The 10-second story", hook: "how the read unfolds as they keep looking", sealed: false },
      { n: "III", title: "Pose & presence", hook: "what the body language broadcasts", sealed: true },
      { n: "IV", title: "Style signals", hook: "what the choices say about status and effort", sealed: true },
      { n: "V", title: "Setting & framing", hook: "what the background gives away", sealed: true },
      { n: "VI", title: "Signal breakdown", hook: "pose · style · setting · framing, measured", sealed: true },
      { n: "VII", title: "What strangers would guess", hook: "job, lifestyle, vibe — the assumptions", sealed: true },
      { n: "VIII", title: "The Tell", hook: "the detail they don't know they're showing", sealed: true },
      { n: "IX", title: "Context read", hook: "how it lands where the photo actually lives", sealed: true },
      { n: "X", title: "Flags & the one change", hook: "what pulls people in, and the single fix", sealed: true },
    ],
    tocSetRow: { n: "XI", title: "Set verdict", hook: "which photo leads, which to drop", sealed: true },
    scalesNote: "Plus the perception radar — six dials: confidence · approachability · intentionality · warmth · status · authenticity.",
    offerHolds: "price holds for",
    unlock: "Unlock the full read",
    confirming: "Confirming your payment…",
    payError: "Payment didn't go through. Try again.",
    payNote: (provider: string) => `Secure checkout by ${provider} · instant unlock after payment`,
    testNote: "Test build — the full read unlocks without charge.",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about anyone.",
  },

  report: {
    header: "The read",
    sections: {
      first_impression: "First impression",
      ten_second_story: "The 10-second story",
      pose_presence: "Pose & presence",
      style_signals: "Style signals",
      setting_framing: "Setting & framing",
      signal_breakdown: "Signal breakdown",
      guesses: "What strangers would guess",
      the_tell: "The Tell",
      context_read: {
        dating: "Dating read",
        social: "Social read",
        professional: "Professional read",
        curious: "Stranger read",
      } as Record<string, string>,
      flags: "Green flag · Red flag",
      one_change: "The one change",
      set_verdict: "Set verdict",
    },
    guessLabels: {
      occupation: "occupation guess",
      lifestyle: "lifestyle guess",
      vibe: "vibe guess",
    },
    guessNote: "Strangers' assumptions — not facts.",
    timeMarks: { half_second: "0.5s", three_seconds: "3s", ten_seconds: "10s" },
    signalLabels: { pose: "Pose", style: "Style", setting: "Setting", framing: "Framing" },
    scalesTitle: "Perception radar",
    scales: {
      confidence: "Confidence",
      approachability: "Approachability",
      intentionality: "Intentionality",
      warmth: "Warmth",
      status_signal: "Status",
      authenticity: "Authenticity",
    },
    scalesNote: "How the photo reads — not who anyone is.",
    leadTag: "lead",
    dropTag: "drop",
    writing: "Writing the read…",
    reportError: "The full read didn't come through. Try again in a moment.",
    retake: "Read another photo",
    disclaimer:
      "The Outside View is an entertainment self-reflection product. It describes how a photo may read to strangers — impressions, not facts about anyone.",
  },

  email: {
    title: "Where should we send the read?",
    body: "The teaser is ready now; the link lets you reopen this reading on any device. No newsletters, no spam — one email with the result.",
  },
} as const;
