import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { questWordBank } from "@/lib/quest-word-bank";
import { wordBank } from "@/lib/word-bank";

test("lazy Quest bank preserves the frozen complete corpus byte-for-byte", () => {
  assert.equal(wordBank.length, 53);
  assert.equal(wordBank.some((word) => word.source === "lexicon"), false);
  assert.equal(questWordBank.length, 3_593);
  assert.equal(questWordBank.findIndex((word) => word.source === "lexicon"), 3_162);
  assert.equal(questWordBank.filter((word) => word.source === "lexicon").length, 431);
  assert.equal(
    createHash("sha256").update(JSON.stringify(questWordBank)).digest("hex"),
    "6dda228a4183c01cfc903cb17eae688c24a802443f45902d1c06a5529ce4313f",
  );
  const generationKeys = questWordBank.map((word) => `${word.topicId}:${word.normalized}:${word.difficulty}`);
  assert.equal(new Set(generationKeys).size, generationKeys.length, "base/lexicon collisions remain first-wins deduplicated");
});
