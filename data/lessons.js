// The offline lesson archive. Multiple hand-written lessons per CEFR level.
// Each entry: { id, level, title, topic, text, translation, vocabulary[], grammar[] }.
// Add more lessons here any time — the app picks from them at random.

export const LESSONS = {
  A1: [
    {
      id: "a1-morgen",
      level: "A1",
      title: "Mein Morgen",
      topic: "a small everyday moment",
      text: "Ich heiße Lena. Jeden Morgen stehe ich um sieben Uhr auf. Ich trinke einen Kaffee und esse ein Brötchen. Dann fahre ich mit dem Fahrrad zur Arbeit. Die Arbeit beginnt um neun Uhr. Am Abend koche ich gern und lese ein Buch.",
      translation:
        "My name is Lena. Every morning I get up at seven o'clock. I drink a coffee and eat a roll. Then I ride my bike to work. Work begins at nine o'clock. In the evening I like to cook and read a book.",
      vocabulary: [
        { german: "aufstehen", english: "to get up", note: "separable: steht … auf" },
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
          examples: [{ german: "Ich stehe um sieben Uhr auf.", english: "I get up at seven." }],
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
    {
      id: "a1-familie",
      level: "A1",
      title: "Meine Familie",
      topic: "family",
      text: "Das ist meine Familie. Mein Vater heißt Thomas und meine Mutter heißt Sabine. Ich habe einen Bruder. Er ist zehn Jahre alt. Wir haben auch einen Hund. Der Hund ist klein und braun. Am Sonntag essen wir zusammen Mittag.",
      translation:
        "This is my family. My father is called Thomas and my mother is called Sabine. I have a brother. He is ten years old. We also have a dog. The dog is small and brown. On Sunday we eat lunch together.",
      vocabulary: [
        { german: "die Familie", english: "family", note: "" },
        { german: "der Vater", english: "father", note: "" },
        { german: "die Mutter", english: "mother", note: "" },
        { german: "der Bruder", english: "brother", note: "" },
        { german: "der Hund", english: "dog", note: "" },
        { german: "zusammen", english: "together", note: "" },
      ],
      grammar: [
        {
          point: "haben + accusative",
          explanation:
            "After haben the object is in the accusative. The masculine article ein becomes einen.",
          examples: [{ german: "Ich habe einen Bruder.", english: "I have a brother." }],
        },
        {
          point: "Possessive articles",
          explanation:
            "mein/meine (my) agree with the noun: mein Vater (m), meine Mutter (f).",
          examples: [{ german: "Mein Vater heißt Thomas.", english: "My father is called Thomas." }],
        },
        {
          point: "sein for descriptions",
          explanation: "Use sein (to be) to describe people and things.",
          examples: [{ german: "Der Hund ist klein und braun.", english: "The dog is small and brown." }],
        },
      ],
    },
    {
      id: "a1-supermarkt",
      level: "A1",
      title: "Im Supermarkt",
      topic: "everyday errands",
      text: "Ich gehe in den Supermarkt. Ich kaufe Brot, Milch und Äpfel. Die Äpfel sind rot und süß. An der Kasse bezahle ich mit Karte. Dann gehe ich nach Hause. Zu Hause mache ich einen Apfelkuchen.",
      translation:
        "I go to the supermarket. I buy bread, milk and apples. The apples are red and sweet. At the till I pay by card. Then I go home. At home I make an apple cake.",
      vocabulary: [
        { german: "der Supermarkt", english: "supermarket", note: "" },
        { german: "kaufen", english: "to buy", note: "" },
        { german: "die Milch", english: "milk", note: "" },
        { german: "der Apfel", english: "apple", note: "plural: die Äpfel" },
        { german: "die Kasse", english: "till / checkout", note: "" },
        { german: "bezahlen", english: "to pay", note: "" },
      ],
      grammar: [
        {
          point: "Accusative of motion",
          explanation:
            "With movement towards a place, two-way prepositions take the accusative: in den Supermarkt.",
          examples: [{ german: "Ich gehe in den Supermarkt.", english: "I go to the supermarket." }],
        },
        {
          point: "Plural nouns",
          explanation:
            "Many nouns change their vowel and add an ending in the plural: der Apfel → die Äpfel.",
          examples: [{ german: "Die Äpfel sind rot.", english: "The apples are red." }],
        },
        {
          point: "nach Hause / zu Hause",
          explanation:
            "nach Hause means '(to) home' (direction); zu Hause means 'at home' (location).",
          examples: [{ german: "Dann gehe ich nach Hause.", english: "Then I go home." }],
        },
      ],
    },
    {
      id: "a1-wetter",
      level: "A1",
      title: "Das Wetter heute",
      topic: "nature and seasons",
      text: "Heute ist das Wetter schön. Die Sonne scheint und der Himmel ist blau. Es ist warm. Viele Kinder spielen im Park. Manche Leute fahren Fahrrad. Am Nachmittag trinke ich einen Tee im Garten.",
      translation:
        "Today the weather is nice. The sun is shining and the sky is blue. It is warm. Many children are playing in the park. Some people are riding bikes. In the afternoon I drink a tea in the garden.",
      vocabulary: [
        { german: "das Wetter", english: "weather", note: "" },
        { german: "die Sonne", english: "sun", note: "" },
        { german: "scheinen", english: "to shine", note: "" },
        { german: "der Himmel", english: "sky", note: "" },
        { german: "spielen", english: "to play", note: "" },
        { german: "der Garten", english: "garden", note: "" },
      ],
      grammar: [
        {
          point: "Impersonal 'es ist'",
          explanation: "Weather and general states use es ist (it is) + adjective.",
          examples: [{ german: "Es ist warm.", english: "It is warm." }],
        },
        {
          point: "Location with 'im'",
          explanation: "in + dem = im for a location (no movement): im Park, im Garten.",
          examples: [{ german: "Viele Kinder spielen im Park.", english: "Many children play in the park." }],
        },
        {
          point: "Front position for time",
          explanation: "Starting with a time phrase keeps the verb in second place.",
          examples: [{ german: "Am Nachmittag trinke ich einen Tee.", english: "In the afternoon I drink a tea." }],
        },
      ],
    },
    {
      id: "a1-wohnung",
      level: "A1",
      title: "Meine Wohnung",
      topic: "home",
      text: "Ich wohne in einer kleinen Wohnung. Die Wohnung hat zwei Zimmer. Im Wohnzimmer steht ein Sofa. In der Küche koche ich gern. Das Bad ist klein, aber sauber. Ich finde meine Wohnung gemütlich.",
      translation:
        "I live in a small flat. The flat has two rooms. In the living room there is a sofa. In the kitchen I like to cook. The bathroom is small but clean. I find my flat cosy.",
      vocabulary: [
        { german: "die Wohnung", english: "flat / apartment", note: "" },
        { german: "das Zimmer", english: "room", note: "" },
        { german: "das Wohnzimmer", english: "living room", note: "" },
        { german: "die Küche", english: "kitchen", note: "" },
        { german: "das Bad", english: "bathroom", note: "" },
        { german: "gemütlich", english: "cosy", note: "" },
      ],
      grammar: [
        {
          point: "wohnen + in + dative",
          explanation: "Saying where you live uses the dative: in einer Wohnung.",
          examples: [{ german: "Ich wohne in einer kleinen Wohnung.", english: "I live in a small flat." }],
        },
        {
          point: "Dative for location",
          explanation: "im Wohnzimmer, in der Küche — no movement, so dative.",
          examples: [{ german: "In der Küche koche ich gern.", english: "In the kitchen I like to cook." }],
        },
        {
          point: "aber as a connector",
          explanation: "aber (but) joins two ideas without changing word order.",
          examples: [{ german: "Das Bad ist klein, aber sauber.", english: "The bathroom is small but clean." }],
        },
      ],
    },
    {
      id: "a1-schule",
      level: "A1",
      title: "Ein Tag in der Schule",
      topic: "school and learning",
      text: "Lukas ist acht Jahre alt. Jeden Tag geht er zur Schule. Der Unterricht beginnt um acht Uhr. In der Pause spielt er mit seinen Freunden. Nach der Schule macht er seine Hausaufgaben. Am liebsten mag er Mathe.",
      translation:
        "Lukas is eight years old. Every day he goes to school. Lessons begin at eight o'clock. During the break he plays with his friends. After school he does his homework. He likes maths best of all.",
      vocabulary: [
        { german: "die Schule", english: "school", note: "" },
        { german: "der Unterricht", english: "lessons / class", note: "" },
        { german: "die Pause", english: "break", note: "" },
        { german: "der Freund", english: "friend", note: "plural: die Freunde" },
        { german: "die Hausaufgaben", english: "homework", note: "usually plural" },
        { german: "am liebsten", english: "most of all / favourite", note: "" },
      ],
      grammar: [
        {
          point: "zu + der = zur",
          explanation: "The dative preposition zu contracts with die/der: zur Schule.",
          examples: [{ german: "Er geht zur Schule.", english: "He goes to school." }],
        },
        {
          point: "mögen (to like)",
          explanation: "mögen is irregular: ich mag, du magst, er mag.",
          examples: [{ german: "Am liebsten mag er Mathe.", english: "He likes maths best." }],
        },
        {
          point: "Possessive in the dative",
          explanation: "After mit (always dative), seinen Freunden takes dative plural endings.",
          examples: [{ german: "Er spielt mit seinen Freunden.", english: "He plays with his friends." }],
        },
      ],
    },
    {
      id: "a1-fussball",
      level: "A1",
      title: "Fußball in Deutschland",
      topic: "sports",
      text: "Fußball ist in Deutschland sehr beliebt. Viele Menschen spielen Fußball. Am Wochenende gehen sie ins Stadion. Die Spieler tragen bunte Trikots. Die Fans singen laut. Manchmal gewinnt die Mannschaft, manchmal verliert sie.",
      translation:
        "Football is very popular in Germany. Many people play football. At the weekend they go to the stadium. The players wear colourful jerseys. The fans sing loudly. Sometimes the team wins, sometimes it loses.",
      vocabulary: [
        { german: "beliebt", english: "popular", note: "" },
        { german: "das Stadion", english: "stadium", note: "" },
        { german: "der Spieler", english: "player", note: "plural: die Spieler" },
        { german: "das Trikot", english: "jersey / shirt", note: "" },
        { german: "die Mannschaft", english: "team", note: "" },
        { german: "gewinnen", english: "to win", note: "opposite: verlieren" },
      ],
      grammar: [
        {
          point: "Present tense",
          explanation: "Simple statements of fact use the present tense.",
          examples: [{ german: "Viele Menschen spielen Fußball.", english: "Many people play football." }],
        },
        {
          point: "Time phrase first",
          explanation: "When a time phrase opens the sentence, the verb stays in second place.",
          examples: [{ german: "Am Wochenende gehen sie ins Stadion.", english: "At the weekend they go to the stadium." }],
        },
        {
          point: "Plural nouns",
          explanation: "Some nouns keep the same form in the plural: der Spieler → die Spieler.",
          examples: [{ german: "Die Spieler tragen bunte Trikots.", english: "The players wear colourful jerseys." }],
        },
      ],
    },
    {
      id: "a1-mauer",
      level: "A1",
      title: "Die Berliner Mauer",
      topic: "history",
      text: "Die Berliner Mauer ist heute berühmt. Viele Touristen kommen nach Berlin. Sie machen Fotos von der Mauer. Früher war die Stadt geteilt. Die Mauer war lang und grau. Heute ist Berlin frei und bunt.",
      translation:
        "The Berlin Wall is famous today. Many tourists come to Berlin. They take photos of the wall. In the past the city was divided. The wall was long and grey. Today Berlin is free and colourful.",
      vocabulary: [
        { german: "berühmt", english: "famous", note: "" },
        { german: "der Tourist", english: "tourist", note: "plural: die Touristen" },
        { german: "die Mauer", english: "wall", note: "" },
        { german: "geteilt", english: "divided", note: "" },
        { german: "grau", english: "grey", note: "" },
        { german: "frei", english: "free", note: "" },
      ],
      grammar: [
        {
          point: "war (simple past of sein)",
          explanation: "To talk about the past, A1 often just uses war (was) and waren (were).",
          examples: [{ german: "Früher war die Stadt geteilt.", english: "In the past the city was divided." }],
        },
        {
          point: "Früher … / Heute …",
          explanation: "Contrasting then and now; the verb follows the time word.",
          examples: [{ german: "Heute ist Berlin frei.", english: "Today Berlin is free." }],
        },
        {
          point: "von + dative",
          explanation: "von always takes the dative: von der Mauer.",
          examples: [{ german: "Sie machen Fotos von der Mauer.", english: "They take photos of the wall." }],
        },
      ],
    },
    {
      id: "a1-grimm",
      level: "A1",
      title: "Die Brüder Grimm",
      topic: "literature",
      text: "Die Brüder Grimm sind sehr berühmt. Sie sammeln alte Märchen. Viele Kinder kennen ihre Geschichten. „Hänsel und Gretel“ ist ein Märchen. „Schneewittchen“ ist auch von den Brüdern Grimm. Heute lesen Eltern die Märchen ihren Kindern vor.",
      translation:
        "The Brothers Grimm are very famous. They collect old fairy tales. Many children know their stories. 'Hansel and Gretel' is a fairy tale. 'Snow White' is also by the Brothers Grimm. Today parents read the fairy tales to their children.",
      vocabulary: [
        { german: "das Märchen", english: "fairy tale", note: "plural: die Märchen" },
        { german: "sammeln", english: "to collect", note: "" },
        { german: "die Geschichte", english: "story", note: "" },
        { german: "kennen", english: "to know (be familiar with)", note: "" },
        { german: "vorlesen", english: "to read aloud", note: "separable: liest … vor" },
        { german: "die Eltern", english: "parents", note: "always plural" },
      ],
      grammar: [
        {
          point: "Separable verb: vorlesen",
          explanation: "The prefix vor- moves to the end of the clause.",
          examples: [{ german: "Eltern lesen die Märchen vor.", english: "Parents read the fairy tales aloud." }],
        },
        {
          point: "Possessive: ihre",
          explanation: "ihre means 'their' (and 'her'); it agrees with the noun.",
          examples: [{ german: "Kinder kennen ihre Geschichten.", english: "Children know their stories." }],
        },
        {
          point: "von + dative (plural)",
          explanation: "von den Brüdern Grimm — plural nouns add -n in the dative.",
          examples: [{ german: "„Schneewittchen“ ist von den Brüdern Grimm.", english: "'Snow White' is by the Brothers Grimm." }],
        },
      ],
    },
    {
      id: "a1-beethoven",
      level: "A1",
      title: "Ludwig van Beethoven",
      topic: "music",
      text: "Ludwig van Beethoven ist ein berühmter Komponist. Er kommt aus Bonn. Seine Musik ist sehr schön. Viele Menschen hören seine Musik gern. Beethoven kann später nicht mehr gut hören. Trotzdem schreibt er wunderbare Musik.",
      translation:
        "Ludwig van Beethoven is a famous composer. He comes from Bonn. His music is very beautiful. Many people like to listen to his music. Later, Beethoven can no longer hear well. Nevertheless he writes wonderful music.",
      vocabulary: [
        { german: "der Komponist", english: "composer", note: "" },
        { german: "die Musik", english: "music", note: "" },
        { german: "hören", english: "to hear / listen", note: "" },
        { german: "schön", english: "beautiful", note: "" },
        { german: "schreiben", english: "to write", note: "" },
        { german: "wunderbar", english: "wonderful", note: "" },
      ],
      grammar: [
        {
          point: "kommen aus (origin)",
          explanation: "To say where someone is from: kommen aus + place.",
          examples: [{ german: "Er kommt aus Bonn.", english: "He comes from Bonn." }],
        },
        {
          point: "Modal verb: können",
          explanation: "können (can) sends the main verb to the end as an infinitive.",
          examples: [{ german: "Beethoven kann nicht mehr gut hören.", english: "Beethoven can no longer hear well." }],
        },
        {
          point: "gern (to like doing)",
          explanation: "gern after a verb means you enjoy the action.",
          examples: [{ german: "Menschen hören seine Musik gern.", english: "People like listening to his music." }],
        },
      ],
    },
    {
      id: "a1-einstein",
      level: "A1",
      title: "Albert Einstein",
      topic: "science",
      text: "Albert Einstein ist ein berühmter Wissenschaftler. Er kommt aus Deutschland. Einstein denkt viel über Zeit und Raum nach. Seine Ideen sind sehr wichtig. Viele Menschen finden Physik schwer. Aber Einstein liebt die Physik.",
      translation:
        "Albert Einstein is a famous scientist. He comes from Germany. Einstein thinks a lot about time and space. His ideas are very important. Many people find physics difficult. But Einstein loves physics.",
      vocabulary: [
        { german: "der Wissenschaftler", english: "scientist", note: "" },
        { german: "nachdenken", english: "to think (about)", note: "separable; über + acc." },
        { german: "die Idee", english: "idea", note: "plural: die Ideen" },
        { german: "wichtig", english: "important", note: "" },
        { german: "die Physik", english: "physics", note: "" },
        { german: "schwer", english: "difficult / hard", note: "" },
      ],
      grammar: [
        {
          point: "Separable verb: nachdenken",
          explanation: "nach- goes to the end: er denkt … nach.",
          examples: [{ german: "Einstein denkt über Zeit nach.", english: "Einstein thinks about time." }],
        },
        {
          point: "finden + adjective",
          explanation: "finden expresses an opinion: etwas schwer finden = to find something hard.",
          examples: [{ german: "Viele finden Physik schwer.", english: "Many find physics hard." }],
        },
        {
          point: "aber (but)",
          explanation: "aber joins two ideas and does not change the word order.",
          examples: [{ german: "Aber Einstein liebt die Physik.", english: "But Einstein loves physics." }],
        },
      ],
    },
    {
      id: "a1-alpen",
      level: "A1",
      title: "Die Alpen",
      topic: "geography and nature",
      text: "Die Alpen sind hohe Berge in Europa. Sie liegen im Süden von Deutschland. Im Winter liegt viel Schnee auf den Bergen. Viele Menschen fahren dort Ski. Im Sommer wandern sie gern. Die Luft in den Bergen ist frisch und klar.",
      translation:
        "The Alps are high mountains in Europe. They lie in the south of Germany. In winter there is a lot of snow on the mountains. Many people ski there. In summer they like to hike. The air in the mountains is fresh and clear.",
      vocabulary: [
        { german: "der Berg", english: "mountain", note: "plural: die Berge" },
        { german: "der Schnee", english: "snow", note: "" },
        { german: "Ski fahren", english: "to ski", note: "" },
        { german: "wandern", english: "to hike", note: "" },
        { german: "die Luft", english: "air", note: "" },
        { german: "frisch", english: "fresh", note: "" },
      ],
      grammar: [
        {
          point: "Location with in + dative",
          explanation: "No movement → dative: in den Bergen, im Süden.",
          examples: [{ german: "Die Luft in den Bergen ist frisch.", english: "The air in the mountains is fresh." }],
        },
        {
          point: "Im Winter / Im Sommer",
          explanation: "Seasons start the sentence; the verb stays second.",
          examples: [{ german: "Im Sommer wandern sie gern.", english: "In summer they like to hike." }],
        },
        {
          point: "Plural: hohe Berge",
          explanation: "Adjectives before plural nouns take -e: hohe Berge.",
          examples: [{ german: "Die Alpen sind hohe Berge.", english: "The Alps are high mountains." }],
        },
      ],
    },
    {
      id: "a1-brot",
      level: "A1",
      title: "Das deutsche Brot",
      topic: "food and culture",
      text: "In Deutschland gibt es sehr viel Brot. Es gibt mehr als dreihundert Sorten. Die Menschen kaufen Brot beim Bäcker. Am Morgen essen viele Leute Brot mit Marmelade. Das Brot ist frisch und lecker. Viele Touristen mögen das deutsche Brot.",
      translation:
        "In Germany there is a lot of bread. There are more than three hundred kinds. People buy bread at the baker's. In the morning many people eat bread with jam. The bread is fresh and tasty. Many tourists like German bread.",
      vocabulary: [
        { german: "das Brot", english: "bread", note: "" },
        { german: "die Sorte", english: "kind / type", note: "plural: die Sorten" },
        { german: "der Bäcker", english: "baker", note: "beim Bäcker = at the baker's" },
        { german: "die Marmelade", english: "jam", note: "" },
        { german: "lecker", english: "tasty", note: "" },
        { german: "mögen", english: "to like", note: "ich mag, sie mögen" },
      ],
      grammar: [
        {
          point: "es gibt + accusative",
          explanation: "es gibt means 'there is/are' and is followed by the accusative.",
          examples: [{ german: "Es gibt sehr viel Brot.", english: "There is a lot of bread." }],
        },
        {
          point: "beim (bei + dem)",
          explanation: "bei dem contracts to beim: beim Bäcker.",
          examples: [{ german: "Die Menschen kaufen Brot beim Bäcker.", english: "People buy bread at the baker's." }],
        },
        {
          point: "mögen (to like)",
          explanation: "mögen is a modal-type verb used to say what you like.",
          examples: [{ german: "Touristen mögen das deutsche Brot.", english: "Tourists like German bread." }],
        },
      ],
    },
    {
      id: "a1-bienen",
      level: "A1",
      title: "Die Bienen",
      topic: "nature",
      text: "Bienen sind kleine Tiere. Sie fliegen von Blume zu Blume. Bienen machen Honig. Der Honig ist süß und gesund. Bienen sind sehr wichtig für die Natur. Ohne Bienen gibt es weniger Obst.",
      translation:
        "Bees are small animals. They fly from flower to flower. Bees make honey. Honey is sweet and healthy. Bees are very important for nature. Without bees there is less fruit.",
      vocabulary: [
        { german: "die Biene", english: "bee", note: "plural: die Bienen" },
        { german: "das Tier", english: "animal", note: "plural: die Tiere" },
        { german: "die Blume", english: "flower", note: "" },
        { german: "der Honig", english: "honey", note: "" },
        { german: "süß", english: "sweet", note: "" },
        { german: "das Obst", english: "fruit", note: "" },
      ],
      grammar: [
        {
          point: "Plural nouns and verbs",
          explanation: "Plural subjects take the -en/-(e)n verb ending: Bienen sind, sie fliegen.",
          examples: [{ german: "Bienen sind kleine Tiere.", english: "Bees are small animals." }],
        },
        {
          point: "von … zu (dative)",
          explanation: "Both von and zu take the dative: von Blume zu Blume.",
          examples: [{ german: "Sie fliegen von Blume zu Blume.", english: "They fly from flower to flower." }],
        },
        {
          point: "ohne + accusative",
          explanation: "ohne (without) takes the accusative case.",
          examples: [{ german: "Ohne Bienen gibt es weniger Obst.", english: "Without bees there is less fruit." }],
        },
      ],
    },
    {
      id: "a1-goethe",
      level: "A1",
      title: "Johann Wolfgang von Goethe",
      topic: "literature",
      text: "Johann Wolfgang von Goethe ist ein berühmter Dichter. Er kommt aus Frankfurt. Goethe schreibt Gedichte und Romane. Sein Buch „Faust“ ist sehr bekannt. Viele Schüler lesen seine Werke in der Schule. Goethe lebt auch lange in Weimar.",
      translation:
        "Johann Wolfgang von Goethe is a famous poet. He comes from Frankfurt. Goethe writes poems and novels. His book 'Faust' is very well known. Many pupils read his works at school. Goethe also lives in Weimar for a long time.",
      vocabulary: [
        { german: "der Dichter", english: "poet", note: "" },
        { german: "das Gedicht", english: "poem", note: "plural: die Gedichte" },
        { german: "der Roman", english: "novel", note: "" },
        { german: "bekannt", english: "well known", note: "" },
        { german: "der Schüler", english: "pupil", note: "plural: die Schüler" },
        { german: "das Werk", english: "work (of art)", note: "plural: die Werke" },
      ],
      grammar: [
        {
          point: "Plural objects",
          explanation: "Goethe schreibt Gedichte und Romane — plural nouns as objects.",
          examples: [{ german: "Goethe schreibt Gedichte und Romane.", english: "Goethe writes poems and novels." }],
        },
        {
          point: "Possessive: sein",
          explanation: "sein means 'his': sein Buch, seine Werke.",
          examples: [{ german: "Sein Buch ist bekannt.", english: "His book is well known." }],
        },
        {
          point: "in der Schule (dative)",
          explanation: "Location 'at school' uses in + dative: in der Schule.",
          examples: [{ german: "Schüler lesen in der Schule.", english: "Pupils read at school." }],
        },
      ],
    },
    {
      id: "a1-oktoberfest",
      level: "A1",
      title: "Das Oktoberfest",
      topic: "culture and festivals",
      text: "Das Oktoberfest ist ein großes Fest in München. Es ist das größte Volksfest der Welt. Millionen Menschen kommen jedes Jahr. Sie tragen Lederhosen und Dirndl. Auf dem Fest gibt es Musik, Bier und Brezeln. Alle Leute tanzen und lachen zusammen.",
      translation:
        "The Oktoberfest is a big festival in Munich. It is the largest folk festival in the world. Millions of people come every year. They wear Lederhosen and Dirndl. At the festival there is music, beer and pretzels. Everyone dances and laughs together.",
      vocabulary: [
        { german: "das Fest", english: "festival / party", note: "" },
        { german: "das Volksfest", english: "folk festival", note: "" },
        { german: "tragen", english: "to wear / carry", note: "" },
        { german: "das Bier", english: "beer", note: "" },
        { german: "die Brezel", english: "pretzel", note: "plural: die Brezeln" },
        { german: "tanzen", english: "to dance", note: "" },
      ],
      grammar: [
        {
          point: "Superlative: das größte",
          explanation: "The 'most' form before a noun adds -ste: das größte Volksfest.",
          examples: [{ german: "Es ist das größte Volksfest.", english: "It is the largest folk festival." }],
        },
        {
          point: "es gibt + accusative",
          explanation: "Listing what's there: Es gibt Musik, Bier und Brezeln.",
          examples: [{ german: "Auf dem Fest gibt es Bier.", english: "At the festival there is beer." }],
        },
        {
          point: "Location: auf dem Fest",
          explanation: "auf + dative for location: auf dem Fest.",
          examples: [{ german: "Auf dem Fest gibt es Musik.", english: "At the festival there is music." }],
        },
      ],
    },
  ],

  A2: [
    {
      id: "a2-hamburg",
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
          explanation: "Modal verbs are usually used in the simple past: wollen → wollten.",
          examples: [{ german: "Wir wollten ins Museum gehen.", english: "We wanted to go to the museum." }],
        },
        {
          point: "Connector: deshalb",
          explanation: "deshalb (therefore) pushes the verb to second position: deshalb + verb + subject.",
          examples: [{ german: "Deshalb sind wir an den Hafen gegangen.", english: "So we went to the harbour." }],
        },
      ],
    },
    {
      id: "a2-reise-allein",
      level: "A2",
      title: "Meine erste Reise allein",
      topic: "a short journey",
      text: "Mit sechzehn bin ich zum ersten Mal allein gereist. Ich habe den Zug nach München genommen. Dort habe ich bei meiner Tante gewohnt. Wir haben jeden Tag etwas unternommen. Am schönsten war der Besuch im Englischen Garten. Ich möchte bald wieder dorthin fahren.",
      translation:
        "At sixteen I travelled alone for the first time. I took the train to Munich. There I stayed with my aunt. We did something every day. The nicest part was the visit to the English Garden. I would like to go there again soon.",
      vocabulary: [
        { german: "reisen", english: "to travel", note: "Perfekt with sein" },
        { german: "der Zug", english: "train", note: "" },
        { german: "die Tante", english: "aunt", note: "" },
        { german: "unternehmen", english: "to do / undertake", note: "etwas unternehmen" },
        { german: "der Besuch", english: "visit", note: "" },
        { german: "dorthin", english: "(to) there", note: "direction" },
      ],
      grammar: [
        {
          point: "Perfekt with irregular participles",
          explanation: "Strong verbs change their stem: nehmen → genommen, unternehmen → unternommen.",
          examples: [{ german: "Ich habe den Zug genommen.", english: "I took the train." }],
        },
        {
          point: "Superlative: am schönsten",
          explanation: "The 'most' form of an adjective used predicatively: am + -sten.",
          examples: [{ german: "Am schönsten war der Besuch.", english: "The nicest thing was the visit." }],
        },
        {
          point: "bei + dative",
          explanation: "Staying 'at someone's place' uses bei + dative: bei meiner Tante.",
          examples: [{ german: "Ich habe bei meiner Tante gewohnt.", english: "I stayed with my aunt." }],
        },
      ],
    },
    {
      id: "a2-fahrrad",
      level: "A2",
      title: "Ein Problem mit dem Fahrrad",
      topic: "an everyday mishap",
      text: "Gestern wollte ich mit dem Fahrrad zur Arbeit fahren. Aber das Fahrrad war kaputt. Deshalb musste ich den Bus nehmen. Der Bus war voll und ich bin zu spät gekommen. Mein Chef war nicht böse. Heute habe ich das Fahrrad repariert.",
      translation:
        "Yesterday I wanted to ride my bike to work. But the bike was broken. So I had to take the bus. The bus was full and I arrived too late. My boss was not angry. Today I repaired the bike.",
      vocabulary: [
        { german: "kaputt", english: "broken", note: "" },
        { german: "der Bus", english: "bus", note: "" },
        { german: "der Chef", english: "boss", note: "" },
        { german: "böse", english: "angry / cross", note: "" },
        { german: "reparieren", english: "to repair", note: "" },
        { german: "zu spät", english: "too late", note: "" },
      ],
      grammar: [
        {
          point: "Modals in the simple past",
          explanation: "wollen → wollte, müssen → musste are the usual past forms.",
          examples: [{ german: "Deshalb musste ich den Bus nehmen.", english: "So I had to take the bus." }],
        },
        {
          point: "Perfekt with sein (movement)",
          explanation: "kommen forms its Perfekt with sein: ich bin gekommen.",
          examples: [{ german: "Ich bin zu spät gekommen.", english: "I arrived too late." }],
        },
        {
          point: "Negation with nicht",
          explanation: "nicht negates the verb or an adjective and usually comes after the verb.",
          examples: [{ german: "Mein Chef war nicht böse.", english: "My boss was not angry." }],
        },
      ],
    },
    {
      id: "a2-gesund",
      level: "A2",
      title: "Gesund leben",
      topic: "health and habits",
      text: "Seit einem Jahr lebe ich gesünder. Ich esse mehr Gemüse als früher. Außerdem trinke ich weniger Kaffee. Dreimal pro Woche gehe ich joggen, weil das gut für den Körper ist. Am Anfang war es schwer, aber jetzt macht es mir Spaß.",
      translation:
        "For a year I have been living more healthily. I eat more vegetables than before. I also drink less coffee. Three times a week I go jogging, because it is good for the body. At the start it was hard, but now I enjoy it.",
      vocabulary: [
        { german: "gesund", english: "healthy", note: "comparative: gesünder" },
        { german: "das Gemüse", english: "vegetables", note: "" },
        { german: "joggen", english: "to jog", note: "" },
        { german: "der Körper", english: "body", note: "" },
        { german: "schwer", english: "hard / difficult", note: "also: heavy" },
        { german: "außerdem", english: "besides / also", note: "" },
      ],
      grammar: [
        {
          point: "Comparatives",
          explanation: "Add -er and use als for 'than': gesünder als, mehr … als, weniger.",
          examples: [{ german: "Ich esse mehr Gemüse als früher.", english: "I eat more vegetables than before." }],
        },
        {
          point: "weil-clause",
          explanation: "weil (because) sends the conjugated verb to the end of the clause.",
          examples: [{ german: "…, weil das gut für den Körper ist.", english: "…, because it is good for the body." }],
        },
        {
          point: "seit + dative",
          explanation: "seit expresses 'for/since' a period and takes the dative: seit einem Jahr.",
          examples: [{ german: "Seit einem Jahr lebe ich gesünder.", english: "For a year I've lived more healthily." }],
        },
      ],
    },
    {
      id: "a2-restaurant",
      level: "A2",
      title: "Im Restaurant",
      topic: "food and culture",
      text: "Letzten Freitag sind wir essen gegangen. Wir haben einen Tisch am Fenster bekommen. Ich habe eine Suppe und einen Salat bestellt. Mein Freund wollte unbedingt Pizza. Das Essen hat sehr gut geschmeckt. Am Ende haben wir dem Kellner ein Trinkgeld gegeben.",
      translation:
        "Last Friday we went out to eat. We got a table by the window. I ordered a soup and a salad. My friend absolutely wanted pizza. The food tasted very good. In the end we gave the waiter a tip.",
      vocabulary: [
        { german: "der Tisch", english: "table", note: "" },
        { german: "bestellen", english: "to order", note: "" },
        { german: "der Salat", english: "salad", note: "" },
        { german: "schmecken", english: "to taste", note: "" },
        { german: "der Kellner", english: "waiter", note: "" },
        { german: "das Trinkgeld", english: "tip", note: "" },
      ],
      grammar: [
        {
          point: "Perfekt practice",
          explanation: "Note sein vs haben: sind … gegangen, but haben … bekommen/bestellt/gegeben.",
          examples: [{ german: "Wir sind essen gegangen.", english: "We went out to eat." }],
        },
        {
          point: "Dative object",
          explanation: "The person who receives something stands in the dative: dem Kellner.",
          examples: [{ german: "Wir haben dem Kellner ein Trinkgeld gegeben.", english: "We gave the waiter a tip." }],
        },
        {
          point: "Word order with two objects",
          explanation: "Usually dative (person) comes before accusative (thing): dem Kellner ein Trinkgeld.",
          examples: [{ german: "Ich habe eine Suppe bestellt.", english: "I ordered a soup." }],
        },
      ],
    },
    {
      id: "a2-umzug",
      level: "A2",
      title: "Umzug in eine neue Stadt",
      topic: "city life",
      text: "Vor zwei Monaten bin ich in eine neue Stadt gezogen. Am Anfang kannte ich niemanden. Deshalb bin ich einem Sportverein beigetreten. Dort habe ich schnell neue Leute kennengelernt. Die Stadt gefällt mir besser als meine alte Heimat. Trotzdem vermisse ich manchmal meine Familie.",
      translation:
        "Two months ago I moved to a new city. At first I didn't know anyone. So I joined a sports club. There I quickly got to know new people. I like the city better than my old home. Nevertheless I sometimes miss my family.",
      vocabulary: [
        { german: "der Umzug", english: "move (house)", note: "ziehen → gezogen" },
        { german: "der Sportverein", english: "sports club", note: "" },
        { german: "kennenlernen", english: "to get to know", note: "separable" },
        { german: "gefallen", english: "to please / to like", note: "es gefällt mir" },
        { german: "die Heimat", english: "home / homeland", note: "" },
        { german: "vermissen", english: "to miss", note: "" },
      ],
      grammar: [
        {
          point: "Verbs with the dative",
          explanation: "beitreten and gefallen take a dative object: einem Verein, mir.",
          examples: [{ german: "Ich bin einem Sportverein beigetreten.", english: "I joined a sports club." }],
        },
        {
          point: "gefallen vs mögen",
          explanation: "gefallen flips the subject: the thing pleases me — es gefällt mir.",
          examples: [{ german: "Die Stadt gefällt mir besser.", english: "I like the city better." }],
        },
        {
          point: "trotzdem",
          explanation: "trotzdem (nevertheless) starts a main clause and is followed by the verb.",
          examples: [{ german: "Trotzdem vermisse ich meine Familie.", english: "Nevertheless I miss my family." }],
        },
      ],
    },
  ],

  B1: [
    {
      id: "b1-neues",
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
        { german: "zum Nachdenken bringen", english: "to make (someone) think", note: "fixed phrase" },
        { german: "fehlen", english: "to be lacking", note: "takes the dative" },
      ],
      grammar: [
        {
          point: "Konjunktiv II (hypothetical)",
          explanation: "Used for unreal conditions and politeness: hätte (would have), würde + infinitive.",
          examples: [{ german: "Wenn ich mehr Zeit hätte, würde ich …", english: "If I had more time, I would …" }],
        },
        {
          point: "dass-clauses",
          explanation: "In a subordinate clause with dass, the conjugated verb goes to the very end.",
          examples: [{ german: "Ich glaube, dass man etwas lernen kann.", english: "I believe one can learn something." }],
        },
        {
          point: "Relative clauses",
          explanation: "A relative pronoun (der/die/das) describes a noun; the verb again goes to the end.",
          examples: [{ german: "ein Artikel, der mich zum Nachdenken gebracht hat", english: "an article that made me think" }],
        },
      ],
    },
    {
      id: "b1-warten",
      level: "B1",
      title: "Die Kunst des Wartens",
      topic: "patience and habits",
      text: "Wenn ich ehrlich bin, kann ich nicht gut warten. Sobald ich an einer Kasse stehe, werde ich ungeduldig. Ein Freund hat mir gesagt, dass Geduld eine Fähigkeit ist, die man üben kann. Seitdem versuche ich, ruhig zu bleiben. An manchen Tagen gelingt es mir, an anderen nicht.",
      translation:
        "If I'm honest, I'm not good at waiting. As soon as I stand at a checkout, I get impatient. A friend told me that patience is a skill one can practise. Since then I try to stay calm. On some days I manage it, on others not.",
      vocabulary: [
        { german: "ehrlich", english: "honest", note: "" },
        { german: "ungeduldig", english: "impatient", note: "opposite: geduldig" },
        { german: "die Geduld", english: "patience", note: "" },
        { german: "die Fähigkeit", english: "skill / ability", note: "" },
        { german: "gelingen", english: "to succeed / to manage", note: "es gelingt mir" },
        { german: "üben", english: "to practise", note: "" },
      ],
      grammar: [
        {
          point: "sobald (as soon as)",
          explanation: "sobald introduces a time clause; the verb goes to the end.",
          examples: [{ german: "Sobald ich an der Kasse stehe, …", english: "As soon as I stand at the checkout, …" }],
        },
        {
          point: "Relative clause inside a statement",
          explanation: "die man üben kann describes Fähigkeit; the verb closes the clause.",
          examples: [{ german: "eine Fähigkeit, die man üben kann", english: "a skill one can practise" }],
        },
        {
          point: "Infinitive with zu",
          explanation: "After versuchen, use zu + infinitive: versuchen, ruhig zu bleiben.",
          examples: [{ german: "Ich versuche, ruhig zu bleiben.", english: "I try to stay calm." }],
        },
      ],
    },
    {
      id: "b1-reich",
      level: "B1",
      title: "Wenn ich reich wäre",
      topic: "wishes and values",
      text: "Wenn ich reich wäre, würde ich um die Welt reisen. Ich würde Länder besuchen, von denen ich bisher nur geträumt habe. Trotzdem glaube ich, dass Geld allein nicht glücklich macht. Wichtiger sind Freunde, denen man vertrauen kann. Geld kann vieles kaufen, aber keine echte Freundschaft.",
      translation:
        "If I were rich, I would travel around the world. I would visit countries I have only dreamed of so far. Nevertheless I believe that money alone doesn't make you happy. More important are friends you can trust. Money can buy many things, but no real friendship.",
      vocabulary: [
        { german: "reich", english: "rich", note: "" },
        { german: "träumen", english: "to dream", note: "träumen von" },
        { german: "glücklich", english: "happy", note: "" },
        { german: "vertrauen", english: "to trust", note: "takes the dative" },
        { german: "echt", english: "real / genuine", note: "" },
        { german: "die Freundschaft", english: "friendship", note: "" },
      ],
      grammar: [
        {
          point: "Konjunktiv II conditions",
          explanation: "wäre + würde build an unreal 'if … then' sentence.",
          examples: [{ german: "Wenn ich reich wäre, würde ich reisen.", english: "If I were rich, I would travel." }],
        },
        {
          point: "Relative pronouns with prepositions",
          explanation: "The preposition stays with the pronoun: von denen, denen man vertrauen kann.",
          examples: [{ german: "Freunde, denen man vertrauen kann", english: "friends you can trust" }],
        },
        {
          point: "kein vs nicht",
          explanation: "Use kein to negate a noun: keine echte Freundschaft.",
          examples: [{ german: "… aber keine echte Freundschaft.", english: "… but no real friendship." }],
        },
      ],
    },
    {
      id: "b1-missverstaendnis",
      level: "B1",
      title: "Ein Missverständnis",
      topic: "everyday relationships",
      text: "Letzte Woche gab es ein Missverständnis mit meiner Kollegin. Sie dachte, dass ich ihre E-Mail ignoriert hätte. In Wirklichkeit war die Nachricht im Spam-Ordner gelandet. Als ich ihr das erklärte, war sie erleichtert. Seitdem achten wir beide besser darauf, wichtige Mails zu markieren.",
      translation:
        "Last week there was a misunderstanding with my colleague. She thought I had ignored her email. In reality the message had landed in the spam folder. When I explained that to her, she was relieved. Since then we both pay closer attention to marking important emails.",
      vocabulary: [
        { german: "das Missverständnis", english: "misunderstanding", note: "" },
        { german: "die Kollegin", english: "colleague (f.)", note: "" },
        { german: "ignorieren", english: "to ignore", note: "" },
        { german: "die Nachricht", english: "message", note: "" },
        { german: "erleichtert", english: "relieved", note: "" },
        { german: "achten auf", english: "to pay attention to", note: "+ accusative" },
      ],
      grammar: [
        {
          point: "Reported thought with Konjunktiv",
          explanation: "ignoriert hätte reports what she wrongly believed.",
          examples: [{ german: "Sie dachte, dass ich … ignoriert hätte.", english: "She thought I had ignored …" }],
        },
        {
          point: "als for a single past event",
          explanation: "Use als (not wenn) for one specific past moment.",
          examples: [{ german: "Als ich ihr das erklärte, …", english: "When I explained that to her, …" }],
        },
        {
          point: "Plusquamperfekt",
          explanation: "war … gelandet (had landed) describes an event before another past event.",
          examples: [{ german: "Die Nachricht war im Spam-Ordner gelandet.", english: "The message had landed in spam." }],
        },
      ],
    },
    {
      id: "b1-stille",
      level: "B1",
      title: "Der Wert der Stille",
      topic: "modern life",
      text: "In unserer lauten Welt wird die Stille immer wertvoller. Viele Menschen, die in großen Städten leben, sehnen sich nach Ruhe. Wenn man einen Moment innehält, merkt man oft, wie gestresst man ist. Experten empfehlen, dass man sich jeden Tag eine kurze Pause gönnt. Die Natur ist dafür der beste Ort.",
      translation:
        "In our noisy world, silence is becoming ever more valuable. Many people who live in big cities long for quiet. When you pause for a moment, you often notice how stressed you are. Experts recommend that you treat yourself to a short break every day. Nature is the best place for that.",
      vocabulary: [
        { german: "die Stille", english: "silence", note: "" },
        { german: "wertvoll", english: "valuable", note: "comparative: wertvoller" },
        { german: "sich sehnen nach", english: "to long for", note: "" },
        { german: "innehalten", english: "to pause", note: "separable" },
        { german: "gestresst", english: "stressed", note: "" },
        { german: "gönnen", english: "to allow / treat oneself", note: "" },
      ],
      grammar: [
        {
          point: "Relative clause as subject",
          explanation: "die in großen Städten leben describes Menschen.",
          examples: [{ german: "Menschen, die in Städten leben", english: "people who live in cities" }],
        },
        {
          point: "wenn for general conditions",
          explanation: "wenn = 'when(ever)' for things that are generally true.",
          examples: [{ german: "Wenn man innehält, merkt man …", english: "When you pause, you notice …" }],
        },
        {
          point: "Comparative & superlative",
          explanation: "wertvoller (more valuable), der beste (the best).",
          examples: [{ german: "Die Stille wird immer wertvoller.", english: "Silence becomes ever more valuable." }],
        },
      ],
    },
    {
      id: "b1-foto",
      level: "B1",
      title: "Ein altes Foto",
      topic: "memory and family",
      text: "Neulich habe ich ein altes Foto meiner Großeltern gefunden. Auf dem Bild sind sie jung und lachen in die Kamera. Meine Großmutter hat mir erzählt, dass sie sich auf einem Dorffest kennengelernt haben. Obwohl das Foto schon vergilbt ist, bedeutet es mir viel. Es erinnert mich daran, woher meine Familie kommt.",
      translation:
        "Recently I found an old photo of my grandparents. In the picture they are young and laughing into the camera. My grandmother told me that they got to know each other at a village festival. Although the photo has already yellowed, it means a lot to me. It reminds me of where my family comes from.",
      vocabulary: [
        { german: "das Foto", english: "photo", note: "" },
        { german: "die Großeltern", english: "grandparents", note: "" },
        { german: "das Dorffest", english: "village festival", note: "" },
        { german: "vergilbt", english: "yellowed (with age)", note: "" },
        { german: "bedeuten", english: "to mean", note: "es bedeutet mir viel" },
        { german: "erinnern an", english: "to remind of", note: "+ accusative" },
      ],
      grammar: [
        {
          point: "Genitive case",
          explanation: "Possession: ein Foto meiner Großeltern (of my grandparents).",
          examples: [{ german: "ein altes Foto meiner Großeltern", english: "an old photo of my grandparents" }],
        },
        {
          point: "obwohl (although)",
          explanation: "obwohl introduces a contrast clause; the verb goes to the end.",
          examples: [{ german: "Obwohl das Foto vergilbt ist, …", english: "Although the photo is yellowed, …" }],
        },
        {
          point: "Indirect question with woher",
          explanation: "woher … kommt is an embedded question; the verb closes the clause.",
          examples: [{ german: "… woher meine Familie kommt.", english: "… where my family comes from." }],
        },
      ],
    },
  ],

  B2: [
    {
      id: "b2-digital",
      level: "B2",
      title: "Digitalisierung mit zwei Gesichtern",
      topic: "technology and daily life",
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
          explanation: "werden + past participle expresses a process done to the subject.",
          examples: [
            { german: "Sie wird kritisch betrachtet.", english: "It is viewed critically." },
            { german: "Es wird befürchtet, dass …", english: "It is feared that …" },
          ],
        },
        {
          point: "Concessive connectors",
          explanation: "obwohl opens a subordinate clause; dennoch/trotzdem continue a main clause.",
          examples: [{ german: "Obwohl es Vorteile gibt, …", english: "Although there are advantages, …" }],
        },
        {
          point: "sich lassen + infinitive",
          explanation: "A common passive alternative: lässt sich nicht leugnen = cannot be denied.",
          examples: [{ german: "Es lässt sich nicht leugnen, dass …", english: "It cannot be denied that …" }],
        },
      ],
    },
    {
      id: "b2-homeoffice",
      level: "B2",
      title: "Arbeiten von zu Hause",
      topic: "the future of work",
      text: "Seit der Pandemie wird immer häufiger von zu Hause gearbeitet. Diese Entwicklung bringt nicht nur Vorteile, sondern auch Herausforderungen mit sich. Einerseits sparen die Beschäftigten Zeit, andererseits fehlt vielen der direkte Kontakt zu den Kollegen. Damit die Zusammenarbeit funktioniert, müssen klare Regeln vereinbart werden. Ob sich das Homeoffice langfristig durchsetzt, bleibt abzuwarten.",
      translation:
        "Since the pandemic, people increasingly work from home. This development brings not only advantages but also challenges. On the one hand employees save time; on the other, many miss direct contact with colleagues. For collaboration to work, clear rules must be agreed. Whether working from home will establish itself in the long term remains to be seen.",
      vocabulary: [
        { german: "die Pandemie", english: "pandemic", note: "" },
        { german: "die Herausforderung", english: "challenge", note: "" },
        { german: "der Beschäftigte", english: "employee", note: "" },
        { german: "die Zusammenarbeit", english: "collaboration", note: "" },
        { german: "vereinbaren", english: "to agree (on)", note: "" },
        { german: "sich durchsetzen", english: "to establish itself / prevail", note: "" },
      ],
      grammar: [
        {
          point: "Passive with modal",
          explanation: "müssen + participle + werden: müssen vereinbart werden (must be agreed).",
          examples: [{ german: "Klare Regeln müssen vereinbart werden.", english: "Clear rules must be agreed." }],
        },
        {
          point: "nicht nur … sondern auch",
          explanation: "A two-part connector linking two equally true ideas.",
          examples: [{ german: "nicht nur Vorteile, sondern auch Herausforderungen", english: "not only advantages but also challenges" }],
        },
        {
          point: "einerseits … andererseits",
          explanation: "Balances two contrasting points (on one hand … on the other).",
          examples: [{ german: "Einerseits sparen sie Zeit, andererseits …", english: "On one hand they save time, on the other …" }],
        },
      ],
    },
    {
      id: "b2-sprache",
      level: "B2",
      title: "Sprache im Wandel",
      topic: "language and society",
      text: "Sprache ist etwas Lebendiges, das sich ständig verändert. Immer wieder werden neue Wörter in den Wortschatz aufgenommen, während andere in Vergessenheit geraten. Manche Sprachpfleger beklagen diesen Wandel, doch er lässt sich kaum aufhalten. Letztlich spiegelt die Sprache wider, wie eine Gesellschaft lebt und denkt. Wer sie verstehen will, muss auch ihre Veränderungen akzeptieren.",
      translation:
        "Language is something living that constantly changes. Again and again new words are taken into the vocabulary, while others fall into oblivion. Some language purists lament this change, but it can hardly be stopped. Ultimately, language reflects how a society lives and thinks. Whoever wants to understand it must also accept its changes.",
      vocabulary: [
        { german: "lebendig", english: "living / lively", note: "" },
        { german: "der Wortschatz", english: "vocabulary", note: "" },
        { german: "die Vergessenheit", english: "oblivion", note: "in Vergessenheit geraten" },
        { german: "beklagen", english: "to lament", note: "" },
        { german: "widerspiegeln", english: "to reflect", note: "separable" },
        { german: "die Veränderung", english: "change", note: "" },
      ],
      grammar: [
        {
          point: "Nominalised adjectives",
          explanation: "etwas Lebendiges = 'something living' — adjective used as a neuter noun.",
          examples: [{ german: "Sprache ist etwas Lebendiges.", english: "Language is something living." }],
        },
        {
          point: "Passive with werden",
          explanation: "werden aufgenommen = are taken in; the agent is left unnamed.",
          examples: [{ german: "Neue Wörter werden aufgenommen.", english: "New words are taken in." }],
        },
        {
          point: "während for contrast",
          explanation: "während can mean 'whereas', contrasting two clauses.",
          examples: [{ german: "…, während andere in Vergessenheit geraten.", english: "…, whereas others fall into oblivion." }],
        },
      ],
    },
    {
      id: "b2-konsum",
      level: "B2",
      title: "Konsum und Verantwortung",
      topic: "sustainability",
      text: "In den letzten Jahren ist das Bewusstsein für nachhaltigen Konsum deutlich gewachsen. Es wird zunehmend darüber diskutiert, welche Folgen unser Einkaufsverhalten für die Umwelt hat. Zwar achten viele Menschen auf Bio-Produkte, dennoch wird oft mehr gekauft, als wirklich gebraucht wird. Verantwortung bedeutet daher nicht nur, bewusst einzukaufen, sondern auch, weniger wegzuwerfen. Letztlich liegt es an jedem Einzelnen, etwas zu verändern.",
      translation:
        "In recent years, awareness of sustainable consumption has grown noticeably. There is increasing discussion about the consequences our shopping behaviour has for the environment. While many people look for organic products, often more is bought than is really needed. Responsibility therefore means not only buying consciously, but also throwing away less. Ultimately it is up to each individual to change something.",
      vocabulary: [
        { german: "nachhaltig", english: "sustainable", note: "" },
        { german: "der Konsum", english: "consumption", note: "" },
        { german: "die Folge", english: "consequence", note: "" },
        { german: "das Einkaufsverhalten", english: "shopping behaviour", note: "" },
        { german: "die Verantwortung", english: "responsibility", note: "" },
        { german: "wegwerfen", english: "to throw away", note: "separable" },
      ],
      grammar: [
        {
          point: "Passive in a comparison",
          explanation: "mehr … als gebraucht wird — passive inside an als-comparison.",
          examples: [{ german: "Es wird mehr gekauft, als gebraucht wird.", english: "More is bought than is needed." }],
        },
        {
          point: "zwar … dennoch",
          explanation: "Concedes a point (zwar) then counters it (dennoch).",
          examples: [{ german: "Zwar achten viele …, dennoch …", english: "While many pay attention …, nevertheless …" }],
        },
        {
          point: "Nominalised infinitive with zu",
          explanation: "bewusst einzukaufen, weniger wegzuwerfen — separable verbs split around zu.",
          examples: [{ german: "…, bewusst einzukaufen", english: "… to buy consciously" }],
        },
      ],
    },
    {
      id: "b2-gewohnheit",
      level: "B2",
      title: "Die Macht der Gewohnheit",
      topic: "psychology of habits",
      text: "Gewohnheiten bestimmen unseren Alltag stärker, als uns bewusst ist. Vieles, was wir täglich tun, geschieht fast automatisch. Gerade deshalb ist es so schwer, schlechte Angewohnheiten abzulegen. Forscher haben herausgefunden, dass es etwa zwei Monate dauert, bis ein neues Verhalten zur Routine wird. Wer durchhält, wird am Ende belohnt.",
      translation:
        "Habits shape our daily life more strongly than we are aware. Much of what we do daily happens almost automatically. That is precisely why it is so hard to give up bad habits. Researchers have found that it takes about two months until a new behaviour becomes routine. Whoever perseveres is rewarded in the end.",
      vocabulary: [
        { german: "die Gewohnheit", english: "habit", note: "" },
        { german: "automatisch", english: "automatic(ally)", note: "" },
        { german: "die Angewohnheit", english: "(bad) habit", note: "" },
        { german: "ablegen", english: "to give up / shed", note: "separable" },
        { german: "das Verhalten", english: "behaviour", note: "" },
        { german: "durchhalten", english: "to persevere", note: "separable" },
      ],
      grammar: [
        {
          point: "Comparative with als",
          explanation: "stärker, als uns bewusst ist — comparing to a whole clause.",
          examples: [{ german: "… stärker, als uns bewusst ist.", english: "… more strongly than we are aware." }],
        },
        {
          point: "was as a relative pronoun",
          explanation: "After Vieles, the relative pronoun is was: Vieles, was wir tun.",
          examples: [{ german: "Vieles, was wir täglich tun", english: "much of what we do daily" }],
        },
        {
          point: "Passive conclusion",
          explanation: "wird belohnt (is rewarded) closes the thought with a passive.",
          examples: [{ german: "Wer durchhält, wird belohnt.", english: "Whoever perseveres is rewarded." }],
        },
      ],
    },
    {
      id: "b2-stadt",
      level: "B2",
      title: "Die Stadt der Zukunft",
      topic: "urban planning",
      text: "Wie die Stadt der Zukunft aussehen wird, beschäftigt Architekten und Politiker gleichermaßen. Geplant werden Viertel, in denen Wohnen, Arbeiten und Erholung näher zusammenrücken. Damit der Verkehr reduziert wird, sollen mehr Wege zu Fuß oder mit dem Rad zurückgelegt werden können. Kritiker geben jedoch zu bedenken, dass solche Konzepte teuer sind. Dennoch sind sich viele einig, dass ein Umdenken notwendig ist.",
      translation:
        "How the city of the future will look occupies architects and politicians alike. Districts are being planned in which living, working and recreation move closer together. So that traffic is reduced, more journeys should be able to be made on foot or by bike. Critics, however, point out that such concepts are expensive. Nevertheless, many agree that a rethink is necessary.",
      vocabulary: [
        { german: "das Viertel", english: "district / quarter", note: "" },
        { german: "die Erholung", english: "recreation / rest", note: "" },
        { german: "der Verkehr", english: "traffic", note: "" },
        { german: "zurücklegen", english: "to cover (a distance)", note: "separable" },
        { german: "zu bedenken geben", english: "to point out (a concern)", note: "" },
        { german: "das Umdenken", english: "a rethink", note: "" },
      ],
      grammar: [
        {
          point: "Indirect question as subject",
          explanation: "Wie … aussehen wird is the subject of the sentence; verb to the end.",
          examples: [{ german: "Wie die Stadt aussehen wird, beschäftigt …", english: "How the city will look occupies …" }],
        },
        {
          point: "Passive with modal + infinitive",
          explanation: "zurückgelegt werden können — passive infinitive under sollen.",
          examples: [{ german: "Wege sollen zurückgelegt werden können.", english: "Journeys should be able to be made." }],
        },
        {
          point: "damit (purpose)",
          explanation: "damit introduces a purpose clause; the verb goes to the end.",
          examples: [{ german: "Damit der Verkehr reduziert wird, …", english: "So that traffic is reduced, …" }],
        },
      ],
    },
  ],

  C1: [
    {
      id: "c1-maschine",
      level: "C1",
      title: "Mensch und Maschine",
      topic: "a question about science",
      text: "Die Frage, inwiefern künstliche Intelligenz das menschliche Denken nachahmen kann, beschäftigt Wissenschaftler seit Jahrzehnten. Während die einen davon überzeugt sind, dass Maschinen eines Tages ein Bewusstsein entwickeln werden, halten andere dies für reine Spekulation. Fest steht jedoch, dass die Grenzen zwischen Mensch und Maschine zunehmend verschwimmen.",
      translation:
        "The question of to what extent artificial intelligence can imitate human thinking has occupied scientists for decades. While some are convinced that machines will one day develop a consciousness, others consider this pure speculation. What is certain, however, is that the boundaries between human and machine are increasingly blurring.",
      vocabulary: [
        { german: "inwiefern", english: "to what extent", note: "introduces an indirect question" },
        { german: "nachahmen", english: "to imitate", note: "separable" },
        { german: "das Bewusstsein", english: "consciousness", note: "" },
        { german: "verschwimmen", english: "to blur", note: "" },
        { german: "die Spekulation", english: "speculation", note: "" },
      ],
      grammar: [
        {
          point: "Indirect questions",
          explanation: "inwiefern, ob, wieso introduce embedded questions; the verb moves to the end.",
          examples: [{ german: "die Frage, inwiefern KI das Denken nachahmen kann", english: "the question of to what extent AI can imitate thinking" }],
        },
        {
          point: "während for contrast",
          explanation: "Besides 'while' (time), während can contrast two ideas, like 'whereas'.",
          examples: [{ german: "Während die einen …, halten andere …", english: "While some …, others consider …" }],
        },
        {
          point: "Fronted constructions",
          explanation: "Fest steht, dass … places the comment first; the subject follows the verb.",
          examples: [{ german: "Fest steht jedoch, dass …", english: "What is certain, however, is that …" }],
        },
      ],
    },
    {
      id: "c1-objektivitaet",
      level: "C1",
      title: "Die Illusion der Objektivität",
      topic: "perception and bias",
      text: "In einem kürzlich erschienenen Artikel argumentiert die Autorin, der Mensch sei niemals völlig objektiv. Jede Wahrnehmung, so behauptet sie, werde von Erfahrungen und Vorurteilen geprägt. Was wir für die reine Wahrheit halten, ist häufig bloß unsere Deutung der Wirklichkeit. Inwieweit man sich von diesen Mustern befreien kann, bleibt umstritten. Eines jedoch steht fest: Wer sich seiner eigenen Voreingenommenheit bewusst ist, urteilt klüger.",
      translation:
        "In a recently published article, the author argues that human beings are never completely objective. Every perception, she claims, is shaped by experiences and prejudices. What we take to be the pure truth is often merely our interpretation of reality. To what extent one can free oneself from these patterns remains contested. One thing, however, is certain: whoever is aware of their own bias judges more wisely.",
      vocabulary: [
        { german: "die Wahrnehmung", english: "perception", note: "" },
        { german: "das Vorurteil", english: "prejudice", note: "" },
        { german: "die Deutung", english: "interpretation", note: "" },
        { german: "umstritten", english: "contested / disputed", note: "" },
        { german: "die Voreingenommenheit", english: "bias", note: "" },
        { german: "prägen", english: "to shape / mould", note: "" },
      ],
      grammar: [
        {
          point: "Konjunktiv I (reported speech)",
          explanation: "sei, werde report the author's claims without endorsing them.",
          examples: [{ german: "…, der Mensch sei niemals völlig objektiv.", english: "… that humans are never completely objective." }],
        },
        {
          point: "Extended attribute",
          explanation: "in einem kürzlich erschienenen Artikel packs a participle phrase before the noun.",
          examples: [{ german: "ein kürzlich erschienener Artikel", english: "a recently published article" }],
        },
        {
          point: "Genitive with adjective endings",
          explanation: "seiner eigenen Voreingenommenheit bewusst — bewusst governs the genitive.",
          examples: [{ german: "Wer sich seiner Voreingenommenheit bewusst ist", english: "whoever is aware of their bias" }],
        },
      ],
    },
    {
      id: "c1-unbekannte",
      level: "C1",
      title: "Der Reiz des Unbekannten",
      topic: "travel and the unfamiliar",
      text: "Es heißt, der Mensch fürchte sich vor nichts so sehr wie vor dem Unbekannten. Und doch übt gerade das Fremde eine seltsame Anziehungskraft aus. Wer sich auf eine fremde Kultur einlässt, der gewinnt nicht nur neue Eindrücke, sondern auch einen anderen Blick auf sich selbst. Die anfängliche Unsicherheit weicht oft einer tiefen Faszination. Reisen bedeutet eben nicht bloß Ortswechsel, sondern innere Veränderung.",
      translation:
        "It is said that human beings fear nothing as much as the unknown. And yet it is precisely the foreign that exerts a strange attraction. Whoever engages with a foreign culture gains not only new impressions but also a different view of themselves. The initial uncertainty often gives way to a deep fascination. Travelling, after all, means not merely a change of place but inner change.",
      vocabulary: [
        { german: "der Reiz", english: "appeal / allure", note: "" },
        { german: "die Anziehungskraft", english: "attraction / pull", note: "" },
        { german: "sich einlassen auf", english: "to engage with", note: "+ accusative" },
        { german: "der Eindruck", english: "impression", note: "plural: Eindrücke" },
        { german: "weichen", english: "to give way (to)", note: "+ dative" },
        { german: "die Faszination", english: "fascination", note: "" },
      ],
      grammar: [
        {
          point: "Konjunktiv I in 'es heißt'",
          explanation: "fürchte sich reports a general saying.",
          examples: [{ german: "Es heißt, der Mensch fürchte sich …", english: "It is said that humans fear …" }],
        },
        {
          point: "Wer …, der … construction",
          explanation: "An elegant way to state a general rule about anyone.",
          examples: [{ german: "Wer sich einlässt, der gewinnt …", english: "Whoever engages gains …" }],
        },
        {
          point: "Modal particle 'eben'",
          explanation: "eben adds a tone of 'after all / simply', marking something as self-evident.",
          examples: [{ german: "Reisen bedeutet eben nicht bloß Ortswechsel.", english: "Travel, after all, is not merely a change of place." }],
        },
      ],
    },
    {
      id: "c1-scheitern",
      level: "C1",
      title: "Über das Scheitern",
      topic: "failure and learning",
      text: "Lange galt das Scheitern als etwas, worüber man besser schweigt. Inzwischen jedoch hat sich die Einstellung gewandelt, zumindest in manchen Kreisen. Unternehmer berichten offen von Fehlschlägen, aus denen sie gelernt hätten. Ob diese neue Offenheit echt ist oder bloß eine Pose, lässt sich schwer beurteilen. Fest steht allerdings, dass aus Fehlern oft mehr erwächst als aus dem Erfolg.",
      translation:
        "For a long time, failure was regarded as something one had better keep quiet about. By now, however, the attitude has changed, at least in some circles. Entrepreneurs talk openly about setbacks from which, they say, they have learned. Whether this new openness is genuine or merely a pose is hard to judge. What is certain, though, is that more often grows out of mistakes than out of success.",
      vocabulary: [
        { german: "das Scheitern", english: "failure", note: "nominalised verb" },
        { german: "schweigen", english: "to keep silent", note: "" },
        { german: "die Einstellung", english: "attitude", note: "" },
        { german: "der Fehlschlag", english: "setback / failure", note: "" },
        { german: "die Offenheit", english: "openness", note: "" },
        { german: "erwachsen aus", english: "to grow out of", note: "" },
      ],
      grammar: [
        {
          point: "Relative pronoun worüber",
          explanation: "For prepositional relatives with things, German uses wo(r)- forms: worüber.",
          examples: [{ german: "etwas, worüber man besser schweigt", english: "something one had better keep quiet about" }],
        },
        {
          point: "Konjunktiv for distancing",
          explanation: "gelernt hätten reports a claim the writer doesn't vouch for.",
          examples: [{ german: "Fehlschläge, aus denen sie gelernt hätten", english: "setbacks they say they learned from" }],
        },
        {
          point: "Indirect alternative question",
          explanation: "Ob … oder … as the subject of lässt sich … beurteilen.",
          examples: [{ german: "Ob das echt ist oder bloß eine Pose, …", english: "Whether that is genuine or just a pose, …" }],
        },
      ],
    },
    {
      id: "c1-bilder",
      level: "C1",
      title: "Die Sprache der Bilder",
      topic: "images and communication",
      text: "Ein gutes Foto, so sagt man, brauche keine Worte. Tatsächlich vermag ein einziges Bild manchmal mehr auszudrücken als eine lange Erklärung. Die zunehmend von Bildern bestimmte Kommunikation verändert allerdings auch, wie wir denken. Wo früher Texte standen, dominieren heute Symbole und Emojis. Ob dadurch etwas verloren geht, darüber lässt sich trefflich streiten.",
      translation:
        "A good photo, so they say, needs no words. Indeed, a single image is sometimes able to express more than a long explanation. The increasingly image-driven nature of communication, however, also changes how we think. Where texts once stood, symbols and emojis now dominate. Whether something is lost as a result is a matter one can argue about at length.",
      vocabulary: [
        { german: "vermögen", english: "to be able to", note: "formal; + zu + infinitive" },
        { german: "ausdrücken", english: "to express", note: "separable" },
        { german: "die Kommunikation", english: "communication", note: "" },
        { german: "dominieren", english: "to dominate", note: "" },
        { german: "das Symbol", english: "symbol", note: "" },
        { german: "trefflich", english: "splendidly / at length", note: "formal" },
      ],
      grammar: [
        {
          point: "Konjunktiv I 'brauche'",
          explanation: "Reports a common saying without asserting it as fact.",
          examples: [{ german: "Ein gutes Foto brauche keine Worte.", english: "A good photo needs no words." }],
        },
        {
          point: "Extended participial attribute",
          explanation: "die zunehmend von Bildern bestimmte Kommunikation embeds a whole phrase before the noun.",
          examples: [{ german: "die von Bildern bestimmte Kommunikation", english: "image-driven communication" }],
        },
        {
          point: "wo(r)- + da(r)- correlation",
          explanation: "Ob …, darüber lässt sich streiten links an indirect question to a da-pronoun.",
          examples: [{ german: "Ob etwas verloren geht, darüber lässt sich streiten.", english: "Whether something is lost — one can argue about that." }],
        },
      ],
    },
    {
      id: "c1-zeit",
      level: "C1",
      title: "Zeit und Wahrnehmung",
      topic: "the perception of time",
      text: "Merkwürdig, wie unterschiedlich wir Zeit empfinden. In der Kindheit, so scheint es, dehnten sich die Sommer endlos, während die Jahre im Alter nur so verfliegen. Psychologen erklären dies damit, dass neue Eindrücke die gefühlte Zeit verlängern. Wer also sein Leben als reicher empfinden möchte, der sollte das Gewohnte immer wieder durchbrechen. Vielleicht liegt das Geheimnis eines erfüllten Lebens eben in der Neugier.",
      translation:
        "Strange, how differently we perceive time. In childhood, it seems, the summers stretched endlessly, while in old age the years simply fly by. Psychologists explain this by saying that new impressions lengthen felt time. Whoever, then, wants to experience their life as richer should keep breaking through the familiar. Perhaps the secret of a fulfilled life lies, after all, in curiosity.",
      vocabulary: [
        { german: "empfinden", english: "to perceive / feel", note: "" },
        { german: "sich dehnen", english: "to stretch", note: "" },
        { german: "verfliegen", english: "to fly by", note: "of time" },
        { german: "verlängern", english: "to lengthen", note: "" },
        { german: "durchbrechen", english: "to break through", note: "" },
        { german: "das Geheimnis", english: "secret", note: "" },
      ],
      grammar: [
        {
          point: "Präteritum in writing",
          explanation: "dehnten sich is the simple past, typical of reflective written German.",
          examples: [{ german: "Die Sommer dehnten sich endlos.", english: "The summers stretched endlessly." }],
        },
        {
          point: "erklären … damit, dass",
          explanation: "A correlate da-word anticipates the dass-clause that follows.",
          examples: [{ german: "Man erklärt dies damit, dass …", english: "One explains this by the fact that …" }],
        },
        {
          point: "Modal particle 'also'",
          explanation: "Here also means 'therefore', drawing a conclusion within the sentence.",
          examples: [{ german: "Wer also sein Leben … empfinden möchte, …", english: "Whoever, then, wants to experience their life …" }],
        },
      ],
    },
  ],

  C2: [
    {
      id: "c2-sprache",
      level: "C2",
      title: "Die verborgene Macht der Sprache",
      topic: "language and perception",
      text: "Es wäre vermessen zu behaupten, die Sprache sei lediglich ein Mittel zur Verständigung. Vielmehr prägt sie, wie wir die Welt wahrnehmen, und nicht selten entzieht sich ihre Wirkung unserem Bewusstsein. Wer sich auf die Feinheiten einer Sprache einlässt, dem offenbart sich eine Welt voller Nuancen, die dem flüchtigen Betrachter verborgen bleibt.",
      translation:
        "It would be presumptuous to claim that language is merely a means of communication. Rather, it shapes how we perceive the world, and not infrequently its effect escapes our awareness. To whoever engages with the subtleties of a language, a world full of nuances reveals itself — one that remains hidden to the fleeting observer.",
      vocabulary: [
        { german: "vermessen", english: "presumptuous", note: "here an adjective" },
        { german: "lediglich", english: "merely", note: "" },
        { german: "wahrnehmen", english: "to perceive", note: "separable" },
        { german: "die Feinheit", english: "subtlety / nuance", note: "" },
        { german: "sich offenbaren", english: "to reveal itself", note: "" },
      ],
      grammar: [
        {
          point: "Konjunktiv I (reported speech)",
          explanation: "die Sprache sei … reports a claim without endorsing it.",
          examples: [{ german: "… zu behaupten, die Sprache sei ein Mittel", english: "… to claim that language is a means" }],
        },
        {
          point: "Wer …, dem … construction",
          explanation: "Pairs an indefinite relative with a resumptive pronoun for a formal feel.",
          examples: [{ german: "Wer sich einlässt, dem offenbart sich …", english: "Whoever engages — to them reveals itself …" }],
        },
        {
          point: "Reflexive with dative effect",
          explanation: "entzieht sich … unserem Bewusstsein — 'withdraws itself from our awareness'.",
          examples: [{ german: "ihre Wirkung entzieht sich unserem Bewusstsein", english: "its effect escapes our awareness" }],
        },
      ],
    },
    {
      id: "c2-zweifel",
      level: "C2",
      title: "Vom Wert des Zweifels",
      topic: "doubt and thought",
      text: "Nichts ist dem Denken so förderlich wie der Zweifel, und doch fürchten ihn die meisten wie ein Unglück. Wer niemals zweifelt, der hat zu denken aufgehört, mag er sich seiner Sache auch noch so sicher wähnen. Es ist gerade die Unsicherheit, die den Geist in Bewegung hält und ihn davor bewahrt, in bequemen Gewissheiten zu erstarren. Zweifel ist kein Mangel an Überzeugung, sondern deren strengster Prüfstein.",
      translation:
        "Nothing is as conducive to thinking as doubt, and yet most people fear it like a misfortune. Whoever never doubts has stopped thinking, however certain of their cause they may imagine themselves to be. It is precisely uncertainty that keeps the mind in motion and guards it against freezing into comfortable certainties. Doubt is not a lack of conviction, but its strictest touchstone.",
      vocabulary: [
        { german: "der Zweifel", english: "doubt", note: "" },
        { german: "förderlich", english: "conducive / beneficial", note: "+ dative" },
        { german: "wähnen", english: "to imagine / fancy", note: "formal" },
        { german: "erstarren", english: "to freeze / become rigid", note: "" },
        { german: "der Prüfstein", english: "touchstone / test", note: "" },
        { german: "die Überzeugung", english: "conviction", note: "" },
      ],
      grammar: [
        {
          point: "Stylistic inversion",
          explanation: "Nichts ist … so … wie fronts the comparison for rhetorical force.",
          examples: [{ german: "Nichts ist dem Denken so förderlich wie der Zweifel.", english: "Nothing is as conducive to thinking as doubt." }],
        },
        {
          point: "Concessive 'mag … auch'",
          explanation: "mag er sich auch noch so sicher wähnen = however sure he may feel.",
          examples: [{ german: "…, mag er sich auch noch so sicher wähnen.", english: "… however sure he may feel." }],
        },
        {
          point: "nicht … sondern (antithesis)",
          explanation: "Sets up a sharp contrast typical of essayistic style.",
          examples: [{ german: "kein Mangel …, sondern deren Prüfstein", english: "not a lack …, but its touchstone" }],
        },
      ],
    },
    {
      id: "c2-weglassen",
      level: "C2",
      title: "Die Kunst des Weglassens",
      topic: "design and restraint",
      text: "Gute Gestaltung, hieß es einmal, erkenne man nicht daran, was hinzugefügt, sondern daran, was weggelassen werde. In einer Zeit, die vom Überfluss berauscht ist, mutet eine solche Haltung beinahe radikal an. Denn wer weglässt, muss wählen, und wer wählt, muss auf etwas verzichten — eine Zumutung für jeden, dem nichts entgehen soll. Und dennoch entsteht das Schöne selten aus der Fülle, sondern aus der Beschränkung.",
      translation:
        "Good design, it was once said, is recognised not by what is added but by what is left out. In an age intoxicated by abundance, such an attitude seems almost radical. For whoever leaves out must choose, and whoever chooses must give something up — an imposition for anyone who wants to miss nothing. And yet beauty rarely arises from abundance, but from restraint.",
      vocabulary: [
        { german: "die Gestaltung", english: "design / shaping", note: "" },
        { german: "der Überfluss", english: "abundance / excess", note: "" },
        { german: "anmuten", english: "to seem / strike as", note: "mutet … an" },
        { german: "die Zumutung", english: "imposition / unreasonable demand", note: "" },
        { german: "die Beschränkung", english: "restraint / limitation", note: "" },
        { german: "verzichten auf", english: "to do without", note: "+ accusative" },
      ],
      grammar: [
        {
          point: "Konjunktiv I in citation",
          explanation: "erkenne, werde report a remembered maxim (hieß es einmal).",
          examples: [{ german: "… erkenne man nicht daran, was hinzugefügt … werde.", english: "… is recognised not by what is added." }],
        },
        {
          point: "Paired Wer …, muss …",
          explanation: "Chained general statements build an argument: wer weglässt, muss wählen.",
          examples: [{ german: "Wer wählt, muss auf etwas verzichten.", english: "Whoever chooses must give something up." }],
        },
        {
          point: "Antithesis nicht … sondern",
          explanation: "selten aus der Fülle, sondern aus der Beschränkung sharpens the point.",
          examples: [{ german: "nicht aus der Fülle, sondern aus der Beschränkung", english: "not from abundance, but from restraint" }],
        },
      ],
    },
    {
      id: "c2-erinnerung",
      level: "C2",
      title: "Erinnerung als Erfindung",
      topic: "memory",
      text: "Man neigt zu glauben, die Erinnerung bewahre die Vergangenheit getreu, gleich einem Archiv, das man nur zu öffnen brauche. In Wahrheit jedoch gleicht das Gedächtnis weniger einem Archiv als einer Werkstatt, in der bei jedem Erinnern aufs Neue gestaltet wird. Was wir zu erinnern meinen, ist oft schon Deutung, gefärbt von dem, was wir heute sind. So gesehen erfinden wir unsere Geschichte fortwährend neu, ohne es zu bemerken.",
      translation:
        "One tends to believe that memory faithfully preserves the past, like an archive one need only open. In truth, however, memory resembles less an archive than a workshop, in which something is freshly shaped with every act of remembering. What we think we remember is often already interpretation, coloured by what we are today. Seen this way, we continually reinvent our history without noticing it.",
      vocabulary: [
        { german: "die Erinnerung", english: "memory / recollection", note: "" },
        { german: "getreu", english: "faithfully", note: "" },
        { german: "das Gedächtnis", english: "memory (faculty)", note: "" },
        { german: "die Werkstatt", english: "workshop", note: "" },
        { german: "gefärbt", english: "coloured / tinged", note: "von + dative" },
        { german: "fortwährend", english: "continually", note: "" },
      ],
      grammar: [
        {
          point: "Konjunktiv I after 'glauben'",
          explanation: "bewahre, brauche mark the believed (and doubted) claim.",
          examples: [{ german: "…, die Erinnerung bewahre die Vergangenheit getreu", english: "… that memory faithfully preserves the past" }],
        },
        {
          point: "weniger … als (comparison)",
          explanation: "gleicht weniger einem Archiv als einer Werkstatt — 'less … than'.",
          examples: [{ german: "weniger einem Archiv als einer Werkstatt", english: "less an archive than a workshop" }],
        },
        {
          point: "ohne … zu (without doing)",
          explanation: "ohne es zu bemerken expresses an accompanying non-action.",
          examples: [{ german: "…, ohne es zu bemerken.", english: "… without noticing it." }],
        },
      ],
    },
    {
      id: "c2-langeweile",
      level: "C2",
      title: "Lob der Langeweile",
      topic: "boredom and creativity",
      text: "Die Langeweile, so verpönt sie heute auch sein mag, ist womöglich fruchtbarer, als ihr Ruf vermuten lässt. Wo nichts uns ablenkt, beginnt der Geist zu schweifen, und nicht selten entspringt gerade diesem Schweifen der erste Funke eines Gedankens. Eine Gesellschaft jedoch, die jede freie Minute mit Reizen füllt, beraubt sich womöglich ebenjener Leere, aus der das Neue erwächst. Wer sie aushält, dem schenkt sie zuweilen mehr als jede Zerstreuung.",
      translation:
        "Boredom, however frowned upon it may be today, is possibly more fruitful than its reputation suggests. Where nothing distracts us, the mind begins to wander, and not infrequently it is precisely from this wandering that the first spark of a thought springs. A society, however, that fills every free minute with stimuli possibly robs itself of the very emptiness from which the new arises. Whoever endures it is sometimes given more by it than by any diversion.",
      vocabulary: [
        { german: "die Langeweile", english: "boredom", note: "" },
        { german: "verpönt", english: "frowned upon", note: "" },
        { german: "schweifen", english: "to wander / roam", note: "" },
        { german: "entspringen", english: "to spring from", note: "+ dative" },
        { german: "berauben", english: "to rob (of)", note: "sich + genitive" },
        { german: "die Zerstreuung", english: "diversion / distraction", note: "" },
      ],
      grammar: [
        {
          point: "Concessive 'so … auch'",
          explanation: "so verpönt sie auch sein mag = however frowned upon it may be.",
          examples: [{ german: "Die Langeweile, so verpönt sie auch sein mag, …", english: "Boredom, however frowned upon it may be, …" }],
        },
        {
          point: "Fronted 'Wo …'",
          explanation: "Wo nichts uns ablenkt opens with the location-clause for rhythm.",
          examples: [{ german: "Wo nichts uns ablenkt, beginnt der Geist zu schweifen.", english: "Where nothing distracts us, the mind begins to wander." }],
        },
        {
          point: "Wer …, dem … (resumptive)",
          explanation: "Closes the essay with a balanced general statement.",
          examples: [{ german: "Wer sie aushält, dem schenkt sie mehr …", english: "Whoever endures it is given more …" }],
        },
      ],
    },
    {
      id: "c2-hoeflichkeit",
      level: "C2",
      title: "Die Höflichkeit der Sprache",
      topic: "courtesy and communication",
      text: "Es gehört zu den feineren Künsten des Umgangs, das Unangenehme so zu sagen, dass es nicht verletzt, und das Notwendige so, dass es dennoch ankommt. Wer die Sprache nur als Werkzeug der Mitteilung begreift, dem entgeht ihre eigentliche Kunst: die des Andeutens. Denn oft liegt im Ungesagten mehr Wirkung als im Ausgesprochenen, und ein kluges Schweigen wiegt schwerer als manches Wort. Höflichkeit ist mithin keine bloße Form, sondern eine Form der Rücksicht.",
      translation:
        "It is one of the finer arts of social conduct to say the unpleasant in such a way that it does not wound, and the necessary in such a way that it nonetheless gets through. Whoever grasps language merely as a tool of communication misses its real art: that of suggestion. For often there is more effect in the unsaid than in the spoken, and a wise silence weighs more heavily than many a word. Courtesy is therefore not a mere form, but a form of consideration.",
      vocabulary: [
        { german: "der Umgang", english: "(social) conduct / dealings", note: "" },
        { german: "verletzen", english: "to hurt / wound", note: "" },
        { german: "andeuten", english: "to hint / suggest", note: "" },
        { german: "das Ungesagte", english: "the unsaid", note: "nominalised" },
        { german: "das Schweigen", english: "silence", note: "" },
        { german: "die Rücksicht", english: "consideration", note: "" },
      ],
      grammar: [
        {
          point: "so … dass (result)",
          explanation: "so zu sagen, dass es nicht verletzt — manner leading to a result.",
          examples: [{ german: "das Unangenehme so zu sagen, dass es nicht verletzt", english: "to say the unpleasant so it doesn't wound" }],
        },
        {
          point: "Nominalised participles",
          explanation: "im Ungesagten, im Ausgesprochenen turn participles into nouns.",
          examples: [{ german: "im Ungesagten mehr Wirkung als im Ausgesprochenen", english: "more effect in the unsaid than in the spoken" }],
        },
        {
          point: "mithin (formal 'therefore')",
          explanation: "A high-register connector drawing a conclusion.",
          examples: [{ german: "Höflichkeit ist mithin keine bloße Form.", english: "Courtesy is therefore not a mere form." }],
        },
      ],
    },
  ],
};
