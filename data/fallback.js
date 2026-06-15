// Curated fallback lessons — one per level — so the app is fully usable
// without an API key (or when the API call fails). Each lesson matches the
// shape returned by the live generator in server.js.

export const FALLBACK_LESSONS = {
  A1: {
    level: "A1",
    title: "Mein Morgen",
    topic: "a small everyday moment",
    text: "Ich heiße Lena. Jeden Morgen stehe ich um sieben Uhr auf. Ich trinke einen Kaffee und esse ein Brötchen. Dann fahre ich mit dem Fahrrad zur Arbeit. Die Arbeit beginnt um neun Uhr. Am Abend koche ich gern und lese ein Buch.",
    translation:
      "My name is Lena. Every morning I get up at seven o'clock. I drink a coffee and eat a roll. Then I ride my bike to work. Work begins at nine o'clock. In the evening I like to cook and read a book.",
    vocabulary: [
      { german: "aufstehen", english: "to get up", note: "separable verb: steht … auf" },
      { german: "das Brötchen", english: "bread roll", note: "" },
      { german: "das Fahrrad", english: "bicycle", note: "mit dem Fahrrad = by bike" },
      { german: "beginnen", english: "to begin", note: "" },
      { german: "gern", english: "gladly / to like doing", note: "ich koche gern = I like cooking" },
    ],
    grammar: [
      {
        point: "Present tense (Präsens)",
        explanation:
          "Regular verbs take endings on the stem: ich trinke, du trinkst, er trinkt. Used for habits and routines.",
        examples: [
          { german: "Ich trinke einen Kaffee.", english: "I drink a coffee." },
          { german: "Die Arbeit beginnt um neun Uhr.", english: "Work begins at nine." },
        ],
      },
      {
        point: "Separable verbs",
        explanation:
          "Some verbs split: the prefix moves to the end of the clause. aufstehen → ich stehe … auf.",
        examples: [
          { german: "Ich stehe um sieben Uhr auf.", english: "I get up at seven." },
        ],
      },
      {
        point: "Word order: verb second",
        explanation:
          "In a main clause the conjugated verb is always the second element, even when a time phrase comes first.",
        examples: [
          { german: "Am Abend koche ich gern.", english: "In the evening I like to cook." },
        ],
      },
    ],
  },

  A2: {
    level: "A2",
    title: "Ein Wochenende in Hamburg",
    topic: "a short journey",
    text: "Letztes Wochenende bin ich nach Hamburg gefahren. Ich habe meine Freundin besucht und wir haben die Stadt angeschaut. Am Samstag wollten wir ins Museum gehen, aber es war geschlossen. Deshalb sind wir an den Hafen gegangen und haben ein Eis gegessen. Das Wetter war schön und wir hatten viel Spaß.",
    translation:
      "Last weekend I went to Hamburg. I visited my friend and we looked around the city. On Saturday we wanted to go to the museum, but it was closed. So we went to the harbour and ate an ice cream. The weather was nice and we had a lot of fun.",
    vocabulary: [
      { german: "besuchen", english: "to visit", note: "" },
      { german: "geschlossen", english: "closed", note: "opposite: geöffnet" },
      { german: "der Hafen", english: "harbour", note: "" },
      { german: "deshalb", english: "therefore / that's why", note: "" },
      { german: "der Spaß", english: "fun", note: "viel Spaß haben = to have fun" },
    ],
    grammar: [
      {
        point: "Perfect tense (Perfekt)",
        explanation:
          "The everyday past tense in spoken German: haben/sein + past participle. Movement verbs use sein.",
        examples: [
          { german: "Ich habe meine Freundin besucht.", english: "I visited my friend." },
          { german: "Ich bin nach Hamburg gefahren.", english: "I went to Hamburg." },
        ],
      },
      {
        point: "Modal verbs in the past",
        explanation:
          "Modal verbs are usually used in the simple past (Präteritum): wollen → wollten.",
        examples: [
          { german: "Wir wollten ins Museum gehen.", english: "We wanted to go to the museum." },
        ],
      },
      {
        point: "Connector: deshalb",
        explanation:
          "deshalb (therefore) starts a clause and pushes the verb to second position: deshalb + verb + subject.",
        examples: [
          { german: "Deshalb sind wir an den Hafen gegangen.", english: "So we went to the harbour." },
        ],
      },
    ],
  },

  B1: {
    level: "B1",
    title: "Jeden Tag etwas Neues",
    topic: "learning and curiosity",
    text: "Wenn ich mehr Zeit hätte, würde ich eine neue Sprache lernen. Viele Menschen sagen, dass sie gern reisen würden, aber im Alltag fehlt ihnen die Gelegenheit. Ich glaube, dass man jeden Tag etwas Neues lernen kann, wenn man neugierig bleibt. Gestern habe ich einen Artikel gelesen, der mich zum Nachdenken gebracht hat.",
    translation:
      "If I had more time, I would learn a new language. Many people say that they would like to travel, but in everyday life they lack the opportunity. I believe that one can learn something new every day if one stays curious. Yesterday I read an article that made me think.",
    vocabulary: [
      { german: "die Gelegenheit", english: "opportunity", note: "" },
      { german: "neugierig", english: "curious", note: "" },
      { german: "der Alltag", english: "everyday life", note: "" },
      { german: "zum Nachdenken bringen", english: "to make (someone) think", note: "fixed expression" },
      { german: "fehlen", english: "to be lacking", note: "takes the dative: ihnen fehlt …" },
    ],
    grammar: [
      {
        point: "Konjunktiv II (hypothetical)",
        explanation:
          "Used for unreal conditions and politeness: hätte (would have), würde + infinitive (would do).",
        examples: [
          { german: "Wenn ich mehr Zeit hätte, würde ich …", english: "If I had more time, I would …" },
        ],
      },
      {
        point: "dass-clauses",
        explanation:
          "In a subordinate clause introduced by dass, the conjugated verb goes to the very end.",
        examples: [
          { german: "Ich glaube, dass man etwas lernen kann.", english: "I believe that one can learn something." },
        ],
      },
      {
        point: "Relative clauses",
        explanation:
          "A relative pronoun (der/die/das) introduces a clause describing a noun; the verb again goes to the end.",
        examples: [
          { german: "ein Artikel, der mich zum Nachdenken gebracht hat", english: "an article that made me think" },
        ],
      },
    ],
  },

  B2: {
    level: "B2",
    title: "Digitalisierung mit zwei Gesichtern",
    topic: "how technology changes daily life",
    text: "Obwohl die Digitalisierung viele Vorteile mit sich bringt, wird sie zunehmend kritisch betrachtet. Experten weisen darauf hin, dass nicht alle Menschen gleichermaßen davon profitieren. Es wird befürchtet, dass die Kluft zwischen den Generationen größer werden könnte. Dennoch lässt sich nicht leugnen, dass der technologische Fortschritt unseren Alltag erheblich erleichtert hat.",
    translation:
      "Although digitalisation brings many advantages, it is increasingly viewed critically. Experts point out that not everyone benefits from it equally. There are fears that the gap between the generations could grow. Nevertheless, it cannot be denied that technological progress has considerably eased our daily lives.",
    vocabulary: [
      { german: "der Vorteil", english: "advantage", note: "opposite: der Nachteil" },
      { german: "zunehmend", english: "increasingly", note: "" },
      { german: "die Kluft", english: "gap / divide", note: "" },
      { german: "leugnen", english: "to deny", note: "" },
      { german: "der Fortschritt", english: "progress", note: "" },
    ],
    grammar: [
      {
        point: "Passive voice (Vorgangspassiv)",
        explanation:
          "werden + past participle expresses a process done to the subject, often without naming the agent.",
        examples: [
          { german: "Sie wird kritisch betrachtet.", english: "It is viewed critically." },
          { german: "Es wird befürchtet, dass …", english: "It is feared that …" },
        ],
      },
      {
        point: "Concessive connectors",
        explanation:
          "obwohl (although) starts a subordinate clause; dennoch / trotzdem (nevertheless) continue a main clause.",
        examples: [
          { german: "Obwohl es Vorteile gibt, …", english: "Although there are advantages, …" },
        ],
      },
      {
        point: "sich lassen + infinitive",
        explanation:
          "A common alternative to the passive expressing possibility: lässt sich nicht leugnen = cannot be denied.",
        examples: [
          { german: "Es lässt sich nicht leugnen, dass …", english: "It cannot be denied that …" },
        ],
      },
    ],
  },

  C1: {
    level: "C1",
    title: "Mensch und Maschine",
    topic: "a surprising question about science",
    text: "Die Frage, inwiefern künstliche Intelligenz das menschliche Denken nachahmen kann, beschäftigt Wissenschaftler seit Jahrzehnten. Während die einen davon überzeugt sind, dass Maschinen eines Tages ein Bewusstsein entwickeln werden, halten andere dies für reine Spekulation. Fest steht jedoch, dass die Grenzen zwischen Mensch und Maschine zunehmend verschwimmen.",
    translation:
      "The question of to what extent artificial intelligence can imitate human thinking has occupied scientists for decades. While some are convinced that machines will one day develop a consciousness, others consider this pure speculation. What is certain, however, is that the boundaries between human and machine are increasingly blurring.",
    vocabulary: [
      { german: "inwiefern", english: "to what extent", note: "introduces an indirect question" },
      { german: "nachahmen", english: "to imitate", note: "separable" },
      { german: "das Bewusstsein", english: "consciousness", note: "" },
      { german: "verschwimmen", english: "to blur / become indistinct", note: "" },
      { german: "die Spekulation", english: "speculation", note: "" },
    ],
    grammar: [
      {
        point: "Indirect questions",
        explanation:
          "Words like inwiefern, ob, wieso introduce embedded questions; the verb moves to the end.",
        examples: [
          { german: "die Frage, inwiefern KI das Denken nachahmen kann", english: "the question of to what extent AI can imitate thinking" },
        ],
      },
      {
        point: "während for contrast",
        explanation:
          "Besides 'while' (time), während can contrast two ideas, like 'whereas'.",
        examples: [
          { german: "Während die einen … , halten andere …", english: "While some … , others consider …" },
        ],
      },
      {
        point: "Fronted constructions",
        explanation:
          "Fest steht, dass … places the comment first for emphasis; the subject follows the verb.",
        examples: [
          { german: "Fest steht jedoch, dass …", english: "What is certain, however, is that …" },
        ],
      },
    ],
  },

  C2: {
    level: "C2",
    title: "Die verborgene Macht der Sprache",
    topic: "books, language and perception",
    text: "Es wäre vermessen zu behaupten, die Sprache sei lediglich ein Mittel zur Verständigung. Vielmehr prägt sie, wie wir die Welt wahrnehmen, und nicht selten entzieht sich ihre Wirkung unserem Bewusstsein. Wer sich auf die Feinheiten einer Sprache einlässt, dem offenbart sich eine Welt voller Nuancen, die dem flüchtigen Betrachter verborgen bleibt.",
    translation:
      "It would be presumptuous to claim that language is merely a means of communication. Rather, it shapes how we perceive the world, and not infrequently its effect escapes our awareness. To whoever engages with the subtleties of a language, a world full of nuances reveals itself — one that remains hidden to the fleeting observer.",
    vocabulary: [
      { german: "vermessen", english: "presumptuous / arrogant", note: "here an adjective" },
      { german: "lediglich", english: "merely", note: "" },
      { german: "wahrnehmen", english: "to perceive", note: "separable" },
      { german: "die Feinheit", english: "subtlety / nuance", note: "" },
      { german: "sich offenbaren", english: "to reveal itself", note: "" },
    ],
    grammar: [
      {
        point: "Konjunktiv I (reported speech)",
        explanation:
          "die Sprache sei … reports a claim without endorsing it — the hallmark of indirect speech.",
        examples: [
          { german: "… zu behaupten, die Sprache sei ein Mittel", english: "… to claim that language is a means" },
        ],
      },
      {
        point: "Fronted subordinate clause with correlate",
        explanation:
          "Wer …, dem … pairs an indefinite relative with a resumptive pronoun for an elegant, formal feel.",
        examples: [
          { german: "Wer sich einlässt, dem offenbart sich …", english: "Whoever engages, to them reveals itself …" },
        ],
      },
      {
        point: "Reflexive verbs with dative effect",
        explanation:
          "entzieht sich … unserem Bewusstsein literally 'withdraws itself from our awareness' — a dense, idiomatic structure.",
        examples: [
          { german: "ihre Wirkung entzieht sich unserem Bewusstsein", english: "its effect escapes our awareness" },
        ],
      },
    ],
  },
};
