package com.qor.android;

import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.PorterDuff;
import android.service.wallpaper.WallpaperService;
import android.view.MotionEvent;
import android.view.SurfaceHolder;

/** Jonli fon rasmi: qor ish stoli ikonkalari va vidjetlari orqasida yog'adi. */
public class SnowWallpaperService extends WallpaperService {

    static final String STORM_AT = "storm_at";

    @Override
    public Engine onCreateEngine() {
        return new QorEngine();
    }

    private final class QorEngine extends Engine
            implements SharedPreferences.OnSharedPreferenceChangeListener {

        private final SnowEngine snow = new SnowEngine();
        private final SurfaceHolder holder = getSurfaceHolder();

        private Thread thread;
        private volatile boolean running = false;
        private volatile boolean visible = false;
        private long startedAt = 0L;
        private SharedPreferences prefs;
        private long lastStormAt = 0L;

        private float lastTapX = -1f;
        private float lastTapY = -1f;
        private long lastTapTime = 0L;

        QorEngine() {
            prefs = Settings.prefs(SnowWallpaperService.this);
            prefs.registerOnSharedPreferenceChangeListener(this);
            applySettings();
            lastStormAt = prefs.getLong(STORM_AT, 0L);
            setTouchEventsEnabled(true);
        }

        @Override
        public void onDestroy() {
            prefs.unregisterOnSharedPreferenceChangeListener(this);
            stop();
            super.onDestroy();
        }

        private void applySettings() {
            snow.setSettings(
                    Settings.density(SnowWallpaperService.this),
                    Settings.wind(SnowWallpaperService.this),
                    Settings.drift(SnowWallpaperService.this),
                    Settings.aurora(SnowWallpaperService.this));
        }

        @Override
        public void onSharedPreferenceChanged(SharedPreferences sharedPreferences, String key) {
            applySettings();
        }

        @Override
        public void onVisibilityChanged(boolean isVisible) {
            visible = isVisible;
            if (isVisible) start();
            else stop();
        }

        @Override
        public void onSurfaceDestroyed(SurfaceHolder surfaceHolder) {
            stop();
            super.onSurfaceDestroyed(surfaceHolder);
        }

        private synchronized void start() {
            if (running || !visible) return;
            running = true;
            startedAt = System.nanoTime();
            thread = new Thread(new Runnable() {
                @Override
                public void run() {
                    loop();
                }
            }, "qor-render");
            thread.start();
        }

        private synchronized void stop() {
            running = false;
            Thread current = thread;
            thread = null;
            if (current != null) {
                current.interrupt();
                try {
                    current.join(400);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        private void loop() {
            long previous = System.nanoTime();
            long frameNanos = 33_000_000L; // ~30 fps

            while (running) {
                long now = System.nanoTime();
                float dt = (now - previous) / 1_000_000_000f;
                previous = now;
                if (dt > 0.05f) dt = 0.05f;

                float time = (now - startedAt) / 1_000_000_000f;

                // "Bo'ron chaqirish" tugmasi sozlamalar orqali keladi.
                long stormAt = prefs.getLong(STORM_AT, 0L);
                if (stormAt != lastStormAt) {
                    lastStormAt = stormAt;
                    snow.triggerStorm(-1f, -1f);
                }

                Canvas canvas = null;
                try {
                    canvas = holder.lockCanvas();
                    if (canvas != null) {
                        snow.update(dt, time);
                        snow.draw(canvas, time);
                    }
                } catch (Exception ignored) {
                    // Yuza yopilgan bo'lishi mumkin — keyingi kadrda qayta urinamiz.
                } finally {
                    if (canvas != null) {
                        try {
                            holder.unlockCanvasAndPost(canvas);
                        } catch (Exception ignored) {
                            // hisobga olinmaydi
                        }
                    }
                }

                long spend = (System.nanoTime() - now);
                long sleep = (frameNanos - spend) / 1_000_000L;
                if (sleep > 0) {
                    try {
                        Thread.sleep(sleep);
                    } catch (InterruptedException e) {
                        return;
                    }
                }
            }
        }

        @Override
        public void onTouchEvent(MotionEvent event) {
            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    snow.applyImpulse(event.getX(), event.getY(), 0f, 0f);
                    break;
                case MotionEvent.ACTION_MOVE:
                    snow.applyImpulse(event.getX(), event.getY(), 0f, 0f);
                    break;
                case MotionEvent.ACTION_UP: {
                    long now = System.currentTimeMillis();
                    float dx = event.getX() - lastTapX;
                    float dy = event.getY() - lastTapY;
                    if (now - lastTapTime < 340L && dx * dx + dy * dy < 3600f) {
                        snow.triggerStorm(event.getX(), event.getY());
                        lastTapTime = 0L;
                    } else {
                        lastTapTime = now;
                        lastTapX = event.getX();
                        lastTapY = event.getY();
                    }
                    snow.releaseTouch();
                    break;
                }
                case MotionEvent.ACTION_CANCEL:
                    snow.releaseTouch();
                    break;
                default:
                    break;
            }
        }
    }
}
