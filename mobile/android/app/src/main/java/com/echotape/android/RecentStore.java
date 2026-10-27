package com.echotape.android;

import android.content.Context;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Small on-device recent library. Subtitle cues are cached so they remain usable without reopening the file. */
public final class RecentStore {
    private static final String FILE_NAME = "recent-library.v1.json";
    private static final String TEMP_FILE_NAME = "recent-library.v1.json.tmp";
    private static final int MAX_ITEMS = 6;

    private RecentStore() {}

    public static Library load(Context context) {
        Library library = new Library();
        File file = new File(context.getFilesDir(), FILE_NAME);
        if (!file.isFile() || file.length() > 40L * 1024 * 1024) return library;
        try (
            FileInputStream input = new FileInputStream(file);
            ByteArrayOutputStream output = new ByteArrayOutputStream((int) file.length())
        ) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            byte[] bytes = output.toByteArray();
            JSONObject root = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            JSONArray audioRows = root.optJSONArray("audio");
            if (audioRows != null) {
                for (int i = 0; i < audioRows.length() && library.audio.size() < MAX_ITEMS; i++) {
                    AudioItem item = AudioItem.fromJson(audioRows.optJSONObject(i));
                    if (item != null) library.audio.add(item);
                }
            }
            JSONArray subtitleRows = root.optJSONArray("subtitles");
            if (subtitleRows != null) {
                for (int i = 0; i < subtitleRows.length() && library.subtitles.size() < MAX_ITEMS; i++) {
                    SubtitleItem item = SubtitleItem.fromJson(subtitleRows.optJSONObject(i));
                    if (item != null) library.subtitles.add(item);
                }
            }
        } catch (Exception ignored) {}
        return library;
    }

    public static void save(Context context, Library library) {
        File target = new File(context.getFilesDir(), FILE_NAME);
        File temporary = new File(context.getFilesDir(), TEMP_FILE_NAME);
        JSONObject root = new JSONObject();
        try {
            JSONArray audioRows = new JSONArray();
            for (AudioItem item : library.audio) audioRows.put(item.toJson());
            JSONArray subtitleRows = new JSONArray();
            for (SubtitleItem item : library.subtitles) subtitleRows.put(item.toJson());
            root.put("version", 1);
            root.put("audio", audioRows);
            root.put("subtitles", subtitleRows);
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(root.toString().getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
            }
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
        } catch (IOException | JSONException ignored) {}
    }

    public static void addAudio(Library library, AudioItem item) {
        library.audio.removeIf(existing -> existing.uri.equals(item.uri));
        library.audio.add(0, item);
        while (library.audio.size() > MAX_ITEMS) library.audio.remove(library.audio.size() - 1);
    }

    public static void addSubtitle(Library library, SubtitleItem item) {
        library.subtitles.removeIf(
            existing -> item.uri.isEmpty() ? existing.name.equals(item.name) : existing.uri.equals(item.uri)
        );
        library.subtitles.add(0, item);
        while (library.subtitles.size() > MAX_ITEMS) library.subtitles.remove(library.subtitles.size() - 1);
    }

    public static final class Library {
        public final ArrayList<AudioItem> audio = new ArrayList<>();
        public final ArrayList<SubtitleItem> subtitles = new ArrayList<>();
    }

    public static final class AudioItem {
        public final String uri;
        public final String name;
        public final long size;
        public final long savedAt;

        public AudioItem(String uri, String name, long size, long savedAt) {
            this.uri = uri == null ? "" : uri;
            this.name = name == null ? "" : name;
            this.size = Math.max(0, size);
            this.savedAt = savedAt;
        }

        JSONObject toJson() throws JSONException {
            JSONObject json = new JSONObject();
            json.put("uri", uri);
            json.put("name", name);
            json.put("size", size);
            json.put("savedAt", savedAt);
            return json;
        }

        static AudioItem fromJson(JSONObject json) {
            if (json == null) return null;
            String uri = json.optString("uri", "");
            String name = json.optString("name", "");
            if (uri.isEmpty() || name.isEmpty()) return null;
            return new AudioItem(uri, name, json.optLong("size", 0), json.optLong("savedAt", 0));
        }
    }

    public static final class SubtitleItem {
        public final String uri;
        public final String name;
        public final String format;
        public final String encoding;
        public final List<String> warnings;
        public final List<Cue> cues;
        public final long savedAt;

        public SubtitleItem(
            String uri,
            String name,
            String format,
            String encoding,
            List<String> warnings,
            List<Cue> cues,
            long savedAt
        ) {
            this.uri = uri == null ? "" : uri;
            this.name = name == null ? "" : name;
            this.format = format == null ? "" : format;
            this.encoding = encoding == null ? "" : encoding;
            this.warnings = new ArrayList<>();
            if (warnings != null) this.warnings.addAll(warnings);
            this.cues = new ArrayList<>();
            if (cues != null) this.cues.addAll(cues);
            this.savedAt = savedAt;
        }

        JSONObject toJson() throws JSONException {
            JSONObject json = new JSONObject();
            json.put("uri", uri);
            json.put("name", name);
            json.put("format", format);
            json.put("encoding", encoding);
            json.put("warnings", new JSONArray(warnings));
            JSONArray cueRows = new JSONArray();
            for (Cue cue : cues) {
                JSONObject row = new JSONObject();
                row.put("id", cue.id);
                row.put("start", cue.start);
                row.put("end", cue.end);
                row.put("text", cue.text);
                cueRows.put(row);
            }
            json.put("cues", cueRows);
            json.put("savedAt", savedAt);
            return json;
        }

        static SubtitleItem fromJson(JSONObject json) {
            if (json == null) return null;
            String name = json.optString("name", "");
            JSONArray cueRows = json.optJSONArray("cues");
            if (name.isEmpty() || cueRows == null) return null;
            List<Cue> restored = new ArrayList<>();
            for (int i = 0; i < cueRows.length(); i++) {
                try {
                    restored.add(Cue.fromJson(cueRows.getJSONObject(i)));
                } catch (JSONException ignored) {}
            }
            if (restored.isEmpty()) return null;
            List<String> warnings = new ArrayList<>();
            JSONArray warningRows = json.optJSONArray("warnings");
            if (warningRows != null) {
                for (int i = 0; i < warningRows.length(); i++) {
                    String warning = warningRows.optString(i, "");
                    if (!warning.isEmpty()) warnings.add(warning);
                }
            }
            return new SubtitleItem(
                json.optString("uri", ""),
                name,
                json.optString("format", ""),
                json.optString("encoding", ""),
                warnings,
                restored,
                json.optLong("savedAt", 0)
            );
        }
    }
}
