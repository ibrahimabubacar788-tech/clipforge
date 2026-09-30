import test from "node:test";
import assert from "node:assert/strict";
import { clipDuration, formatTimestamp } from "../src/clip-utils.js";

test("calculates a valid clip duration", () => assert.equal(clipDuration(124, 148), 24));
test("rejects a reversed or invalid clip range", () => { assert.equal(clipDuration(10, 10), 0); assert.equal(clipDuration("no", 20), 0); });
test("formats timestamps as minutes and seconds", () => assert.equal(formatTimestamp(148), "02:28"));
