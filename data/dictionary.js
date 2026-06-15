// A compact offline German→English dictionary of high-frequency words and
// common inflected forms. Used by the tap-to-check feature together with each
// lesson's own vocabulary list. Keys are lowercase. This is intentionally
// small and pragmatic — not a full dictionary — and is easy to extend.

export const DICTIONARY = {
  // articles & determiners
  der: "the", die: "the", das: "the", den: "the", dem: "the", des: "of the",
  ein: "a / one", eine: "a", einen: "a", einem: "a", einer: "a", eines: "of a",
  kein: "no / not a", keine: "no", keinen: "no", dieser: "this", diese: "this",
  dieses: "this", diesen: "this", jeder: "every", jede: "every", jeden: "every",
  manche: "some", viele: "many", vieles: "much / many things", alle: "all",
  manchen: "some", solche: "such", welche: "which",

  // pronouns
  ich: "I", du: "you (informal)", er: "he", sie: "she / they", es: "it",
  wir: "we", ihr: "you (pl.) / her", mich: "me", dich: "you", ihn: "him",
  uns: "us", euch: "you (pl.)", mir: "(to) me", dir: "(to) you", ihm: "(to) him",
  ihnen: "(to) them", man: "one / you (general)", wer: "who", was: "what",
  wen: "whom", wem: "to whom", sich: "oneself / each other", selbst: "(one)self",
  mein: "my", meine: "my", meiner: "my", deine: "your", sein: "his / to be",
  seine: "his", seinen: "his", unser: "our", unsere: "our", unseren: "our",
  ihre: "her / their", niemand: "nobody", niemanden: "nobody", etwas: "something",
  nichts: "nothing", jemand: "someone", denen: "(to) whom / those", deren: "whose",

  // sein (to be)
  bin: "am", bist: "are", ist: "is", sind: "are", seid: "are",
  war: "was", warst: "were", waren: "were", gewesen: "been", sei: "be (reported)",
  wäre: "would be", wären: "would be",

  // haben (to have)
  habe: "have", hast: "have", hat: "has", haben: "have / to have", habt: "have",
  hatte: "had", hatten: "had", gehabt: "had", hätte: "would have", hätten: "would have",

  // werden (to become / passive)
  werde: "become / will", wirst: "become / will", wird: "becomes / is (passive)",
  werden: "become / are (passive)", wurde: "was (passive)", wurden: "were (passive)",
  geworden: "become", worden: "been (passive)", würde: "would", würden: "would",

  // modal verbs
  kann: "can", kannst: "can", können: "can / to be able", könnte: "could",
  konnte: "could", muss: "must / have to", musst: "must", müssen: "must",
  musste: "had to", will: "want(s)", willst: "want", wollen: "to want",
  wollte: "wanted", wollten: "wanted", soll: "should / is to", sollen: "should",
  sollte: "should", darf: "may / am allowed", dürfen: "may", möchte: "would like",
  möchten: "would like", mag: "like(s)", mögen: "to like",

  // common verbs (base forms)
  gehen: "to go", kommen: "to come", machen: "to do / make", sehen: "to see",
  sagen: "to say", geben: "to give", finden: "to find", nehmen: "to take",
  essen: "to eat", trinken: "to drink", fahren: "to drive / go", wohnen: "to live",
  leben: "to live", arbeiten: "to work", lernen: "to learn", spielen: "to play",
  kaufen: "to buy", lesen: "to read", heißen: "to be called", denken: "to think",
  glauben: "to believe", wissen: "to know", kennen: "to know (be familiar)",
  bleiben: "to stay", stehen: "to stand", liegen: "to lie", bringen: "to bring",
  brauchen: "to need", versuchen: "to try", verstehen: "to understand",
  bedeuten: "to mean", erklären: "to explain", erzählen: "to tell", fragen: "to ask",
  hören: "to hear", schreiben: "to write", sprechen: "to speak", reden: "to talk",
  gibt: "gives (es gibt = there is)", geht: "goes", kommt: "comes", macht: "does/makes",
  sieht: "sees", sagt: "says", weiß: "knows", findet: "finds", bleibt: "stays",
  heißt: "is called", gehört: "belongs / heard", gefällt: "pleases",

  // adverbs & particles
  nicht: "not", auch: "also", sehr: "very", immer: "always", oft: "often",
  manchmal: "sometimes", jetzt: "now", heute: "today", gestern: "yesterday",
  morgen: "tomorrow / morning", dann: "then", hier: "here", dort: "there",
  da: "there / since", schon: "already", noch: "still / yet", wieder: "again",
  mehr: "more", weniger: "less", zusammen: "together", ganz: "quite / whole",
  nur: "only", viel: "a lot / much", wenig: "little", gut: "good / well",
  schlecht: "bad", besser: "better", gern: "gladly", lieber: "rather",
  bald: "soon", endlich: "finally", vielleicht: "perhaps", wirklich: "really",
  natürlich: "of course", eigentlich: "actually", besonders: "especially",
  zwar: "admittedly", eben: "just / after all", doch: "but / yet", ja: "yes",
  nein: "no", so: "so / thus", wie: "how / like / as", warum: "why",
  weil: "because", wenn: "if / when", als: "when / than / as", dass: "that",
  ob: "whether", obwohl: "although", trotzdem: "nevertheless", dennoch: "nevertheless",
  deshalb: "therefore", deswegen: "therefore", außerdem: "besides", jedoch: "however",
  also: "so / therefore", sondern: "but rather", denn: "because / for",
  und: "and", oder: "or", aber: "but", damit: "so that", während: "while / whereas",
  sobald: "as soon as", seitdem: "since then", bisher: "so far", letztlich: "ultimately",
  zunehmend: "increasingly", häufig: "frequently", selten: "rarely", gerade: "just / precisely",

  // prepositions
  in: "in / into", an: "at / on", auf: "on / onto", mit: "with", für: "for",
  von: "from / of", zu: "to", bei: "at / with", nach: "after / to", aus: "out of / from",
  über: "over / about", unter: "under / among", vor: "before / in front of",
  hinter: "behind", neben: "next to", zwischen: "between", durch: "through",
  gegen: "against", ohne: "without", um: "around / at", seit: "since / for",
  bis: "until", wegen: "because of", trotz: "despite", statt: "instead of",
  zum: "to the", zur: "to the", im: "in the", am: "at the / on the", beim: "at the",
  vom: "from the", ins: "into the", ans: "to the",

  // common nouns
  tag: "day", jahr: "year", zeit: "time", mensch: "human / person", leute: "people",
  frau: "woman / Mrs", mann: "man", kind: "child", kinder: "children", stadt: "city",
  haus: "house", welt: "world", wasser: "water", leben: "life", arbeit: "work",
  hand: "hand", auge: "eye", wort: "word", wörter: "words", buch: "book",
  freund: "friend", freunde: "friends", familie: "family", land: "country",
  länder: "countries", weg: "way / path", wege: "ways", geld: "money",
  natur: "nature", ruhe: "calm / quiet", moment: "moment", sprache: "language",
  gesellschaft: "society", erfahrung: "experience", grund: "reason / ground",

  // adjectives
  groß: "big / large", klein: "small", neu: "new", alt: "old", jung: "young",
  lang: "long", kurz: "short", hoch: "high", schön: "beautiful / nice",
  schnell: "fast", langsam: "slow", einfach: "simple / easy", schwer: "hard / heavy",
  leicht: "easy / light", wichtig: "important", möglich: "possible", nötig: "necessary",
  ähnlich: "similar", verschieden: "different", echt: "real", voll: "full",
  leer: "empty", warm: "warm", kalt: "cold", laut: "loud", leise: "quiet",
  glücklich: "happy", traurig: "sad", müde: "tired", reich: "rich", arm: "poor",

  // numbers
  null: "zero", eins: "one", zwei: "two", drei: "three", vier: "four",
  fünf: "five", sechs: "six", sieben: "seven", acht: "eight", neun: "nine",
  zehn: "ten", hundert: "hundred", tausend: "thousand", erste: "first",
  zweite: "second", letzte: "last",
};
