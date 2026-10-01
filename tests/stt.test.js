import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTranscriptionResponse } from "../server/stt.js";

test("normalizes diarized transcription segments", () => {
  const result = normalizeTranscriptionResponse({
    segments: [
      { start: "0.5", end: "3.25", speaker: "SPEAKER_00", text: "  Hello there.  " },
      { start: 3.25, end: 3.25, speaker: "SPEAKER_01", text: "empty duration" },
      { start: "bad", end: 5, text: "invalid start" },
      { start: 5, end: 8, text: "" },
    ],
  });
  assert.deepEqual(result, [
    { start: 0.5, end: 3.25, speaker: "SPEAKER_00", text: "Hello there." },
  ]);
});

test("normalizes segments without a speaker", () => {
  const result = normalizeTranscriptionResponse({
    segments: [{ start: 1, end: 2, text: "No speaker label." }],
  });
  assert.deepEqual(result, [{ start: 1, end: 2, text: "No speaker label." }]);
});

test("returns an empty list for missing segments", () => {
  assert.deepEqual(normalizeTranscriptionResponse({}), []);
});
