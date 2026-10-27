package com.echotape.android;

import java.util.concurrent.CopyOnWriteArraySet;
import org.json.JSONObject;

public final class EchoPlaybackBus {
    public interface Listener {
        void onPlaybackState(JSONObject state);
        void onQueueCleared(int count, String reason);
    }

    private static final CopyOnWriteArraySet<Listener> listeners = new CopyOnWriteArraySet<>();

    private EchoPlaybackBus() {}

    public static void addListener(Listener listener) {
        listeners.add(listener);
    }

    public static void removeListener(Listener listener) {
        listeners.remove(listener);
    }

    public static void publishState(JSONObject state) {
        for (Listener listener : listeners) {
            listener.onPlaybackState(state);
        }
    }

    public static void publishQueueCleared(int count, String reason) {
        for (Listener listener : listeners) {
            listener.onQueueCleared(count, reason);
        }
    }
}
