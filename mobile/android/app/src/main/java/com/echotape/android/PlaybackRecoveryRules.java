package com.echotape.android;

/**
 * Pure recovery rules shared by the Android service and local JVM tests.
 *
 * A process restart may restore a source and a paused position, but it must
 * never restore an old TTS job or resume audio without a fresh user action.
 */
public final class PlaybackRecoveryRules {
    private PlaybackRecoveryRules() {}

    public static long clampSavedPosition(long savedPositionMs, long durationMs) {
        long safePosition = Math.max(0, savedPositionMs);
        if (durationMs <= 0) return safePosition;
        return Math.min(safePosition, Math.max(0, durationMs - 30));
    }

    public static int nextCueIndex(double[] cueStarts, double positionSeconds, double offsetSeconds) {
        double threshold = positionSeconds - 0.02;
        int low = 0;
        int high = cueStarts.length;
        while (low < high) {
            int mid = (low + high) >>> 1;
            double cueAt = cueStarts[mid] + offsetSeconds;
            if (cueAt < threshold) low = mid + 1;
            else high = mid;
        }
        return low;
    }

    public static boolean shouldResumeAudioAfterProcessRestart() {
        return false;
    }

    public static int restoredSpeechQueueSize() {
        return 0;
    }
}
