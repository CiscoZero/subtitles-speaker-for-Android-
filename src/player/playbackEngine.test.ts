import assert from "node:assert/strict";
import test from "node:test";
import type { Cue } from "../lib/subtitles.ts";
import {
  PlaybackEngine,
  initialPlaybackSnapshot,
  type AudioPort,
  type QueueClearReason,
  type SpeakResult,
  type SpeechPort,
} from "./playbackEngine.ts";

class FakeAudio implements AudioPort {
  time = 0;
  duration = 60;
  playing = false;
  playCalls = 0;
  pauseCalls = 0;
  seeks: number[] = [];

  getTime(): number {
    return this.time;
  }

  getDuration(): number {
    return this.duration;
  }

  async play(): Promise<void> {
    this.playing = true;
    this.playCalls += 1;
  }

  pause(): void {
    this.playing = false;
    this.pauseCalls += 1;
  }

  seek(seconds: number): void {
    this.time = seconds;
    this.seeks.push(seconds);
  }
}

type PendingSpeech = {
  text: string;
  resolve: (result: SpeakResult) => void;
};

class FakeSpeech implements SpeechPort {
  calls: PendingSpeech[] = [];
  orphaned: PendingSpeech[] = [];
  stopCalls = 0;
  preservePendingOnStop = false;

  speak(text: string): Promise<SpeakResult> {
    return new Promise((resolve) => {
      this.calls.push({ text, resolve });
    });
  }

  stop(): void {
    this.stopCalls += 1;
    const pending = this.calls.splice(0);
    if (this.preservePendingOnStop) {
      this.orphaned.push(...pending);
      return;
    }
    pending.forEach((item) => item.resolve("cancelled"));
  }

  complete(result: SpeakResult = "done"): void {
    const pending = this.calls.shift();
    if (!pending) throw new Error("No pending speech");
    pending.resolve(result);
  }

  completeOrphaned(result: SpeakResult = "done"): void {
    const pending = this.orphaned.shift();
    if (!pending) throw new Error("No orphaned speech");
    pending.resolve(result);
  }
}

const cue = (id: number, start: number, text = `cue-${id}`): Cue => ({
  id,
  start,
  end: start + 1,
  text,
});

const flush = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await Promise.resolve();
};

async function createEngine(
  cues: Cue[],
  autoPause = true,
): Promise<{
  engine: PlaybackEngine;
  audio: FakeAudio;
  speech: FakeSpeech;
  cleared: Array<{ count: number; reason: QueueClearReason }>;
  errors: string[];
}> {
  const audio = new FakeAudio();
  const speech = new FakeSpeech();
  const cleared: Array<{ count: number; reason: QueueClearReason }> = [];
  const errors: string[] = [];
  const engine = new PlaybackEngine(audio, speech, {
    onQueueCleared: (count, reason) => cleared.push({ count, reason }),
    onError: (message) => errors.push(message),
  });
  engine.setCues(cues);
  engine.updateSettings({ autoPause, offsetMs: 0, expiredPolicy: "read-all", blockedWords: [] });
  return { engine, audio, speech, cleared, errors };
}

test("auto pause defaults to enabled and resumes at the paused audio position", async () => {
  assert.equal(initialPlaybackSnapshot.autoPause, true);
  const { engine, audio, speech } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1.03;
  engine.tick();
  await flush();

  assert.equal(speech.calls[0].text, "cue-0");
  assert.equal(audio.playing, false);
  assert.equal(engine.getSnapshot().pauseReason, "auto");

  speech.complete("done");
  await flush();

  assert.equal(audio.playing, true);
  assert.equal(audio.time, 1);
  assert.equal(engine.getSnapshot().transport, "playing");
  assert.equal(engine.getSnapshot().activeCue, null);
});

test("manual pause during an auto-paused reading prevents stale completion from resuming", async () => {
  const { engine, audio, speech } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  engine.pause();
  await flush();

  assert.equal(audio.playing, false);
  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().pointer, 0);
  assert.equal(engine.getSnapshot().pauseReason, "user");
  assert.equal(audio.playCalls, 1);
});

test("seeking invalidates the current reading and never resumes it", async () => {
  const { engine, audio, speech, cleared } = await createEngine([
    cue(0, 1),
    cue(1, 3),
    cue(2, 8),
  ]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  speech.stopCalls = 0;
  await engine.seek(3, { autoPlay: false });

  assert.equal(speech.stopCalls, 1);
  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().transport, "paused");
  assert.equal(engine.getSnapshot().pointer, 1);
  assert.equal(audio.time, 3);
  assert.equal(cleared.length, 0);
});

test("manual mode keeps audio playing while reading queued subtitles in order", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1, "first"), cue(1, 2, "second"), cue(2, 3, "third")],
    false,
  );

  await engine.play();
  audio.time = 1.01;
  engine.tick();
  audio.time = 2.01;
  engine.tick();
  audio.time = 3.01;
  engine.tick();
  await flush();

  assert.equal(audio.playing, true);
  assert.equal(audio.pauseCalls, 0);
  assert.equal(speech.calls[0].text, "first");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 2);

  speech.complete("done");
  await flush();
  assert.equal(speech.calls[0].text, "second");

  speech.complete("done");
  await flush();
  assert.equal(speech.calls[0].text, "third");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 0);
});

test("manual pause controls only the original audio and leaves the speech queue running", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1, "first"), cue(1, 2, "second")],
    false,
  );

  await engine.play();
  audio.time = 1;
  engine.tick();
  audio.time = 2;
  engine.tick();
  await flush();
  engine.pause();

  assert.equal(audio.playing, false);
  assert.equal(engine.getSnapshot().transport, "paused");
  assert.equal(engine.getSnapshot().speech, "speaking");

  speech.complete("done");
  await flush();

  assert.equal(speech.calls[0].text, "second");
  assert.equal(audio.playing, false);
  assert.equal(engine.getSnapshot().transport, "paused");
});

test("clearing the speech queue cancels the active item and all pending items", async () => {
  const { engine, audio, speech, cleared } = await createEngine(
    [cue(0, 1), cue(1, 2), cue(2, 3)],
    false,
  );

  await engine.play();
  audio.time = 3;
  engine.tick();
  await flush();
  speech.stopCalls = 0;
  engine.clearSpeechQueue();
  await flush();

  assert.equal(speech.stopCalls, 1);
  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 0);
  assert.deepEqual(cleared, [{ count: 3, reason: "user" }]);
  assert.equal(audio.playing, true);
});

test("switching B to A clears old work and only handles a later undispatched cue", async () => {
  const { engine, audio, speech, cleared } = await createEngine(
    [cue(0, 0.1, "old-1"), cue(1, 0.2, "old-2"), cue(2, 0.5, "new")],
    false,
  );

  await engine.play();
  audio.time = 0.11;
  engine.tick();
  audio.time = 0.21;
  engine.tick();
  await flush();
  assert.equal(speech.calls[0].text, "old-1");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 1);

  audio.time = 0.36;
  engine.updateSettings({ autoPause: true, offsetMs: 0, expiredPolicy: "read-all", blockedWords: [] });
  await flush();

  assert.deepEqual(cleared, [{ count: 2, reason: "mode-switch" }]);
  assert.equal(speech.calls.length, 0);
  assert.equal(engine.getSnapshot().pendingSpeechCount, 0);
  assert.equal(engine.getSnapshot().pointer, 2);

  audio.time = 0.5;
  engine.tick();
  await flush();

  assert.equal(speech.calls[0].text, "new");
  assert.equal(audio.playing, false);
});

test("switching A to B resumes auto-paused audio without interrupting current speech", async () => {
  const { engine, audio, speech } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  engine.updateSettings({ autoPause: false, offsetMs: 0, expiredPolicy: "read-all", blockedWords: [] });
  await flush();

  assert.equal(audio.playing, true);
  assert.equal(engine.getSnapshot().transport, "playing");
  assert.equal(engine.getSnapshot().speech, "speaking");
  assert.equal(speech.calls[0].text, "cue-0");

  speech.complete("done");
  await flush();

  assert.equal(audio.playing, true);
  assert.equal(audio.playCalls, 2);
});

test("switching subtitle files invalidates old completion callbacks", async () => {
  const { engine, audio, speech } = await createEngine([cue(0, 1, "old")]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  engine.setCues([cue(10, 5, "new")]);
  await flush();

  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().transport, "paused");
  assert.equal(engine.getSnapshot().pointer, 0);
  assert.equal(audio.playing, false);
  assert.equal(speech.calls.length, 0);
});

test("TTS failure in auto mode leaves audio paused and keeps the failed cue retryable", async () => {
  const { engine, audio, speech, errors } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  speech.complete("error");
  await flush();

  assert.equal(engine.getSnapshot().speech, "error");
  assert.equal(engine.getSnapshot().transport, "paused");
  assert.equal(engine.getSnapshot().pointer, 0);
  assert.equal(audio.playing, false);
  assert.equal(errors.length, 1);
});

test("TTS failure in manual mode preserves the active and pending queue instead of dropping it", async () => {
  const { engine, audio, speech, errors } = await createEngine(
    [cue(0, 1, "first"), cue(1, 2, "second")],
    false,
  );

  await engine.play();
  audio.time = 2;
  engine.tick();
  await flush();
  speech.complete("error");
  await flush();

  assert.equal(engine.getSnapshot().speech, "error");
  assert.equal(engine.getSnapshot().activeCue, 0);
  assert.equal(engine.getSnapshot().pendingSpeechCount, 1);
  assert.deepEqual(engine.getSnapshot().pendingCueIds, [1]);
  assert.equal(errors.length, 1);
  assert.equal(audio.playing, true);
});

test("equal cue timestamps are each dispatched exactly once", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1, "first"), cue(1, 1, "second")],
    false,
  );

  await engine.play();
  audio.time = 1;
  engine.tick();
  engine.tick();
  await flush();

  assert.equal(speech.calls[0].text, "first");
  assert.equal(engine.getSnapshot().pointer, 2);
  assert.equal(engine.getSnapshot().pendingSpeechCount, 1);

  speech.complete("done");
  await flush();
  assert.equal(speech.calls[0].text, "second");
});

test("audio ending in manual mode does not discard the remaining speech queue", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1, "first"), cue(1, 2, "second")],
    false,
  );

  await engine.play();
  audio.time = 2;
  engine.tick();
  await flush();
  engine.handleEnded();

  assert.equal(engine.getSnapshot().transport, "ended");
  assert.equal(engine.getSnapshot().speech, "speaking");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 1);

  speech.complete("done");
  await flush();
  assert.equal(speech.calls[0].text, "second");

  speech.complete("done");
  await flush();
  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 0);
});

test("resuming after a manual pause starts a fresh transport session", async () => {
  const { engine, audio } = await createEngine([cue(0, 10)]);

  await engine.play();
  engine.pause();
  await engine.play();

  assert.equal(audio.playing, true);
  assert.equal(engine.getSnapshot().transport, "playing");
  assert.equal(audio.playCalls, 2);
});

test("unexpected speech cancellation keeps auto-paused audio stopped", async () => {
  const { engine, audio, speech, errors } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  speech.complete("cancelled");
  await flush();

  assert.equal(engine.getSnapshot().speech, "error");
  assert.equal(engine.getSnapshot().transport, "paused");
  assert.equal(audio.playing, false);
  assert.equal(errors.length, 1);
});

test("stop clears the source transport and pending queue", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1), cue(1, 2), cue(2, 3)],
    false,
  );

  await engine.play();
  audio.time = 3;
  engine.tick();
  await flush();
  engine.stop();

  assert.equal(engine.getSnapshot().transport, "idle");
  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 0);
  assert.equal(engine.getSnapshot().pointer, 0);
  assert.equal(audio.time, 0);
  assert.equal(audio.playing, false);
  assert.equal(speech.calls.length, 0);
});

test("a late callback from a cancelled reading cannot affect a newer session", async () => {
  const { engine, audio, speech, errors } = await createEngine([cue(0, 1)]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();

  speech.preservePendingOnStop = true;
  engine.pause();
  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();

  assert.equal(speech.orphaned.length, 1);
  assert.equal(speech.calls.length, 1);
  assert.equal(engine.getSnapshot().speech, "speaking");
  assert.equal(audio.playing, false);

  speech.completeOrphaned("error");
  await flush();

  assert.equal(engine.getSnapshot().speech, "speaking");
  assert.equal(engine.getSnapshot().activeCue, 0);
  assert.equal(audio.playing, false);
  assert.equal(errors.length, 0);
});

test("auto mode skips blocked cues without pausing the original audio", async () => {
  const { engine, audio, speech } = await createEngine([
    cue(0, 1, "这句包含广告"),
    cue(1, 2, "正常字幕"),
  ]);
  engine.updateSettings({
    autoPause: true,
    offsetMs: 0,
    expiredPolicy: "read-all",
    blockedWords: ["广告"],
  });

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();

  assert.equal(speech.calls.length, 0);
  assert.equal(audio.playing, true);
  assert.equal(engine.getSnapshot().pointer, 1);

  audio.time = 2;
  engine.tick();
  await flush();

  assert.equal(speech.calls[0].text, "正常字幕");
  assert.equal(audio.playing, false);
});

test("manual mode never queues blocked cues", async () => {
  const { engine, audio, speech } = await createEngine(
    [cue(0, 1, "广告内容"), cue(1, 2, "第一句正常"), cue(2, 3, "第二句正常")],
    false,
  );
  engine.updateSettings({
    autoPause: false,
    offsetMs: 0,
    expiredPolicy: "read-all",
    blockedWords: ["广告"],
  });

  await engine.play();
  audio.time = 3;
  engine.tick();
  await flush();

  assert.equal(audio.playing, true);
  assert.equal(speech.calls[0].text, "第一句正常");
  assert.equal(engine.getSnapshot().pendingSpeechCount, 1);
  assert.deepEqual(engine.getSnapshot().pendingCueIds, [2]);
});

test("adding a blocked word stops the active match and resumes original audio", async () => {
  const { engine, audio, speech } = await createEngine([cue(0, 1, "突然出现的广告词")]);

  await engine.play();
  audio.time = 1;
  engine.tick();
  await flush();
  assert.equal(speech.calls[0].text, "突然出现的广告词");
  assert.equal(audio.playing, false);

  engine.updateSettings({
    autoPause: true,
    offsetMs: 0,
    expiredPolicy: "read-all",
    blockedWords: ["广告"],
  });
  await flush();

  assert.equal(engine.getSnapshot().speech, "idle");
  assert.equal(engine.getSnapshot().activeCue, null);
  assert.equal(audio.playing, true);
});
