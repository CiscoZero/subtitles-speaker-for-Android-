import assert from "node:assert/strict";
import test from "node:test";
import { parseSubtitles } from "./subtitles.ts";

test("parses LRC timestamps, repeated tags and offset", () => {
  const result = parseSubtitles(
    "[ar:EchoTape]\n[offset:-500]\n[00:01.20][00:05.50]同一句歌词\n[00:08.00]<00:08.20>第二句\n",
    "song.lrc",
  );

  assert.equal(result.format, "lrc");
  assert.equal(result.cues.length, 3);
  assert.equal(result.cues[0].start, 0.7);
  assert.equal(result.cues[1].start, 5);
  assert.equal(result.cues[0].text, "同一句歌词");
  assert.equal(result.cues[0].end - result.cues[0].start, 1.25);
  assert.equal(result.cues[2].text, "第二句");
  assert.ok(Math.abs(result.cues[2].end - result.cues[2].start - 1.2) < 0.0001);
});

test("detects LRC content without a file extension", () => {
  const result = parseSubtitles("[00:03.00]没有扩展名\n", "lyrics");

  assert.equal(result.format, "lrc");
  assert.equal(result.cues.length, 1);
  assert.equal(result.cues[0].start, 3);
});

test("keeps ASS override blocks out of the spoken text", () => {
  const result = parseSubtitles(
    "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
      "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\blur6}正文\n",
    "styled.ass",
  );

  assert.equal(result.cues.length, 1);
  assert.equal(result.cues[0].text, "正文");
});
