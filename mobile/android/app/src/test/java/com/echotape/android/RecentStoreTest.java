package com.echotape.android;

import static org.junit.Assert.assertEquals;

import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

public class RecentStoreTest {
    @Test
    public void recentAudioDeduplicatesAndKeepsNewestFirst() {
        RecentStore.Library library = new RecentStore.Library();
        for (int i = 0; i < 8; i++) {
            RecentStore.addAudio(library, new RecentStore.AudioItem("uri-" + i, "audio-" + i, i, i));
        }
        RecentStore.addAudio(library, new RecentStore.AudioItem("uri-5", "updated", 50, 50));

        assertEquals(6, library.audio.size());
        assertEquals("uri-5", library.audio.get(0).uri);
        assertEquals("updated", library.audio.get(0).name);
        assertEquals(1, library.audio.stream().filter(item -> item.uri.equals("uri-5")).count());
    }

    @Test
    public void recentSubtitleDeduplicatesAndKeepsCueSnapshot() {
        RecentStore.Library library = new RecentStore.Library();
        List<Cue> cues = new ArrayList<>();
        cues.add(new Cue(0, 1, 2, "字幕内容"));
        RecentStore.SubtitleItem subtitle = new RecentStore.SubtitleItem(
            "content://subtitle/1",
            "lesson.ass",
            "ass",
            "UTF-8",
            new ArrayList<>(),
            cues,
            1
        );

        RecentStore.addSubtitle(library, subtitle);
        RecentStore.addSubtitle(library, subtitle);

        assertEquals(1, library.subtitles.size());
        assertEquals("字幕内容", library.subtitles.get(0).cues.get(0).text);
    }
}
