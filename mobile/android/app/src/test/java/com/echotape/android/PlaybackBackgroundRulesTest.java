package com.echotape.android;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PlaybackBackgroundRulesTest {
    @Test
    public void keepsWakeLockWhileOriginalAudioIsPlaying() {
        assertTrue(PlaybackBackgroundRules.shouldKeepPlaybackAwake("playing", "none", "idle"));
    }

    @Test
    public void keepsWakeLockAcrossAutoPauseForSpeech() {
        assertTrue(PlaybackBackgroundRules.shouldKeepPlaybackAwake("paused", "auto", "speaking"));
    }

    @Test
    public void releasesWakeLockWhenUserPausesOrSpeechFails() {
        assertFalse(PlaybackBackgroundRules.shouldKeepPlaybackAwake("paused", "user", "idle"));
        assertFalse(PlaybackBackgroundRules.shouldKeepPlaybackAwake("paused", "auto", "error"));
        assertFalse(PlaybackBackgroundRules.shouldKeepPlaybackAwake("ended", "none", "idle"));
    }

    @Test
    public void taskRemovalDoesNotStopActiveBackgroundPlayback() {
        assertFalse(PlaybackBackgroundRules.shouldStopServiceOnTaskRemoved("playing", "none", "idle"));
        assertFalse(PlaybackBackgroundRules.shouldStopServiceOnTaskRemoved("paused", "auto", "speaking"));
        assertTrue(PlaybackBackgroundRules.shouldStopServiceOnTaskRemoved("paused", "user", "idle"));
    }
}
