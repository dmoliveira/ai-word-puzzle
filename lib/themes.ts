import type { ThemeStyle } from "@/lib/game-types";

export const themeStyles: ThemeStyle[] = [
  {
    id: "alpha",
    label: "Alpha Signal",
    strapline: "Crisp constellation glass with star-chart accents.",
    className: "style-alpha",
    greekConstellation: ["alpha", "beta", "gamma"],
    motif: "star lattice",
  },
  {
    id: "nebula",
    label: "Nebula Velvet",
    strapline: "Violet glow, softer contrast, denser clue atmosphere.",
    className: "style-nebula",
    greekConstellation: ["delta", "epsilon", "zeta"],
    motif: "violet dust",
  },
  {
    id: "sunforge",
    label: "Sunforge",
    strapline: "Amber and ember tones for warmer, bolder rounds.",
    className: "style-sunforge",
    greekConstellation: ["eta", "theta", "iota"],
    motif: "ember grid",
  },
  {
    id: "arcade",
    label: "Arcade Grove",
    strapline: "Mint-green pulse with playful synth energy.",
    className: "style-arcade",
    greekConstellation: ["kappa", "lambda", "mu"],
    motif: "pixel grove",
  },
];

export function getThemeStyle(styleId: ThemeStyle["id"]) {
  return themeStyles.find((style) => style.id === styleId) ?? themeStyles[0];
}
