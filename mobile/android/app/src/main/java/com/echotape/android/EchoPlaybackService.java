package com.echotape.android;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class EchoPlaybackService extends MediaSessionService {
    private static final String TAG = "EchoPlaybackService";
    private static final long TICK_MS = 50;
    private static final double TRIGGER_EARLY_SECONDS = 0.012;
    private static final double MAX_SNAP_BACK_SECONDS = 1.2;
    private static final long POSITION_SAVE_INTERVAL_MS = 2000;
    private static final long MAX_SESSION_FILE_BYTES = 40L * 1024 * 1024;
    private static final String SESSION_FILE = "echo-session.v1.json";
    private static final String SESSION_TEMP_FILE = "echo-session.v1.json.tmp";
    private static final String SESSION_PREFS = "echotape.playback.state";
    private static final String PREF_POSITION_MS = "positionMs";
    private static final String PREF_SETTINGS = "settings";
    private static final String PREF_VOICE_NAME = "voiceName";

    private static volatile EchoPlaybackService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService persistenceExecutor = Executors.newSingleThreadExecutor();
    private final List<Cue> cues = new ArrayList<>();
    private final List<String> blockedWords = new ArrayList<>();
    private final ArrayDeque<Integer> speechQueue = new ArrayDeque<>();

    private ExoPlayer player;
    private MediaSession mediaSession;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String ttsError = "";
    private int ttsGeneration;
    private boolean ttsAutoRetryUsed;
    private String voiceName = "";
    private String audioUri = "";
    private String audioName = "";
    private String subtitleUri = "";
    private String subtitleName = "";
    private String subtitleFormat = "";
    private String subtitleEncoding = "";
    private JSONArray subtitleWarnings = new JSONArray();

    private String transport = "idle";
    private String speech = "idle";
    private String pauseReason = "none";
    private String lastError = "";
    private int activeCue = -1;
    private int lastBlockedCue = -1;
    private int pointer;
    private int speechToken;
    private long resumePositionMs;

    private boolean autoPause = true;
    private double offsetMs;
    private double finalLrcCueStart = -1;
    private float playbackRate = 1f;
    private float ttsRate = 1f;
    private float ttsPitch = 1f;
    private float ttsVolume = 1f;
    private String expiredPolicy = "read-all";
    private String triggerMode = "end";

    private SpeechJob speechJob;
    private boolean internalPause;
    private long lastPositionSaveAtMs;
    private final Map<String, File> pendingSpeechFiles = new HashMap<>();
    private ExoPlayer synthesizedSpeechPlayer;
    private File playingSynthesizedFile;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (!"playing".equals(transport) || player == null) return;
            tick();
            handler.postDelayed(this, TICK_MS);
        }
    };

    public static void ensureStarted(Context context) {
        Intent intent = new Intent(context, EchoPlaybackService.class);
        context.startService(intent);
    }

    @Nullable
    public static EchoPlaybackService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build();

        player = new ExoPlayer.Builder(this)
            .setAudioAttributes(audioAttributes, true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build();
        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    transport = "playing";
                    if (!"auto".equals(pauseReason)) pauseReason = "none";
                    handler.removeCallbacks(ticker);
                    handler.post(ticker);
                } else if ("playing".equals(transport) && !internalPause) {
                    transport = "paused";
                    pauseReason = "user";
                }
                savePlaybackPosition(true);
                emitState();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_ENDED) {
                    transport = "ended";
                    pauseReason = "none";
                    if (autoPause) cancelSpeech();
                    savePlaybackPosition(true);
                    emitState();
                }
            }
        });

        PendingIntent sessionActivity = PendingIntent.getActivity(
            this,
            0,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        mediaSession = new MediaSession.Builder(this, player)
            .setSessionActivity(sessionActivity)
            .build();

        initializeTts();
        restorePersistedSession();
        emitState();
    }

    private void initializeTts() {
        int generation = ++ttsGeneration;
        TextToSpeech previous = tts;
        tts = null;
        ttsReady = false;
        if (previous != null) {
            previous.stop();
            previous.shutdown();
        }
        TextToSpeech next = new TextToSpeech(this, status -> handler.post(() -> onTtsInitialized(status, generation)));
        tts = next;
        next.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                handler.post(() -> onTtsDone(utteranceId));
            }

            @Override
            public void onError(String utteranceId) {
                handler.post(() -> onTtsError(utteranceId));
            }

            @Override
            public void onStop(String utteranceId, boolean interrupted) {
                // Cancellation is session-controlled through speechToken.
            }
        });
    }

    private void onTtsInitialized(int status, int generation) {
        if (generation != ttsGeneration) return;
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true;
            ttsError = "";
            lastError = "";
            configureTts();
            emitState();
            return;
        }

        ttsReady = false;
        if (!ttsAutoRetryUsed) {
            ttsAutoRetryUsed = true;
            ttsError = "系统语音引擎正在重新连接…";
            emitState();
            handler.postDelayed(this::initializeTts, 900);
            return;
        }

        int engineCount = 0;
        try {
            List<TextToSpeech.EngineInfo> engines = tts == null ? null : tts.getEngines();
            engineCount = engines == null ? 0 : engines.size();
        } catch (RuntimeException ignored) {}
        ttsError = engineCount == 0
            ? "未检测到 Android 系统语音引擎。请安装或启用系统 TTS 引擎。"
            : "系统语音引擎初始化失败（已检测到 " + engineCount + " 个引擎）。请在系统设置中启用并配置中文语音。";
        lastError = ttsError;
        emitState();
    }

    public void retryTts() {
        ttsAutoRetryUsed = false;
        initializeTts();
        emitState();
    }

    public void reapplySpeechTuning() {
        requireMainThread();
        if (!"speaking".equals(speech) || activeCue < 0 || activeCue >= cues.size()) return;
        stopSynthesizedSpeechPlayback();
        beginSpeech(cues.get(activeCue).text, activeCue);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        int result = super.onStartCommand(intent, flags, startId);
        emitState();
        return result;
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public void onDestroy() {
        savePlaybackPosition(true);
        cancelSpeech();
        handler.removeCallbacksAndMessages(null);
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        ttsGeneration += 1;
        persistenceExecutor.shutdown();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        savePlaybackPosition(true);
        super.onTaskRemoved(rootIntent);
    }

    public void loadSession(
        Uri nextAudioUri,
        String nextAudioName,
        List<Cue> nextCues,
        JSONObject settings,
        @Nullable JSONObject source,
        long startPositionMs
    ) {
        requireMainThread();
        cancelSpeech();
        speechQueue.clear();
        cues.clear();
        cues.addAll(nextCues);
        audioUri = nextAudioUri.toString();
        audioName = nextAudioName == null ? "" : nextAudioName;
        readSourceMetadata(source);
        updateFinalLrcCueStart();
        pointer = 0;
        activeCue = -1;
        lastBlockedCue = -1;
        transport = "idle";
        speech = "idle";
        pauseReason = "none";
        lastError = "";
        applySettings(settings, false);
        sortCuesByTriggerMode();
        configureTts();

        MediaMetadata metadata = new MediaMetadata.Builder()
            .setTitle(audioName.isEmpty() ? "EchoTape" : audioName)
            .build();
        MediaItem item = new MediaItem.Builder().setUri(nextAudioUri).setMediaMetadata(metadata).build();
        player.setMediaItem(item);
        player.setPlaybackSpeed(playbackRate);
        player.prepare();
        long safePosition = Math.max(0, startPositionMs);
        if (safePosition > 0) {
            player.seekTo(safePosition);
            pointer = findNextIndex(safePosition / 1000.0, false);
            transport = "paused";
            pauseReason = "user";
        }
        persistSessionSource();
        savePlaybackPosition(true);
        emitState();
    }

    public void clearSession() {
        requireMainThread();
        cancelSpeech();
        speechQueue.clear();
        cues.clear();
        finalLrcCueStart = -1;
        audioUri = "";
        audioName = "";
        subtitleName = "";
        subtitleUri = "";
        subtitleFormat = "";
        subtitleEncoding = "";
        subtitleWarnings = new JSONArray();
        pointer = 0;
        activeCue = -1;
        lastBlockedCue = -1;
        transport = "idle";
        speech = "idle";
        pauseReason = "none";
        lastError = "";
        if (player != null) {
            player.stop();
            player.clearMediaItems();
        }
        clearPersistedSession();
        emitState();
    }

    public void play() {
        requireMainThread();
        if (player == null) return;
        if (player.getPlaybackState() == Player.STATE_ENDED) {
            cancelSpeech();
            speechQueue.clear();
            pointer = 0;
            activeCue = -1;
            lastBlockedCue = -1;
            player.seekTo(0);
        }
        if ("error".equals(speech) && autoPause) {
            speech = "idle";
            activeCue = -1;
        }
        transport = "playing";
        pauseReason = "none";
        player.play();
        handler.removeCallbacks(ticker);
        handler.post(ticker);
        savePlaybackPosition(true);
        emitState();
    }

    public void pause() {
        requireMainThread();
        if (player == null) return;
        if (autoPause && !"idle".equals(speech)) {
            int active = activeCue;
            cancelSpeech();
            if (active >= 0) pointer = active;
            activeCue = -1;
            speech = "idle";
        }
        transport = "paused";
        pauseReason = "user";
        internalPause = true;
        player.pause();
        internalPause = false;
        handler.removeCallbacks(ticker);
        savePlaybackPosition(true);
        emitState();
    }

    public void stop() {
        requireMainThread();
        cancelSpeech();
        speechQueue.clear();
        pointer = 0;
        activeCue = -1;
        lastBlockedCue = -1;
        speech = "idle";
        pauseReason = "none";
        if (player != null) {
            internalPause = true;
            player.pause();
            player.seekTo(0);
            internalPause = false;
        }
        transport = "idle";
        savePlaybackPosition(true);
        emitState();
    }

    public void seekTo(long targetMs) {
        requireMainThread();
        if (player == null) return;
        boolean wasActive = "playing".equals(transport) ||
            (autoPause && "speaking".equals(speech) && "auto".equals(pauseReason));
        long duration = player.getDuration();
        long max = duration > 0 ? duration : Math.max(0, targetMs);
        long next = Math.max(0, Math.min(targetMs, Math.max(0, max - 30)));

        cancelSpeech();
        speechQueue.clear();
        activeCue = -1;
        lastBlockedCue = -1;
        speech = "idle";
        player.seekTo(next);
        pointer = findNextIndex(next / 1000.0, false);
        pauseReason = "none";
        if (wasActive) {
            transport = "playing";
            player.play();
        } else {
            transport = "paused";
        }
        savePlaybackPosition(true);
        emitState();
    }

    public void skipSpeech() {
        requireMainThread();
        if ("idle".equals(speech)) return;
        boolean resume = autoPause && "auto".equals(pauseReason);
        cancelSpeech();
        activeCue = -1;
        speech = "idle";
        if (resume) {
            resumeAutoPausedAudio();
        } else {
            startNextSpeech();
        }
        savePlaybackPosition(true);
    }

    public void clearSpeechQueue() {
        requireMainThread();
        int count = speechQueue.size() + (activeCue >= 0 ? 1 : 0);
        boolean resume = autoPause && "auto".equals(pauseReason);
        cancelSpeech();
        speechQueue.clear();
        activeCue = -1;
        speech = "idle";
        lastError = "";
        if (count > 0) EchoPlaybackBus.publishQueueCleared(count, "user");
        if (resume) resumeAutoPausedAudio();
        else {
            savePlaybackPosition(true);
            emitState();
        }
    }

    public void updateSettings(@Nullable JSONObject settings) {
        requireMainThread();
        applySettings(settings, true);
        persistVolatileState();
        filterBlockedSpeechQueue();
        if (activeCue >= 0 && activeCue < cues.size() && isBlocked(cues.get(activeCue).text)) {
            skipSpeech();
        } else {
            emitState();
        }
    }

    public void replaceCues(List<Cue> nextCues) {
        requireMainThread();
        boolean wasAutoPaused = autoPause && "paused".equals(transport) && "auto".equals(pauseReason);
        cancelSpeech();
        speechQueue.clear();
        cues.clear();
        cues.addAll(nextCues);
        updateFinalLrcCueStart();
        sortCuesByTriggerMode();
        long currentPosition = player == null ? 0 : player.getCurrentPosition();
        pointer = findNextIndex(currentPosition / 1000.0, false);
        activeCue = -1;
        lastBlockedCue = -1;
        speech = "idle";
        if (wasAutoPaused && player != null) {
            pauseReason = "none";
            transport = "playing";
            player.play();
            handler.removeCallbacks(ticker);
            handler.post(ticker);
        }
        persistSessionSource();
        savePlaybackPosition(true);
        emitState();
    }

    public void setVoice(String nextVoiceName) {
        requireMainThread();
        voiceName = nextVoiceName == null ? "" : nextVoiceName;
        configureTts();
        persistVolatileState();
        emitState();
    }

    public JSONObject getState() {
        JSONObject state = new JSONObject();
        try {
            state.put("transport", transport);
            state.put("speech", speech);
            state.put("hasSession", !audioUri.isEmpty());
            state.put("activeCue", activeCue >= 0 ? activeCue : JSONObject.NULL);
            state.put("lastBlockedCue", lastBlockedCue >= 0 ? lastBlockedCue : JSONObject.NULL);
            state.put("pointer", pointer);
            state.put("pendingSpeechCount", speechQueue.size());
            state.put("blockedWordCount", blockedWords.size());
            state.put("triggerMode", triggerMode);
            state.put("autoPause", autoPause);
            state.put("pauseReason", pauseReason);
            state.put("positionMs", player == null ? 0 : Math.max(0, player.getCurrentPosition()));
            long duration = player == null ? 0 : player.getDuration();
            state.put("durationMs", duration == C.TIME_UNSET ? 0 : Math.max(0, duration));
            state.put("ttsReady", ttsReady);
            state.put("lastError", lastError.isEmpty() ? ttsError : lastError);
        } catch (JSONException ignored) {}
        return state;
    }

    public JSONObject getSessionInfo() {
        JSONObject session = new JSONObject();
        try {
            session.put("hasSession", !audioUri.isEmpty());
            session.put("audioUri", audioUri);
            session.put("audioName", audioName);
            session.put("subtitleUri", subtitleUri);
            session.put("subtitleName", subtitleName);
            session.put("subtitleFormat", subtitleFormat);
            session.put("subtitleEncoding", subtitleEncoding);
            session.put("subtitleWarnings", new JSONArray(subtitleWarnings.toString()));
            session.put("cues", cuesToJson());
            session.put("positionMs", player == null ? 0 : Math.max(0, player.getCurrentPosition()));
        } catch (JSONException ignored) {}
        return session;
    }

    public JSONArray getVoices() {
        JSONArray result = new JSONArray();
        if (!ttsReady) return result;
        Set<Voice> voices = tts.getVoices();
        if (voices == null) return result;
        List<Voice> sorted = new ArrayList<>(voices);
        Collections.sort(sorted, (a, b) -> a.getName().compareToIgnoreCase(b.getName()));
        for (Voice voice : sorted) {
            try {
                JSONObject row = new JSONObject();
                row.put("name", voice.getName());
                row.put("lang", voice.getLocale().toLanguageTag());
                row.put("localService", !voice.isNetworkConnectionRequired());
                result.put(row);
            } catch (JSONException ignored) {}
        }
        return result;
    }

    public boolean speakPreview(String text, JSONObject settings) {
        requireMainThread();
        if (!ttsReady || tts == null) return false;
        if (!"idle".equals(speech)) return false;
        applySettings(settings, false);
        configureTts();
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, ttsVolume);
        String utteranceId = "echo-preview-" + (++speechToken);
        if (shouldUseSynthesizedPlayback()) {
            File file = new File(getCacheDir(), utteranceId + ".wav");
            pendingSpeechFiles.put(utteranceId, file);
            int result = tts.synthesizeToFile(text, params, file, utteranceId);
            if (result == TextToSpeech.ERROR) {
                pendingSpeechFiles.remove(utteranceId);
                if (file.exists()) file.delete();
                tts.setSpeechRate(ttsRate);
                tts.setPitch(ttsPitch);
                return tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId) != TextToSpeech.ERROR;
            }
            return true;
        }
        return tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId) != TextToSpeech.ERROR;
    }

    private void tick() {
        if (!"playing".equals(transport) || player == null) return;
        double now = player.getCurrentPosition() / 1000.0;
        while (pointer < cues.size()) {
            Cue cue = cues.get(pointer);
            double triggerAt = cueTrigger(cue) + offsetMs / 1000.0;
            if (now + TRIGGER_EARLY_SECONDS < triggerAt) break;
            int index = pointer++;
            if (isBlocked(cue.text)) {
                lastBlockedCue = index;
                savePlaybackPosition(true);
                emitState();
                return;
            }
            if (autoPause) {
                startAutoSpeech(index);
                return;
            }
            speechQueue.add(index);
        }
        if ("idle".equals(speech) && !speechQueue.isEmpty()) {
            startNextSpeech();
        }
        emitState();
        savePlaybackPosition(false);
    }

    private void startAutoSpeech(int index) {
        Cue cue = cues.get(index);
        if (isBlocked(cue.text)) {
            pointer = Math.max(pointer, index + 1);
            lastBlockedCue = index;
            emitState();
            return;
        }
        lastBlockedCue = -1;
        double triggerAt = cueTrigger(cue) + offsetMs / 1000.0;
        long nowSeconds = player.getCurrentPosition();
        double overshoot = nowSeconds / 1000.0 - triggerAt;
        internalPause = true;
        player.pause();
        internalPause = false;
        if (overshoot > 0.02 && overshoot <= MAX_SNAP_BACK_SECONDS) {
            player.seekTo(Math.max(0, Math.round(triggerAt * 1000)));
        }
        transport = "paused";
        pauseReason = "auto";
        resumePositionMs = player.getCurrentPosition();
        activeCue = index;
        lastBlockedCue = -1;
        speech = "speaking";
        savePlaybackPosition(true);
        beginSpeech(cue.text, index);
    }

    private void beginSpeech(String text, int cueIndex) {
        speechQueue.remove(cueIndex);
        lastError = "";
        if (!ttsReady || tts == null) {
            failSpeech("Android 系统语音未初始化，无法朗读");
            return;
        }
        configureTts();
        int token = ++speechToken;
        speechJob = new SpeechJob(token, cueIndex, splitIntoSegments(text));
        speakNextSegment();
    }

    private void speakNextSegment() {
        if (speechJob == null || speechJob.segments.isEmpty()) {
            finishSpeech();
            return;
        }
        configureTts();
        String segment = speechJob.segments.remove(0);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, ttsVolume);
        String utteranceId = "echo-" + speechJob.token + "-" + speechJob.cueIndex + "-" + speechJob.segmentIndex++;
        if (shouldUseSynthesizedPlayback()) {
            File file = new File(getCacheDir(), utteranceId + ".wav");
            pendingSpeechFiles.put(utteranceId, file);
            int result = tts.synthesizeToFile(segment, params, file, utteranceId);
            if (result == TextToSpeech.ERROR) {
                pendingSpeechFiles.remove(utteranceId);
                if (file.exists()) file.delete();
                tts.setSpeechRate(ttsRate);
                tts.setPitch(ttsPitch);
                speakDirectSegment(segment, params, utteranceId);
            }
            return;
        }
        speakDirectSegment(segment, params, utteranceId);
    }

    private void speakDirectSegment(String segment, Bundle params, String utteranceId) {
        int result = tts.speak(segment, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        if (result == TextToSpeech.ERROR) {
            failSpeech("Android 系统语音拒绝朗读，请检查中文语音包");
        }
    }

    private void onTtsDone(String utteranceId) {
        File synthesizedFile = pendingSpeechFiles.remove(utteranceId);
        if (utteranceId.startsWith("echo-preview-")) {
            if (synthesizedFile != null && synthesizedFile.exists()) {
                playSynthesizedSegment(synthesizedFile, utteranceId);
            }
            return;
        }
        int token = utteranceToken(utteranceId);
        if (speechJob == null || token != speechJob.token) {
            if (synthesizedFile != null && synthesizedFile.exists()) synthesizedFile.delete();
            return;
        }
        if (synthesizedFile != null) {
            if (!synthesizedFile.exists()) {
                failSpeech("系统语音未能生成朗读音频");
                return;
            }
            playSynthesizedSegment(synthesizedFile, utteranceId);
            return;
        }
        completeSpeechSegment(utteranceId);
    }

    private void completeSpeechSegment(String utteranceId) {
        if (speechJob == null || utteranceToken(utteranceId) != speechJob.token) return;
        if (speechJob.segments.isEmpty()) finishSpeech();
        else speakNextSegment();
    }

    private void onTtsError(String utteranceId) {
        File synthesizedFile = pendingSpeechFiles.remove(utteranceId);
        if (synthesizedFile != null && synthesizedFile.exists()) synthesizedFile.delete();
        if (utteranceId.startsWith("echo-preview-")) return;
        int token = utteranceToken(utteranceId);
        if (speechJob == null || token != speechJob.token) return;
        failSpeech("Android 系统语音朗读失败，请检查中文语音设置");
    }

    private void playSynthesizedSegment(File file, String utteranceId) {
        stopSynthesizedSpeechPlayback();
        ExoPlayer player = new ExoPlayer.Builder(this)
            .setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                    .build(),
                false
            )
            .build();
        synthesizedSpeechPlayer = player;
        playingSynthesizedFile = file;
        player.setVolume(ttsVolume);
        player.setPlaybackParameters(
            new PlaybackParameters(
                (float) clamp(ttsRate, 0.5, 2.0),
                (float) clamp(ttsPitch, 0.5, 2.0)
            )
        );
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState != Player.STATE_ENDED || synthesizedSpeechPlayer != player) return;
                releaseSynthesizedPlayer(player, file);
                completeSpeechSegment(utteranceId);
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (synthesizedSpeechPlayer != player) return;
                failSynthesizedSpeech("朗读音频播放失败", file);
            }
        });
        try {
            player.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)));
            player.prepare();
            player.play();
        } catch (Exception error) {
            failSynthesizedSpeech("无法播放系统语音生成的音频", file);
        }
    }

    private void failSynthesizedSpeech(String message, File file) {
        stopSynthesizedSpeechPlayback();
        if (file.exists()) file.delete();
        failSpeech(message);
    }

    private void releaseSynthesizedPlayer(ExoPlayer player, File file) {
        player.release();
        if (synthesizedSpeechPlayer == player) synthesizedSpeechPlayer = null;
        if (playingSynthesizedFile == file) playingSynthesizedFile = null;
        if (file.exists()) file.delete();
    }

    private void stopSynthesizedSpeechPlayback() {
        ExoPlayer player = synthesizedSpeechPlayer;
        File file = playingSynthesizedFile;
        synthesizedSpeechPlayer = null;
        playingSynthesizedFile = null;
        if (player != null) {
            player.stop();
            player.release();
        }
        if (file != null && file.exists()) file.delete();
    }

    private void finishSpeech() {
        speechJob = null;
        activeCue = -1;
        speech = "idle";
        if (autoPause && "auto".equals(pauseReason)) {
            if ("skip".equals(expiredPolicy)) {
                double now = player.getCurrentPosition() / 1000.0;
                while (pointer < cues.size() && cueTrigger(cues.get(pointer)) + offsetMs / 1000.0 <= now + 0.02) {
                    pointer += 1;
                }
            }
            resumeAutoPausedAudio();
        } else {
            emitState();
            startNextSpeech();
        }
        savePlaybackPosition(true);
    }

    private void failSpeech(String message) {
        speechJob = null;
        speech = "error";
        lastError = message;
        if (autoPause) {
            pointer = Math.max(0, activeCue);
            transport = "paused";
        }
        savePlaybackPosition(true);
        emitState();
    }

    private void startNextSpeech() {
        if (!"idle".equals(speech)) {
            emitState();
            return;
        }
        Integer index = null;
        while (!speechQueue.isEmpty()) {
            Integer candidate = speechQueue.pollFirst();
            if (candidate == null) continue;
            if (candidate < 0 || candidate >= cues.size()) continue;
            if (isBlocked(cues.get(candidate).text)) continue;
            index = candidate;
            break;
        }
        if (index == null) {
            emitState();
            return;
        }
        activeCue = index;
        lastBlockedCue = -1;
        speech = "speaking";
        emitState();
        beginSpeech(cues.get(index).text, index);
    }

    private void resumeAutoPausedAudio() {
        if (!autoPause || !"auto".equals(pauseReason) || player == null) {
            emitState();
            return;
        }
        long drift = Math.abs(player.getCurrentPosition() - resumePositionMs);
        if (drift > 20) player.seekTo(resumePositionMs);
        pauseReason = "none";
        transport = "playing";
        player.play();
        handler.removeCallbacks(ticker);
        handler.post(ticker);
        savePlaybackPosition(true);
        emitState();
    }

    private void readSourceMetadata(@Nullable JSONObject source) {
        subtitleName = "";
        subtitleUri = "";
        subtitleFormat = "";
        subtitleEncoding = "";
        subtitleWarnings = new JSONArray();
        if (source == null) return;
        subtitleUri = source.optString("uri", "");
        subtitleName = source.optString("name", "");
        subtitleFormat = source.optString("format", "");
        subtitleEncoding = source.optString("encoding", "");
        JSONArray warnings = source.optJSONArray("warnings");
        if (warnings != null) {
            try {
                subtitleWarnings = new JSONArray(warnings.toString());
            } catch (JSONException ignored) {
                subtitleWarnings = new JSONArray();
            }
        }
    }

    private void restorePersistedSession() {
        File file = sessionFile();
        if (!file.isFile()) return;
        try {
            String raw = readSessionFile(file);
            JSONObject root = new JSONObject(raw);
            String restoredAudioUri = root.optString("audioUri", "");
            JSONArray rawCues = root.optJSONArray("cues");
            if (restoredAudioUri.isEmpty() || rawCues == null) return;

            List<Cue> restoredCues = new ArrayList<>();
            for (int i = 0; i < rawCues.length(); i++) {
                restoredCues.add(Cue.fromJson(rawCues.getJSONObject(i)));
            }

            cancelSpeech();
            speechQueue.clear();
            cues.clear();
            cues.addAll(restoredCues);
            audioUri = restoredAudioUri;
            audioName = root.optString("audioName", "");
            readSourceMetadata(root.optJSONObject("source"));
            updateFinalLrcCueStart();

            SharedPreferences prefs = sessionPreferences();
            String settingsRaw = prefs.getString(PREF_SETTINGS, null);
            JSONObject restoredSettings = root.optJSONObject("settings");
            if (settingsRaw != null) {
                try {
                    restoredSettings = new JSONObject(settingsRaw);
                } catch (JSONException ignored) {}
            }
            applySettings(restoredSettings, false);
            sortCuesByTriggerMode();
            voiceName = prefs.getString(PREF_VOICE_NAME, voiceName);
            configureTts();

            MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(audioName.isEmpty() ? "EchoTape" : audioName)
                .build();
            MediaItem item = new MediaItem.Builder()
                .setUri(Uri.parse(audioUri))
                .setMediaMetadata(metadata)
                .build();
            player.setMediaItem(item);
            player.setPlaybackSpeed(playbackRate);
            player.prepare();

            long savedPosition = PlaybackRecoveryRules.clampSavedPosition(
                prefs.getLong(PREF_POSITION_MS, root.optLong("positionMs", 0)),
                player.getDuration()
            );
            if (savedPosition > 0) player.seekTo(savedPosition);
            pointer = findRecoveryCueIndex(savedPosition / 1000.0);
            activeCue = -1;
            speechQueue.clear();
            speech = "idle";
            transport = "paused";
            pauseReason = "user";
            lastError = "";
        } catch (Exception error) {
            Log.w(TAG, "Unable to restore the previous playback session", error);
        }
    }

    private void persistSessionSource() {
        if (audioUri.isEmpty()) return;
        JSONObject root = new JSONObject();
        try {
            root.put("version", 1);
            root.put("audioUri", audioUri);
            root.put("audioName", audioName);
            root.put("source", sourceToJson());
            root.put("cues", cuesToJson());
            root.put("settings", settingsToJson());
            root.put("savedAtEpochMs", System.currentTimeMillis());
        } catch (JSONException error) {
            Log.w(TAG, "Unable to serialize playback session", error);
            return;
        }
        String payload = root.toString();
        persistenceExecutor.execute(() -> writeSessionFile(payload));
    }

    private JSONObject sourceToJson() throws JSONException {
        JSONObject source = new JSONObject();
        source.put("uri", subtitleUri);
        source.put("name", subtitleName);
        source.put("format", subtitleFormat);
        source.put("encoding", subtitleEncoding);
        source.put("warnings", new JSONArray(subtitleWarnings.toString()));
        return source;
    }

    private JSONArray cuesToJson() throws JSONException {
        JSONArray result = new JSONArray();
        for (Cue cue : cues) {
            JSONObject row = new JSONObject();
            row.put("id", cue.id);
            row.put("start", cue.start);
            row.put("end", cue.end);
            row.put("text", cue.text);
            result.put(row);
        }
        return result;
    }

    private JSONObject settingsToJson() throws JSONException {
        JSONObject settings = new JSONObject();
        settings.put("autoPause", autoPause);
        settings.put("offsetMs", offsetMs);
        settings.put("playbackRate", playbackRate);
        settings.put("ttsRate", ttsRate);
        settings.put("ttsPitch", ttsPitch);
        settings.put("ttsVolume", ttsVolume);
        settings.put("expiredPolicy", expiredPolicy);
        settings.put("triggerMode", triggerMode);
        settings.put("blockedWords", new JSONArray(blockedWords));
        return settings;
    }

    private void persistVolatileState() {
        SharedPreferences.Editor editor = sessionPreferences().edit();
        try {
            editor.putString(PREF_SETTINGS, settingsToJson().toString());
        } catch (JSONException ignored) {}
        editor.putString(PREF_VOICE_NAME, voiceName);
        editor.putLong(PREF_POSITION_MS, player == null ? 0 : Math.max(0, player.getCurrentPosition()));
        editor.apply();
    }

    private void savePlaybackPosition(boolean force) {
        if (audioUri.isEmpty()) return;
        long now = System.currentTimeMillis();
        if (!force && now - lastPositionSaveAtMs < POSITION_SAVE_INTERVAL_MS) return;
        lastPositionSaveAtMs = now;
        persistVolatileState();
    }

    private void clearPersistedSession() {
        sessionPreferences().edit().clear().apply();
        persistenceExecutor.execute(() -> {
            File file = sessionFile();
            if (file.exists() && !file.delete()) {
                Log.w(TAG, "Unable to remove the persisted playback session");
            }
        });
        lastPositionSaveAtMs = 0;
    }

    private void writeSessionFile(String payload) {
        File target = sessionFile();
        File temporary = new File(getFilesDir(), SESSION_TEMP_FILE);
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(payload.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
            try {
                Files.move(
                    temporary.toPath(),
                    target.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE
                );
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException error) {
            Log.w(TAG, "Unable to persist playback session", error);
        }
    }

    private String readSessionFile(File file) throws IOException {
        if (file.length() > MAX_SESSION_FILE_BYTES) {
            throw new IOException("Persisted session is too large");
        }
        try (
            FileInputStream input = new FileInputStream(file);
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream((int) file.length())
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private File sessionFile() {
        return new File(getFilesDir(), SESSION_FILE);
    }

    private SharedPreferences sessionPreferences() {
        return getSharedPreferences(SESSION_PREFS, MODE_PRIVATE);
    }

    private int findRecoveryCueIndex(double seconds) {
        double[] starts = new double[cues.size()];
        for (int i = 0; i < cues.size(); i++) starts[i] = cues.get(i).start;
        return PlaybackRecoveryRules.nextCueIndex(starts, seconds, offsetMs / 1000.0);
    }

    private void applySettings(@Nullable JSONObject settings, boolean handleModeSwitch) {
        if (settings == null) return;
        boolean previousAutoPause = autoPause;
        String previousTriggerMode = triggerMode;
        autoPause = settings.optBoolean("autoPause", autoPause);
        offsetMs = settings.optDouble("offsetMs", offsetMs);
        playbackRate = (float) clamp(settings.optDouble("playbackRate", playbackRate), 0.5, 2.0);
        ttsRate = (float) clamp(settings.optDouble("ttsRate", ttsRate), 0.5, 2.0);
        ttsPitch = (float) clamp(settings.optDouble("ttsPitch", ttsPitch), 0.5, 2.0);
        ttsVolume = (float) clamp(settings.optDouble("ttsVolume", ttsVolume), 0.0, 1.0);
        expiredPolicy = settings.optString("expiredPolicy", expiredPolicy);
        triggerMode = "start".equals(settings.optString("triggerMode", triggerMode)) ? "start" : "end";
        if (settings.has("blockedWords")) {
            blockedWords.clear();
            JSONArray words = settings.optJSONArray("blockedWords");
            if (words != null) {
                for (int i = 0; i < words.length(); i++) {
                    String word = words.optString(i, "").trim();
                    if (!word.isEmpty() && !containsBlockedWord(word)) blockedWords.add(word);
                }
            }
            lastBlockedCue = -1;
        }
        if (player != null) player.setPlaybackSpeed(playbackRate);
        configureTts();

        boolean triggerModeChanged = !previousTriggerMode.equals(triggerMode);
        if (triggerModeChanged) {
            cancelSpeech();
            speechQueue.clear();
            activeCue = -1;
            lastBlockedCue = -1;
            speech = "idle";
            sortCuesByTriggerMode();
            double currentSeconds = player == null ? 0 : player.getCurrentPosition() / 1000.0;
            pointer = findNextIndex(currentSeconds, false);
            if (autoPause && "auto".equals(pauseReason)) {
                pauseReason = "none";
                transport = "playing";
                if (player != null) player.play();
                handler.removeCallbacks(ticker);
                handler.post(ticker);
            }
        }

        if (!handleModeSwitch || previousAutoPause == autoPause) return;
        if (autoPause) {
            double now = player == null ? 0 : player.getCurrentPosition() / 1000.0;
            int count = speechQueue.size() + (activeCue >= 0 ? 1 : 0);
            cancelSpeech();
            speechQueue.clear();
            activeCue = -1;
            speech = "idle";
            pointer = findNextIndex(now + 0.02, true);
            if (count > 0) EchoPlaybackBus.publishQueueCleared(count, "mode-switch");
        } else if ("paused".equals(transport) && "auto".equals(pauseReason)) {
            pauseReason = "none";
            transport = "playing";
            player.play();
            handler.removeCallbacks(ticker);
            handler.post(ticker);
        }
        savePlaybackPosition(true);
    }

    private void configureTts() {
        if (tts == null || !ttsReady) return;
        boolean synthesizedPlayback = shouldUseSynthesizedPlayback();
        float synthesisRate = synthesizedPlayback ? 1f : ttsRate;
        float synthesisPitch = synthesizedPlayback ? 1f : ttsPitch;
        tts.setAudioAttributes(
            new android.media.AudioAttributes.Builder()
                .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        );
        Set<Voice> voices = tts.getVoices();
        if (!voiceName.isEmpty() && voices != null) {
            for (Voice voice : voices) {
                if (voice.getName().equals(voiceName)) {
                    tts.setVoice(voice);
                    tts.setSpeechRate(synthesisRate);
                    tts.setPitch(synthesisPitch);
                    return;
                }
            }
        }
        tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        // Some engines reset rate/pitch when the voice or language changes.
        tts.setSpeechRate(synthesisRate);
        tts.setPitch(synthesisPitch);
    }

    private boolean shouldUseSynthesizedPlayback() {
        return Math.abs(ttsRate - 1f) > 0.01f || Math.abs(ttsPitch - 1f) > 0.01f;
    }

    private boolean isBlocked(String text) {
        if (text == null || text.isEmpty() || blockedWords.isEmpty()) return false;
        String normalized = text.toLowerCase(Locale.ROOT);
        for (String word : blockedWords) {
            if (normalized.contains(word.toLowerCase(Locale.ROOT))) return true;
        }
        return false;
    }

    private boolean containsBlockedWord(String candidate) {
        for (String word : blockedWords) {
            if (word.equalsIgnoreCase(candidate)) return true;
        }
        return false;
    }

    private void filterBlockedSpeechQueue() {
        if (speechQueue.isEmpty() || blockedWords.isEmpty()) return;
        java.util.Iterator<Integer> iterator = speechQueue.iterator();
        while (iterator.hasNext()) {
            Integer index = iterator.next();
            if (index == null || index < 0 || index >= cues.size() || isBlocked(cues.get(index).text)) {
                iterator.remove();
            }
        }
    }

    private void cancelSpeech() {
        speechToken += 1;
        speechJob = null;
        if (tts != null) tts.stop();
        stopSynthesizedSpeechPlayback();
        for (File file : pendingSpeechFiles.values()) {
            if (file.exists()) file.delete();
        }
        pendingSpeechFiles.clear();
    }

    private int findNextIndex(double seconds, boolean strict) {
        double threshold = seconds + (strict ? 0.02 : -0.02);
        int low = 0;
        int high = cues.size();
        while (low < high) {
            int mid = (low + high) >>> 1;
            double cueAt = cueTrigger(cues.get(mid)) + offsetMs / 1000.0;
            if (strict ? cueAt <= threshold : cueAt < threshold) low = mid + 1;
            else high = mid;
        }
        return low;
    }

    private int utteranceToken(String id) {
        String[] parts = id.split("-");
        if (parts.length < 3) return -1;
        try {
            return Integer.parseInt(parts[1]);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private double cueTrigger(Cue cue) {
        if (!"end".equals(triggerMode)) return cue.start;
        if (
            "lrc".equals(subtitleFormat) &&
            finalLrcCueStart >= 0 &&
            Math.abs(cue.start - finalLrcCueStart) < 0.001 &&
            player != null
        ) {
            long duration = player.getDuration();
            if (duration > 0 && duration != C.TIME_UNSET) {
                return Math.max(cue.start, duration / 1000.0 - 0.35);
            }
        }
        return cue.end;
    }

    private void updateFinalLrcCueStart() {
        finalLrcCueStart = -1;
        if (!"lrc".equals(subtitleFormat)) return;
        for (Cue cue : cues) {
            finalLrcCueStart = Math.max(finalLrcCueStart, cue.start);
        }
    }

    private void sortCuesByTriggerMode() {
        Collections.sort(
            cues,
            java.util.Comparator
                .comparingDouble((Cue cue) -> cueTrigger(cue))
                .thenComparingDouble(cue -> cue.start)
        );
    }

    private List<String> splitIntoSegments(String input) {
        String compact = input == null ? "" : input.replaceAll("\\s+", " ").trim();
        List<String> result = new ArrayList<>();
        for (int start = 0; start < compact.length(); start += 70) {
            result.add(compact.substring(start, Math.min(compact.length(), start + 70)));
        }
        if (result.isEmpty()) result.add("");
        return result;
    }

    private void emitState() {
        EchoPlaybackBus.publishState(getState());
    }

    private void requireMainThread() {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            throw new IllegalStateException("EchoPlaybackService methods must be called on the main thread");
        }
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static final class SpeechJob {
        final int token;
        final int cueIndex;
        final List<String> segments;
        int segmentIndex;

        SpeechJob(int token, int cueIndex, List<String> segments) {
            this.token = token;
            this.cueIndex = cueIndex;
            this.segments = segments;
        }
    }
}
