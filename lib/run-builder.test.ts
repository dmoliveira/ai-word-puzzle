import assert from "node:assert/strict";
import test from "node:test";
import { buildRunForOptions, isQuestBuilderLoaded, RunBuildAbortedError } from "@/lib/run-builder";

test("crossword generation remains synchronous in its base-bank path", async () => {
  assert.equal(isQuestBuilderLoaded(), false);
  const run = await buildRunForOptions({ mode: "custom", seed: "base-only", boardView: "crossword", puzzleSize: 4 }, 1_000);
  assert.equal(run.options.boardView, "crossword");
  assert.equal(isQuestBuilderLoaded(), false);
});

test("an already stale request is rejected before loading the Quest builder", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(buildRunForOptions({ mode: "custom", seed: "stale", boardView: "quest", puzzleSize: 4 }, 1_000, {}, controller.signal), RunBuildAbortedError);
  assert.equal(isQuestBuilderLoaded(), false);
});

test("the lazy Quest path preserves generator identity and rejects an in-flight stale request", async () => {
  const controller = new AbortController();
  const stale = buildRunForOptions({ mode: "custom", seed: "stale-quest", topics: ["story"], boardView: "quest", puzzleSize: 4 }, 1_000, { generatorVersion: 3 }, controller.signal);
  controller.abort();
  await assert.rejects(stale, RunBuildAbortedError);

  const run = await buildRunForOptions({ mode: "custom", seed: "current-quest", topics: ["story"], boardView: "quest", puzzleSize: 4 }, 1_000, { generatorVersion: 3 });
  assert.equal(run.generatorVersion, 3);
  assert.equal(run.options.boardView, "quest");
  assert.equal(isQuestBuilderLoaded(), true);
});
