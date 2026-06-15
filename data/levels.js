// CEFR levels and the grammar each level is expected to teach.
// Used both to guide text generation and to show the learner what to focus on.

export const LEVELS = {
  A1: {
    label: "A1 · Beginner",
    summary: "Everyday basics: introducing yourself, simple present tense, articles.",
    grammarFocus: [
      "Present tense of regular and common irregular verbs (sein, haben)",
      "Definite and indefinite articles (der/die/das, ein/eine)",
      "Basic word order in main clauses (verb in second position)",
      "Separable verbs (aufstehen, einkaufen)",
    ],
  },
  A2: {
    label: "A2 · Elementary",
    summary: "Talking about the past and expressing wishes with modal verbs.",
    grammarFocus: [
      "Perfect tense (Perfekt) with haben and sein",
      "Modal verbs (können, müssen, wollen) in present and simple past",
      "Accusative and dative prepositions",
      "Comparatives and connectors (weil, deshalb)",
    ],
  },
  B1: {
    label: "B1 · Intermediate",
    summary: "Opinions, hypotheticals, and more complex sentence structures.",
    grammarFocus: [
      "Subordinate clauses with dass, weil, wenn",
      "Konjunktiv II for wishes and politeness (hätte, würde, könnte)",
      "Relative clauses (der/die/das as relative pronouns)",
      "Genitive case in everyday use",
    ],
  },
  B2: {
    label: "B2 · Upper-Intermediate",
    summary: "Abstract topics, the passive voice, and nuanced connectors.",
    grammarFocus: [
      "Passive voice (Vorgangspassiv with werden)",
      "Concessive and causal connectors (obwohl, trotzdem, dennoch)",
      "Nominalisation and noun-heavy style",
      "Two-part connectors (nicht nur … sondern auch, zwar … aber)",
    ],
  },
  C1: {
    label: "C1 · Advanced",
    summary: "Complex argumentation, reported speech, and idiomatic precision.",
    grammarFocus: [
      "Konjunktiv I for reported speech (er sagte, er sei …)",
      "Extended attributes and participial constructions",
      "Indirect questions (inwiefern, ob, wieso)",
      "Subtle use of modal particles (doch, ja, eben, wohl)",
    ],
  },
  C2: {
    label: "C2 · Mastery",
    summary: "Near-native style, register, and stylistic devices.",
    grammarFocus: [
      "Stylistic inversion and marked word order for emphasis",
      "Idiomatic and figurative language",
      "Dense subordinate-clause architecture",
      "Register shifts and rhetorical devices",
    ],
  },
};

export const LEVEL_CODES = Object.keys(LEVELS);

// A pool of topics to keep generated texts varied and "interesting".
export const TOPICS = [
  "an unusual local tradition",
  "a small everyday moment that became memorable",
  "a surprising fact about science",
  "city life versus the countryside",
  "a piece of German or Austrian history",
  "food and what it says about a culture",
  "how technology changes daily habits",
  "a short story about a journey",
  "an interview-style snippet about someone's job",
  "nature and the changing seasons",
  "music and how it connects people",
  "a curious animal and its behaviour",
  "books, reading, and learning",
  "a festival or holiday and its customs",
  "the future of work",
];
