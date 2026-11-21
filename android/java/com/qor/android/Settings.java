package com.qor.android;

import android.content.Context;
import android.content.SharedPreferences;

/** Sozlamalar: ish stolida (Windows) versiyadagi bilan bir xil kalitlar. */
final class Settings {
    static final String PREFS = "qor";
    static final String DENSITY = "density";
    static final String WIND = "wind";
    static final String DRIFT = "drift";
    static final String AURORA = "aurora";

    static final String[] DENSITY_KEYS = {"yengil", "orta", "kuchli"};
    static final String[] DENSITY_LABELS = {"Yengil", "O\u02bbrta", "Kuchli"};
    static final String[] WIND_KEYS = {"sokin", "orta", "kuchli"};
    static final String[] WIND_LABELS = {"Sokin", "O\u02bbrta", "Kuchli"};

    private Settings() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static int indexOf(String[] keys, String value) {
        for (int i = 0; i < keys.length; i++) {
            if (keys[i].equals(value)) return i;
        }
        return 1;
    }

    static String density(Context context) {
        return prefs(context).getString(DENSITY, "orta");
    }

    static String wind(Context context) {
        return prefs(context).getString(WIND, "orta");
    }

    static boolean drift(Context context) {
        return prefs(context).getBoolean(DRIFT, true);
    }

    static boolean aurora(Context context) {
        return prefs(context).getBoolean(AURORA, false);
    }
}
