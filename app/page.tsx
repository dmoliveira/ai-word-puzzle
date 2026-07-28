import { WordPuzzleStudio } from "@/app/components/word-puzzle-studio";

export default function Home() {
  return (
    <>
      <header className="border-b border-white/10 bg-slate-950/75 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-300">Free · accessible · local-first</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">Astra Lexa daily crossword and word quest</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">Solve one canonical UTC daily crossword, replay shared seeds, or build a custom crossword or trace quest. Keyboard, touch, hints, review, and progress work without an account.</p>
          </div>
          <a href="#puzzle-studio" className="accent-chip inline-flex min-h-11 items-center justify-center self-start rounded-full px-5 py-2.5 text-sm font-semibold lg:self-auto">Open the puzzle studio</a>
          <noscript><p className="text-sm text-amber-200">Astra Lexa needs JavaScript for interactive puzzle play.</p></noscript>
        </div>
      </header>
      <WordPuzzleStudio />
    </>
  );
}
