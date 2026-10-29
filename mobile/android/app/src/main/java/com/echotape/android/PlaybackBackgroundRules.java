package com.echotape.android;

/**
 * Pure rules for keeping the media service alive while the user intends to play.
 *
 * The media player may be paused briefly while an Android TTS utterance is
 * playing. That intentional pause must not be treated as the end of background
 * playback.
 */
public final class PlaybackBackgroundRules {
    private PlaybackBackgroundRules() {}

    public static boolean shouldKeepPlaybackAwake(
        String transport,
        String pauseReason,
        String speech
    ) {
        if ("playing".equals(transport)) return true;
        return "paused".equals(transport) &&
            "auto".equals(pauseReason) &&
            "speaking".equals(speech);
    }

    public static boolean shouldStopServiceOnTaskRemoved(
        String transport,
        String pauseReason,
        String speech
    ) {
        return !shouldKeepPlaybackAwake(transport, pauseReason, speech);
    }
}
