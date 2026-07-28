import type { ContentPackId, TopicId } from "@/lib/game-types";

export const crosswordTopicIds = ["myth", "cosmos", "ocean", "greek"] as const satisfies readonly TopicId[];
export const crosswordContentPackIds = ["myth-beings", "cosmos-flight", "ocean-life", "greek-symbols"] as const satisfies readonly ContentPackId[];

const editorialClues: Record<(typeof crosswordTopicIds)[number], Record<string, string>> = {
  myth: {
    titan: "A primordial giant from Greek mythology.",
    hero: "A central figure admired for courageous deeds.",
    nymph: "A nature spirit in Greek and Roman mythology.",
    pegasus: "The winged horse of Greek mythology.",
    siren: "A mythical singer whose voice lured sailors toward danger.",
    chimera: "A fire-breathing hybrid monster from Greek mythology.",
    hydra: "The many-headed serpent defeated by Heracles.",
    centaur: "A mythical being with a human torso and a horse’s body.",
    gorgon: "A snake-haired monster whose gaze could turn people to stone.",
    atlas: "The Titan condemned to hold up the heavens.",
    immortal: "A being that lives forever and cannot die.",
    titaness: "A female member of the Titans in Greek mythology.",
  },
  cosmos: {
    rocket: "A vehicle propelled upward by engines that expel hot gas.",
    orbit: "The curved path one object follows around another in space.",
    signal: "A transmitted message used to communicate across a distance.",
    shuttle: "A reusable craft designed to travel between Earth and space.",
    rover: "A robotic vehicle built to explore another world’s surface.",
    satellite: "An object that travels around a planet or other body.",
    module: "A self-contained section of a spacecraft or station.",
    capsule: "A compact crew compartment designed for spaceflight and return.",
    trajectory: "The calculated path of a moving object through space.",
    observatory: "A facility equipped to study the sky and celestial objects.",
    antenna: "A device that sends or receives radio waves.",
    launchpad: "The prepared platform from which a spacecraft takes off.",
  },
  ocean: {
    coral: "A marine animal whose colonies can build vast reefs.",
    shell: "A hard outer covering made by many sea creatures.",
    reef: "A ridge of rock or living material near the sea’s surface.",
    dolphin: "An intelligent marine mammal known for clicks and whistles.",
    kelp: "A large brown seaweed that can form underwater forests.",
    seagull: "A coastal bird often seen circling beaches and harbors.",
    seabed: "The ground at the bottom of a sea or ocean.",
    barnacle: "A small crustacean that fixes itself to rocks, boats, or whales.",
    lanternfish: "A small deep-sea fish with light-producing organs.",
    tidepool: "A rocky hollow that holds seawater after the tide retreats.",
    brackish: "Describing water that is partly fresh and partly salty.",
    undertow: "A current beneath the surface that flows away from shore.",
  },
  greek: {
    alpha: "The first letter of the Greek alphabet.",
    beta: "The second letter of the Greek alphabet.",
    gamma: "The third letter of the Greek alphabet.",
    delta: "The fourth letter of the Greek alphabet.",
    sigma: "The eighteenth letter of the Greek alphabet.",
    omega: "The twenty-fourth and final letter of the Greek alphabet.",
    theta: "The eighth letter of the Greek alphabet.",
    lambda: "The eleventh letter of the Greek alphabet.",
    kappa: "The tenth letter of the Greek alphabet.",
    mu: "The twelfth letter of the Greek alphabet.",
    pi: "The sixteenth Greek letter and the symbol for a circle’s circumference ratio.",
    rho: "The seventeenth letter of the Greek alphabet.",
    tau: "The nineteenth letter of the Greek alphabet.",
    phi: "The twenty-first letter of the Greek alphabet.",
    psi: "The twenty-third letter of the Greek alphabet.",
    zeta: "The sixth letter of the Greek alphabet.",
    eta: "The seventh letter of the Greek alphabet.",
    iota: "The ninth letter of the Greek alphabet.",
  },
};

export function getEditorialClue(topicId: TopicId, answer: string) {
  if (!crosswordTopicIds.includes(topicId as (typeof crosswordTopicIds)[number])) {
    return null;
  }

  return editorialClues[topicId as (typeof crosswordTopicIds)[number]][answer.toLowerCase()] ?? null;
}

export function isCrosswordTopic(topicId: TopicId) {
  return crosswordTopicIds.includes(topicId as (typeof crosswordTopicIds)[number]);
}

export function isCrosswordContentPack(contentPackId: ContentPackId) {
  return crosswordContentPackIds.includes(contentPackId as (typeof crosswordContentPackIds)[number]);
}

export function getEditorialClueCount() {
  return Object.values(editorialClues).reduce((total, topicClues) => total + Object.keys(topicClues).length, 0);
}
