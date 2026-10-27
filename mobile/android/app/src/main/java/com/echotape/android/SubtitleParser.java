package com.echotape.android;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Native subtitle decoder/parser used by the Android Views UI. */
public final class SubtitleParser {
    private static final Pattern CLOCK = Pattern.compile(
        "^(?:(\\d+):)?(\\d{1,2}):(\\d{1,2})(?:[.,](\\d{1,3}))?$"
    );
    private static final Pattern CJK = Pattern.compile(
        "[\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]"
    );
    private static final Pattern LRC_TIME = Pattern.compile(
        "\\[(\\d{1,3}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]"
    );
    private static final Pattern LRC_ENHANCED_TIME = Pattern.compile(
        "<\\d{1,3}:\\d{1,2}(?:[.:]\\d{1,3})?>"
    );

    private SubtitleParser() {}

    public static DecodedText decode(byte[] bytes) {
        if (
            bytes.length >= 3 &&
            (bytes[0] & 0xff) == 0xef &&
            (bytes[1] & 0xff) == 0xbb &&
            (bytes[2] & 0xff) == 0xbf
        ) {
            return new DecodedText(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8), "UTF-8 BOM");
        }
        if (
            bytes.length >= 2 &&
            (bytes[0] & 0xff) == 0xff &&
            (bytes[1] & 0xff) == 0xfe
        ) {
            return new DecodedText(new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE), "UTF-16LE");
        }
        if (
            bytes.length >= 2 &&
            (bytes[0] & 0xff) == 0xfe &&
            (bytes[1] & 0xff) == 0xff
        ) {
            return new DecodedText(new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE), "UTF-16BE");
        }
        try {
            String text = StandardCharsets.UTF_8
                .newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
            return new DecodedText(text, "UTF-8");
        } catch (CharacterCodingException ignored) {
            return new DecodedText(new String(bytes, Charset.forName("GB18030")), "GB18030");
        }
    }

    public static Result parse(String raw, String fileName) {
        List<String> warnings = new ArrayList<>();
        String normalized = raw.replace("\r\n", "\n").replace('\r', '\n');
        String extension = "";
        int dot = fileName == null ? -1 : fileName.lastIndexOf('.');
        if (dot >= 0) extension = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);

        String format;
        if ("vtt".equals(extension)) {
            format = "vtt";
        } else if ("srt".equals(extension)) {
            format = "srt";
        } else if ("ass".equals(extension) || "ssa".equals(extension)) {
            format = "ass";
        } else if ("lrc".equals(extension)) {
            format = "lrc";
        } else if ("txt".equals(extension)) {
            format = "txt";
        } else if (normalized.trim().startsWith("WEBVTT")) {
            format = "vtt";
        } else if (normalized.toLowerCase(Locale.ROOT).contains("[events]")) {
            format = "ass";
        } else if (normalized.contains("-->")) {
            format = "srt";
        } else if (LRC_TIME.matcher(normalized).find()) {
            format = "lrc";
        } else {
            format = "txt";
        }

        List<Cue> cues;
        if ("ass".equals(format)) {
            cues = parseAss(normalized);
        } else if ("lrc".equals(format)) {
            cues = parseLrc(normalized, warnings);
        } else if ("txt".equals(format)) {
            cues = parsePlainText(normalized, warnings);
        } else {
            cues = parseTimedBlocks(normalized);
            if (cues.isEmpty()) {
                cues = parseLenientBlocks(normalized);
                if (!cues.isEmpty()) warnings.add("字幕排版不标准，已启用宽松解析，请核对前几句时间点。");
            }
        }

        return new Result(format, normalize(cues, warnings), warnings);
    }

    private static List<Cue> parseTimedBlocks(String raw) {
        List<Cue> cues = new ArrayList<>();
        String[] blocks = raw.split("\\n{2,}");
        for (String block : blocks) {
            List<String> lines = new ArrayList<>();
            for (String line : block.split("\\n")) lines.add(line.replace("\ufeff", ""));
            if (lines.isEmpty()) continue;
            String header = lines.get(0).trim();
            if (
                header.matches("(?i)^(NOTE|STYLE|REGION)\\b.*")
            ) continue;
            boolean webVttHeader = header.matches("(?i)^WEBVTT\\b.*");
            int timeIndex = -1;
            for (int i = 0; i < lines.size(); i++) {
                if (lines.get(i).contains("-->")) {
                    timeIndex = i;
                    break;
                }
            }
            if (timeIndex < 0) continue;
            if (webVttHeader && timeIndex == 0) timeIndex = -1;
            if (timeIndex < 0) continue;
            String[] timing = lines.get(timeIndex).split("-->", 2);
            Double start = parseClock(timing[0]);
            if (start == null) continue;
            Double end = timing.length > 1 ? parseClock(timing[1]) : null;
            StringBuilder body = new StringBuilder();
            for (int i = timeIndex + 1; i < lines.size(); i++) {
                if (body.length() > 0) body.append('\n');
                body.append(lines.get(i));
            }
            String text = cleanText(body.toString());
            if (!text.isEmpty()) cues.add(new Cue(cues.size(), start, end == null ? start + 2 : end, text));
        }
        return cues;
    }

    private static List<Cue> parseLenientBlocks(String raw) {
        List<Cue> cues = new ArrayList<>();
        double start = 0;
        double end = 0;
        List<String> buffer = new ArrayList<>();
        for (String line : raw.split("\\n")) {
            if (line.contains("-->")) {
                appendBuffer(cues, buffer, start, end);
                buffer.clear();
                String[] timing = line.split("-->", 2);
                Double parsed = parseClock(timing[0]);
                if (parsed == null) continue;
                start = parsed;
                Double parsedEnd = timing.length > 1 ? parseClock(timing[1]) : null;
                end = parsedEnd == null ? start + 2 : parsedEnd;
            } else if (!(buffer.isEmpty() && line.trim().matches("\\d+"))) {
                if (!line.trim().isEmpty()) buffer.add(line);
            }
        }
        appendBuffer(cues, buffer, start, end);
        return cues;
    }

    private static void appendBuffer(List<Cue> cues, List<String> buffer, double start, double end) {
        if (buffer.isEmpty()) return;
        String text = cleanText(String.join("\n", buffer));
        if (!text.isEmpty()) cues.add(new Cue(cues.size(), start, end, text));
    }

    private static List<Cue> parseAss(String raw) {
        List<Cue> cues = new ArrayList<>();
        boolean inEvents = false;
        String[] fields = {
            "layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"
        };
        for (String line : raw.split("\\n")) {
            String trimmed = line.trim();
            if (trimmed.matches("^\\[.*\\]$")) {
                inEvents = trimmed.equalsIgnoreCase("[Events]");
                continue;
            }
            if (!inEvents) continue;
            if (trimmed.matches("(?i)^format\\s*:.*")) {
                String[] parsed = trimmed.substring(trimmed.indexOf(':') + 1).split(",");
                fields = new String[parsed.length];
                for (int i = 0; i < parsed.length; i++) fields[i] = parsed[i].trim().toLowerCase(Locale.ROOT);
                continue;
            }
            if (!trimmed.matches("(?i)^dialogue\\s*:.*")) continue;
            String rest = trimmed.substring(trimmed.indexOf(':') + 1);
            List<String> parts = splitAssFields(rest, fields.length);
            int startIndex = indexOf(fields, "start");
            int endIndex = indexOf(fields, "end");
            int textIndex = indexOf(fields, "text");
            if (startIndex < 0 || endIndex < 0 || startIndex >= parts.size() || endIndex >= parts.size()) continue;
            Double start = parseClock(parts.get(startIndex));
            if (start == null) continue;
            Double end = parseClock(parts.get(endIndex));
            StringBuilder body = new StringBuilder();
            int from = textIndex >= 0 ? textIndex : startIndex + 2;
            for (int i = from; i < parts.size(); i++) {
                if (body.length() > 0) body.append(',');
                body.append(parts.get(i));
            }
            String text = cleanText(
                body.toString().replaceAll("(?i)\\\\[Nn]", "\n").replaceAll("(?i)\\\\h", " ")
            );
            if (!text.isEmpty()) cues.add(new Cue(cues.size(), start, end == null ? start + 2 : end, text));
        }
        return cues;
    }

    private static List<String> splitAssFields(String raw, int expected) {
        List<String> result = new ArrayList<>();
        int start = 0;
        int field = 0;
        for (int i = 0; i < raw.length() && field < expected - 1; i++) {
            if (raw.charAt(i) == ',') {
                result.add(raw.substring(start, i));
                start = i + 1;
                field += 1;
            }
        }
        result.add(raw.substring(start));
        return result;
    }

    private static List<Cue> parsePlainText(String raw, List<String> warnings) {
        List<Cue> cues = new ArrayList<>();
        double cursor = 0.6;
        for (String line : raw.split("\\n")) {
            String text = line.trim();
            if (text.isEmpty()) continue;
            double duration = estimateDurationSeconds(text);
            cues.add(new Cue(cues.size(), cursor, cursor + duration, text));
            cursor += duration + 0.2;
        }
        warnings.add("纯文本没有时间轴，已按文字长度估算，请优先使用 VTT、SRT 或 ASS。");
        return cues;
    }

    private static List<Cue> parseLrc(String raw, List<String> warnings) {
        List<Cue> cues = new ArrayList<>();
        double offsetSeconds = 0;
        int timedLines = 0;
        for (String line : raw.split("\\n")) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            if (trimmed.matches("(?i)^\\[offset:.*\\]$")) {
                String value = trimmed.substring(trimmed.indexOf(':') + 1, trimmed.length() - 1).trim();
                try {
                    offsetSeconds = Double.parseDouble(value.replace("+", "")) / 1000.0;
                } catch (NumberFormatException ignored) {}
                continue;
            }

            Matcher matcher = LRC_TIME.matcher(trimmed);
            List<Double> starts = new ArrayList<>();
            StringBuilder removed = new StringBuilder(trimmed);
            while (matcher.find()) {
                double minutes = Double.parseDouble(matcher.group(1));
                double seconds = Double.parseDouble(matcher.group(2));
                double fraction = 0;
                if (matcher.group(3) != null) {
                    fraction = Double.parseDouble(matcher.group(3)) / Math.pow(10, matcher.group(3).length());
                }
                starts.add(Math.max(0, minutes * 60 + seconds + fraction + offsetSeconds));
            }
            if (starts.isEmpty()) continue;
            timedLines += 1;
            String text = LRC_TIME.matcher(removed).replaceAll("");
            text = LRC_ENHANCED_TIME.matcher(text).replaceAll("");
            text = cleanText(text);
            if (text.isEmpty()) continue;
            double duration = estimateDurationSeconds(text);
            for (double start : starts) {
                cues.add(new Cue(cues.size(), start, start + duration, text));
            }
        }
        if (timedLines == 0) warnings.add("LRC 中没有找到 [mm:ss.xx] 时间标签。");
        else if (!cues.isEmpty()) warnings.add("LRC 没有结束时间，已按文字字数估算字幕结束时间。");
        return cues;
    }

    private static double estimateDurationSeconds(String text) {
        String compact = text.replaceAll("\\s+", "");
        int cjkCharacters = 0;
        int totalCharacters = 0;
        for (int offset = 0; offset < compact.length(); ) {
            int codePoint = compact.codePointAt(offset);
            totalCharacters += 1;
            if (
                (codePoint >= 0x3000 && codePoint <= 0x303f) ||
                (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
                (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
                (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
                (codePoint >= 0xff00 && codePoint <= 0xffef)
            ) {
                cjkCharacters += 1;
            }
            offset += Character.charCount(codePoint);
        }
        int otherCharacters = Math.max(0, totalCharacters - cjkCharacters);
        double estimated = cjkCharacters / 4.0 + otherCharacters / 10.0;
        return Math.max(1.2, Math.min(12.0, estimated));
    }

    private static List<Cue> normalize(List<Cue> source, List<String> warnings) {
        List<Cue> filtered = new ArrayList<>();
        for (Cue cue : source) {
            if (cue.text != null && !cue.text.trim().isEmpty()) filtered.add(cue);
        }
        boolean sorted = true;
        for (int i = 1; i < filtered.size(); i++) {
            if (filtered.get(i).start < filtered.get(i - 1).start) {
                sorted = false;
                break;
            }
        }
        filtered.sort(Comparator.comparingDouble(cue -> cue.start));
        if (!sorted && !filtered.isEmpty()) warnings.add("字幕时间轴顺序不连续，已按起始时间重新排序。");

        List<Cue> result = new ArrayList<>();
        int repaired = 0;
        int overlaps = 0;
        double previousEnd = -1;
        for (int i = 0; i < filtered.size(); i++) {
            Cue cue = filtered.get(i);
            double start = cue.start;
            double end = cue.end;
            if (!Double.isFinite(start) || start < 0) {
                start = 0;
                repaired += 1;
            }
            if (!Double.isFinite(end) || end <= start) {
                end = start + Math.max(1.2, cue.text.length() / 5.0);
                repaired += 1;
            }
            if (start < previousEnd - 0.001) overlaps += 1;
            previousEnd = end;
            result.add(new Cue(i, start, end, cue.text));
        }
        if (repaired > 0) warnings.add(repaired + " 处时间戳缺失或无效，已自动补齐。");
        if (overlaps > 0) warnings.add(overlaps + " 处字幕时间重叠，会按起始时间逐条朗读。");
        return result;
    }

    private static Double parseClock(String raw) {
        if (raw == null) return null;
        String token = raw.trim().split("\\s+")[0];
        Matcher matcher = CLOCK.matcher(token);
        if (!matcher.matches()) return null;
        double hours = matcher.group(1) == null ? 0 : Double.parseDouble(matcher.group(1));
        double minutes = Double.parseDouble(matcher.group(2));
        double seconds = Double.parseDouble(matcher.group(3));
        double fraction = 0;
        if (matcher.group(4) != null) {
            fraction = Double.parseDouble(matcher.group(4)) / Math.pow(10, matcher.group(4).length());
        }
        return hours * 3600 + minutes * 60 + seconds + fraction;
    }

    private static String cleanText(String body) {
        List<String> lines = new ArrayList<>();
        for (String raw : body.split("\\n")) {
            String line = raw
                .replaceAll("\\{\\\\[^}]*\\}", "")
                .replaceAll("</?[^>]*>", "")
                .replaceAll("(?i)&nbsp;|&#160;", " ")
                .replaceAll("(?i)&quot;", "\"")
                .replaceAll("(?i)&#39;|&apos;", "'")
                .replaceAll("(?i)&lt;", "<")
                .replaceAll("(?i)&gt;", ">")
                .replaceAll("(?i)&amp;", "&")
                .replaceAll("[\\u200b-\\u200d\\ufeff]", "")
                .trim();
            if (!line.isEmpty()) lines.add(line);
        }
        StringBuilder result = new StringBuilder();
        for (String line : lines) {
            if (result.length() > 0) {
                String previous = result.substring(result.length() - 1);
                String next = line.substring(0, 1);
                if (!CJK.matcher(previous).matches() && !CJK.matcher(next).matches()) result.append(' ');
            }
            result.append(line);
        }
        return result.toString();
    }

    private static int indexOf(String[] values, String target) {
        for (int i = 0; i < values.length; i++) {
            if (target.equals(values[i])) return i;
        }
        return -1;
    }

    public static final class DecodedText {
        public final String text;
        public final String encoding;

        DecodedText(String text, String encoding) {
            this.text = text;
            this.encoding = encoding;
        }
    }

    public static final class Result {
        public final String format;
        public final List<Cue> cues;
        public final List<String> warnings;

        Result(String format, List<Cue> cues, List<String> warnings) {
            this.format = format;
            this.cues = cues;
            this.warnings = warnings;
        }
    }
}
