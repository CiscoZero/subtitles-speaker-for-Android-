package com.echotape.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import org.junit.Test;

public class SubtitleParserTest {
    @Test
    public void parsesVttAndRemovesMarkup() {
        String input =
            "WEBVTT\n\n00:00:01.250 --> 00:00:03.000\n<i>你好</i>\n\n" +
            "00:00:04.000 --> 00:00:05.000\n第二句\n";

        SubtitleParser.Result result = SubtitleParser.parse(input, "lesson.vtt");

        assertEquals("vtt", result.format);
        assertEquals(2, result.cues.size());
        assertEquals(1.25, result.cues.get(0).start, 0.001);
        assertEquals("你好", result.cues.get(0).text);
    }

    @Test
    public void parsesSrtAndKeepsOverlappingCuesInOrder() {
        String input =
            "1\n00:00:02,000 --> 00:00:05,000\n第二句\n\n" +
            "2\n00:00:01,000 --> 00:00:03,000\n第一句\n";

        SubtitleParser.Result result = SubtitleParser.parse(input, "lesson.srt");

        assertEquals("srt", result.format);
        assertEquals(2, result.cues.size());
        assertEquals("第一句", result.cues.get(0).text);
        assertTrue(result.warnings.stream().anyMatch(value -> value.contains("重叠")));
    }

    @Test
    public void parsesAssDialogueWithCommaInsideText() {
        String input =
            "[Script Info]\nTitle: test\n\n[Events]\n" +
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
            "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,你好，世界\n";

        SubtitleParser.Result result = SubtitleParser.parse(input, "lesson.ass");

        assertEquals("ass", result.format);
        assertEquals(1, result.cues.size());
        assertEquals("你好，世界", result.cues.get(0).text);
    }

    @Test
    public void decodesUtf8BomAndFallsBackToTxt() {
        byte[] body = "第一行\n第二行\n".getBytes(StandardCharsets.UTF_8);
        byte[] bytes = new byte[body.length + 3];
        bytes[0] = (byte) 0xef;
        bytes[1] = (byte) 0xbb;
        bytes[2] = (byte) 0xbf;
        System.arraycopy(body, 0, bytes, 3, body.length);

        SubtitleParser.DecodedText decoded = SubtitleParser.decode(bytes);
        SubtitleParser.Result result = SubtitleParser.parse(decoded.text, "notes.txt");

        assertEquals("UTF-8 BOM", decoded.encoding);
        assertEquals("txt", result.format);
        assertEquals(2, result.cues.size());
    }

    @Test
    public void parsesLrcMultipleTimestampsAndOffset() {
        String input =
            "[ar:EchoTape]\n" +
            "[offset:-500]\n" +
            "[00:01.20][00:05.50]同一句歌词\n" +
            "[00:08.00]<00:08.20>第二句\n";

        SubtitleParser.Result result = SubtitleParser.parse(input, "song.lrc");

        assertEquals("lrc", result.format);
        assertEquals(3, result.cues.size());
        assertEquals(0.7, result.cues.get(0).start, 0.001);
        assertEquals(5.0, result.cues.get(1).start, 0.001);
        assertEquals("同一句歌词", result.cues.get(0).text);
        assertEquals(1.25, result.cues.get(0).end - result.cues.get(0).start, 0.001);
        assertEquals("第二句", result.cues.get(2).text);
        assertEquals(1.2, result.cues.get(2).end - result.cues.get(2).start, 0.001);
    }

    @Test
    public void stripsAssOverrideBlocksWithoutAndroidPatternErrors() {
        String input =
            "[Events]\n" +
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n" +
            "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8\\blur6}正文\n";

        SubtitleParser.Result result = SubtitleParser.parse(input, "styled.ass");

        assertEquals(1, result.cues.size());
        assertEquals("正文", result.cues.get(0).text);
    }
}
