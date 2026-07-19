import type { Answers } from "../lib/scoring";
import { partialLean } from "../lib/scoring";

export interface InsightScreen {
  afterBlock: number;
  kicker: string;
  build: (answers: Answers) => { title: string; body: string };
}

const LEAN_COPY: Record<
  ReturnType<typeof partialLean>,
  { early: [string, string]; trigger: [string, string]; moves: [string, string] }
> = {
  anx: {
    early: [
      "You invest early — before safety is established.",
      "Your answers so far follow a recognizable track: you read every signal and you read it fast. That radar didn't come from nowhere. Let's look at what happens when it picks something up.",
    ],
    trigger: [
      "Distance doesn't just bother you. It activates you.",
      "Notice the shape forming: when they step back, something in you steps forward. The next section is about what you actually *do* when that switch flips — answer honestly, this is where the loop lives.",
    ],
    moves: [
      "Your moves have a signature.",
      "Pursuit, analysis, effort — your responses share one engine: closing the gap is your safety strategy. One section left. It's about how it ends — and why it keeps ending the same way.",
    ],
  },
  avo: {
    early: [
      "You guard the exit from day one.",
      "Your early-stage answers have a consistent thread: interest, held at arm's length. That distance is doing a job for you. Let's see what it protects you from.",
    ],
    trigger: [
      "Closeness registers as pressure.",
      "A pattern is emerging: the closer it gets, the more something in you reaches for the door. The next section is about your actual moves — the quiet ones nobody sees.",
    ],
    moves: [
      "Your retreat is a system, not a mood.",
      "Fading, rationing, out-lasting — your responses point to a well-rehearsed distance machine. Last section: how your relationships end. You already know it's relevant.",
    ],
  },
  mixed: {
    early: [
      "You run hot and cold — and both are real.",
      "Your answers don't fit one lane: you reach and retreat, sometimes in the same week. That's not indecision — it's two safety systems firing. Keep going, this gets interesting.",
    ],
    trigger: [
      "Both alarms are wired.",
      "Distance activates you *and* closeness crowds you — a rarer combination than you'd think. The next section is about what you do with that double signal.",
    ],
    moves: [
      "Push and pull, taking turns at the wheel.",
      "Your moves alternate between closing the gap and opening it. One section left — the endings. For your combination, that's where the pattern shows its full shape.",
    ],
  },
  steady: {
    early: [
      "So far: unusually steady.",
      "Your early answers show something uncommon — interest without alarm. Either you've done real work, or you're one of the few who got this wiring for free. The trigger section will tell us which.",
    ],
    trigger: [
      "Storms come — and pass through you.",
      "Even under pressure, your answers stay grounded. That's rare on this test. Two sections left; let's see if it holds where most patterns break.",
    ],
    moves: [
      "Your moves stay yours.",
      "No chasing, no vanishing — you act instead of react. Last section: endings. Even steady people have a story there.",
    ],
  },
};

export const INSIGHT_SCREENS: InsightScreen[] = [2, 3, 4].map((block) => ({
  afterBlock: block,
  kicker: `Checkpoint ${block - 1} of 3`,
  build: (answers) => {
    const lean = partialLean(answers);
    const key = block === 2 ? "early" : block === 3 ? "trigger" : "moves";
    const [title, body] = LEAN_COPY[lean][key];
    return { title, body };
  },
}));
