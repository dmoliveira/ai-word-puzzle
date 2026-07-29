import assert from "node:assert/strict";
import test from "node:test";
import { sha256Hex } from "@/lib/sha256";

test("synchronous SHA-256 matches standard UTF-8 vectors", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex("Astra ✦ Lexa"), "958d6433256eb25c2a54cb1862e3e3b6af375e70d4e473f6cc855c269b1af714");
});
