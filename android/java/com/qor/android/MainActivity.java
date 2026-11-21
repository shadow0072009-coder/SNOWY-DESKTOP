package com.qor.android;

import android.app.Activity;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Sozlamalar oynasi: fon rasmini o'rnatish, zichlik, shamol, bo'ron. */
public class MainActivity extends Activity {

    private static final int BG = 0xFF070C22;
    private static final int CARD = 0xFF121C36;
    private static final int STROKE = 0xFF22304F;
    private static final int TEXT = 0xFFEAF1FF;
    private static final int MUTED = 0xFF92A6C6;
    private static final int ACCENT = 0xFF3B82F6;

    private SharedPreferences prefs;
    private LinearLayout densityRow;
    private LinearLayout windRow;

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = Settings.prefs(this);

        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(28), dp(20), dp(32));

        TextView title = new TextView(this);
        title.setText("\u2744  Qor");
        title.setTextColor(TEXT);
        title.setTextSize(30);
        title.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText("Ish stolingizda qor yog'adi \u2014 ikonkalar va vidjetlar orqasida,"
                + " hech narsani to'smasdan.");
        subtitle.setTextColor(MUTED);
        subtitle.setTextSize(14);
        subtitle.setLineSpacing(dp(3), 1f);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subtitleParams.topMargin = dp(8);
        subtitleParams.bottomMargin = dp(22);
        root.addView(subtitle, subtitleParams);

        TextView apply = actionButton("Ish stoliga o'rnatish", ACCENT, Color.WHITE, true);
        apply.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openWallpaperChooser();
            }
        });
        root.addView(apply);

        TextView storm = actionButton("Bo'ron chaqirish", CARD, TEXT, false);
        LinearLayout.LayoutParams stormParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        stormParams.topMargin = dp(10);
        storm.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                prefs.edit().putLong(SnowWallpaperService.STORM_AT,
                        System.currentTimeMillis()).apply();
                Toast.makeText(MainActivity.this, "Bo'ron chaqirildi \u2744",
                        Toast.LENGTH_SHORT).show();
            }
        });
        root.addView(storm, stormParams);

        root.addView(sectionLabel("Zichlik"), topMargin(dp(24)));
        densityRow = new LinearLayout(this);
        densityRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(densityRow, topMargin(dp(10)));

        root.addView(sectionLabel("Shamol"), topMargin(dp(20)));
        windRow = new LinearLayout(this);
        windRow.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(windRow, topMargin(dp(10)));

        root.addView(switchRow("Qor to'planishi (uyum)", Settings.drift(this), Settings.DRIFT),
                topMargin(dp(22)));
        root.addView(switchRow("Yog'du (aurora) effekti", Settings.aurora(this), Settings.AURORA),
                topMargin(dp(8)));

        TextView hint = new TextView(this);
        hint.setText("Maslahat: fon rasmini o'rnatgandan so'ng, bo'sh joyga ikki marta tegsangiz "
                + "bo'ron chaqiriladi.");
        hint.setTextColor(MUTED);
        hint.setTextSize(13);
        hint.setLineSpacing(dp(2), 1f);
        root.addView(hint, topMargin(dp(26)));

        scroll.addView(root);
        setContentView(scroll);

        renderChips();
    }

    private void renderChips() {
        String density = Settings.density(this);
        String wind = Settings.wind(this);

        densityRow.removeAllViews();
        for (int i = 0; i < Settings.DENSITY_KEYS.length; i++) {
            final String key = Settings.DENSITY_KEYS[i];
            TextView chip = chipView(Settings.DENSITY_LABELS[i], key.equals(density), i > 0);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().putString(Settings.DENSITY, key).apply();
                    renderChips();
                }
            });
            densityRow.addView(chip);
        }

        windRow.removeAllViews();
        for (int i = 0; i < Settings.WIND_KEYS.length; i++) {
            final String key = Settings.WIND_KEYS[i];
            TextView chip = chipView(Settings.WIND_LABELS[i], key.equals(wind), i > 0);
            chip.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    prefs.edit().putString(Settings.WIND, key).apply();
                    renderChips();
                }
            });
            windRow.addView(chip);
        }
    }

    private TextView chipView(String label, boolean selected, boolean withGap) {
        TextView chip = new TextView(this);
        chip.setText(label);
        chip.setTextSize(14);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(dp(6), dp(11), dp(6), dp(11));
        chip.setTextColor(selected ? Color.WHITE : MUTED);

        GradientDrawable background = new GradientDrawable();
        background.setCornerRadius(dp(12));
        background.setColor(selected ? ACCENT : CARD);
        background.setStroke(dp(1), selected ? ACCENT : STROKE);
        chip.setBackground(background);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        if (withGap) params.leftMargin = dp(8);
        chip.setLayoutParams(params);
        return chip;
    }

    private TextView actionButton(String label, int background, int textColor, boolean bold) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextSize(16);
        button.setGravity(Gravity.CENTER);
        button.setPadding(dp(16), dp(15), dp(16), dp(15));
        button.setTextColor(textColor);
        if (bold) button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));

        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(14));
        shape.setColor(background);
        if (background == CARD) shape.setStroke(dp(1), STROKE);
        button.setBackground(shape);
        button.setClickable(true);
        return button;
    }

    private TextView sectionLabel(String label) {
        TextView view = new TextView(this);
        view.setText(label.toUpperCase());
        view.setTextColor(MUTED);
        view.setTextSize(12);
        view.setLetterSpacing(0.08f);
        return view;
    }

    private LinearLayout switchRow(String label, boolean checked, final String key) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(14), dp(6), dp(14), dp(6));

        GradientDrawable shape = new GradientDrawable();
        shape.setCornerRadius(dp(12));
        shape.setColor(CARD);
        shape.setStroke(dp(1), STROKE);
        row.setBackground(shape);

        CheckBox box = new CheckBox(this);
        box.setChecked(checked);
        box.setText(label);
        box.setTextColor(TEXT);
        box.setTextSize(15);
        box.setPadding(0, dp(6), 0, dp(6));
        box.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override
            public void onCheckedChanged(CompoundButton buttonView, boolean isChecked) {
                prefs.edit().putBoolean(key, isChecked).apply();
            }
        });
        row.addView(box);
        return row;
    }

    private LinearLayout.LayoutParams topMargin(int margin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.topMargin = margin;
        return params;
    }

    private void openWallpaperChooser() {
        Intent intent = new Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER);
        intent.putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                new ComponentName(this, SnowWallpaperService.class));
        try {
            startActivity(intent);
        } catch (Exception first) {
            try {
                startActivity(new Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
            } catch (Exception second) {
                Toast.makeText(this, "Fon rasmi bo'limini qo'lda oching: Sozlamalar \u2192 Fon",
                        Toast.LENGTH_LONG).show();
            }
        }
    }
}
