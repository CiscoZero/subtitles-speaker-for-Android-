package com.echotape.android;

import org.json.JSONException;
import org.json.JSONObject;

public final class Cue {
    public final int id;
    public final double start;
    public final double end;
    public final String text;

    public Cue(int id, double start, double end, String text) {
        this.id = id;
        this.start = start;
        this.end = end;
        this.text = text;
    }

    public static Cue fromJson(JSONObject json) throws JSONException {
        return new Cue(
            json.optInt("id"),
            json.getDouble("start"),
            json.optDouble("end", json.getDouble("start") + 2),
            json.getString("text")
        );
    }
}
