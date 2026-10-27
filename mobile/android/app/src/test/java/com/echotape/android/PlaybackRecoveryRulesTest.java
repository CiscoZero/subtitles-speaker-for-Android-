package com.echotape.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import org.junit.Test;

public class PlaybackRecoveryRulesTest {
    @Test
    public void clampsInvalidAndEndPositions() {
        assertEquals(0, PlaybackRecoveryRules.clampSavedPosition(-10, 60_000));
        assertEquals(12_345, PlaybackRecoveryRules.clampSavedPosition(12_345, 0));
        assertEquals(59_970, PlaybackRecoveryRules.clampSavedPosition(60_000, 60_000));
    }

    @Test
    public void keepsCueAtSavedPositionAndSkipsOnlyClearlyCompletedCues() {
        double[] starts = { 1.0, 3.0, 3.0, 8.0 };

        assertEquals(1, PlaybackRecoveryRules.nextCueIndex(starts, 3.0, 0));
        assertEquals(3, PlaybackRecoveryRules.nextCueIndex(starts, 3.1, 0));
        assertEquals(4, PlaybackRecoveryRules.nextCueIndex(starts, 8.1, 0));
    }

    @Test
    public void processRecoveryNeverAutoResumesOrRestoresSpeech() {
        assertFalse(PlaybackRecoveryRules.shouldResumeAudioAfterProcessRestart());
        assertEquals(0, PlaybackRecoveryRules.restoredSpeechQueueSize());
    }
}
