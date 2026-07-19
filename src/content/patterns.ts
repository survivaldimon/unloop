import type { PatternId } from "../types";

export interface LoopStep {
  label: string;
  /** May contain {silence_thought} {distance_feeling} {first_move} {ending} {fear} slots. */
  text: string;
}

export interface Pattern {
  id: PatternId;
  name: string;
  tagline: string;
  family: "anxious" | "avoidant" | "mixed" | "secure";
  /** Flattering/intriguing line for the share card — the wound stays in the report. */
  shareLine: string;
  loop: LoopStep[]; // 5 steps
  teaserInsights: string[]; // slots allowed
  origins: string; // chapter: where it comes from
  outsideFallback: string; // chapter: how it reads from outside (LLM fallback)
  breaking: string[]; // chapter: loop interrupts
  greenFlags: string[]; // chapter: who is safe for this pattern
  redFlags: string[]; // who re-triggers the loop
}

export const PATTERNS: Record<PatternId, Pattern> = {
  pursuer: {
    id: "pursuer",
    name: "The Pursuer",
    tagline: "You don't lose people. You lose yourself chasing them.",
    family: "anxious",
    shareLine: "Loves at full volume · gives 200% · feels everything first",
    loop: [
      { label: "Trigger", text: "Distance appears — a slow reply, a flat tone, a cancelled plan." },
      { label: "Thought", text: "“I'm losing them.” Your brain skips evidence and goes straight to the verdict: {silence_thought}." },
      { label: "Feeling", text: "{distance_feeling} — a fear so loud it feels like fact." },
      { label: "Move", text: "You close the gap by force: {first_move}. More texts, more effort, more presence." },
      { label: "Result", text: "They feel the pressure and step back further. The distance you feared — you helped build it. And the loop confirms: {fear}." },
    ],
    teaserInsights: [
      "When they go quiet, your first instinct is to {silence_thought} — that's not a quirk, it's step 2 of a five-step loop.",
      "Your pursuit isn't neediness. It's a strategy your nervous system learned: closeness = safety. The problem is the dose.",
    ],
    origins:
      "Pursuit is a learned equation: somewhere early, love was real but inconsistent — warm one day, distracted the next. A child in that weather learns that connection must be *earned and maintained manually*, or it evaporates. So you became brilliant at reading rooms, moods, pauses. That radar is a genuine gift. But it's calibrated for storms — it fires on clear days too, and every false alarm sends you chasing safety that was never actually leaving.",
    outsideFallback:
      "From the inside, your pursuit feels like love in motion. From the outside, early on, it reads as warmth — people are flattered. Then the volume rises. Your partner starts feeling less like a person and more like a fire alarm they have to keep answering. They pull back not because they care less, but to hear themselves think — and to you, that silence sounds like the beginning of the end, so you chase harder. Most partners never explain this. They just get quieter.",
    breaking: [
      "The 24-hour rule: when the fear spikes, you're allowed to do anything except reach out — for 24 hours. Not to punish them. To let your nervous system learn that the wave passes and nobody dies.",
      "Name the alarm, not the accusation: replace “why are you distant?” with “I notice I get anxious when things go quiet — I'm working on it.” One sentence, once. It reads as strength, not pressure.",
      "Redirect the pursuit energy: the urge to chase is real energy — spend it on something with a finish line (gym, project, friend) so the relief comes from completion, not from their reply.",
      "Track false alarms: keep a note of every time you were sure it was ending and it wasn't. After ten entries, your brain starts doubting the alarm instead of the relationship.",
    ],
    greenFlags: [
      "People who answer consistency with consistency — boring texters, reliable planners. Your system heals next to predictability.",
      "Someone who names their need for space in advance (“heads-up, quiet week ahead”) — a schedule kills your alarm before it rings.",
      "People who say what they feel unprompted, so your radar can finally go off duty.",
    ],
    redFlags: [
      "Intermittent rewarders — hot Monday, gone Thursday. To your system, that's not chemistry, that's a slot machine.",
      "Anyone who treats your expressed needs as “drama”. Your needs aren't drama; unpredictability is.",
    ],
  },

  decoder: {
    id: "decoder",
    name: "The Decoder",
    tagline: "You don't have conversations. You have investigations.",
    family: "anxious",
    shareLine: "Reads people like open books · misses nothing · feels everything",
    loop: [
      { label: "Trigger", text: "An ambiguous signal — a shorter text, a changed tone, a “k.”" },
      { label: "Thought", text: "“It means something.” You {silence_thought} — because to you, data is safety." },
      { label: "Feeling", text: "{distance_feeling}, disguised as analysis. The spreadsheet is a shield for the fear." },
      { label: "Move", text: "You investigate instead of asking. Screenshots to friends, timelines, theories — everything except the one direct question." },
      { label: "Result", text: "You act on your conclusions, not their reality. They feel studied, not seen — and drift. Case closed the way you feared: {fear}." },
    ],
    teaserInsights: [
      "Your instinct to {silence_thought} feels like getting closer to the truth. It's actually getting further from the person.",
      "You've never been wrong about a vibe shift. You've often been wrong about what it meant — that gap is your entire loop.",
    ],
    origins:
      "Decoding is what a sharp mind does when direct answers were never safe or never came. If you grew up reading a parent's footsteps in the hallway — knowing the mood before the door opened — analysis *was* protection. You became fluent in subtext because text couldn't be trusted. The skill is real: you notice what others miss. But in love, you keep solving for hidden meaning in people who sometimes just… had a long day.",
    outsideFallback:
      "You feel like an attentive, perceptive partner — and you are. But your partner slowly notices they're being *interpreted* rather than heard. Their offhand words return three days later as evidence. They start pre-editing themselves around you, choosing words carefully — which gives you less authentic data, which sharpens your analysis, which makes them edit more. The person who could read everyone ends up with a partner who's become unreadable on purpose.",
    breaking: [
      "The one-question rule: every theory earns you exactly one direct question to the source. “You seemed off tonight — are we okay?” Evidence beats inference, every time.",
      "Set a research curfew: no re-reading chats after 22:00. Night analysis has a 90% false-positive rate — you know this from experience.",
      "Screenshot embargo: before sending the chat to a friend for review, ask the person one honest question first. Friends analyze copies; you have access to the original.",
      "Write the boring theory too: for every alarming interpretation, force one mundane alternative (“tired”, “busy”, “bad day”). Give it equal airtime.",
    ],
    greenFlags: [
      "Over-communicators — people who narrate their inner state before you have to dig for it.",
      "Someone who reacts to your one direct question with warmth, not defensiveness. That's your whole diagnostic right there.",
      "People whose words and actions match over weeks. Consistency starves the decoder; that's the point.",
    ],
    redFlags: [
      "Mixed-signal artists and “I'm bad at texting” people. To you that's not a quirk — it's an unsolvable case you'll never put down.",
      "Anyone who makes you feel crazy for noticing real things. Your radar is fine; hiding things is the problem.",
    ],
  },

  tester: {
    id: "tester",
    name: "The Tester",
    tagline: "You never ask for love. You set traps for it.",
    family: "anxious",
    shareLine: "Fiercely loyal · never settles · demands the real thing",
    loop: [
      { label: "Trigger", text: "Doubt creeps in — do they actually care, or are you convenient?" },
      { label: "Thought", text: "“Words are cheap. I need proof.” Asking directly feels like begging — so you engineer the answer." },
      { label: "Feeling", text: "{distance_feeling}, wrapped in control. If they pass, relief for a day. If they fail — confirmation." },
      { label: "Move", text: "The exam begins: “I'm fine.” The strategic silence. {first_move}. They don't know they're being graded." },
      { label: "Result", text: "They fail a test they never knew they took. You collect the evidence, they collect the exhaustion — and it ends the way it always does: {ending}." },
    ],
    teaserInsights: [
      "“I'm fine” is never a status report from you. It's question one of an exam they don't know they're taking.",
      "Here's the trap: every test you run has a pass condition they can't see. You're not testing their love — you're testing their mind-reading.",
    ],
    origins:
      "Testing is born where asking was punished or ignored. If saying “I need you” once cost you — ridicule, dismissal, a parent who turned away — you learned to verify love covertly instead of requesting it openly. A test feels safer than a question because a test can't be rejected. Underneath every trap you set is the most vulnerable sentence you own, still waiting to be said out loud: “show me I matter.”",
    outsideFallback:
      "Your partner lives in a weather system they can't forecast. Things feel fine — then suddenly cold, and they don't know what exam they failed. At first they try harder, which you quietly enjoy. But nobody passes forever; graded people eventually stop studying. When they finally say “I feel like I can never win with you,” they're describing the loop from the inside — and by then they've usually already stopped trying.",
    breaking: [
      "Translate one test per week into its underlying question. “I'm fine” → “I'm hurt about tonight and I need ten minutes of you.” Terrifying, and twice as effective.",
      "Announce the mechanism once: “when I get scared, I go quiet and wait for you to notice.” A named trap stops working on both of you.",
      "Grade the ask, not the guess: if they respond well to a direct request, count that as passing — stop requiring telepathy as the gold standard.",
      "Before any strategic silence, set a timer: 30 minutes. Then say the thing. The silence was never the message; it was the fear of sending one.",
    ],
    greenFlags: [
      "People who ask “what's actually wrong?” and wait for the real answer. Patience is your love language, even if you'd never admit it.",
      "Someone who fails a test but passes the conversation about it — repair matters more than performance.",
      "Direct askers. Being around people who request things openly retrains the part of you that forgot it's allowed.",
    ],
    redFlags: [
      "Game-players and score-keepers — with them your testing escalates into an arms race no one wins.",
      "People who shrug at your silences. Indifference reads as “failed test” to you, and you'll double the stakes.",
    ],
  },

  fixer: {
    id: "fixer",
    name: "The Fixer",
    tagline: "You don't fall in love with people. You fall in love with their potential.",
    family: "anxious",
    shareLine: "Sees the best in everyone · gives without keeping score · heals people",
    loop: [
      { label: "Trigger", text: "You meet someone wonderful — and slightly broken. The brokenness isn't a bug. It's the hook." },
      { label: "Thought", text: "“If I help them become who they could be, they'll never leave the person who did that.” Love becomes a job with deferred pay." },
      { label: "Feeling", text: "Needed. Which your system files under “safe” — because {fear}." },
      { label: "Move", text: "You over-function: their chef, therapist, manager, alarm clock. You do; they receive. The imbalance feels like devotion.", },
      { label: "Result", text: "Either they heal and outgrow the hospital — or they never heal and you burn out resenting the patient. Both exits end at the same place: {ending}." },
    ],
    teaserInsights: [
      "Your deepest fear — {fear} — is the engine here: if love must be earned, then usefulness feels like the only stable currency.",
      "You don't actually believe someone would stay for you-without-the-service. That belief, not your partners, is what needs the repair work.",
    ],
    origins:
      "Fixers are usually made early: a child who earned warmth by being helpful — the little adult, the easy one, the one who managed a parent's moods. Love arrived as a paycheck for services rendered, so you concluded the deal was: *be needed or be left*. You bring real gifts — attentiveness, generosity, competence. But you keep choosing renovation projects instead of partners, because a finished person triggers the scariest question you know: what do I offer if not repairs?",
    outsideFallback:
      "Early on, you're a miracle: suddenly their life works, bills get paid, wounds get tended. But being someone's project is quietly humiliating — every act of care doubles as a memo that they're not enough as-is. Some partners settle into the comfort and stop growing (you become the resentful engine of a stalled life). Others recover, look around from their new height, and leave — not despite your help, but propelled by it. Neither of them ever saw the person behind the service desk. You never showed them.",
    breaking: [
      "The 50% experiment: for two weeks, contribute exactly half — half the texts, half the plans, half the fixing. What survives at 50% is a relationship. What collapses was a job.",
      "Receive without repaying: next time they give you something — help, a compliment, care — say “thank you” and full stop. No instant counter-gift. Sit in the debt. That discomfort is the exact spot where the loop lives.",
      "Date the finished ones: notice who you're drawn to. If the pull is “so much potential” — that's the hook. Practice interest in people who are already okay. Boring at first. That's withdrawal, not incompatibility.",
      "Ask for one thing per week: small, concrete, for you. “Can you pick up dinner tonight?” Needing things is the skill you skipped.",
    ],
    greenFlags: [
      "People who already have a life that works — therapy done, dishes washed, friendships intact. You need a partner, not a caseload.",
      "Someone who notices when *you're* struggling without being told. Being cared for will feel wrong at first; that's the healing starting.",
      "People who thank you for who you are, not what you did this week.",
    ],
    redFlags: [
      "Charming disasters and “you're the only one who understands me” people. That sentence is your kryptonite — it's a job offer disguised as intimacy.",
      "Anyone whose affection spikes when you're useful and cools when you have needs of your own.",
    ],
  },

  vanisher: {
    id: "vanisher",
    name: "The Vanisher",
    tagline: "You don't leave relationships. You evaporate from them.",
    family: "avoidant",
    shareLine: "Deep but rationed · a fortress with a garden inside · leaves them wondering",
    loop: [
      { label: "Trigger", text: "It gets good. Really good. Keys are exchanged, futures are sketched — closeness stops being theoretical." },
      { label: "Thought", text: "“Something is off.” You can't name it, but suddenly their chewing is annoying and their texts feel like tasks." },
      { label: "Feeling", text: "Suffocation dressed as clarity — {distance_feeling}. The walls feel closer every day." },
      { label: "Move", text: "The slow fade: {first_move}. Longer reply times, foggier plans, a schedule that's suddenly “crazy right now.”" },
      { label: "Result", text: "They feel you leaving and either chase (which speeds the fade) or mirror your distance (which you read as proof it was never real). {ending} — and three months later, alone and safe, you miss them." },
    ],
    teaserInsights: [
      "Your feelings don't actually switch off — {ending} is the visible end of a fade that started weeks earlier, at the exact moment things got serious.",
      "The suffocation you feel isn't about them. It's an alarm wired to closeness itself — and it has been sounding since long before this relationship.",
    ],
    origins:
      "Vanishing is a skill learned where needing people didn't pay. Maybe caregivers met your emotions with discomfort or dismissal, and you concluded that needs are a burden best handled privately. You built an exquisite inner world — self-contained, calm, yours. Real intimacy threatens the architecture: it *requires* need. So when someone gets close enough to matter, an ancient alarm reads “matter” as “danger”, and your system starts quietly packing. The love is real. So is the alarm. They're just wired to the same switch.",
    outsideFallback:
      "From outside, you're intriguing — warm, then gone, then warm again. Early on it reads as depth and independence. But your partner is slowly starving on rationed closeness: every step forward they take, you take half a step back, always deniable (“I've just been busy”). They begin doubting their own perception, because nothing is ever said out loud — the door just gets heavier every week. When they finally leave or blow up, you feel confirmed: see, people always want too much. They didn't want too much. They wanted you, findable.",
    breaking: [
      "Say the alarm out loud: “I pull back when things get close — it's about my wiring, not you, and I'm working on it.” One sentence turns a vanishing act into a shared project.",
      "Schedule the distance: claim your space *in advance* (a solo evening, a free Sunday) instead of stealing it via fade. Requested space builds trust; stolen space burns it.",
      "The 90-second stay: when the urge to withdraw hits mid-conversation, stay 90 seconds longer and name one feeling. The alarm peaks and passes; you've just never stayed long enough to learn that.",
      "Audit the ick: when their laugh/texts/chewing suddenly annoys you, check the calendar — did closeness just level up? The ick is rarely about the laugh.",
    ],
    greenFlags: [
      "Secure, unbothered people who hear “I need a weekend to myself” and say “great, see you Monday” — no punishment, no pursuit.",
      "Someone with a full life of their own. Empty-calendar partners set off your suffocation alarm on day one.",
      "People who let closeness grow in steps you can see coming, not in ambushes.",
    ],
    redFlags: [
      "Pursuers who read your first quiet day as crisis and triple the contact — your fade and their chase are a perfect doom-loop.",
      "Anyone who treats your need for solitude as an insult to be negotiated away.",
    ],
  },

  fortress: {
    id: "fortress",
    name: "The Fortress",
    tagline: "Nobody hurts you. Nobody reaches you either.",
    family: "avoidant",
    shareLine: "Unshakeable · self-made · the calmest person in any crisis",
    loop: [
      { label: "Trigger", text: "Someone offers real closeness — help, softness, a place to put your weight down." },
      { label: "Thought", text: "“Needing this is how people get owned.” Because deep down: {fear}." },
      { label: "Feeling", text: "A flicker of longing, instantly overruled by the garrison. Wanting it proves the danger." },
      { label: "Move", text: "You politely decline the closeness: jokes instead of feelings, competence instead of vulnerability, “I'm good” as a full sentence." },
      { label: "Result", text: "They stop offering. You're safe, unburdened, unreached — and the fortress proves again that no one ever really stays. No one was allowed to." },
    ],
    teaserInsights: [
      "Your independence isn't a preference — it's a defense so old it feels like personality. {fear} is the brick it's built from.",
      "People don't leave you because you're too much. They leave because there was never a door — and they got tired of talking to walls.",
    ],
    origins:
      "Fortresses are built young, brick by brick, wherever depending on someone ended badly — a caregiver who used vulnerability against you, chaos you survived by needing nothing, love that came with invoices. Self-sufficiency worked. It got you here. The problem is that walls don't know the war is over: they screen out enemies and lovers with equal efficiency. Somewhere inside is the person who originally needed protecting — still waiting to find out if it's safe to come out. It is. But only you can open a gate that was built from the inside.",
    outsideFallback:
      "You read as strong, funny, unflappable — the one everyone leans on. But partners eventually notice the exchange rate: they hand you their inner world and receive weather reports back. Loving a fortress is lonely; they're *with* you and still alone. Most don't leave dramatically — they just stop knocking. And your calm at their departure becomes their final proof that they never actually got in. Your composure isn't experienced as strength by the people who love you. It's experienced as absence.",
    breaking: [
      "One brick a week: share one real thing — a worry, a want, a memory that matters. Small enough to survive, real enough to count. Intimacy is a dosage game.",
      "Accept help you don't need: let someone carry something, book something, comfort you — precisely when you could do it yourself. The point isn't the help; it's teaching your system that debt-free receiving exists.",
      "Say the meta-sentence: “opening up is hard for me — silence doesn't mean you don't matter.” It buys patience you'll need.",
      "Catch the deflection: every time you answer a real question with a joke, notice it. You don't have to stop yet. Just count. Awareness rusts the hinges open.",
    ],
    greenFlags: [
      "Patient, secure people who knock gently and repeatedly without battering the door.",
      "Someone who shares their own vulnerability first, without demanding immediate reciprocity — a demo that the drawbridge holds weight.",
      "People who notice the garden behind the walls and stay curious about it.",
    ],
    redFlags: [
      "Emotional battering rams — “open up to me NOW” people. Force confirms the fortress's original threat model.",
      "Anyone who weaponizes what you finally shared. One such incident sets the project back years — choose the audience for brick-removal carefully.",
    ],
  },

  pushpull: {
    id: "pushpull",
    name: "The Push-Pull",
    tagline: "Come here. Go away. Come here.",
    family: "mixed",
    shareLine: "Loves deeply · feels everything twice · the most intense person they'll ever meet",
    loop: [
      { label: "Trigger", text: "Closeness OR distance — both alarms are wired. There is no safe zone, only oscillation." },
      { label: "Thought", text: "Up close: “they'll swallow me.” At distance: “they'll leave me.” Two ancient fears take turns at the wheel — and {fear} rides along." },
      { label: "Feeling", text: "{distance_feeling}. Longing and suffocation in the same hour. It reads as passion; it's actually a fire alarm duet." },
      { label: "Move", text: "You pull them in with everything you have — then push off the moment they arrive. {first_move}, then regret, then repair, then repeat." },
      { label: "Result", text: "{ending}. The intensity feels like proof of real love — but it's the loop itself generating the drama both of you are exhausted by." },
    ],
    teaserInsights: [
      "You're not “bad at relationships”. You're running two contradictory safety programs at once — closeness triggers one, distance triggers the other.",
      "The break-up/make-up cycle isn't passion. It's the only rhythm that briefly satisfies both alarms — and it never satisfies either for long.",
    ],
    origins:
      "Push-pull wiring usually forms where the source of comfort and the source of fear were the same person — a caregiver who soothed you and scared you, loved you and lashed out. The math is impossible for a child: safety = danger. So you learned to approach and brace simultaneously. As an adult, calm relationships feel suspicious (where's the other shoe?), and chaotic ones feel like home. Your intensity is real — but underneath it is a nervous system that has never once been allowed to relax around love.",
    outsideFallback:
      "Loving you is the best and hardest thing your partners have done. The pull phase is intoxicating — no one makes people feel more chosen than you. Then the push arrives without a schedule: coldness, an exit, a fight that came from nowhere they can see. Partners describe it as emotional weather — they carry an umbrella all the time and still get soaked. The stable ones eventually leave to protect themselves; the unstable ones stay and feed the cycle. Both outcomes teach you love is chaos. It isn't. Your alarm system is.",
    breaking: [
      "Name the phase out loud: “I'm in a push right now — it's my wiring, not my verdict on us. Give me tonight.” Narrating the cycle is the single strongest interrupt.",
      "Ban exits during storms: no breakup decisions inside 48 hours of a trigger. Push-phase decisions have a terrible track record — you have the receipts.",
      "Find the middle dose: engineer structured closeness with built-in edges (a shared trip *with* solo mornings, together-weekends *with* separate Sundays). Both alarms stay quiet when the dose is scheduled.",
      "This is also the pattern that most reliably benefits from a professional in the room — not because you're broken, but because rewiring a double alarm solo is like doing surgery on your own hands.",
    ],
    greenFlags: [
      "Steady, secure people whose reaction to your push is neither chasing nor doors slamming — just “I'm here, take your evening.”",
      "Someone who doesn't confuse calm with boredom and can name it: “this is what safe feels like — give it a month.”",
      "Partners who hold their own boundaries kindly. Your system needs to learn that boundaries and abandonment are different species.",
    ],
    redFlags: [
      "Fellow storm-chasers. Two double-alarms make legendary stories and unlivable lives.",
      "Anyone who uses your push phases as ammunition later. The cycle only unwinds where it's safe to have one.",
    ],
  },

  anchor: {
    id: "anchor",
    name: "The Anchor",
    tagline: "Steady isn't boring. It's the rarest thing on this test.",
    family: "secure",
    shareLine: "The safe harbor · says what they mean · loves without the chaos",
    loop: [
      { label: "Trigger", text: "Distance, conflict, ambiguity — the same storms everyone faces." },
      { label: "Thought", text: "“Something's up — let's find out what.” Curiosity where others hear alarms." },
      { label: "Feeling", text: "Feelings, fully felt — but held, not obeyed. Discomfort without catastrophe." },
      { label: "Move", text: "You ask. You say. You wait. The boring superpowers that solve 90% of what destroys other people's relationships." },
      { label: "Result", text: "Storms pass through the relationship instead of becoming it. The loop here is a virtuous one — trust compounds." },
    ],
    teaserInsights: [
      "Your answers show something genuinely uncommon: distance makes you curious, not activated. That's not luck — it's capacity.",
      "Your real risk is different: anchors often attract people who need saving, and mistake the rescue mission for chemistry.",
    ],
    origins:
      "Somewhere along the way — through decent-enough caregiving, good relationships, therapy, or deliberate work — your nervous system learned that closeness is safe and solitude is survivable. That's the whole trick, and it's rarer than it sounds. It doesn't make you immune to heartbreak; it makes you able to have it without losing yourself.",
    outsideFallback:
      "You read as calm, clear, and slightly suspicious to anxious people (“nobody's actually like this”) and as home to avoidant ones. Your danger zone: your stability can absorb enormous dysfunction before you notice you're the only one holding the structure up. Steadiness deserves reciprocity, not just gratitude.",
    breaking: [
      "Your loop-work is different: guard the anchor. Don't let your capacity to stay calm become a license for partners to bring chaos.",
      "Check the ledger quarterly: are you regulating for two? Stability given must eventually be stability returned.",
      "Don't confuse patience with purpose. You can hold space for a struggling partner *and* require they work on their side of it.",
    ],
    greenFlags: [
      "Other secure-ish people — or honest works-in-progress who own their patterns out loud.",
      "Someone whose presence lowers your shoulders, not just someone whose crises need your calm.",
    ],
    redFlags: [
      "Charismatic chaos that frames your steadiness as “finally, someone who can handle me.” You're a partner, not a container.",
      "Anyone who mistakes your flexibility for the absence of limits.",
    ],
  },
};

/** Replace {quoteKey} slots with the user's actual quoted answers. */
export function fillSlots(
  text: string,
  quotes: Partial<Record<string, string>>,
): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => quotes[key] ?? genericSlot(key));
}

function genericSlot(key: string): string {
  switch (key) {
    case "silence_thought":
      return "run the silence through every filter you have";
    case "distance_feeling":
      return "that old familiar pull in your chest";
    case "first_move":
      return "your signature move";
    case "ending":
      return "the ending you already know by heart";
    case "fear":
      return "the fear that started all of this";
    default:
      return "…";
  }
}
