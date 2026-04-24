import type { ChallengeLevel, PuzzleWord, TopicId, TopicPack } from "@/lib/game-types";
import { curatedEnglishLexicon } from "@/lib/lexicon-seeds";

const greekMarks = [
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "zeta",
  "eta",
  "theta",
  "iota",
  "kappa",
  "lambda",
  "mu",
];

const topicPacks: TopicPack[] = [
  {
    id: "myth",
    label: "Myth & Legend",
    mood: "Ancient voices, heroic paths, and temple dust.",
    scene: ["laurel fire", "marble echo", "heroic hush"],
    icons: ["owl", "torch", "lyre", "column"],
    easy: "oracle titan hero nymph temple olive echo bronze shield laurel nectar thunder pegasus trident labyrinth siren chimera hydra atlas zephyr ember raven crown scroll voyage".split(" "),
    medium: "odyssey prophecy immortal ambrosia centaur gorgon relic citadel amphora draught omen fable ritual talisman titaness voyageur festival dynasty horizon sentinel starlit cascade twilight artifact".split(" "),
    hard: "heliotrope catacomb pantheon aegis harbinger celestial invincible labyrinthine chronicle automaton tempestuous revelation constellation anointed moonstone everglow sovereign spellbound thunderhead glasswork".split(" "),
  },
  {
    id: "cosmos",
    label: "Cosmos",
    mood: "Orbital drift, radiant dust, and patient signals.",
    scene: ["signal haze", "planet glow", "midnight orbit"],
    icons: ["star", "ring", "comet", "planet"],
    easy: "planet comet rocket meteor galaxy orbit nebula lunar solar crater signal vacuum aurora shuttle rover asteroid satellite stardust eclipse module capsule photon horizon zenith".split(" "),
    medium: "gravity pulsar stellar ionosphere eclipse velocity vacuum chamber trajectory observatory terminal spectrum fusion antenna ignition quantum radiant orbital eclipse twilight launchpad celestial".split(" "),
    hard: "interstellar singularity heliosphere exoplanet telemetry afterglow magnetism transponder cryogenic supernova quasar acceleration astrolabe continuum vacuumed propulsion radiantness observatory noctilucent".split(" "),
  },
  {
    id: "ocean",
    label: "Ocean",
    mood: "Salt air, deep water, and bright things under the tide.",
    scene: ["foam trail", "tidal shimmer", "harbor hush"],
    icons: ["wave", "shell", "anchor", "coral"],
    easy: "coral harbor tide drift anchor shell reef marina dolphin current sailor vessel lagoon splash beacon compass kelp seagull seabed trawler ferry island estuary jetty".split(" "),
    medium: "brackish lanternfish seabreeze tidepool barnacle moonwake undertow shoreline captaincy whirlpool ropework seaworthy semaphore saltwater coastland floodgate".split(" "),
    hard: "bioluminescent phosphorescent hydrophone bathysphere cartography tidewater seafaring mariner chronometer breakwater wavecrest weathered shipwright undertidal".split(" "),
  },
  {
    id: "garden",
    label: "Garden",
    mood: "Green patience, petals, and bright rooted calm.",
    scene: ["petal rain", "green lattice", "morning soil"],
    icons: ["leaf", "petal", "sprout", "moss"],
    easy: "rose tulip fern cedar ivy basil orchard meadow blossom pollen nectar seedling trellis sunflower lavender mint clover willow petal root stem garden".split(" "),
    medium: "greenhouse rosemary marigold hillside arborist courtyard dewdrop vinework moonflower hummingbird seedpod wildflower rainbarrel grove".split(" "),
    hard: "photosynthesis chrysanthemum arboriculture vermilion evergreen herbarium pollinator glasshouse horticulture moonpetal understory".split(" "),
  },
  {
    id: "city",
    label: "City Light",
    mood: "Late trains, glass towers, and rooftop stories.",
    scene: ["neon crosswalk", "tower mist", "subway thunder"],
    icons: ["tram", "tower", "neon", "alley"],
    easy: "avenue subway market skyline bridge lantern cafe mural signal plaza alley rooftop district station tunnel balcony courier traffic".split(" "),
    medium: "boulevard sidewalk headlight afterhours storefront highrise overpass timetable warehouse underpass cityscape metroline courtyard brickwork".split(" "),
    hard: "metropolis thoroughfare interchange skyscraper boulevardier cartographer soundscape nightshift infrastructure pedestrian nocturne".split(" "),
  },
  {
    id: "music",
    label: "Music",
    mood: "Rhythm, resonance, and rooms that remember songs.",
    scene: ["velvet stage", "amp glow", "vinyl midnight"],
    icons: ["note", "amp", "drum", "vinyl"],
    easy: "melody chorus rhythm ballad tempo lyric cadence piano violin trumpet drummer echo stanza refrain harmony record microphone".split(" "),
    medium: "crescendo overture bridgework riffing setlist downbeat headliner resonance songbook backbeat soundcheck tunecraft".split(" "),
    hard: "symphonic improvisation counterpoint reverberation soundboard orchestral metronomic interlude syncopation".split(" "),
  },
  {
    id: "kitchen",
    label: "Kitchen",
    mood: "Steam, spice, and good timing.",
    scene: ["copper pan", "spice cloud", "lamplit supper"],
    icons: ["spoon", "flame", "bread", "tea"],
    easy: "biscuit skillet pepper butter simmer whisk kettle pantry noodle recipe garlic honey berry pastry cocoa supper feast".split(" "),
    medium: "rosemary marinade sourdough caramel pantrylight spoonful bakehouse cinnamon teacup saucepan".split(" "),
    hard: "confection hearthstone crystallized aromatic fermentation buttermilk charbroiled".split(" "),
  },
  {
    id: "wild",
    label: "Wild Trails",
    mood: "Tracks, cliffs, flight, and weathered ground.",
    scene: ["ridge wind", "pine shadow", "trail dust"],
    icons: ["peak", "pine", "hawk", "trail"],
    easy: "forest canyon summit falcon river boulder pine timber meadow otter wolf feather granite valley trail campfire sunrise".split(" "),
    medium: "ridgeback moonrise waterfall hillside outpost stonepath wanderer firelight highland backpack".split(" "),
    hard: "wilderness mountaintop thunderstone windcarved expedition glacial riverbend overland".split(" "),
  },
  {
    id: "weather",
    label: "Weather",
    mood: "Pressure shifts, cloud theaters, and bright fronts.",
    scene: ["storm glass", "silver cloud", "rain static"],
    icons: ["cloud", "rain", "sun", "wind"],
    easy: "breeze thunder drizzle rainbow frost cyclone hailstorm mist sunset monsoon gust forecast lightning shadow winter summer".split(" "),
    medium: "daybreak overcast moonstorm rainfall windward stormfront heatwave cloudbank".split(" "),
    hard: "barometric atmospheric thunderhead torrential luminescent nocturnal solarwind".split(" "),
  },
  {
    id: "desert",
    label: "Desert",
    mood: "Heat shimmer, dune silence, and bright mineral light.",
    scene: ["mirage line", "sunstone dust", "dune shadow"],
    icons: ["dune", "sun", "cactus", "stone"],
    easy: "dune cactus oasis amber mesa canyon lizard sandstone mirage lantern trail nomad caravan saddle drywind sundial jackal campfire".split(" "),
    medium: "sandstorm windcarved moonbasin saltplain dusttrail waystation sunbaked torchline ridgeglass caravanserai".split(" "),
    hard: "horizonless argentine sunscorched echoing glasssand aridlands weatherstone sandstonekeep".split(" "),
  },
  {
    id: "festival",
    label: "Festival",
    mood: "Lantern glow, moving color, and crowded midnight joy.",
    scene: ["lantern parade", "confetti drift", "midnight square"],
    icons: ["lantern", "ribbon", "mask", "drum"],
    easy: "parade lantern ribbon confetti banner costume drummer ticket stage sparkle carnival chorus firework market dancer trumpet".split(" "),
    medium: "procession moonstage celebratory afterglow paperlight headliner streamers spotlight fairground".split(" "),
    hard: "pageantry masquerade illuminations soundscape wonderlight revelatory".split(" "),
  },
  {
    id: "winter",
    label: "Winterlight",
    mood: "Cold air, silver quiet, and windows full of warmth.",
    scene: ["snowglass pane", "frost lantern", "midnight snowfall"],
    icons: ["snow", "frost", "pines", "hearth"],
    easy: "winter frost icicle snowfall pinewood blanket firelight cocoa mitten sled lantern chimney snowfall moonfrost scarf".split(" "),
    medium: "snowdrift hearthlight northwind moonsnow silverpine windowglow fireside weatherglass".split(" "),
    hard: "crystalline everfrost glimmersnow hushlight wintertide frostbound".split(" "),
  },
  {
    id: "invent",
    label: "Invention",
    mood: "Workshop sparks and ideas with moving parts.",
    scene: ["copper spark", "draft table", "gear hum"],
    icons: ["gear", "spark", "blueprint", "switch"],
    easy: "engine circuit piston magnet lever pulley copper gadget blueprint signal battery workshop engine spark rotor".split(" "),
    medium: "prototype workshop torque lanternwork pressure valve motioncraft gearbox voltage mechanism".split(" "),
    hard: "calibration architecture oscillation microcircuit steamdriven instrumentation".split(" "),
  },
  {
    id: "story",
    label: "Storybook",
    mood: "Pages, voices, and moonlit turns of plot.",
    scene: ["paper lantern", "ink river", "quiet chapter"],
    icons: ["book", "quill", "candle", "mask"],
    easy: "chapter lantern author whisper library paper fable riddle ending villain secret witness letter journal prologue chapterplay".split(" "),
    medium: "narrator moonlight bookmark passage plotline folktale mystery chapterhouse".split(" "),
    hard: "epilogue allegorical manuscript storytelling dreamscape cliffhanger".split(" "),
  },
  {
    id: "greek",
    label: "Greek Letters",
    mood: "Glyphs, symbols, and a playful coded layer.",
    scene: ["glyph spiral", "scholar glow", "cipher trace"],
    icons: ["alpha", "sigma", "omega", "delta"],
    easy: "alpha beta gamma delta sigma omega theta lambda kappa mu pi rho tau phi psi zeta eta iota".split(" "),
    medium: "epsilon omicron upsilon digamma glyphic symbolist theorem notation lexicon codex".split(" "),
    hard: "philosophic harmonics mnemonic semiotic etymology iconography".split(" "),
  },
];

const topicCompoundSpecs: Record<TopicId, { prefixes: string[]; suffixes: string[] }> = {
  myth: {
    prefixes: ["amber", "atlas", "bronze", "crown", "ember", "hero", "laurel", "moon", "oracle", "siren", "temple", "thunder"],
    suffixes: ["bound", "crown", "flame", "forge", "gate", "keeper", "light", "mark", "path", "scroll", "song", "stone"],
  },
  cosmos: {
    prefixes: ["aster", "comet", "cosmo", "lunar", "meteor", "moon", "nebula", "nova", "orbit", "photon", "solar", "star"],
    suffixes: ["beam", "bound", "chart", "craft", "drift", "field", "flare", "glow", "line", "path", "trail", "watch"],
  },
  ocean: {
    prefixes: ["anchor", "brine", "coral", "harbor", "kelp", "lagoon", "marina", "reef", "salt", "sea", "shell", "tide"],
    suffixes: ["bloom", "bound", "craft", "drift", "foam", "glow", "line", "path", "song", "spray", "stone", "watch"],
  },
  garden: {
    prefixes: ["basil", "blossom", "cedar", "clover", "fern", "garden", "ivy", "lavender", "meadow", "moss", "petal", "willow"],
    suffixes: ["arch", "bloom", "branch", "field", "gate", "glow", "house", "light", "path", "root", "song", "trail"],
  },
  city: {
    prefixes: ["alley", "avenue", "brick", "cinder", "glass", "market", "metro", "neon", "plaza", "rooftop", "sky", "subway"],
    suffixes: ["bridge", "drift", "field", "glow", "grid", "line", "mark", "night", "path", "signal", "side", "watch"],
  },
  music: {
    prefixes: ["ballad", "cadence", "chorus", "echo", "lyric", "melody", "rhythm", "song", "sound", "stanza", "tempo", "vinyl"],
    suffixes: ["bound", "bridge", "craft", "drift", "flame", "glow", "house", "line", "note", "pulse", "song", "wave"],
  },
  kitchen: {
    prefixes: ["baker", "butter", "candle", "cinnamon", "copper", "garlic", "honey", "kettle", "pantry", "pepper", "simmer", "sugar"],
    suffixes: ["bloom", "bound", "crumb", "craft", "flame", "glow", "house", "mark", "mix", "plate", "stone", "whisk"],
  },
  wild: {
    prefixes: ["canyon", "falcon", "forest", "granite", "meadow", "otter", "pine", "ridge", "river", "stone", "summit", "timber"],
    suffixes: ["bound", "crest", "drift", "field", "glow", "mark", "path", "ridge", "run", "song", "trail", "watch"],
  },
  weather: {
    prefixes: ["aurora", "breeze", "cloud", "frost", "gust", "hail", "lightning", "mist", "moon", "rain", "storm", "sun"],
    suffixes: ["bank", "bound", "break", "drift", "fall", "glow", "line", "mark", "path", "rise", "song", "watch"],
  },
  desert: {
    prefixes: ["amber", "cactus", "desert", "dune", "mesa", "mirage", "nomad", "oasis", "sand", "stone", "sun", "torch"],
    suffixes: ["bloom", "bound", "drift", "glass", "line", "mark", "path", "ridge", "song", "spark", "stone", "trail"],
  },
  festival: {
    prefixes: ["banner", "carnival", "chorus", "confetti", "drum", "fair", "festival", "lantern", "mask", "parade", "ribbon", "spark"],
    suffixes: ["beam", "bound", "dance", "drift", "glow", "light", "line", "march", "song", "spark", "stage", "wave"],
  },
  winter: {
    prefixes: ["blanket", "frost", "glacier", "hearth", "icicle", "midnight", "moon", "pine", "silver", "snow", "winter", "wool"],
    suffixes: ["bound", "drift", "fall", "fire", "glow", "glass", "light", "mark", "song", "spark", "trail", "watch"],
  },
  invent: {
    prefixes: ["battery", "blueprint", "circuit", "copper", "engine", "gear", "lantern", "lever", "magnet", "piston", "rotor", "signal"],
    suffixes: ["array", "bound", "craft", "drive", "forge", "frame", "grid", "light", "mark", "spark", "switch", "work"],
  },
  story: {
    prefixes: ["chapter", "candle", "fable", "ink", "journal", "lantern", "letter", "library", "moon", "paper", "riddle", "whisper"],
    suffixes: ["book", "bound", "draft", "glow", "house", "line", "mark", "page", "path", "song", "tale", "thread"],
  },
  greek: {
    prefixes: ["alpha", "beta", "delta", "gamma", "kappa", "lambda", "omega", "omicron", "phi", "sigma", "theta", "zeta"],
    suffixes: ["bound", "code", "glyph", "line", "mark", "path", "pulse", "script", "sign", "spark", "trace", "wave"],
  },
};

const generalWordPools: Record<ChallengeLevel, string> = {
  breeze:
    "acorn amber apple apron arrow artist attic autumn bakery bamboo basket beacon berry blanket blossom border breeze brook button cabin candle carpet castle cherry circle cloud coffee comet copper cottage cricket crystal curtain daisy dancer dawn desert dream ember engine feather fiddle firefly forest fountain garden giggle glacier harbor hazel hearth island jacket jasmine jewel kettle lantern lemon library lilac market meadow mirror moonlight morning mountain orchard paper pebble pepper pillow planet pocket postcard puddle rabbit raindrop river robin saddle sailor scarlet secret shadow silver sketch skyline snowflake songbird sparkle spring starfish stone story sunrise teacup ticket timber violet wagon waterfall whisper window winter woodland" +
    " anchor animal answer badge balloon barrel basketry beach bell bicycle biscuit bonnet bottle branch buttonhole camera canvas captain carnival carpeted carrot cellar chimney clover coast coral cottagecore creek cricketing crocus daffodil daylight doorway dragonfly earring evening family festival fireplace flannel folklore freckles friendship ginger glimmer hammock harborview harvest heartbeat honeycomb icicle inkwell lanternlight laughter lemonade lighthouse linen lockbox lullaby mailbox mariner moonbeam northwind notebook oakwood oatmeal pastry pebblework pinecone postcarding rainbow riverbank rosewood sailboat sandbar seashore shoelace shoreline songbook songline starlight steamship sugar sunset thimble tidepool trailhead umbrella velvet wagoner washline windmill woodlander"
  ,
  quest:
    "adventure alcove alloy anthem archive artisan ascent avenue balance banner brisket canyon caravan charcoal charm circuit coastal compass current daylight driftwood emberglow emerald festival firelight foothill freeway frontier garnet gateway harvest hush lanternlit marble midnight mosaic nomad northbound outpost overlook passage pebbled riverbed sailcloth saltwind sandstone seafarer shoreline sidepath skyline skylight songcraft southbound spindle starboard stonework sunward tapestry thunderbird townscape trailside undertone wayfinder westward windward wonderland" +
    " afterimage airfield amphitheater backdrop bandstand bellflower bookseller breakpoint campfire cedarwood chambered clockwork cloudline courtyard crossroads daystar dockside earthbound eastward evergreen fieldstone firebrand foldaway framework guidepost halflight hilltop houseplant lakeshore landmark lamplight larksong lifeline moonrise nightfall northstar orchardgate pathway ridgeway roadstead sandglass seedhouse shorelineview stairwell stonepath threadwork tidewater torchlight trailmark undertow vantage waystation wheatfield whispering wildflower windchime"
  ,
  mythic:
    "afterglow alchemy altitude ambergris architect atlasbound avalanche brilliance catapult cathedral celestial chrysalis citrine clockmaker constellation craftwork daydreamer downriver elsewhere emberstone evermore firebrand glassmaker glistening handwoven headwater homecoming luminance moonstone nightgarden northlight opaline outlander parable pilgrimage radiance riverstone rosewater sanctuary sapphire skybound spellcraft stargazer storyweaver sunstone tidewalker trailblazer turnstile velvetine wanderlight wayfarer windborne wondercraft" +
    " aerialist argentum astronomer auroral bewitching borderless brilliance candlemark cartwheel charmedness citadel cloudbreaker copperleaf dreamtide earthsong eventide featherlight fieldguide goldthread harmonics hillshade lampblack lighthousekeeper moonriver nightbloom overstory pathfinder riverglow silvered skyglass songsmith starborn stonegarden sunlit thornfield tidebound trailsong watchtower wayfaring weatherstone whisperwind wildfire"
};

function normalizeWord(word: string) {
  return word.toLowerCase().replace(/[^a-z]/g, "");
}

function getDifficultyScore(level: ChallengeLevel) {
  switch (level) {
    case "breeze":
      return 1;
    case "quest":
      return 2;
    case "mythic":
      return 3;
  }
}

function createPrompt(pack: TopicPack, answer: string, frequencyBand: PuzzleWord["frequencyBand"]) {
  const scene = pack.scene[answer.length % pack.scene.length];

  if (pack.id === "desert") {
    return frequencyBand === "rare"
      ? `Desert clue: picture ${scene} and reach for a more literary or evocative word from that landscape.`
      : frequencyBand === "uncommon"
        ? `Desert clue: picture ${scene} and choose a richer word that still feels dry, bright, or windworn.`
        : `Desert clue: picture ${scene} and choose a clear everyday word from that landscape.`;
  }

  if (pack.id === "festival") {
    return frequencyBand === "rare"
      ? `Festival clue: think of ${scene} and reach for a more vivid celebratory word.`
      : frequencyBand === "uncommon"
        ? `Festival clue: think of ${scene} and find a brighter, slightly richer celebration word.`
        : `Festival clue: think of ${scene} and pick a familiar word you would expect around a celebration.`;
  }

  if (pack.id === "winter") {
    return frequencyBand === "rare"
      ? `Winterlight clue: picture ${scene} and reach for a colder, more poetic English word.`
      : frequencyBand === "uncommon"
        ? `Winterlight clue: picture ${scene} and choose a textured winter word with a softer mood.`
        : `Winterlight clue: picture ${scene} and choose a familiar winter word that fits cleanly.`;
  }

  if (frequencyBand === "rare") {
    return `${pack.label} clue: think of ${scene} and reach for a rarer, more evocative English answer.`;
  }

  if (frequencyBand === "uncommon") {
    return `${pack.label} clue: think of ${scene} and find a slightly richer word that still fits the scene cleanly.`;
  }

  return `${pack.label} clue: think of ${scene} and a familiar word that belongs in that atmosphere.`;
}

function createMicroHint(pack: TopicPack, answer: string, frequencyBand: PuzzleWord["frequencyBand"]) {
  const opening = answer[0]?.toUpperCase() ?? "?";

  if (frequencyBand === "rare") {
    return `Starts with ${opening}, runs ${answer.length} letters, leans toward ${pack.mood.toLowerCase()}, and sits in the sharper end of the lexicon.`;
  }

  if (frequencyBand === "uncommon") {
    return `Starts with ${opening}, runs ${answer.length} letters, and leans toward ${pack.mood.toLowerCase()} with a little extra texture.`;
  }

  return `Starts with ${opening}, runs ${answer.length} letters, and leans toward ${pack.mood.toLowerCase()}.`;
}

function createTeaser(pack: TopicPack, answer: string, frequencyBand: PuzzleWord["frequencyBand"]) {
  const pace = answer.length <= 6 ? "a quick strike" : answer.length <= 9 ? "a steady build" : "a longer reveal";
  const tone = frequencyBand === "rare" ? "Expect a less obvious finish." : frequencyBand === "uncommon" ? "There is a little extra texture here." : "This one should read cleanly once it clicks.";
  return `${pack.label} energy with ${pace}. ${tone}`;
}

function createLearningNote(pack: TopicPack, answer: string, frequencyBand: PuzzleWord["frequencyBand"]) {
  const part = answer.length <= 5 ? "short everyday vocabulary" : answer.length <= 8 ? "mid-length descriptive vocabulary" : "longer expressive vocabulary";
  const difficultyTone = frequencyBand === "rare" ? "It is less frequent, so use the scene and tone together." : frequencyBand === "uncommon" ? "It is not the first word every learner reaches for, so lean on the mood." : "It is fairly common, so connect it to the scene first.";
  return `${pack.label} language cue: this answer behaves like ${part}. ${difficultyTone}`;
}

function createUsageExample(pack: TopicPack, answer: string) {
  return `Example idea: "The ${answer} fits a ${pack.mood.toLowerCase()} scene."`;
}

function createRelatedWords(pack: TopicPack, answer: string) {
  const related = [pack.icons[answer.length % pack.icons.length], pack.scene[0], pack.label.toLowerCase()]
    .map((item) => item.replace(/[^a-z ]/gi, "").trim())
    .filter(Boolean);

  return [...new Set(related)].slice(0, 3);
}

function createGeneralWords(level: ChallengeLevel, existingCount: number): PuzzleWord[] {
  const words = generalWordPools[level]
    .split(/\s+/)
    .map((word) => normalizeWord(word))
    .filter((word) => word.length >= 4);

  return words.map((word, index) => {
    const frequencyBand: PuzzleWord["frequencyBand"] = level === "breeze" ? "common" : level === "quest" ? "uncommon" : "rare";

    return {
      id: `general-${level}-${index}`,
      answer: word,
      normalized: word,
      topicId: "story",
      topicLabel: "General English",
      difficulty: level,
      frequencyBand,
      length: word.length,
      prompt: `Think in English wordplay rather than a single subject lane.`,
      microHint: `A flexible common-word clue. ${word.length} letters long.`,
      teaser: `A bridge word that keeps the round flowing.`,
      learningNote: `General English cue: try to connect the letters to a broad everyday meaning before chasing a niche topic word.`,
      usageExample: `Example idea: "The word ${word} can appear in many simple English situations."`,
      relatedWords: ["general", `${word.length} letters`, frequencyBand],
      visuals: [greekMarks[(existingCount + index) % greekMarks.length], `${word.length} letters`, index % 2 === 0 ? "common" : "nimble"],
      greekMark: greekMarks[(existingCount + index) % greekMarks.length],
      weight: 1,
    };
  });
}

function getCuratedDifficulty(word: string, band: PuzzleWord["frequencyBand"]): ChallengeLevel {
  if (band === "rare" || word.length >= 11) {
    return "mythic";
  }

  if (band === "uncommon" || word.length >= 8) {
    return "quest";
  }

  return "breeze";
}

function createCuratedLexiconWords(startIndex: number): PuzzleWord[] {
  const groups = [
    { band: "common" as const, words: curatedEnglishLexicon.common },
    { band: "uncommon" as const, words: curatedEnglishLexicon.uncommon },
    { band: "rare" as const, words: curatedEnglishLexicon.rare },
  ];

  return groups.flatMap(({ band, words }, bandIndex) =>
    words.map((rawWord, index) => {
      const answer = normalizeWord(rawWord);
      const difficulty = getCuratedDifficulty(answer, band);

      return {
        id: `curated-${band}-${startIndex + bandIndex * 1000 + index}`,
        answer,
        normalized: answer,
        topicId: "story",
        topicLabel: "General English",
        difficulty,
        frequencyBand: band,
        length: answer.length,
        prompt: band === "rare" ? "A rarer English term. Think a little wider than the first obvious answer." : band === "uncommon" ? "A richer English term with more texture than the easiest lane." : "A familiar English clue lane with cleaner surface meaning.",
        microHint: `${band} lexicon clue. ${answer.length} letters long.`,
        teaser: band === "rare" ? "A rarer lexicon pick that sharpens the board." : "A curated English entry that balances the run.",
        learningNote: band === "rare" ? "Vocabulary cue: this is a lower-frequency English word, so use length, first letter, and theme together." : band === "uncommon" ? "Vocabulary cue: this word is useful intermediate vocabulary with a stronger flavor than the most common option." : "Vocabulary cue: this is common English vocabulary that should become easier with repetition.",
        usageExample: `Example idea: "The word ${answer} can fit a clear English sentence once you know its tone."`,
        relatedWords: [band, `${answer.length} letters`, "english"],
        visuals: [greekMarks[(startIndex + bandIndex + index) % greekMarks.length], band, `${answer.length} letters`],
        greekMark: greekMarks[(startIndex + bandIndex + index) % greekMarks.length],
        weight: band === "common" ? 1 : band === "uncommon" ? 2 : 3,
      } satisfies PuzzleWord;
    })
  );
}

function getGeneratedDifficulty(word: string): ChallengeLevel {
  if (word.length <= 7) {
    return "breeze";
  }

  if (word.length <= 10) {
    return "quest";
  }

  return "mythic";
}

function createGeneratedCompoundWords(): PuzzleWord[] {
  return topicPacks.flatMap((pack) => {
    const spec = topicCompoundSpecs[pack.id];

    return spec.prefixes.flatMap((prefix, prefixIndex) =>
      spec.suffixes
        .map((suffix, suffixIndex) => ({ suffixIndex, answer: `${prefix}${suffix}` }))
        .filter(({ answer }) => {
          const length = answer.length;
          return length >= 5 && length <= 14;
        })
        .map(({ answer, suffixIndex }, index) => {
          const difficulty = getGeneratedDifficulty(answer);

          return {
            id: `${pack.id}-generated-${prefixIndex}-${suffixIndex}-${index}`,
            answer,
            normalized: answer,
            topicId: pack.id,
            topicLabel: pack.label,
            difficulty,
            frequencyBand: difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare",
            length: answer.length,
            prompt: createPrompt(pack, answer, difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare"),
            microHint: createMicroHint(pack, answer, difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare"),
            teaser: createTeaser(pack, answer, difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare"),
            learningNote: createLearningNote(pack, answer, difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare"),
            usageExample: createUsageExample(pack, answer),
            relatedWords: createRelatedWords(pack, answer),
            visuals: [pack.icons[(prefixIndex + index) % pack.icons.length], pack.scene[suffixIndex % pack.scene.length], `${answer.length} letters`],
            greekMark: greekMarks[(prefixIndex + suffixIndex) % greekMarks.length],
            weight: difficulty === "breeze" ? 5 : difficulty === "quest" ? 6 : 7,
          } satisfies PuzzleWord;
        })
    );
  });
}

export const topicCatalog = topicPacks;

export const wordBank: PuzzleWord[] = (() => {
  const themed = topicPacks.flatMap((pack) => {
    const source = [
      { difficulty: "breeze" as const, words: pack.easy },
      { difficulty: "quest" as const, words: pack.medium },
      { difficulty: "mythic" as const, words: pack.hard },
    ];

    return source.flatMap(({ difficulty, words }, groupIndex) =>
      words
        .map((rawWord, index) => normalizeWord(rawWord))
        .filter((word) => word.length >= 3)
        .map((answer, index) => {
          const frequencyBand: PuzzleWord["frequencyBand"] = difficulty === "breeze" ? "common" : difficulty === "quest" ? "uncommon" : "rare";

          return {
            id: `${pack.id}-${difficulty}-${index}`,
            answer,
            normalized: answer,
            topicId: pack.id,
            topicLabel: pack.label,
            difficulty,
            frequencyBand,
            length: answer.length,
            prompt: createPrompt(pack, answer, frequencyBand),
            microHint: createMicroHint(pack, answer, frequencyBand),
            teaser: createTeaser(pack, answer, frequencyBand),
            learningNote: createLearningNote(pack, answer, frequencyBand),
            usageExample: createUsageExample(pack, answer),
            relatedWords: createRelatedWords(pack, answer),
            visuals: [pack.icons[index % pack.icons.length], pack.scene[groupIndex % pack.scene.length], `${answer.length} letters`],
            greekMark: greekMarks[(index + groupIndex) % greekMarks.length],
            weight: difficulty === "breeze" ? 2 : difficulty === "quest" ? 3 : 4,
          } satisfies PuzzleWord;
        })
    );
  });

  const general = [
    ...createGeneralWords("breeze", themed.length),
    ...createGeneralWords("quest", themed.length + 200),
    ...createGeneralWords("mythic", themed.length + 400),
  ];

  const generated = createGeneratedCompoundWords();
  const curated = createCuratedLexiconWords(themed.length + general.length + generated.length);

  const seen = new Set<string>();

  return [...themed, ...general, ...generated, ...curated].filter((entry) => {
    const key = `${entry.topicId}:${entry.normalized}:${entry.difficulty}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
})();

export function getWordsForTopics(topics: TopicId[]) {
  const topicSet = new Set(topics);
  return wordBank.filter((entry) => topicSet.has(entry.topicId));
}

export function getRelatedWords(topicId: TopicId, challenge: ChallengeLevel) {
  const targetDifficulty = getDifficultyScore(challenge);
  return wordBank.filter((entry) => {
    if (entry.topicId !== topicId) {
      return false;
    }

    return Math.abs(getDifficultyScore(entry.difficulty) - targetDifficulty) <= 1;
  });
}
