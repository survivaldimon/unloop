import type { QuizQuestion } from "../types";

/**
 * 32 screens: 4 context + 28 scored.
 * Scored options map to scales; "secure" options carry no weights on purpose —
 * consistently secure answers resolve to the Anchor pattern via low ANX/AVO.
 */
export const QUESTIONS: QuizQuestion[] = [
  // ───────────────────────── Block 1 · About you (context)
  {
    id: "q1",
    block: 1,
    context: true,
    prompt: "First — how old are you?",
    options: [
      { id: "a", text: "18–24", weights: {} },
      { id: "b", text: "25–34", weights: {} },
      { id: "c", text: "35–44", weights: {} },
      { id: "d", text: "45+", weights: {} },
    ],
  },
  {
    id: "q2",
    block: 1,
    context: true,
    prompt: "Where are you right now, relationship-wise?",
    options: [
      { id: "a", text: "In a relationship", weights: {} },
      { id: "b", text: "In a situationship — it's… undefined", weights: {} },
      { id: "c", text: "It recently ended", weights: {} },
      { id: "d", text: "Single", weights: {} },
    ],
  },
  {
    id: "q3",
    block: 1,
    context: true,
    prompt: "What made you take this test?",
    options: [
      { id: "a", text: "My relationships keep ending the same way", weights: {} },
      { id: "b", text: "Someone keeps pulling away and I want to know why", weights: {} },
      { id: "c", text: "I want to understand myself before the next one", weights: {} },
      { id: "d", text: "Honestly? Just curious", weights: {} },
    ],
  },
  {
    id: "q4",
    block: 1,
    context: true,
    prompt: "How many relationships have actually mattered?",
    options: [
      { id: "a", text: "One big one", weights: {} },
      { id: "b", text: "Two or three", weights: {} },
      { id: "c", text: "More than I'd like to admit", weights: {} },
      { id: "d", text: "Still waiting for the first real one", weights: {} },
    ],
  },

  // ───────────────────────── Block 2 · The beginning
  {
    id: "q5",
    block: 2,
    prompt:
      "New person. Great first date. They haven't texted by the next evening. What's happening in your head?",
    options: [
      {
        id: "a",
        text: "Replaying the date, hunting for the moment I ruined it",
        weights: { ANX: 2, RUMIN: 2 },
      },
      { id: "b", text: "I text first — why play games?", weights: { ANX: 1, PROTEST: 2 } },
      { id: "c", text: "Nothing. If it fades, it fades", weights: { AVO: 2, SUFF: 1 } },
      { id: "d", text: "A flicker of 'hm', then I get on with my evening", weights: {} },
    ],
  },
  {
    id: "q6",
    block: 2,
    prompt: "How fast do you fall?",
    options: [
      { id: "a", text: "Fast. I can build our future by date three", weights: { ANX: 2 } },
      {
        id: "b",
        text: "I hold back on purpose — showing interest feels like losing",
        weights: { AVO: 2 },
      },
      { id: "c", text: "I fall for people who need fixing", weights: { ANX: 1, CARE: 2 } },
      { id: "d", text: "Gradually, as trust builds", weights: {} },
    ],
  },
  {
    id: "q7",
    block: 2,
    prompt: "Someone is really into you — openly, clearly, no games. Your gut reaction:",
    options: [
      { id: "a", text: "Slight suspicion. What's wrong with them?", weights: { AVO: 2, DEACT: 1 } },
      { id: "b", text: "Relief — finally I can stop performing", weights: { ANX: 1 } },
      {
        id: "c",
        text: "I mirror their energy ×2 so they never doubt me",
        weights: { ANX: 1, CARE: 1 },
      },
      { id: "d", text: "It feels good. Simple as that", weights: {} },
    ],
  },
  {
    id: "q8",
    block: 2,
    prompt: "Your texting style at the start of something new:",
    options: [
      { id: "a", text: "I reply instantly and hate that I do", weights: { ANX: 2, PROTEST: 1 } },
      {
        id: "b",
        text: "I draft, edit, delete, send the fourth version",
        weights: { ANX: 1, RUMIN: 2 },
      },
      {
        id: "c",
        text: "I take hours — closeness that fast feels off",
        weights: { AVO: 2, DEACT: 1 },
      },
      { id: "d", text: "I answer when I see it. No math involved", weights: {} },
    ],
  },
  {
    id: "q9",
    block: 2,
    prompt: "The first small red flag appears. You:",
    options: [
      {
        id: "a",
        text: "Explain it away — everyone has an off day",
        weights: { ANX: 1, CARE: 1 },
      },
      {
        id: "b",
        text: "File it as proof I shouldn't get comfortable",
        weights: { AVO: 1, SUFF: 1 },
      },
      {
        id: "c",
        text: "Bring it up as a joke, to see how they react",
        weights: { TEST: 2, ANX: 1 },
      },
      { id: "d", text: "Name it directly, once, and watch what happens", weights: {} },
    ],
  },
  {
    id: "q10",
    block: 2,
    prompt: "Who says “I love you” first?",
    options: [
      { id: "a", text: "Me. Usually too early", weights: { ANX: 2 } },
      { id: "b", text: "Them. I say “thank you” or laugh nervously", weights: { AVO: 2 } },
      {
        id: "c",
        text: "Me — once I've done enough for them that it feels safe",
        weights: { CARE: 2, ANX: 1 },
      },
      { id: "d", text: "Whoever feels it first. It's not a race", weights: {} },
    ],
  },
  {
    id: "q11",
    block: 2,
    prompt: "Three weeks in, they say: “Let's slow down a little.” You hear:",
    options: [
      {
        id: "a",
        text: "“It's over” — and quietly start preparing for the end",
        weights: { ANX: 2, RUMIN: 1 },
      },
      { id: "b", text: "“Finally, some air”", weights: { AVO: 2 } },
      {
        id: "c",
        text: "A challenge — I can win them back to full speed",
        weights: { ANX: 1, PROTEST: 1, CARE: 1 },
      },
      { id: "d", text: "A normal request from a person with a life", weights: {} },
    ],
  },

  // ───────────────────────── Block 3 · The trigger
  {
    id: "q12",
    block: 3,
    quoteKey: "silence_thought",
    prompt: "They read your message 3 hours ago. No reply. The first thing your brain does:",
    options: [
      {
        id: "a",
        text: "Re-reads our chat looking for what I said wrong",
        weights: { ANX: 2, RUMIN: 2 },
        quote: "re-read the chat hunting for your mistake",
      },
      {
        id: "b",
        text: "Checks when they were last online. Twice",
        weights: { ANX: 2, PROTEST: 1 },
        quote: "check their last-seen — twice",
      },
      {
        id: "c",
        text: "Quietly starts closing a door somewhere in me",
        weights: { AVO: 1, DEACT: 2 },
        quote: "start closing the door from your side",
      },
      {
        id: "d",
        text: "Assumes they're busy, because people are busy",
        weights: {},
        quote: "assume they're busy",
      },
    ],
  },
  {
    id: "q13",
    block: 3,
    prompt: "“We need to talk.” The message every phone dreads. You:",
    options: [
      {
        id: "a",
        text: "Spiral through every scenario before they even reply",
        weights: { ANX: 2, RUMIN: 2 },
      },
      {
        id: "b",
        text: "Rehearse my defense like a court case",
        weights: { RUMIN: 1, SUFF: 1, AVO: 1 },
      },
      { id: "c", text: "Reply “sure” and go emotionally offline", weights: { AVO: 2, DEACT: 1 } },
      { id: "d", text: "Ask “now or tonight?” — and mean it", weights: {} },
    ],
  },
  {
    id: "q14",
    block: 3,
    prompt: "Mid-argument, they raise their voice. Your move:",
    options: [
      {
        id: "a",
        text: "Plead or cry — losing them feels closer than the argument",
        weights: { ANX: 2 },
      },
      { id: "b", text: "Go cold and surgical. Feelings off, facts on", weights: { AVO: 2, SUFF: 1 } },
      {
        id: "c",
        text: "Say something sharp — will they stay anyway?",
        weights: { TEST: 2, ANX: 1 },
      },
      { id: "d", text: "Call a timeout before it gets ugly", weights: {} },
    ],
  },
  {
    id: "q15",
    block: 3,
    quoteKey: "distance_feeling",
    prompt: "You feel them pulling away. The dominant feeling is:",
    options: [
      {
        id: "a",
        text: "Panic with a to-do list: fix it, fix it now",
        weights: { ANX: 2, PROTEST: 1, CARE: 1 },
        quote: "panic with a to-do list",
      },
      {
        id: "b",
        text: "A cold inventory of everything wrong with them",
        weights: { AVO: 2, SUFF: 1 },
        quote: "a cold inventory of their flaws",
      },
      {
        id: "c",
        text: "Familiar. Almost comfortable. Here we go again",
        weights: { ANX: 1, AVO: 1 },
        quote: "a familiar “here we go again”",
      },
      {
        id: "d",
        text: "Curiosity — something's up with them, not me",
        weights: {},
        quote: "curiosity, not panic",
      },
    ],
  },
  {
    id: "q16",
    block: 3,
    prompt: "They laugh a little too long at someone else's joke. You:",
    options: [
      {
        id: "a",
        text: "Investigate that person's entire existence online",
        weights: { ANX: 2, RUMIN: 1 },
      },
      {
        id: "b",
        text: "Mention it “as a joke” three days later",
        weights: { TEST: 2, ANX: 1 },
      },
      {
        id: "c",
        text: "Use it as quiet permission to detach a little",
        weights: { AVO: 2, DEACT: 1 },
      },
      { id: "d", text: "Notice, shrug, forget by dinner", weights: {} },
    ],
  },
  {
    id: "q17",
    block: 3,
    prompt: "When you're the one who's upset with them:",
    options: [
      {
        id: "a",
        text: "I say “I'm fine” and wait for them to dig",
        weights: { TEST: 2, ANX: 1 },
      },
      { id: "b", text: "I flood them — everything, at once", weights: { ANX: 2, PROTEST: 1 } },
      { id: "c", text: "I don't say it. It joins the archive", weights: { AVO: 2, SUFF: 1 } },
      { id: "d", text: "I tell them, once I know what I actually feel", weights: {} },
    ],
  },
  {
    id: "q18",
    block: 3,
    prompt: "They cancel Friday plans — real reason, sincere apology. You:",
    options: [
      {
        id: "a",
        text: "“Of course, no worries!!” + two hours of what-does-this-mean",
        weights: { ANX: 2, RUMIN: 1 },
      },
      {
        id: "b",
        text: "Feel secretly relieved to get a night off from us",
        weights: { AVO: 2, DEACT: 1 },
      },
      {
        id: "c",
        text: "Say it's fine — then cancel the next one. Balance",
        weights: { TEST: 1, AVO: 1, SUFF: 1 },
      },
      { id: "d", text: "Feel disappointed, say so, reschedule", weights: {} },
    ],
  },
  {
    id: "q19",
    block: 3,
    prompt: "The morning after a genuinely intimate night — emotional, not just physical:",
    options: [
      {
        id: "a",
        text: "I need them to confirm it meant the same to them",
        weights: { ANX: 2, PROTEST: 1 },
      },
      {
        id: "b",
        text: "I feel weirdly exposed and need a day alone",
        weights: { AVO: 2, DEACT: 2 },
      },
      {
        id: "c",
        text: "I start doing things for them — breakfast, errands, favors",
        weights: { CARE: 2 },
      },
      { id: "d", text: "I feel closer. That's it. That's the feeling", weights: {} },
    ],
  },

  // ───────────────────────── Block 4 · Your moves
  {
    id: "q20",
    block: 4,
    quoteKey: "first_move",
    prompt: "Silence from them, day two. Your actual move:",
    options: [
      {
        id: "a",
        text: "The double text. Casual on the surface, panicked underneath",
        weights: { PROTEST: 2, ANX: 1 },
        quote: "the casual-but-not double text",
      },
      {
        id: "b",
        text: "A story posted where I look happy. Bait",
        weights: { PROTEST: 2, TEST: 1 },
        quote: "the strategic story post",
      },
      {
        id: "c",
        text: "Nothing. Silence is my mother tongue — I can outlast anyone",
        weights: { DEACT: 2, SUFF: 1 },
        quote: "out-silencing them",
      },
      {
        id: "d",
        text: "One honest check-in, then I live my life",
        weights: {},
        quote: "one honest check-in",
      },
    ],
  },
  {
    id: "q21",
    block: 4,
    prompt: "Your search history during a rough patch:",
    options: [
      { id: "a", text: "“why do they pull away” — at 2:47 AM", weights: { RUMIN: 2, ANX: 1 } },
      {
        id: "b",
        text: "Their name + every social platform that exists",
        weights: { ANX: 1, RUMIN: 1, PROTEST: 1 },
      },
      {
        id: "c",
        text: "“How to know when to leave” — while planning to stay",
        weights: { AVO: 1, ANX: 1, RUMIN: 1 },
      },
      { id: "d", text: "Mostly recipes, honestly", weights: {} },
    ],
  },
  {
    id: "q22",
    block: 4,
    prompt: "To make someone stay, you have historically:",
    options: [
      { id: "a", text: "Shape-shifted into whatever they needed", weights: { CARE: 2, ANX: 1 } },
      {
        id: "b",
        text: "Made myself indispensable — their chef, driver, therapist",
        weights: { CARE: 2 },
      },
      {
        id: "c",
        text: "Never tried. If they want to go, the door's right there",
        weights: { SUFF: 2, AVO: 1 },
      },
      { id: "d", text: "Stayed myself, and let that be enough", weights: {} },
    ],
  },
  {
    id: "q23",
    block: 4,
    prompt: "When they finally reach out after days of distance:",
    options: [
      { id: "a", text: "Reply in 0.3 seconds, dignity optional", weights: { ANX: 2, PROTEST: 1 } },
      {
        id: "b",
        text: "Make them wait exactly as long as they made me",
        weights: { TEST: 2, ANX: 1 },
      },
      {
        id: "c",
        text: "Feel annoyed they broke my hard-won calm",
        weights: { AVO: 2, DEACT: 1 },
      },
      { id: "d", text: "Feel glad, and say so", weights: {} },
    ],
  },
  {
    id: "q24",
    block: 4,
    prompt: "Your friends' role in your love life:",
    options: [
      {
        id: "a",
        text: "Forensic team. They've analyzed every screenshot",
        weights: { RUMIN: 2, ANX: 1 },
      },
      { id: "b", text: "They learn about my breakups after the fact", weights: { AVO: 1, SUFF: 2 } },
      {
        id: "c",
        text: "They warn me I'm doing it again. I do it again",
        weights: { ANX: 1, AVO: 1 },
      },
      { id: "d", text: "Reality-checkers I actually listen to", weights: {} },
    ],
  },
  {
    id: "q25",
    block: 4,
    prompt: "Apologizing after a fight:",
    options: [
      {
        id: "a",
        text: "I apologize first, fast — even when it wasn't me",
        weights: { ANX: 2, CARE: 1 },
      },
      {
        id: "b",
        text: "I can't say the words. I do nice things instead",
        weights: { AVO: 2, CARE: 1 },
      },
      {
        id: "c",
        text: "I apologize — and update my private ledger of who owed what",
        weights: { TEST: 1, SUFF: 1, RUMIN: 1 },
      },
      { id: "d", text: "When I'm wrong — cleanly. When I'm not — I don't", weights: {} },
    ],
  },
  {
    id: "q26",
    block: 4,
    prompt: "Being fully known — someone seeing all of it:",
    options: [
      {
        id: "a",
        text: "The dream and the terror. I overshare, then regret it",
        weights: { ANX: 2, RUMIN: 1 },
      },
      {
        id: "b",
        text: "No one gets the full tour. Some rooms stay locked",
        weights: { SUFF: 2, AVO: 1 },
      },
      {
        id: "c",
        text: "I show the version that's easiest to love",
        weights: { CARE: 1, ANX: 1 },
      },
      { id: "d", text: "Slowly, room by room, with the right person", weights: {} },
    ],
  },
  {
    id: "q27",
    block: 4,
    prompt: "Alone on a Sunday. No plans, phone quiet:",
    options: [
      { id: "a", text: "Restless. I'll text someone — anyone — by noon", weights: { ANX: 2, PROTEST: 1 } },
      {
        id: "b",
        text: "Bliss. This is the one relationship I never fight with",
        weights: { AVO: 2, SUFF: 1 },
      },
      {
        id: "c",
        text: "A productive avalanche — errands as anesthesia",
        weights: { DEACT: 1, SUFF: 1 },
      },
      { id: "d", text: "Pleasant. Recharge, see Monday coming", weights: {} },
    ],
  },

  // ───────────────────────── Block 5 · How it ends
  {
    id: "q28",
    block: 5,
    quoteKey: "ending",
    prompt: "Your relationships usually end:",
    options: [
      {
        id: "a",
        text: "Slowly — I feel them leaving months before they do",
        weights: { ANX: 2, RUMIN: 1 },
        quote: "you feel them leaving months before they go",
      },
      {
        id: "b",
        text: "Abruptly — one day my feelings just switch off",
        weights: { AVO: 2, DEACT: 2 },
        quote: "your feelings switch off overnight",
      },
      {
        id: "c",
        text: "Explosively — one final test they didn't pass",
        weights: { TEST: 2, ANX: 1 },
        quote: "one final test they didn't pass",
      },
      {
        id: "d",
        text: "Repeatedly — we break up more than once",
        weights: { ANX: 1, AVO: 1 },
        quote: "the break-up/make-up cycle",
      },
      {
        id: "e",
        text: "Mutually and sadly — it just wasn't it",
        weights: {},
        quote: "a sad, honest ending",
      },
    ],
  },
  {
    id: "q29",
    block: 5,
    prompt: "After the breakup, you:",
    options: [
      { id: "a", text: "Draft texts I don't send. Some I do", weights: { ANX: 2, PROTEST: 1 } },
      { id: "b", text: "Delete everything, rebrand, act reborn", weights: { AVO: 2, DEACT: 1 } },
      { id: "c", text: "Run the autopsy for months", weights: { RUMIN: 2, ANX: 1 } },
      { id: "d", text: "Grieve it properly, then genuinely move on", weights: {} },
    ],
  },
  {
    id: "q30",
    block: 5,
    prompt: "Be honest — your ex would describe you as:",
    options: [
      { id: "a", text: "“Too much.” Their word, my scar", weights: { ANX: 2 } },
      { id: "b", text: "“Impossible to reach”", weights: { AVO: 2, SUFF: 1 } },
      { id: "c", text: "“Hot and cold. I never knew which one I'd get”", weights: { ANX: 1, AVO: 1 } },
      { id: "d", text: "“Solid. Even at the end”", weights: {} },
    ],
  },
  {
    id: "q31",
    block: 5,
    prompt: "The story you tell yourself about why it keeps going wrong:",
    options: [
      { id: "a", text: "I pick the wrong people", weights: { ANX: 1, RUMIN: 1 } },
      { id: "b", text: "I'm better alone. Some people just are", weights: { SUFF: 2, AVO: 1 } },
      {
        id: "c",
        text: "I ruin it right when it gets good",
        weights: { AVO: 1, ANX: 1, DEACT: 1 },
      },
      { id: "d", text: "Timing, growth, luck — no villain required", weights: {} },
    ],
  },
  {
    id: "q32",
    block: 5,
    quoteKey: "fear",
    prompt: "Last one. Strip everything away — the real fear underneath:",
    options: [
      {
        id: "a",
        text: "That I'm easy to leave",
        weights: { ANX: 2 },
        quote: "being easy to leave",
      },
      {
        id: "b",
        text: "That needing someone hands them a weapon",
        weights: { AVO: 2, SUFF: 1 },
        quote: "that needing someone arms them against you",
      },
      {
        id: "c",
        text: "That I'm only lovable while I'm useful",
        weights: { CARE: 2, ANX: 1 },
        quote: "being loved only for your usefulness",
      },
      {
        id: "d",
        text: "That if they really knew me, they'd go",
        weights: { ANX: 1, AVO: 1 },
        quote: "that being fully known means being left",
      },
    ],
  },
];

export const SCORED_QUESTIONS = QUESTIONS.filter((q) => !q.context);
export const TOTAL_SCREENS = QUESTIONS.length;
