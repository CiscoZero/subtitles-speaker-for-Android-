import assert from "node:assert/strict";
import test from "node:test";
import { detectSourceLanguage, parseSubtitles, retimeEstimatedCues } from "./subtitles.ts";

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
  assert.ok(Math.abs(result.cues[0].end - result.cues[0].start - 3.95) < 0.0001);
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

test("detects scripts used by original audio lyrics", () => {
  assert.equal(detectSourceLanguage("这是中文歌词"), "zh");
  assert.equal(detectSourceLanguage("これは日本語の歌です"), "ja");
  assert.equal(detectSourceLanguage("이것은 한국어 노래입니다"), "ko");
  assert.equal(detectSourceLanguage("This is the song that you have heard"), "en");
});

test("language estimate is capped by the next LRC timestamp", () => {
  const cues = [
    { id: 0, start: 10, end: 14, text: "あいうえおか" },
    { id: 1, start: 11, end: 15, text: "つぎのうた" },
  ];

  retimeEstimatedCues(cues, "lrc", "auto");

  assert.equal(cues[0].end, 10.65);
  assert.ok(Math.abs(cues[1].end - 12.2) < 0.0001);
});

test("long LRC gaps still wait for the next timestamp", () => {
  const cues = [
    { id: 0, start: 0, end: 14, text: "这是中文歌词" },
    { id: 1, start: 20, end: 24, text: "第二句" },
  ];

  retimeEstimatedCues(cues, "lrc", "zh");

  assert.equal(cues[0].end, 19.65);
});
