import type { ContentPack, PuzzleWord, TopicPack } from "@/lib/game-types";

export const topicCatalog: TopicPack[] = [
  {
    "id": "myth",
    "label": "Myth & Legend",
    "mood": "Ancient voices, heroic paths, and temple dust.",
    "scene": [
      "laurel fire",
      "marble echo",
      "heroic hush"
    ],
    "icons": [
      "owl",
      "torch",
      "lyre",
      "column"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "cosmos",
    "label": "Cosmos",
    "mood": "Orbital drift, radiant dust, and patient signals.",
    "scene": [
      "signal haze",
      "planet glow",
      "midnight orbit"
    ],
    "icons": [
      "star",
      "ring",
      "comet",
      "planet"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "ocean",
    "label": "Ocean",
    "mood": "Salt air, deep water, and bright things under the tide.",
    "scene": [
      "foam trail",
      "tidal shimmer",
      "harbor hush"
    ],
    "icons": [
      "wave",
      "shell",
      "anchor",
      "coral"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "garden",
    "label": "Garden",
    "mood": "Green patience, petals, and bright rooted calm.",
    "scene": [
      "petal rain",
      "green lattice",
      "morning soil"
    ],
    "icons": [
      "leaf",
      "petal",
      "sprout",
      "moss"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "city",
    "label": "City Light",
    "mood": "Late trains, glass towers, and rooftop stories.",
    "scene": [
      "neon crosswalk",
      "tower mist",
      "subway thunder"
    ],
    "icons": [
      "tram",
      "tower",
      "neon",
      "alley"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "music",
    "label": "Music",
    "mood": "Rhythm, resonance, and rooms that remember songs.",
    "scene": [
      "velvet stage",
      "amp glow",
      "vinyl midnight"
    ],
    "icons": [
      "note",
      "amp",
      "drum",
      "vinyl"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "kitchen",
    "label": "Kitchen",
    "mood": "Steam, spice, and good timing.",
    "scene": [
      "copper pan",
      "spice cloud",
      "lamplit supper"
    ],
    "icons": [
      "spoon",
      "flame",
      "bread",
      "tea"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "wild",
    "label": "Wild Trails",
    "mood": "Tracks, cliffs, flight, and weathered ground.",
    "scene": [
      "ridge wind",
      "pine shadow",
      "trail dust"
    ],
    "icons": [
      "peak",
      "pine",
      "hawk",
      "trail"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "weather",
    "label": "Weather",
    "mood": "Pressure shifts, cloud theaters, and bright fronts.",
    "scene": [
      "storm glass",
      "silver cloud",
      "rain static"
    ],
    "icons": [
      "cloud",
      "rain",
      "sun",
      "wind"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "desert",
    "label": "Desert",
    "mood": "Heat shimmer, dune silence, and bright mineral light.",
    "scene": [
      "mirage line",
      "sunstone dust",
      "dune shadow"
    ],
    "icons": [
      "dune",
      "sun",
      "cactus",
      "stone"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "festival",
    "label": "Festival",
    "mood": "Lantern glow, moving color, and crowded midnight joy.",
    "scene": [
      "lantern parade",
      "confetti drift",
      "midnight square"
    ],
    "icons": [
      "lantern",
      "ribbon",
      "mask",
      "drum"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "winter",
    "label": "Winterlight",
    "mood": "Cold air, silver quiet, and windows full of warmth.",
    "scene": [
      "snowglass pane",
      "frost lantern",
      "midnight snowfall"
    ],
    "icons": [
      "snow",
      "frost",
      "pines",
      "hearth"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "invent",
    "label": "Invention",
    "mood": "Workshop sparks and ideas with moving parts.",
    "scene": [
      "copper spark",
      "draft table",
      "gear hum"
    ],
    "icons": [
      "gear",
      "spark",
      "blueprint",
      "switch"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "story",
    "label": "Storybook",
    "mood": "Pages, voices, and moonlit turns of plot.",
    "scene": [
      "paper lantern",
      "ink river",
      "quiet chapter"
    ],
    "icons": [
      "book",
      "quill",
      "candle",
      "mask"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  },
  {
    "id": "greek",
    "label": "Greek Letters",
    "mood": "Glyphs, symbols, and a playful coded layer.",
    "scene": [
      "glyph spiral",
      "scholar glow",
      "cipher trace"
    ],
    "icons": [
      "alpha",
      "sigma",
      "omega",
      "delta"
    ],
    "easy": [],
    "medium": [],
    "hard": []
  }
];

export const contentCatalog: ContentPack[] = [
  {
    "id": "myth-beings",
    "topicId": "myth",
    "label": "Mythic Beings",
    "summary": "Gods, monsters, and legendary figures.",
    "answers": [
      "titan",
      "hero",
      "nymph",
      "pegasus",
      "siren",
      "chimera",
      "hydra",
      "centaur",
      "gorgon",
      "atlas",
      "immortal",
      "titaness"
    ]
  },
  {
    "id": "myth-relics",
    "topicId": "myth",
    "label": "Sacred Relics",
    "summary": "Temples, omens, and old ceremonial artifacts.",
    "answers": [
      "oracle",
      "temple",
      "olive",
      "shield",
      "laurel",
      "trident",
      "labyrinth",
      "prophecy",
      "ambrosia",
      "relic",
      "citadel",
      "amphora",
      "omen",
      "ritual",
      "talisman",
      "pantheon",
      "aegis"
    ]
  },
  {
    "id": "cosmos-flight",
    "topicId": "cosmos",
    "label": "Orbital Flight",
    "summary": "Craft, launches, and machines that cross the sky.",
    "answers": [
      "rocket",
      "orbit",
      "signal",
      "shuttle",
      "rover",
      "satellite",
      "module",
      "capsule",
      "trajectory",
      "observatory",
      "antenna",
      "launchpad"
    ]
  },
  {
    "id": "cosmos-phenomena",
    "topicId": "cosmos",
    "label": "Stellar Phenomena",
    "summary": "The sky itself: light, dust, and celestial events.",
    "answers": [
      "planet",
      "comet",
      "meteor",
      "galaxy",
      "nebula",
      "lunar",
      "solar",
      "crater",
      "aurora",
      "asteroid",
      "stardust",
      "eclipse",
      "photon",
      "zenith",
      "pulsar",
      "stellar",
      "spectrum",
      "fusion",
      "quantum",
      "celestial"
    ]
  },
  {
    "id": "ocean-life",
    "topicId": "ocean",
    "label": "Sea Life",
    "summary": "Creatures and living detail beneath the tide.",
    "answers": [
      "coral",
      "shell",
      "reef",
      "dolphin",
      "kelp",
      "seagull",
      "seabed",
      "barnacle",
      "lanternfish",
      "tidepool",
      "brackish",
      "undertow"
    ]
  },
  {
    "id": "ocean-sailing",
    "topicId": "ocean",
    "label": "Sailing & Shore",
    "summary": "Harbors, navigation, craft, and coastlines.",
    "answers": [
      "harbor",
      "tide",
      "anchor",
      "marina",
      "current",
      "sailor",
      "vessel",
      "beacon",
      "compass",
      "trawler",
      "ferry",
      "estuary",
      "captaincy",
      "shoreline",
      "seaworthy",
      "semaphore"
    ]
  },
  {
    "id": "garden-blooms",
    "topicId": "garden",
    "label": "Petals & Blooms",
    "summary": "Flowers, petals, pollen, and bright color.",
    "answers": [
      "rose",
      "tulip",
      "orchard",
      "blossom",
      "pollen",
      "nectar",
      "sunflower",
      "lavender",
      "petal",
      "marigold",
      "moonflower",
      "wildflower",
      "chrysanthemum"
    ]
  },
  {
    "id": "garden-growers",
    "topicId": "garden",
    "label": "Roots & Growers",
    "summary": "Leaves, herbs, vines, and the work of growing.",
    "answers": [
      "fern",
      "cedar",
      "ivy",
      "basil",
      "meadow",
      "seedling",
      "trellis",
      "mint",
      "clover",
      "willow",
      "root",
      "stem",
      "greenhouse",
      "rosemary",
      "arborist",
      "vinework",
      "seedpod",
      "grove",
      "evergreen",
      "herbarium",
      "pollinator",
      "glasshouse",
      "understory"
    ]
  },
  {
    "id": "city-transit",
    "topicId": "city",
    "label": "Transit Grid",
    "summary": "Subways, stations, and routes through the city.",
    "answers": [
      "avenue",
      "subway",
      "bridge",
      "signal",
      "plaza",
      "station",
      "tunnel",
      "courier",
      "traffic",
      "boulevard",
      "sidewalk",
      "overpass",
      "timetable",
      "underpass",
      "metroline"
    ]
  },
  {
    "id": "city-night",
    "topicId": "city",
    "label": "Night Lights",
    "summary": "Rooftops, storefronts, and after-hours glow.",
    "answers": [
      "market",
      "skyline",
      "lantern",
      "cafe",
      "mural",
      "alley",
      "rooftop",
      "district",
      "balcony",
      "headlight",
      "afterhours",
      "storefront",
      "highrise",
      "warehouse",
      "cityscape",
      "courtyard",
      "brickwork"
    ]
  },
  {
    "id": "music-stage",
    "topicId": "music",
    "label": "Stage Energy",
    "summary": "Performance, rhythm, and live-show momentum.",
    "answers": [
      "melody",
      "chorus",
      "rhythm",
      "ballad",
      "tempo",
      "lyric",
      "cadence",
      "drummer",
      "echo",
      "stanza",
      "refrain",
      "bridgework",
      "riffing",
      "setlist",
      "downbeat",
      "headliner",
      "resonance",
      "backbeat",
      "soundcheck",
      "tunecraft"
    ]
  },
  {
    "id": "music-instruments",
    "topicId": "music",
    "label": "Instruments & Sound",
    "summary": "Objects and structures that make the music happen.",
    "answers": [
      "piano",
      "violin",
      "trumpet",
      "harmony",
      "record",
      "microphone",
      "crescendo",
      "overture",
      "songbook",
      "symphonic",
      "counterpoint",
      "soundboard",
      "orchestral",
      "interlude",
      "syncopation"
    ]
  },
  {
    "id": "kitchen-pantry",
    "topicId": "kitchen",
    "label": "Pantry Staples",
    "summary": "Core ingredients, tools, and everyday prep.",
    "answers": [
      "skillet",
      "pepper",
      "butter",
      "whisk",
      "kettle",
      "pantry",
      "noodle",
      "recipe",
      "garlic",
      "honey",
      "rosemary",
      "marinade",
      "teacup",
      "saucepan",
      "fermentation",
      "buttermilk"
    ]
  },
  {
    "id": "kitchen-bakes",
    "topicId": "kitchen",
    "label": "Bakes & Sweets",
    "summary": "Warm ovens, cocoa, pastry, and dessert craft.",
    "answers": [
      "biscuit",
      "simmer",
      "berry",
      "pastry",
      "cocoa",
      "supper",
      "feast",
      "sourdough",
      "caramel",
      "bakehouse",
      "cinnamon",
      "confection",
      "hearthstone",
      "crystallized",
      "aromatic",
      "charbroiled"
    ]
  },
  {
    "id": "wild-creatures",
    "topicId": "wild",
    "label": "Wild Creatures",
    "summary": "Animals, feathers, and motion in the open wild.",
    "answers": [
      "falcon",
      "otter",
      "wolf",
      "feather",
      "trail",
      "campfire",
      "ridgeback",
      "wanderer"
    ]
  },
  {
    "id": "wild-landforms",
    "topicId": "wild",
    "label": "Peaks & Rivers",
    "summary": "Ground, stone, and the shape of the landscape.",
    "answers": [
      "forest",
      "canyon",
      "summit",
      "river",
      "boulder",
      "pine",
      "timber",
      "meadow",
      "granite",
      "valley",
      "sunrise",
      "moonrise",
      "waterfall",
      "hillside",
      "stonepath",
      "firelight",
      "highland",
      "backpack",
      "wilderness",
      "mountaintop",
      "glacial",
      "riverbend",
      "overland"
    ]
  },
  {
    "id": "weather-storms",
    "topicId": "weather",
    "label": "Stormfront",
    "summary": "Rain, wind, thunder, and hard-moving weather.",
    "answers": [
      "thunder",
      "drizzle",
      "cyclone",
      "hailstorm",
      "monsoon",
      "gust",
      "forecast",
      "lightning",
      "moonstorm",
      "rainfall",
      "windward",
      "stormfront",
      "heatwave",
      "barometric",
      "thunderhead",
      "torrential",
      "solarwind"
    ]
  },
  {
    "id": "weather-skies",
    "topicId": "weather",
    "label": "Sky Signs",
    "summary": "Clouds, color, and changing light overhead.",
    "answers": [
      "breeze",
      "rainbow",
      "frost",
      "mist",
      "sunset",
      "shadow",
      "winter",
      "summer",
      "daybreak",
      "overcast",
      "cloudbank",
      "atmospheric",
      "luminescent",
      "nocturnal"
    ]
  },
  {
    "id": "desert-survival",
    "topicId": "desert",
    "label": "Dunes & Survival",
    "summary": "Travel, shelter, and motion across the dry open land.",
    "answers": [
      "dune",
      "cactus",
      "oasis",
      "mesa",
      "canyon",
      "lizard",
      "mirage",
      "lantern",
      "trail",
      "nomad",
      "caravan",
      "saddle",
      "drywind",
      "sundial",
      "jackal",
      "campfire",
      "sandstorm",
      "waystation",
      "caravanserai"
    ]
  },
  {
    "id": "desert-stones",
    "topicId": "desert",
    "label": "Stone & Heat",
    "summary": "Mineral, sunlight, and arid formations.",
    "answers": [
      "amber",
      "sandstone",
      "windcarved",
      "moonbasin",
      "saltplain",
      "dusttrail",
      "sunbaked",
      "torchline",
      "ridgeglass",
      "horizonless",
      "sunscorched",
      "glasssand",
      "aridlands",
      "weatherstone",
      "sandstonekeep"
    ]
  },
  {
    "id": "festival-parade",
    "topicId": "festival",
    "label": "Parade Route",
    "summary": "Lanterns, banners, and moving celebration.",
    "answers": [
      "parade",
      "lantern",
      "ribbon",
      "confetti",
      "banner",
      "costume",
      "drummer",
      "ticket",
      "sparkle",
      "carnival",
      "firework",
      "market",
      "dancer",
      "procession",
      "paperlight",
      "streamers",
      "fairground"
    ]
  },
  {
    "id": "festival-performance",
    "topicId": "festival",
    "label": "Stage & Sound",
    "summary": "Performance energy, spotlight, and night-square spectacle.",
    "answers": [
      "stage",
      "chorus",
      "trumpet",
      "moonstage",
      "celebratory",
      "afterglow",
      "headliner",
      "spotlight",
      "pageantry",
      "masquerade",
      "illuminations",
      "soundscape",
      "wonderlight",
      "revelatory"
    ]
  },
  {
    "id": "winter-weather",
    "topicId": "winter",
    "label": "Frost & Snow",
    "summary": "Cold air, snowfall, and ice-bright weather.",
    "answers": [
      "winter",
      "frost",
      "icicle",
      "snowfall",
      "moonfrost",
      "snowdrift",
      "northwind",
      "moonsnow",
      "silverpine",
      "crystalline",
      "everfrost",
      "glimmersnow",
      "frostbound"
    ]
  },
  {
    "id": "winter-cozy",
    "topicId": "winter",
    "label": "Cozy Hearth",
    "summary": "Warm shelter, fireside comfort, and winter calm.",
    "answers": [
      "pinewood",
      "blanket",
      "firelight",
      "cocoa",
      "mitten",
      "sled",
      "lantern",
      "chimney",
      "scarf",
      "hearthlight",
      "windowglow",
      "fireside",
      "weatherglass",
      "wintertide"
    ]
  },
  {
    "id": "invent-workshop",
    "topicId": "invent",
    "label": "Workshop Mechanics",
    "summary": "Tools, gears, and moving engineered parts.",
    "answers": [
      "engine",
      "circuit",
      "piston",
      "magnet",
      "lever",
      "pulley",
      "copper",
      "gadget",
      "blueprint",
      "signal",
      "battery",
      "workshop",
      "spark",
      "rotor",
      "prototype",
      "torque",
      "pressure",
      "valve",
      "motioncraft",
      "gearbox",
      "mechanism",
      "calibration",
      "microcircuit",
      "instrumentation"
    ]
  },
  {
    "id": "invent-power",
    "topicId": "invent",
    "label": "Spark & Energy",
    "summary": "Voltage, ignition, and powered invention language.",
    "answers": [
      "lanternwork",
      "voltage",
      "oscillation",
      "steamdriven",
      "architecture"
    ]
  },
  {
    "id": "story-books",
    "topicId": "story",
    "label": "Books & Pages",
    "summary": "Authors, paper, journals, and the physical story world.",
    "answers": [
      "chapter",
      "author",
      "library",
      "paper",
      "letter",
      "journal",
      "prologue",
      "bookmark",
      "passage",
      "chapterhouse",
      "epilogue",
      "manuscript"
    ]
  },
  {
    "id": "story-plot",
    "topicId": "story",
    "label": "Plot & Voices",
    "summary": "Narration, mystery, endings, and turns of story.",
    "answers": [
      "lantern",
      "whisper",
      "fable",
      "riddle",
      "ending",
      "villain",
      "secret",
      "witness",
      "narrator",
      "moonlight",
      "plotline",
      "folktale",
      "mystery",
      "allegorical",
      "storytelling",
      "dreamscape",
      "cliffhanger"
    ]
  },
  {
    "id": "greek-symbols",
    "topicId": "greek",
    "label": "Letter Forms",
    "summary": "Core Greek letters and symbol marks.",
    "answers": [
      "alpha",
      "beta",
      "gamma",
      "delta",
      "sigma",
      "omega",
      "theta",
      "lambda",
      "kappa",
      "mu",
      "pi",
      "rho",
      "tau",
      "phi",
      "psi",
      "zeta",
      "eta",
      "iota"
    ]
  },
  {
    "id": "greek-scholar",
    "topicId": "greek",
    "label": "Scholar Signs",
    "summary": "Notation, codex, and language around symbol study.",
    "answers": [
      "epsilon",
      "omicron",
      "upsilon",
      "digamma",
      "glyphic",
      "symbolist",
      "theorem",
      "notation",
      "lexicon",
      "codex",
      "philosophic",
      "harmonics",
      "mnemonic",
      "semiotic",
      "etymology",
      "iconography"
    ]
  }
];

export const wordBank: PuzzleWord[] = [
  {
    "id": "myth-breeze-1",
    "answer": "titan",
    "normalized": "titan",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A primordial giant from Greek mythology.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A primordial giant from Greek mythology.",
    "microHint": "Starts with T, runs 5 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ti-ta-n",
    "usageExample": "Example: \"In the old tale, the titan appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know titan yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "torch",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "torch",
      "laurel fire",
      "5 letters"
    ],
    "greekMark": "beta",
    "weight": 2
  },
  {
    "id": "myth-breeze-2",
    "answer": "hero",
    "normalized": "hero",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A central figure admired for courageous deeds.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "A central figure admired for courageous deeds.",
    "microHint": "Starts with H, runs 4 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: he-ro",
    "usageExample": "Example: \"In the old tale, the hero appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know hero yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "owl",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "lyre",
      "laurel fire",
      "4 letters"
    ],
    "greekMark": "gamma",
    "weight": 2
  },
  {
    "id": "myth-breeze-3",
    "answer": "nymph",
    "normalized": "nymph",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A nature spirit in Greek and Roman mythology.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A nature spirit in Greek and Roman mythology.",
    "microHint": "Starts with N, runs 5 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ny-mph",
    "usageExample": "Example: \"In the old tale, the nymph appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know nymph yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "torch",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "column",
      "laurel fire",
      "5 letters"
    ],
    "greekMark": "delta",
    "weight": 2
  },
  {
    "id": "myth-breeze-12",
    "answer": "pegasus",
    "normalized": "pegasus",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The winged horse of Greek mythology.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "The winged horse of Greek mythology.",
    "microHint": "Starts with P, runs 7 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: pe-ga-su-s",
    "usageExample": "Example: \"In the old tale, the pegasus appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know pegasus yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "column",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "owl",
      "laurel fire",
      "7 letters"
    ],
    "greekMark": "alpha",
    "weight": 2
  },
  {
    "id": "myth-breeze-15",
    "answer": "siren",
    "normalized": "siren",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A mythical singer whose voice lured sailors toward danger.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A mythical singer whose voice lured sailors toward danger.",
    "microHint": "Starts with S, runs 5 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: si-re-n",
    "usageExample": "Example: \"In the old tale, the siren appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know siren yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "torch",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "column",
      "laurel fire",
      "5 letters"
    ],
    "greekMark": "delta",
    "weight": 2
  },
  {
    "id": "myth-breeze-16",
    "answer": "chimera",
    "normalized": "chimera",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A fire-breathing hybrid monster from Greek mythology.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "A fire-breathing hybrid monster from Greek mythology.",
    "microHint": "Starts with C, runs 7 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: chi-me-ra",
    "usageExample": "Example: \"In the old tale, the chimera appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know chimera yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "column",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "owl",
      "laurel fire",
      "7 letters"
    ],
    "greekMark": "epsilon",
    "weight": 2
  },
  {
    "id": "myth-breeze-17",
    "answer": "hydra",
    "normalized": "hydra",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The many-headed serpent defeated by Heracles.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The many-headed serpent defeated by Heracles.",
    "microHint": "Starts with H, runs 5 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: hy-dra",
    "usageExample": "Example: \"In the old tale, the hydra appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know hydra yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "torch",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "torch",
      "laurel fire",
      "5 letters"
    ],
    "greekMark": "zeta",
    "weight": 2
  },
  {
    "id": "myth-breeze-18",
    "answer": "atlas",
    "normalized": "atlas",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The Titan condemned to hold up the heavens.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The Titan condemned to hold up the heavens.",
    "microHint": "Starts with A, runs 5 letters, and leans toward ancient voices, heroic paths, and temple dust..",
    "teaser": "Myth & Legend energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Myth & Legend language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: a-tla-s",
    "usageExample": "Example: \"In the old tale, the atlas appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know atlas yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "torch",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "lyre",
      "laurel fire",
      "5 letters"
    ],
    "greekMark": "eta",
    "weight": 2
  },
  {
    "id": "myth-quest-2",
    "answer": "immortal",
    "normalized": "immortal",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A being that lives forever and cannot die.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "A being that lives forever and cannot die.",
    "microHint": "Starts with I, runs 8 letters, and leans toward ancient voices, heroic paths, and temple dust. with a little extra texture.",
    "teaser": "Myth & Legend energy with a steady build. There is a little extra texture here.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: i-mmo-rta-l",
    "usageExample": "Example: \"In the old tale, the immortal appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know immortal yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "owl",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "lyre",
      "marble echo",
      "8 letters"
    ],
    "greekMark": "delta",
    "weight": 3
  },
  {
    "id": "myth-quest-4",
    "answer": "centaur",
    "normalized": "centaur",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A mythical being with a human torso and a horse’s body.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 7,
    "prompt": "A mythical being with a human torso and a horse’s body.",
    "microHint": "Starts with C, runs 7 letters, and leans toward ancient voices, heroic paths, and temple dust. with a little extra texture.",
    "teaser": "Myth & Legend energy with a steady build. There is a little extra texture here.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: ce-ntau-r",
    "usageExample": "Example: \"In the old tale, the centaur appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know centaur yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "column",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "owl",
      "marble echo",
      "7 letters"
    ],
    "greekMark": "zeta",
    "weight": 3
  },
  {
    "id": "myth-quest-5",
    "answer": "gorgon",
    "normalized": "gorgon",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A snake-haired monster whose gaze could turn people to stone.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 6,
    "prompt": "A snake-haired monster whose gaze could turn people to stone.",
    "microHint": "Starts with G, runs 6 letters, and leans toward ancient voices, heroic paths, and temple dust. with a little extra texture.",
    "teaser": "Myth & Legend energy with a quick strike. There is a little extra texture here.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: go-rgo-n",
    "usageExample": "Example: \"In the old tale, the gorgon appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know gorgon yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "lyre",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "torch",
      "marble echo",
      "6 letters"
    ],
    "greekMark": "eta",
    "weight": 3
  },
  {
    "id": "myth-quest-14",
    "answer": "titaness",
    "normalized": "titaness",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A female member of the Titans in Greek mythology.",
    "topicId": "myth",
    "topicLabel": "Myth & Legend",
    "contentPackIds": [
      "myth-beings"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "A female member of the Titans in Greek mythology.",
    "microHint": "Starts with T, runs 8 letters, and leans toward ancient voices, heroic paths, and temple dust. with a little extra texture.",
    "teaser": "Myth & Legend energy with a steady build. There is a little extra texture here.",
    "learningNote": "Myth & Legend language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a legend or old-story idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: ti-ta-ne-ss",
    "usageExample": "Example: \"In the old tale, the titaness appeared near the temple steps.\"",
    "translationAid": "Translation aid: if you do not know titaness yet, first picture laurel fire, then connect it to myth & legend vocabulary instead of translating word by word.",
    "relatedWords": [
      "owl",
      "laurel fire",
      "myth  legend"
    ],
    "visuals": [
      "lyre",
      "marble echo",
      "8 letters"
    ],
    "greekMark": "delta",
    "weight": 3
  },
  {
    "id": "cosmos-breeze-2",
    "answer": "rocket",
    "normalized": "rocket",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A vehicle propelled upward by engines that expel hot gas.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 6,
    "prompt": "A vehicle propelled upward by engines that expel hot gas.",
    "microHint": "Starts with R, runs 6 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ro-cke-t",
    "usageExample": "Example: \"The crew watched the rocket drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know rocket yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "comet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "comet",
      "signal haze",
      "6 letters"
    ],
    "greekMark": "gamma",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-5",
    "answer": "orbit",
    "normalized": "orbit",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The curved path one object follows around another in space.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The curved path one object follows around another in space.",
    "microHint": "Starts with O, runs 5 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: o-rbi-t",
    "usageExample": "Example: \"The crew watched the orbit drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know orbit yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "ring",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "ring",
      "signal haze",
      "5 letters"
    ],
    "greekMark": "zeta",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-10",
    "answer": "signal",
    "normalized": "signal",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A transmitted message used to communicate across a distance.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 6,
    "prompt": "A transmitted message used to communicate across a distance.",
    "microHint": "Starts with S, runs 6 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: si-gna-l",
    "usageExample": "Example: \"The crew watched the signal drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know signal yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "comet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "comet",
      "signal haze",
      "6 letters"
    ],
    "greekMark": "lambda",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-13",
    "answer": "shuttle",
    "normalized": "shuttle",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A reusable craft designed to travel between Earth and space.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "A reusable craft designed to travel between Earth and space.",
    "microHint": "Starts with S, runs 7 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: shu-ttle",
    "usageExample": "Example: \"The crew watched the shuttle drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know shuttle yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "planet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "ring",
      "signal haze",
      "7 letters"
    ],
    "greekMark": "beta",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-14",
    "answer": "rover",
    "normalized": "rover",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A robotic vehicle built to explore another world’s surface.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A robotic vehicle built to explore another world’s surface.",
    "microHint": "Starts with R, runs 5 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ro-ve-r",
    "usageExample": "Example: \"The crew watched the rover drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know rover yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "ring",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "comet",
      "signal haze",
      "5 letters"
    ],
    "greekMark": "gamma",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-16",
    "answer": "satellite",
    "normalized": "satellite",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "An object that travels around a planet or other body.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 9,
    "prompt": "An object that travels around a planet or other body.",
    "microHint": "Starts with S, runs 9 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like longer expressive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: sa-te-lli-te",
    "usageExample": "Example: \"The crew watched the satellite drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know satellite yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "ring",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "star",
      "signal haze",
      "9 letters"
    ],
    "greekMark": "epsilon",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-19",
    "answer": "module",
    "normalized": "module",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A self-contained section of a spacecraft or station.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 6,
    "prompt": "A self-contained section of a spacecraft or station.",
    "microHint": "Starts with M, runs 6 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: mo-du-le",
    "usageExample": "Example: \"The crew watched the module drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know module yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "comet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "planet",
      "signal haze",
      "6 letters"
    ],
    "greekMark": "theta",
    "weight": 2
  },
  {
    "id": "cosmos-breeze-20",
    "answer": "capsule",
    "normalized": "capsule",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A compact crew compartment designed for spaceflight and return.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "A compact crew compartment designed for spaceflight and return.",
    "microHint": "Starts with C, runs 7 letters, and leans toward orbital drift, radiant dust, and patient signals..",
    "teaser": "Cosmos energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a space or sky idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ca-psu-le",
    "usageExample": "Example: \"The crew watched the capsule drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know capsule yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "planet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "star",
      "signal haze",
      "7 letters"
    ],
    "greekMark": "iota",
    "weight": 2
  },
  {
    "id": "cosmos-quest-8",
    "answer": "trajectory",
    "normalized": "trajectory",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The calculated path of a moving object through space.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 10,
    "prompt": "The calculated path of a moving object through space.",
    "microHint": "Starts with T, runs 10 letters, and leans toward orbital drift, radiant dust, and patient signals. with a little extra texture.",
    "teaser": "Cosmos energy with a longer reveal. There is a little extra texture here.",
    "learningNote": "Cosmos language cue: this answer behaves like longer expressive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a space or sky idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: tra-je-cto-ry",
    "usageExample": "Example: \"The crew watched the trajectory drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know trajectory yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "comet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "star",
      "planet glow",
      "10 letters"
    ],
    "greekMark": "kappa",
    "weight": 3
  },
  {
    "id": "cosmos-quest-9",
    "answer": "observatory",
    "normalized": "observatory",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A facility equipped to study the sky and celestial objects.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 11,
    "prompt": "A facility equipped to study the sky and celestial objects.",
    "microHint": "Starts with O, runs 11 letters, and leans toward orbital drift, radiant dust, and patient signals. with a little extra texture.",
    "teaser": "Cosmos energy with a longer reveal. There is a little extra texture here.",
    "learningNote": "Cosmos language cue: this answer behaves like longer expressive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a space or sky idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: o-bse-rva-to-ry",
    "usageExample": "Example: \"The crew watched the observatory drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know observatory yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "planet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "ring",
      "planet glow",
      "11 letters"
    ],
    "greekMark": "lambda",
    "weight": 3
  },
  {
    "id": "cosmos-quest-13",
    "answer": "antenna",
    "normalized": "antenna",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A device that sends or receives radio waves.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 7,
    "prompt": "A device that sends or receives radio waves.",
    "microHint": "Starts with A, runs 7 letters, and leans toward orbital drift, radiant dust, and patient signals. with a little extra texture.",
    "teaser": "Cosmos energy with a steady build. There is a little extra texture here.",
    "learningNote": "Cosmos language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a space or sky idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: a-nte-nna",
    "usageExample": "Example: \"The crew watched the antenna drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know antenna yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "planet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "ring",
      "planet glow",
      "7 letters"
    ],
    "greekMark": "gamma",
    "weight": 3
  },
  {
    "id": "cosmos-quest-20",
    "answer": "launchpad",
    "normalized": "launchpad",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The prepared platform from which a spacecraft takes off.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 9,
    "prompt": "The prepared platform from which a spacecraft takes off.",
    "microHint": "Starts with L, runs 9 letters, and leans toward orbital drift, radiant dust, and patient signals. with a little extra texture.",
    "teaser": "Cosmos energy with a steady build. There is a little extra texture here.",
    "learningNote": "Cosmos language cue: this answer behaves like longer expressive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a space or sky idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: lau-nchpa-d",
    "usageExample": "Example: \"The crew watched the launchpad drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know launchpad yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "ring",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "star",
      "planet glow",
      "9 letters"
    ],
    "greekMark": "kappa",
    "weight": 3
  },
  {
    "id": "cosmos-mythic-17",
    "answer": "observatory",
    "normalized": "observatory",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A facility equipped to study the sky and celestial objects.",
    "topicId": "cosmos",
    "topicLabel": "Cosmos",
    "contentPackIds": [
      "cosmos-flight"
    ],
    "difficulty": "mythic",
    "frequencyBand": "rare",
    "length": 11,
    "prompt": "A facility equipped to study the sky and celestial objects.",
    "microHint": "Starts with O, runs 11 letters, leans toward orbital drift, radiant dust, and patient signals., and sits in the sharper end of the lexicon.",
    "teaser": "Cosmos energy with a longer reveal. Expect a less obvious finish.",
    "learningNote": "Cosmos language cue: this answer behaves like longer expressive vocabulary. It is less frequent, so use the scene and tone together.",
    "plainMeaning": "Plain meaning: think of a space or sky idea, but in a less common or more literary way.",
    "pronunciationHint": "Pronunciation: o-bse-rva-to-ry",
    "usageExample": "Example: \"The crew watched the observatory drift across the dark sky.\"",
    "translationAid": "Translation aid: if you do not know observatory yet, first picture signal haze, then connect it to cosmos vocabulary instead of translating word by word.",
    "relatedWords": [
      "planet",
      "signal haze",
      "cosmos"
    ],
    "visuals": [
      "ring",
      "midnight orbit",
      "11 letters"
    ],
    "greekMark": "theta",
    "weight": 4
  },
  {
    "id": "ocean-breeze-0",
    "answer": "coral",
    "normalized": "coral",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A marine animal whose colonies can build vast reefs.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A marine animal whose colonies can build vast reefs.",
    "microHint": "Starts with C, runs 5 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: co-ra-l",
    "usageExample": "Example: \"From the harbor wall, the coral stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know coral yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "shell",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "wave",
      "foam trail",
      "5 letters"
    ],
    "greekMark": "alpha",
    "weight": 2
  },
  {
    "id": "ocean-breeze-5",
    "answer": "shell",
    "normalized": "shell",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A hard outer covering made by many sea creatures.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "A hard outer covering made by many sea creatures.",
    "microHint": "Starts with S, runs 5 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: she-ll",
    "usageExample": "Example: \"From the harbor wall, the shell stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know shell yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "shell",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "shell",
      "foam trail",
      "5 letters"
    ],
    "greekMark": "zeta",
    "weight": 2
  },
  {
    "id": "ocean-breeze-6",
    "answer": "reef",
    "normalized": "reef",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A ridge of rock or living material near the sea’s surface.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "A ridge of rock or living material near the sea’s surface.",
    "microHint": "Starts with R, runs 4 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ree-f",
    "usageExample": "Example: \"From the harbor wall, the reef stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know reef yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "anchor",
      "foam trail",
      "4 letters"
    ],
    "greekMark": "eta",
    "weight": 2
  },
  {
    "id": "ocean-breeze-8",
    "answer": "dolphin",
    "normalized": "dolphin",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "An intelligent marine mammal known for clicks and whistles.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "An intelligent marine mammal known for clicks and whistles.",
    "microHint": "Starts with D, runs 7 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: do-lphi-n",
    "usageExample": "Example: \"From the harbor wall, the dolphin stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know dolphin yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "coral",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "wave",
      "foam trail",
      "7 letters"
    ],
    "greekMark": "iota",
    "weight": 2
  },
  {
    "id": "ocean-breeze-16",
    "answer": "kelp",
    "normalized": "kelp",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A large brown seaweed that can form underwater forests.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "A large brown seaweed that can form underwater forests.",
    "microHint": "Starts with K, runs 4 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ke-lp",
    "usageExample": "Example: \"From the harbor wall, the kelp stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know kelp yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "wave",
      "foam trail",
      "4 letters"
    ],
    "greekMark": "epsilon",
    "weight": 2
  },
  {
    "id": "ocean-breeze-17",
    "answer": "seagull",
    "normalized": "seagull",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A coastal bird often seen circling beaches and harbors.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 7,
    "prompt": "A coastal bird often seen circling beaches and harbors.",
    "microHint": "Starts with S, runs 7 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a steady build. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: sea-gu-ll",
    "usageExample": "Example: \"From the harbor wall, the seagull stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know seagull yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "coral",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "shell",
      "foam trail",
      "7 letters"
    ],
    "greekMark": "zeta",
    "weight": 2
  },
  {
    "id": "ocean-breeze-18",
    "answer": "seabed",
    "normalized": "seabed",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The ground at the bottom of a sea or ocean.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 6,
    "prompt": "The ground at the bottom of a sea or ocean.",
    "microHint": "Starts with S, runs 6 letters, and leans toward salt air, deep water, and bright things under the tide..",
    "teaser": "Ocean energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: sea-be-d",
    "usageExample": "Example: \"From the harbor wall, the seabed stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know seabed yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "anchor",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "anchor",
      "foam trail",
      "6 letters"
    ],
    "greekMark": "eta",
    "weight": 2
  },
  {
    "id": "ocean-quest-0",
    "answer": "brackish",
    "normalized": "brackish",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "Describing water that is partly fresh and partly salty.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "Describing water that is partly fresh and partly salty.",
    "microHint": "Starts with B, runs 8 letters, and leans toward salt air, deep water, and bright things under the tide. with a little extra texture.",
    "teaser": "Ocean energy with a steady build. There is a little extra texture here.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: bra-cki-sh",
    "usageExample": "Example: \"From the harbor wall, the brackish stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know brackish yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "wave",
      "tidal shimmer",
      "8 letters"
    ],
    "greekMark": "beta",
    "weight": 3
  },
  {
    "id": "ocean-quest-1",
    "answer": "lanternfish",
    "normalized": "lanternfish",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A small deep-sea fish with light-producing organs.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 11,
    "prompt": "A small deep-sea fish with light-producing organs.",
    "microHint": "Starts with L, runs 11 letters, and leans toward salt air, deep water, and bright things under the tide. with a little extra texture.",
    "teaser": "Ocean energy with a longer reveal. There is a little extra texture here.",
    "learningNote": "Ocean language cue: this answer behaves like longer expressive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: la-nte-rnfi-sh",
    "usageExample": "Example: \"From the harbor wall, the lanternfish stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know lanternfish yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "coral",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "shell",
      "tidal shimmer",
      "11 letters"
    ],
    "greekMark": "gamma",
    "weight": 3
  },
  {
    "id": "ocean-quest-3",
    "answer": "tidepool",
    "normalized": "tidepool",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A rocky hollow that holds seawater after the tide retreats.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "A rocky hollow that holds seawater after the tide retreats.",
    "microHint": "Starts with T, runs 8 letters, and leans toward salt air, deep water, and bright things under the tide. with a little extra texture.",
    "teaser": "Ocean energy with a steady build. There is a little extra texture here.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: ti-de-poo-l",
    "usageExample": "Example: \"From the harbor wall, the tidepool stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know tidepool yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "coral",
      "tidal shimmer",
      "8 letters"
    ],
    "greekMark": "epsilon",
    "weight": 3
  },
  {
    "id": "ocean-quest-4",
    "answer": "barnacle",
    "normalized": "barnacle",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A small crustacean that fixes itself to rocks, boats, or whales.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "A small crustacean that fixes itself to rocks, boats, or whales.",
    "microHint": "Starts with B, runs 8 letters, and leans toward salt air, deep water, and bright things under the tide. with a little extra texture.",
    "teaser": "Ocean energy with a steady build. There is a little extra texture here.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: ba-rna-cle",
    "usageExample": "Example: \"From the harbor wall, the barnacle stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know barnacle yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "wave",
      "tidal shimmer",
      "8 letters"
    ],
    "greekMark": "zeta",
    "weight": 3
  },
  {
    "id": "ocean-quest-6",
    "answer": "undertow",
    "normalized": "undertow",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "A current beneath the surface that flows away from shore.",
    "topicId": "ocean",
    "topicLabel": "Ocean",
    "contentPackIds": [
      "ocean-life"
    ],
    "difficulty": "quest",
    "frequencyBand": "uncommon",
    "length": 8,
    "prompt": "A current beneath the surface that flows away from shore.",
    "microHint": "Starts with U, runs 8 letters, and leans toward salt air, deep water, and bright things under the tide. with a little extra texture.",
    "teaser": "Ocean energy with a steady build. There is a little extra texture here.",
    "learningNote": "Ocean language cue: this answer behaves like mid-length descriptive vocabulary. It is not the first word every learner reaches for, so lean on the mood.",
    "plainMeaning": "Plain meaning: think of a sea, shore, or water idea, but with a slightly richer word than the first beginner option.",
    "pronunciationHint": "Pronunciation: u-nde-rto-w",
    "usageExample": "Example: \"From the harbor wall, the undertow stood out above the tide.\"",
    "translationAid": "Translation aid: if you do not know undertow yet, first picture foam trail, then connect it to ocean vocabulary instead of translating word by word.",
    "relatedWords": [
      "wave",
      "foam trail",
      "ocean"
    ],
    "visuals": [
      "anchor",
      "tidal shimmer",
      "8 letters"
    ],
    "greekMark": "theta",
    "weight": 3
  },
  {
    "id": "greek-breeze-0",
    "answer": "alpha",
    "normalized": "alpha",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The first letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The first letter of the Greek alphabet.",
    "microHint": "Starts with A, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: a-lpha",
    "usageExample": "Example: \"In the notes, the alpha made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know alpha yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "alpha",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "alpha",
    "weight": 2
  },
  {
    "id": "greek-breeze-1",
    "answer": "beta",
    "normalized": "beta",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The second letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "The second letter of the Greek alphabet.",
    "microHint": "Starts with B, runs 4 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: be-ta",
    "usageExample": "Example: \"In the notes, the beta made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know beta yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "alpha",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "sigma",
      "glyph spiral",
      "4 letters"
    ],
    "greekMark": "beta",
    "weight": 2
  },
  {
    "id": "greek-breeze-2",
    "answer": "gamma",
    "normalized": "gamma",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The third letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The third letter of the Greek alphabet.",
    "microHint": "Starts with G, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ga-mma",
    "usageExample": "Example: \"In the notes, the gamma made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know gamma yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "omega",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "gamma",
    "weight": 2
  },
  {
    "id": "greek-breeze-3",
    "answer": "delta",
    "normalized": "delta",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The fourth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The fourth letter of the Greek alphabet.",
    "microHint": "Starts with D, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: de-lta",
    "usageExample": "Example: \"In the notes, the delta made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know delta yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "delta",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "delta",
    "weight": 2
  },
  {
    "id": "greek-breeze-4",
    "answer": "sigma",
    "normalized": "sigma",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The eighteenth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The eighteenth letter of the Greek alphabet.",
    "microHint": "Starts with S, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: si-gma",
    "usageExample": "Example: \"In the notes, the sigma made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know sigma yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "alpha",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "epsilon",
    "weight": 2
  },
  {
    "id": "greek-breeze-5",
    "answer": "omega",
    "normalized": "omega",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The twenty-fourth and final letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The twenty-fourth and final letter of the Greek alphabet.",
    "microHint": "Starts with O, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: o-me-ga",
    "usageExample": "Example: \"In the notes, the omega made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know omega yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "sigma",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "zeta",
    "weight": 2
  },
  {
    "id": "greek-breeze-6",
    "answer": "theta",
    "normalized": "theta",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The eighth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The eighth letter of the Greek alphabet.",
    "microHint": "Starts with T, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: the-ta",
    "usageExample": "Example: \"In the notes, the theta made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know theta yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "omega",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "eta",
    "weight": 2
  },
  {
    "id": "greek-breeze-7",
    "answer": "lambda",
    "normalized": "lambda",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The eleventh letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 6,
    "prompt": "The eleventh letter of the Greek alphabet.",
    "microHint": "Starts with L, runs 6 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like mid-length descriptive vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: la-mbda",
    "usageExample": "Example: \"In the notes, the lambda made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know lambda yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "omega",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "delta",
      "glyph spiral",
      "6 letters"
    ],
    "greekMark": "theta",
    "weight": 2
  },
  {
    "id": "greek-breeze-8",
    "answer": "kappa",
    "normalized": "kappa",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The tenth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 5,
    "prompt": "The tenth letter of the Greek alphabet.",
    "microHint": "Starts with K, runs 5 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ka-ppa",
    "usageExample": "Example: \"In the notes, the kappa made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know kappa yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "sigma",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "alpha",
      "glyph spiral",
      "5 letters"
    ],
    "greekMark": "iota",
    "weight": 2
  },
  {
    "id": "greek-breeze-9",
    "answer": "rho",
    "normalized": "rho",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The seventeenth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 3,
    "prompt": "The seventeenth letter of the Greek alphabet.",
    "microHint": "Starts with R, runs 3 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: rho",
    "usageExample": "Example: \"In the notes, the rho made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know rho yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "delta",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "sigma",
      "glyph spiral",
      "3 letters"
    ],
    "greekMark": "kappa",
    "weight": 2
  },
  {
    "id": "greek-breeze-10",
    "answer": "tau",
    "normalized": "tau",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The nineteenth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 3,
    "prompt": "The nineteenth letter of the Greek alphabet.",
    "microHint": "Starts with T, runs 3 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: tau",
    "usageExample": "Example: \"In the notes, the tau made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know tau yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "delta",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "omega",
      "glyph spiral",
      "3 letters"
    ],
    "greekMark": "lambda",
    "weight": 2
  },
  {
    "id": "greek-breeze-11",
    "answer": "phi",
    "normalized": "phi",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The twenty-first letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 3,
    "prompt": "The twenty-first letter of the Greek alphabet.",
    "microHint": "Starts with P, runs 3 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: phi",
    "usageExample": "Example: \"In the notes, the phi made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know phi yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "delta",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "delta",
      "glyph spiral",
      "3 letters"
    ],
    "greekMark": "mu",
    "weight": 2
  },
  {
    "id": "greek-breeze-12",
    "answer": "psi",
    "normalized": "psi",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The twenty-third letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 3,
    "prompt": "The twenty-third letter of the Greek alphabet.",
    "microHint": "Starts with P, runs 3 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: psi",
    "usageExample": "Example: \"In the notes, the psi made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know psi yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "delta",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "alpha",
      "glyph spiral",
      "3 letters"
    ],
    "greekMark": "alpha",
    "weight": 2
  },
  {
    "id": "greek-breeze-13",
    "answer": "zeta",
    "normalized": "zeta",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The sixth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "The sixth letter of the Greek alphabet.",
    "microHint": "Starts with Z, runs 4 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: ze-ta",
    "usageExample": "Example: \"In the notes, the zeta made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know zeta yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "alpha",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "sigma",
      "glyph spiral",
      "4 letters"
    ],
    "greekMark": "beta",
    "weight": 2
  },
  {
    "id": "greek-breeze-14",
    "answer": "eta",
    "normalized": "eta",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The seventh letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 3,
    "prompt": "The seventh letter of the Greek alphabet.",
    "microHint": "Starts with E, runs 3 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: e-ta",
    "usageExample": "Example: \"In the notes, the eta made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know eta yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "delta",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "omega",
      "glyph spiral",
      "3 letters"
    ],
    "greekMark": "gamma",
    "weight": 2
  },
  {
    "id": "greek-breeze-15",
    "answer": "iota",
    "normalized": "iota",
    "source": "topic",
    "qualityStatus": "approved",
    "clue": "The ninth letter of the Greek alphabet.",
    "topicId": "greek",
    "topicLabel": "Greek Letters",
    "contentPackIds": [
      "greek-symbols"
    ],
    "difficulty": "breeze",
    "frequencyBand": "common",
    "length": 4,
    "prompt": "The ninth letter of the Greek alphabet.",
    "microHint": "Starts with I, runs 4 letters, and leans toward glyphs, symbols, and a playful coded layer..",
    "teaser": "Greek Letters energy with a quick strike. This one should read cleanly once it clicks.",
    "learningNote": "Greek Letters language cue: this answer behaves like short everyday vocabulary. It is fairly common, so connect it to the scene first.",
    "plainMeaning": "Plain meaning: think of a symbol, letter, or coded idea in a clear everyday way.",
    "pronunciationHint": "Pronunciation: io-ta",
    "usageExample": "Example: \"In the notes, the iota made the symbol easier to remember.\"",
    "translationAid": "Translation aid: if you do not know iota yet, first picture glyph spiral, then connect it to greek letters vocabulary instead of translating word by word.",
    "relatedWords": [
      "alpha",
      "glyph spiral",
      "greek letters"
    ],
    "visuals": [
      "delta",
      "glyph spiral",
      "4 letters"
    ],
    "greekMark": "delta",
    "weight": 2
  }
];
