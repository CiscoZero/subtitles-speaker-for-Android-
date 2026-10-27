package com.echotape.android;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "EchoNative")
public class EchoNativePlugin extends Plugin {
    private static final int MAX_SUBTITLE_BYTES = 20 * 1024 * 1024;
    private final ExecutorService ioExecutor = Executors.newSingleThreadExecutor();

    private final EchoPlaybackBus.Listener playbackListener = new EchoPlaybackBus.Listener() {
        @Override
        public void onPlaybackState(JSONObject state) {
            try {
                notifyListeners("stateChanged", JSObject.fromJSONObject(state));
            } catch (JSONException ignored) {}
        }

        @Override
        public void onQueueCleared(int count, String reason) {
            JSObject data = new JSObject();
            data.put("count", count);
            data.put("reason", reason);
            notifyListeners("queueCleared", data);
        }
    };

    @Override
    public void load() {
        EchoPlaybackBus.addListener(playbackListener);
        EchoPlaybackService.ensureStarted(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        EchoPlaybackBus.removeListener(playbackListener);
        ioExecutor.shutdownNow();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void pickAudio(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("audio/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "audioPicked");
    }

    @ActivityCallback
    private void audioPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择音频");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("文件选择器没有返回 URI");
            return;
        }
        persistReadPermission(uri, result.getData().getFlags());
        JSObject payload = describeUri(uri);
        call.resolve(payload);
    }

    @PluginMethod
    public void pickSubtitle(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[] { "text/plain", "text/vtt", "application/x-subrip", "application/octet-stream" }
        );
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "subtitlePicked");
    }

    @ActivityCallback
    private void subtitlePicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("未选择字幕");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("文件选择器没有返回 URI");
            return;
        }
        persistReadPermission(uri, result.getData().getFlags());
        ioExecutor.execute(() -> {
            try {
                JSObject description = describeUri(uri);
                DecodedText decoded = readSubtitle(uri);
                description.put("content", decoded.text);
                description.put("encoding", decoded.encoding);
                getBridge().executeOnMainThread(() -> call.resolve(description));
            } catch (Exception error) {
                getBridge().executeOnMainThread(() -> call.reject("字幕读取失败", error));
            }
        });
    }

    @PluginMethod
    public void loadSession(PluginCall call) {
        String audioUri = call.getString("audioUri");
        JSArray rawCues = call.getArray("cues");
        if (audioUri == null || rawCues == null) {
            call.reject("audioUri 和 cues 不能为空");
            return;
        }
        List<Cue> cues = new ArrayList<>();
        try {
            for (int i = 0; i < rawCues.length(); i++) {
                cues.add(Cue.fromJson(rawCues.getJSONObject(i)));
            }
        } catch (JSONException error) {
            call.reject("字幕数据格式错误", error);
            return;
        }
        withService(call, service -> {
            service.loadSession(
                Uri.parse(audioUri),
                call.getString("audioName", ""),
                cues,
                call.getObject("settings"),
                call.getObject("source"),
                call.getLong("startPositionMs", 0L)
            );
            return true;
        });
    }

    @PluginMethod
    public void getSession(PluginCall call) {
        withService(call, service -> {
            try {
                call.resolve(JSObject.fromJSONObject(service.getSessionInfo()));
            } catch (JSONException error) {
                call.reject("无法读取已保存的播放会话", error);
            }
            return false;
        });
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        withService(call, service -> {
            service.clearSession();
            return true;
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        withService(call, service -> {
            service.play();
            return true;
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withService(call, service -> {
            service.pause();
            return true;
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withService(call, service -> {
            service.stop();
            return true;
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        withService(call, service -> {
            service.seekTo(call.getLong("positionMs", 0L));
            return true;
        });
    }

    @PluginMethod
    public void skipSpeech(PluginCall call) {
        withService(call, service -> {
            service.skipSpeech();
            return true;
        });
    }

    @PluginMethod
    public void clearSpeechQueue(PluginCall call) {
        withService(call, service -> {
            service.clearSpeechQueue();
            return true;
        });
    }

    @PluginMethod
    public void updateSettings(PluginCall call) {
        withService(call, service -> {
            service.updateSettings(call.getObject("settings"));
            return true;
        });
    }

    @PluginMethod
    public void setVoice(PluginCall call) {
        withService(call, service -> {
            service.setVoice(call.getString("name", ""));
            return true;
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        withService(call, service -> {
            try {
                call.resolve(JSObject.fromJSONObject(service.getState()));
            } catch (JSONException error) {
                call.reject("无法读取播放状态", error);
            }
            return false;
        });
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        withService(call, service -> {
            JSObject result = new JSObject();
            result.put("voices", JSArray.from(service.getVoices()));
            call.resolve(result);
            return false;
        });
    }

    @PluginMethod
    public void previewVoice(PluginCall call) {
        String text = call.getString("text", "这是中文朗读测试。");
        withService(call, service -> {
            boolean started = service.speakPreview(text, call.getObject("settings"));
            if (!started) {
                call.reject("语音引擎尚未就绪或正在朗读");
                return false;
            }
            return true;
        });
    }

    private void withService(PluginCall call, ServiceAction action) {
        EchoPlaybackService.ensureStarted(getContext());
        getBridge().executeOnMainThread(new Runnable() {
            private int attempts;

            @Override
            public void run() {
                EchoPlaybackService service = EchoPlaybackService.getInstance();
                if (service == null) {
                    if (++attempts >= 100) {
                        call.reject("原生播放服务初始化超时");
                        return;
                    }
                    getBridge().executeOnMainThread(this);
                    return;
                }
                if (action.run(service)) call.resolve();
            }
        });
    }

    private JSObject describeUri(Uri uri) {
        JSObject payload = new JSObject();
        String name = uri.getLastPathSegment() == null ? "未命名文件" : uri.getLastPathSegment();
        long size = 0;
        try (
            Cursor cursor = getContext()
                .getContentResolver()
                .query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameIndex >= 0) name = cursor.getString(nameIndex);
                if (sizeIndex >= 0) size = cursor.getLong(sizeIndex);
            }
        } catch (Exception ignored) {}
        payload.put("uri", uri.toString());
        payload.put("name", name);
        payload.put("size", size);
        return payload;
    }

    private void persistReadPermission(Uri uri, int flags) {
        int takeFlags = flags & Intent.FLAG_GRANT_READ_URI_PERMISSION;
        if (takeFlags == 0) takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException ignored) {}
    }

    private DecodedText readSubtitle(Uri uri) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        byte[] bytes;
        try (InputStream input = resolver.openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IllegalStateException("无法打开字幕文件");
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_SUBTITLE_BYTES) throw new IllegalStateException("字幕文件超过 20 MB");
                output.write(buffer, 0, read);
            }
            bytes = output.toByteArray();
        }
        return decode(bytes);
    }

    private DecodedText decode(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xef && (bytes[1] & 0xff) == 0xbb && (bytes[2] & 0xff) == 0xbf) {
            return new DecodedText(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8), "UTF-8 BOM");
        }
        if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xfe) {
            return new DecodedText(new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE), "UTF-16LE");
        }
        if (bytes.length >= 2 && (bytes[0] & 0xff) == 0xfe && (bytes[1] & 0xff) == 0xff) {
            return new DecodedText(new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE), "UTF-16BE");
        }
        try {
            String utf8 = StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
            return new DecodedText(utf8, "UTF-8");
        } catch (CharacterCodingException ignored) {
            return new DecodedText(new String(bytes, Charset.forName("GB18030")), "GB18030");
        }
    }

    private interface ServiceAction {
        boolean run(EchoPlaybackService service);
    }

    private static final class DecodedText {
        final String text;
        final String encoding;

        DecodedText(String text, String encoding) {
            this.text = text;
            this.encoding = encoding;
        }
    }
}
