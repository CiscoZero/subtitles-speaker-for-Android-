import type { Cue } from "../lib/subtitles.ts";

export type TransportState = "idle" | "playing" | "paused" | "ended";
export type SpeechState = "idle" | "speaking" | "error";
export type PauseReason = "none" | "auto" | "user";
export type SpeakResult = "done" | "cancelled" | "error";
export type QueueClearReason = "mode-switch" | "seek" | "source-change" | "user" | "audio-error";

export type EngineSettings = {
  autoPause: boolean;
  offsetMs: number;
  expiredPolicy: "read-all" | "skip";
  blockedWords: string[];
};

export type AudioPort = {
  getTime: () => number;
  getDuration: () => number;
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
};

export type SpeechPort = {
  speak: (text: string) => Promise<SpeakResult>;
  stop: () => void;
};

export type PlaybackSnapshot = {
  transport: TransportState;
  speech: SpeechState;
  activeCue: number | null;
  pointer: number;
  pendingSpeechCount: number;
  pendingCueIds: number[];
  autoPause: boolean;
  pauseReason: PauseReason;
};

type Callbacks = {
  onChange?: (snapshot: PlaybackSnapshot) => void;
  onError?: (message: string) => void;
  onQueueCleared?: (count: number, reason: QueueClearReason) => void;
};

const DEFAULT_SNAPSHOT: PlaybackSnapshot = {
  transport: "idle",
  speech: "idle",
  activeCue: null,
  pointer: 0,
  pendingSpeechCount: 0,
  pendingCueIds: [],
  autoPause: true,
  pauseReason: "none",
};

/**
 * Pure playback coordinator shared with the React hook.
 *
 * The original audio timeline is always authoritative. Automatic speech pauses
 * that timeline, while manual mode leaves it completely under the user's control.
 */
export class PlaybackEngine {
  private readonly audio: AudioPort;
  private readonly speech: SpeechPort;
  private readonly callbacks: Callbacks;

  private cues: Cue[] = [];
  private settings: EngineSettings = {
    autoPause: true,
    offsetMs: 0,
    expiredPolicy: "read-all",
    blockedWords: [],
  };
  private transport: TransportState = "idle";
  private speechState: SpeechState = "idle";
  private activeCue: number | null = null;
  private pointer = 0;
  private pendingQueue: number[] = [];
  private pauseReason: PauseReason = "none";
  private resumePosition: number | null = null;
  private speechRun = 0;
  private transportRun = 0;
  private disposed = false;

  constructor(audio: AudioPort, speech: SpeechPort, callbacks: Callbacks = {}) {
    this.audio = audio;
    this.speech = speech;
    this.callbacks = callbacks;
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      transport: this.transport,
      speech: this.speechState,
      activeCue: this.activeCue,
      pointer: this.pointer,
      pendingSpeechCount: this.pendingQueue.length,
      pendingCueIds: [...this.pendingQueue],
      autoPause: this.settings.autoPause,
      pauseReason: this.pauseReason,
    };
  }

  setCues(cues: Cue[]): void {
    const wasSpeaking = this.speechState !== "idle";
    this.cancelSpeech();
    this.pendingQueue = [];
    this.activeCue = null;
    this.speechState = "idle";
    this.cues = cues;
    this.pointer = this.findNextIndex(this.audio.getTime());

    if (wasSpeaking) {
      this.transportRun += 1;
      this.audio.pause();
      this.transport = "paused";
      this.pauseReason = "user";
      this.resumePosition = null;
    }

    this.emit();
  }

  updateSettings(next: EngineSettings): void {
    const wasAutoPause = this.settings.autoPause;
    this.settings = { ...next };
    this.filterBlockedPending();

    const activeBlocked =
      this.activeCue !== null &&
      this.cues[this.activeCue] !== undefined &&
      this.isBlocked(this.cues[this.activeCue].text);
    if (activeBlocked) this.skipSpeech();

    if (!wasAutoPause && next.autoPause) {
      this.switchToAutoPause();
      return;
    }

    if (wasAutoPause && !next.autoPause) {
      this.switchToManualMode();
      return;
    }

    this.emit();
  }

  async play(): Promise<void> {
    const duration = this.audio.getDuration();
    const atEnd = duration > 0 && this.audio.getTime() >= duration - 0.05;

    if (this.transport === "ended" || atEnd) {
      this.cancelSpeech();
      this.dropPendingQueue("seek", false);
      this.audio.seek(0);
      this.pointer = this.findNextIndex(0);
      this.activeCue = null;
      this.speechState = "idle";
    }

    if (this.settings.autoPause && this.speechState === "error") {
      this.activeCue = null;
      this.speechState = "idle";
    }

    this.pauseReason = "none";
    this.resumePosition = null;
    await this.startTransport();
  }

  pause(): void {
    this.transportRun += 1;

    if (this.settings.autoPause && this.speechState !== "idle") {
      const active = this.activeCue;
      this.cancelSpeech();
      if (active !== null) this.pointer = active;
      this.activeCue = null;
      this.speechState = "idle";
    }

    this.audio.pause();
    this.transport = "paused";
    this.pauseReason = "user";
    this.resumePosition = null;
    this.emit();
  }

  stop(): void {
    this.transportRun += 1;
    this.cancelSpeech();
    this.pendingQueue = [];
    this.audio.pause();
    this.audio.seek(0);
    this.transport = "idle";
    this.speechState = "idle";
    this.activeCue = null;
    this.pointer = 0;
    this.pauseReason = "none";
    this.resumePosition = null;
    this.emit();
  }

  async seek(target: number, options: { autoPlay?: boolean } = {}): Promise<void> {
    const duration = this.audio.getDuration();
    const max = duration > 0 ? duration : target;
    const next = Math.min(Math.max(0, target), Math.max(0, max - 0.03));
    const wasActive =
      this.transport === "playing" ||
      (this.settings.autoPause && this.speechState === "speaking" && this.pauseReason === "auto");

    this.transportRun += 1;
    this.cancelSpeech();
    this.activeCue = null;
    this.speechState = "idle";
    this.dropPendingQueue("seek", true);
    this.audio.seek(next);
    this.pointer = this.findNextIndex(next);
    this.pauseReason = "none";
    this.resumePosition = null;

    if (options.autoPlay ?? wasActive) {
      await this.startTransport();
    } else {
      this.transport = "paused";
      this.emit();
    }
  }

  async jumpToCue(index: number): Promise<void> {
    const cue = this.cues[index];
    if (!cue) return;
    const target = Math.max(0, cue.start + this.offsetSeconds() - 0.04);
    await this.seek(target, { autoPlay: true });
    this.pointer = index;
    this.emit();
  }

  async stepCue(direction: 1 | -1): Promise<void> {
    if (!this.cues.length) return;
    const now = this.audio.getTime();

    if (direction === 1) {
      const index = Math.max(this.pointer, this.findNextIndex(now + 0.05));
      if (index < this.cues.length) await this.jumpToCue(index);
      return;
    }

    let index = this.cues.length - 1;
    while (index >= 0 && this.cues[index].start + this.offsetSeconds() > now - 1) {
      index -= 1;
    }
    await this.jumpToCue(Math.max(0, index));
  }

  tick(): void {
    if (this.transport !== "playing" || this.disposed) return;

    const now = this.audio.getTime();
    if (this.settings.autoPause) {
      if (this.speechState !== "idle") return;
      while (this.cues[this.pointer]) {
        const cue = this.cues[this.pointer];
        if (now + 0.012 < cue.start + this.offsetSeconds()) break;
        const index = this.pointer;
        this.pointer += 1;
        if (this.isBlocked(cue.text)) continue;
        void this.startAutoSpeech(index);
        return;
      }
      return;
    }

    this.enqueueDueCues(now);
    if (this.speechState === "idle" && this.pendingQueue.length > 0) {
      void this.startNextSpeech();
    }
  }

  skipSpeech(): void {
    if (this.speechState === "idle") return;
    const shouldResumeAuto = this.settings.autoPause && this.pauseReason === "auto";

    this.cancelSpeech();
    this.activeCue = null;
    this.speechState = "idle";

    if (shouldResumeAuto) {
      void this.resumeAutoPausedTransport();
    } else if (this.pendingQueue.length > 0) {
      void this.startNextSpeech();
    } else {
      this.emit();
    }
  }

  clearSpeechQueue(): void {
    const count = this.pendingQueue.length + (this.activeCue === null ? 0 : 1);
    const shouldResumeAuto = this.settings.autoPause && this.pauseReason === "auto";

    this.cancelSpeech();
    this.pendingQueue = [];
    this.activeCue = null;
    this.speechState = "idle";

    if (count > 0) this.callbacks.onQueueCleared?.(count, "user");
    if (shouldResumeAuto) {
      void this.resumeAutoPausedTransport();
    } else {
      this.emit();
    }
  }

  handleEnded(): void {
    this.transportRun += 1;
    if (this.settings.autoPause && this.speechState !== "idle") {
      this.cancelSpeech();
      this.activeCue = null;
      this.speechState = "idle";
    }
    this.transport = "ended";
    this.pauseReason = "none";
    this.resumePosition = null;
    this.emit();
  }

  handleAudioError(): void {
    this.transportRun += 1;
    this.cancelSpeech();
    this.dropPendingQueue("audio-error", true);
    this.activeCue = null;
    this.speechState = "idle";
    this.audio.pause();
    this.transport = "paused";
    this.pauseReason = "user";
    this.resumePosition = null;
    this.emit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.transportRun += 1;
    this.cancelSpeech();
    this.pendingQueue = [];
    this.disposed = true;
  }

  private async startAutoSpeech(index: number): Promise<void> {
    const cue = this.cues[index];
    if (!cue) return;
    if (this.isBlocked(cue.text)) {
      this.pointer = Math.max(this.pointer, index + 1);
      this.emit();
      return;
    }

    this.transportRun += 1;
    const triggerAt = Math.max(0, cue.start + this.offsetSeconds());
    const overshoot = this.audio.getTime() - triggerAt;
    if (overshoot > 0.02 && overshoot <= 1.2) {
      this.audio.seek(triggerAt);
    }

    this.audio.pause();
    this.transport = "paused";
    this.pauseReason = "auto";
    this.resumePosition = this.audio.getTime();
    this.pointer = index + 1;
    this.activeCue = index;
    this.speechState = "speaking";
    this.emit();

    const run = ++this.speechRun;
    const result = await this.speech.speak(cue.text);
    if (this.disposed || run !== this.speechRun) return;

    if (result === "error" || result === "cancelled") {
      this.speechState = "error";
      this.pointer = index;
      this.callbacks.onError?.(
        result === "cancelled"
          ? "中文朗读被意外取消，原声保持暂停。"
          : "中文朗读失败：可能是系统缺少中文语音，或语音引擎被占用。请更换语音后继续。",
      );
      this.emit();
      return;
    }

    this.activeCue = null;
    this.speechState = "idle";

    if (this.settings.expiredPolicy === "skip") {
      while (this.cues[this.pointer]) {
        const triggerAt = this.cues[this.pointer].start + this.offsetSeconds();
        if (triggerAt > this.audio.getTime() + 0.02) break;
        this.pointer += 1;
      }
    }
    this.emit();

    if (this.settings.autoPause && this.pauseReason === "auto") {
      await this.resumeAutoPausedTransport();
    }
  }

  private async startNextSpeech(): Promise<void> {
    if (this.speechState !== "idle") return;

    let index: number | undefined;
    while (this.pendingQueue.length > 0) {
      const candidate = this.pendingQueue.shift();
      if (candidate === undefined) continue;
      const candidateCue = this.cues[candidate];
      if (!candidateCue || this.isBlocked(candidateCue.text)) continue;
      index = candidate;
      break;
    }
    if (index === undefined) {
      this.emit();
      return;
    }
    const cue = this.cues[index];
    if (!cue) {
      this.emit();
      if (this.pendingQueue.length > 0) void this.startNextSpeech();
      return;
    }

    this.activeCue = index;
    this.speechState = "speaking";
    this.emit();

    const run = ++this.speechRun;
    const result = await this.speech.speak(cue.text);
    if (this.disposed || run !== this.speechRun) return;

    if (result === "error" || result === "cancelled") {
      this.speechState = "error";
      this.callbacks.onError?.(
        result === "cancelled"
          ? "中文朗读被意外取消，待播队列已保留。"
          : "中文朗读失败，待播队列已保留。请检查系统中文语音后重试或清空队列。",
      );
      this.emit();
      return;
    }

    this.activeCue = null;
    this.speechState = "idle";
    this.emit();
    if (this.pendingQueue.length > 0) {
      void this.startNextSpeech();
    }
  }

  private enqueueDueCues(now: number): void {
    let changed = false;
    while (this.cues[this.pointer]) {
      const triggerAt = this.cues[this.pointer].start + this.offsetSeconds();
      if (now + 0.012 < triggerAt) break;
      const index = this.pointer;
      this.pointer += 1;
      if (this.isBlocked(this.cues[index].text)) continue;
      this.pendingQueue.push(index);
      changed = true;
    }
    if (changed) this.emit();
  }

  private switchToAutoPause(): void {
    const switchPosition = this.audio.getTime();
    const count = this.pendingQueue.length + (this.activeCue === null ? 0 : 1);

    this.cancelSpeech();
    this.pendingQueue = [];
    this.activeCue = null;
    this.speechState = "idle";
    this.pointer = this.findNextIndex(switchPosition + 0.02, true);
    this.pauseReason = this.transport === "paused" && this.pauseReason === "user" ? "user" : "none";
    this.resumePosition = null;

    if (count > 0) this.callbacks.onQueueCleared?.(count, "mode-switch");
    this.emit();
  }

  private switchToManualMode(): void {
    if (this.transport === "paused" && this.pauseReason === "auto") {
      this.pauseReason = "none";
      this.resumePosition = null;
      void this.startTransport();
      return;
    }
    this.emit();
  }

  private async resumeAutoPausedTransport(): Promise<void> {
    if (
      !this.settings.autoPause ||
      this.pauseReason !== "auto" ||
      this.transport !== "paused"
    ) {
      this.emit();
      return;
    }

    const resumeAt = this.resumePosition;
    if (resumeAt !== null && Math.abs(this.audio.getTime() - resumeAt) > 0.02) {
      this.audio.seek(resumeAt);
    }
    this.pauseReason = "none";
    this.resumePosition = null;
    await this.startTransport();
  }

  private async startTransport(): Promise<void> {
    this.transportRun += 1;
    const run = this.transportRun;
    this.transport = "playing";
    this.emit();

    try {
      await this.audio.play();
      if (this.disposed || run !== this.transportRun) return;
    } catch {
      if (this.disposed || run !== this.transportRun) return;
      this.transport = "paused";
      this.pauseReason = "user";
      this.callbacks.onError?.("无法继续播放原声，请再点一次「继续」。");
      this.emit();
    }
  }

  private dropPendingQueue(reason: QueueClearReason, notify: boolean): void {
    const count = this.pendingQueue.length;
    this.pendingQueue = [];
    if (notify && count > 0) this.callbacks.onQueueCleared?.(count, reason);
  }

  private filterBlockedPending(): void {
    if (!this.settings.blockedWords.length || !this.pendingQueue.length) return;
    this.pendingQueue = this.pendingQueue.filter((index) => {
      const cue = this.cues[index];
      return cue !== undefined && !this.isBlocked(cue.text);
    });
  }

  private isBlocked(text: string): boolean {
    if (!this.settings.blockedWords.length) return false;
    const normalized = text.toLocaleLowerCase();
    return this.settings.blockedWords.some((word) => {
      const term = word.trim().toLocaleLowerCase();
      return term.length > 0 && normalized.includes(term);
    });
  }

  private cancelSpeech(): void {
    this.speechRun += 1;
    try {
      this.speech.stop();
    } catch {
      // A failing speech engine must not prevent audio transport changes.
    }
  }

  private offsetSeconds(): number {
    return this.settings.offsetMs / 1000;
  }

  private findNextIndex(time: number, strict = false): number {
    const offset = this.offsetSeconds();
    const threshold = time + (strict ? 0.02 : -0.02);
    let low = 0;
    let high = this.cues.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      const cueAt = this.cues[mid].start + offset;
      if (strict ? cueAt <= threshold : cueAt < threshold) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private emit(): void {
    if (this.disposed) return;
    this.callbacks.onChange?.(this.getSnapshot());
  }
}

export const initialPlaybackSnapshot = DEFAULT_SNAPSHOT;
