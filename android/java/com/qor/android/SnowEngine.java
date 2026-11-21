package com.qor.android;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.RadialGradient;
import android.graphics.Shader;

import java.util.ArrayList;
import java.util.Random;

/**
 * Qor dvigateli — Windows versiyasidagi src/renderer/snow.js ning Java porti.
 * Tejamkor: 30 fps, tayyor spritelar, qayta ishlatiladigan gradientlar.
 */
final class SnowEngine {
    private static final float COL_BASE = 18f;
    private static final float[] DENSITY_COUNT = {70f, 150f, 300f};
    private static final float[] WIND_MUL = {0.45f, 1f, 2.1f};
    private static final float CRYSTAL_Z = 0.55f;

    private static final float[] AURORA_PHASE = {0f, 1.7f, 3.1f, 4.6f, 5.4f};
    private static final float[] AURORA_SPEED = {0.11f, 0.07f, 0.13f, 0.09f, 0.05f};
    private static final int[] AURORA_HUE = {168, 196, 276, 148, 224};

    private final Random random = new Random();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint spritePaint = new Paint(Paint.FILTER_BITMAP_FLAG);
    private final Path path = new Path();

    private final ArrayList<Flake> flakes = new ArrayList<>();
    private final ArrayList<Spark> sparks = new ArrayList<>();
    private final float[] mouse = {-1e5f, -1e5f, 0f, 0f, 0f};
    private boolean mouseActive = false;

    private int width = 1;
    private int height = 1;
    private float scale = 1f;
    private float colWidth = COL_BASE;
    private int colCount = 2;
    private float[] heights = {0f, 0f};
    private float[] smooth = {0f, 0f};
    private float[] caps = {0f, 0f};
    private float maxHeight = 60f;
    private float groundTop = 0f;
    private LinearGradient groundGradient;
    private LinearGradient skyGradient;
    private float[] dotX = new float[0];
    private float[] dotOffset = new float[0];
    private float[] dotPhase = new float[0];

    private String densityKey = "orta";
    private String windKey = "orta";
    private boolean drift = true;
    private boolean aurora = false;

    private float stormTimeLeft = 0f;
    private float stormX = 0f;
    private float stormY = 0f;

    private Bitmap glowSprite;
    private Bitmap[] crystalSprites;

    private static final class Flake {
        float x, y, z, r, phase, sway, swaySpeed, alpha, vx, vy, rot, spin;
        int kind;
    }

    private static final class Spark {
        float x, y, vx, vy, r, life;
    }

    SnowEngine() {
        glowSprite = makeGlowSprite();
        crystalSprites = makeCrystalSprites();
    }

    void setSettings(String density, String wind, boolean driftOn, boolean auroraOn) {
        boolean densityChanged = !density.equals(densityKey);
        densityKey = density;
        windKey = wind;
        drift = driftOn;
        aurora = auroraOn;
        if (densityChanged) balance();
    }

    // ---------------------------------------------------------------- spritelar

    private static Bitmap makeGlowSprite() {
        int size = 48;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        RadialGradient gradient = new RadialGradient(
                size / 2f, size / 2f, size / 2f,
                new int[]{
                        Color.argb(255, 255, 255, 255),
                        Color.argb(230, 255, 255, 255),
                        Color.argb(72, 255, 255, 255),
                        Color.argb(0, 255, 255, 255)
                },
                new float[]{0f, 0.4f, 0.75f, 1f},
                Shader.TileMode.CLAMP);
        p.setShader(gradient);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, p);
        return bitmap;
    }

    /** Haqiqiy olti qirrali qor parchalari: 6 ta shox + yon shoxchalar. */
    private static Bitmap[] makeCrystalSprites() {
        int size = 56;
        float[][] branchAt = {
                {0.42f, 0.72f},
                {0.5f},
                {0.34f, 0.58f, 0.82f},
                {0.45f, 0.75f},
        };
        float[] branchLen = {0.3f, 0.42f, 0.22f, 0.36f};
        float[] lineWidth = {2.1f, 2.4f, 1.7f, 2.8f};
        boolean[] dots = {false, false, false, true};

        Bitmap[] sprites = new Bitmap[4];
        for (int v = 0; v < 4; v++) {
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            float center = size / 2f;
            float armLen = size * 0.44f;
            float unit = size / 64f;

            Path path = new Path();

            Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setColor(Color.argb(245, 255, 255, 255));
            p.setShadowLayer(size * 0.06f, 0f, 0f, Color.argb(204, 214, 238, 255));

            canvas.translate(center, center);

            for (int arm = 0; arm < 6; arm++) {
                canvas.save();
                canvas.rotate(60f * arm);

                p.setStrokeWidth(lineWidth[v] * unit);
                path.reset();
                path.moveTo(0f, 0f);
                path.lineTo(0f, -armLen);
                canvas.drawPath(path, p);

                for (float at : branchAt[v]) {
                    float baseY = -armLen * at;
                    float length = armLen * branchLen[v] * (1f - at * 0.45f);
                    for (int side = -1; side <= 1; side += 2) {
                        p.setStrokeWidth(lineWidth[v] * unit * 0.7f);
                        path.reset();
                        path.moveTo(0f, baseY);
                        path.lineTo((float) Math.sin(Math.PI / 3) * length * side,
                                baseY - (float) Math.cos(Math.PI / 3) * length);
                        canvas.drawPath(path, p);
                    }
                }

                if (dots[v]) {
                    Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
                    fill.setColor(Color.argb(242, 255, 255, 255));
                    canvas.drawCircle(0f, -armLen, size * 0.035f, fill);
                }

                canvas.restore();
            }

            Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
            fill.setColor(Color.argb(245, 255, 255, 255));
            canvas.drawCircle(0f, 0f, size * 0.055f, fill);

            sprites[v] = bitmap;
        }
        return sprites;
    }

    // ---------------------------------------------------------------- o'lcham

    private static float clamp(float value, float min, float max) {
        return value < min ? min : value > max ? max : value;
    }

    void prepare(int w, int h) {
        if (w < 1) w = 1;
        if (h < 1) h = 1;
        if (w == width && h == height && groundGradient != null) return;

        width = w;
        height = h;

        scale = clamp(Math.min(w / 1920f, h / 1080f), 0.55f, 2f);
        colWidth = Math.max(10f, Math.round(COL_BASE * scale));
        colCount = Math.max(2, (int) Math.ceil(w / colWidth));

        heights = new float[colCount];
        smooth = new float[colCount];
        caps = new float[colCount];

        maxHeight = Math.min(h * 0.045f, 42f * scale);

        // Uyum balandligi "profili": tekis parda emas, tepalik va ochiq joylar.
        float[] rough = new float[colCount];
        float walk = 0.62f;
        for (int i = 0; i < colCount; i++) {
            walk = clamp(walk + (random.nextFloat() - 0.5f) * 0.42f, 0.02f, 1f);
            rough[i] = walk;
        }
        for (int i = 0; i < colCount; i++) {
            float left = rough[i > 0 ? i - 1 : i];
            float right = rough[i < colCount - 1 ? i + 1 : i];
            smooth[i] = rough[i] * 0.5f + left * 0.25f + right * 0.25f;
        }
        for (int i = 0; i < colCount; i++) {
            float value = smooth[i];
            caps[i] = maxHeight * (value < 0.18f ? value * 0.35f : 0.22f + value * 0.9f);
        }

        // Tungi osmon — Windows versiyasida fon foydalanuvchiniki, Android'da fon rasmining o'zi.
        skyGradient = new LinearGradient(0f, 0f, 0f, h,
                new int[]{
                        Color.rgb(7, 12, 34),
                        Color.rgb(13, 22, 52),
                        Color.rgb(20, 32, 66),
                        Color.rgb(8, 14, 34)
                },
                new float[]{0f, 0.45f, 0.78f, 1f},
                Shader.TileMode.CLAMP);

        groundGradient = new LinearGradient(0f, Math.max(0f, h - maxHeight - 6f), 0f, h,
                new int[]{
                        Color.argb(0, 228, 242, 255),
                        Color.argb(87, 238, 248, 255),
                        Color.argb(148, 246, 251, 255)
                },
                new float[]{0f, 0.45f, 1f},
                Shader.TileMode.CLAMP);

        int dots = Math.max(12, Math.round(w / (46f * scale)));
        dotX = new float[dots];
        dotOffset = new float[dots];
        dotPhase = new float[dots];
        for (int i = 0; i < dots; i++) {
            dotX[i] = random.nextFloat() * w;
            dotOffset[i] = 2f + random.nextFloat() * 14f;
            dotPhase[i] = random.nextFloat() * 6.28f;
        }

        balance();
    }

    private int targetCount() {
        int index = Settings.indexOf(Settings.DENSITY_KEYS, densityKey);
        float areaScale = clamp((width * (float) height) / (1920f * 1080f), 0.3f, 2f);
        return Math.round(DENSITY_COUNT[index] * areaScale);
    }

    private void balance() {
        int target = targetCount();
        while (flakes.size() > target) flakes.remove(flakes.size() - 1);
        while (flakes.size() < target) flakes.add(spawn(new Flake(), true));
    }

    private Flake spawn(Flake flake, boolean initial) {
        float z = (float) Math.pow(random.nextDouble(), 0.85);
        flake.z = z;
        flake.r = (0.7f + z * 2.2f) * scale;
        flake.x = random.nextFloat() * width;
        flake.y = initial ? random.nextFloat() * height : -14f - random.nextFloat() * height * 0.25f;
        flake.phase = random.nextFloat() * (float) (Math.PI * 2);
        flake.sway = (8f + random.nextFloat() * 24f) * scale;
        flake.swaySpeed = 0.5f + random.nextFloat() * 1.5f;
        flake.alpha = 0.2f + z * 0.62f;
        flake.vx = 0f;
        flake.vy = (20f + z * 40f) * scale;
        flake.kind = random.nextInt(crystalSprites.length);
        flake.rot = random.nextFloat() * (float) (Math.PI * 2);
        flake.spin = (random.nextFloat() - 0.5f) * 0.7f;
        return flake;
    }

    private void deposit(int index, Flake flake) {
        float add = (3.6f + flake.z * 2.2f) * scale;
        heights[index] = Math.min(caps[index], heights[index] + add);
        if (index > 0) heights[index - 1] = Math.min(caps[index - 1], heights[index - 1] + add * 0.35f);
        if (index < colCount - 1)
            heights[index + 1] = Math.min(caps[index + 1], heights[index + 1] + add * 0.35f);
        if (index > 1) heights[index - 2] = Math.min(caps[index - 2], heights[index - 2] + add * 0.12f);
        if (index < colCount - 2)
            heights[index + 2] = Math.min(caps[index + 2], heights[index + 2] + add * 0.12f);
    }

    // ---------------------------------------------------------------- yangilash

    void update(float dt, float time) {
        updateFlakes(dt, time);
        updateGround(dt);
        updateSparks(dt);
    }

    private void updateFlakes(float dt, float time) {
        int windIndex = Settings.indexOf(Settings.WIND_KEYS, windKey);
        float windMul = WIND_MUL[windIndex];

        float gust = (float) (Math.sin(time * 0.23f) * 0.55f
                + Math.sin(time * 0.71f + 1.3f) * 0.3f
                + Math.sin(time * 0.11f + 0.7f) * 0.15f);
        float windBase = (24f + gust * 34f) * windMul * scale;

        float stormPower = 0f;
        if (stormTimeLeft > 0f) {
            stormTimeLeft = Math.max(0f, stormTimeLeft - dt);
            stormPower = Math.min(1f, stormTimeLeft / 1.2f);
        }

        float decay = (float) Math.pow(0.1, dt);
        mouse[2] *= decay;
        mouse[3] *= decay;

        float radius = 260f * scale;
        float radius2 = radius * radius;
        float influence = 1f - (float) Math.exp(-dt * 3.4f);
        float stormRadius = 560f * scale;
        float stormRadius2 = stormRadius * stormRadius;

        for (int i = 0; i < flakes.size(); i++) {
            Flake flake = flakes.get(i);
            float sway = (float) Math.sin(time * flake.swaySpeed + flake.phase)
                    * flake.sway * (0.35f + flake.z);
            float targetVx = windBase * (0.35f + flake.z * 0.9f) + sway;
            float targetVy = (22f + flake.z * 88f) * scale;

            if (mouseActive) {
                float dx = flake.x - mouse[0];
                float dy = flake.y - mouse[1];
                float dist2 = dx * dx + dy * dy;
                if (dist2 < radius2) {
                    float dist = (float) Math.sqrt(dist2);
                    if (dist < 1f) dist = 1f;
                    float k = 1f - dist / radius;
                    float strength = k * k;
                    targetVx += (dx / dist) * 520f * strength + mouse[2] * 0.6f * strength;
                    targetVy += (dy / dist) * 420f * strength + mouse[3] * 0.6f * strength;
                }
            }

            if (stormPower > 0f) {
                float dx = flake.x - stormX;
                float dy = flake.y - stormY;
                float dist2 = dx * dx + dy * dy;
                if (dist2 < stormRadius2) {
                    float dist = (float) Math.sqrt(dist2);
                    if (dist < 1f) dist = 1f;
                    float k = 1f - dist / stormRadius;
                    float push = k * k * 1100f * scale * stormPower;
                    targetVx += (dx / dist) * push;
                    targetVy += (dy / dist) * push - 140f * k * stormPower * scale;
                }
                targetVy += 90f * stormPower * (0.4f + flake.z) * scale;
                targetVx += windBase * 1.6f * stormPower;
            }

            flake.vx += (targetVx - flake.vx) * influence;
            flake.vy += (targetVy - flake.vy) * influence;
            flake.x += flake.vx * dt;
            flake.y += flake.vy * dt;
            flake.rot += flake.spin * (0.4f + flake.z) * dt;

            if (flake.x < -40f) flake.x = width + 40f;
            else if (flake.x > width + 40f) flake.x = -40f;

            int column = (int) clamp((int) Math.floor(flake.x / colWidth), 0, colCount - 1);
            float ground = height - heights[column];

            if (flake.y >= ground - flake.r) {
                if (drift) deposit(column, flake);
                spawn(flake, false);
            } else if (flake.y > height + 40f) {
                spawn(flake, false);
            }
        }

        // Zichlik pasaytirilganda ortiqcha parchalar asta olib tashlanadi.
        int target = targetCount();
        while (flakes.size() > target + 40) flakes.remove(flakes.size() - 1);
    }

    private void updateGround(float dt) {
        float melt = (drift ? 0.15f : 10f) * dt;
        float top = 0f;

        for (int i = 0; i < colCount; i++) {
            float h = heights[i] - melt;
            heights[i] = Math.max(0f, h);
        }

        for (int i = 0; i < colCount; i++) {
            float left = i > 0 ? heights[i - 1] : heights[i];
            float right = i < colCount - 1 ? heights[i + 1] : heights[i];
            float value = heights[i] * 0.66f + left * 0.17f + right * 0.17f;
            smooth[i] = value;
            if (value > top) top = value;
        }

        System.arraycopy(smooth, 0, heights, 0, colCount);
        groundTop = top;
    }

    private void updateSparks(float dt) {
        for (int i = sparks.size() - 1; i >= 0; i--) {
            Spark spark = sparks.get(i);
            spark.life -= dt;
            if (spark.life <= 0f) {
                sparks.remove(i);
                continue;
            }
            spark.x += spark.vx * dt;
            spark.y += spark.vy * dt;
            spark.vx *= 1f - 2f * dt;
            spark.vy *= 1f - 2f * dt;
            spark.vy += 60f * dt;
        }
    }

    // ---------------------------------------------------------------- hodisalar

    void applyImpulse(float x, float y, float vx, float vy) {
        mouse[0] = x;
        mouse[1] = y;
        mouse[2] = clamp(vx, -4000f, 4000f);
        mouse[3] = clamp(vy, -4000f, 4000f);
        mouse[4] = 0f;
        mouseActive = true;

        float speed = (float) Math.hypot(mouse[2], mouse[3]);
        if (speed > 700f && sparks.size() < 80 && random.nextFloat() < 0.5f) {
            Spark spark = new Spark();
            spark.x = x;
            spark.y = y;
            spark.vx = (random.nextFloat() - 0.5f) * 160f - mouse[2] * 0.05f;
            spark.vy = (random.nextFloat() - 0.5f) * 160f - mouse[3] * 0.05f;
            spark.r = (0.8f + random.nextFloat() * 1.6f) * scale;
            spark.life = 0.45f + random.nextFloat() * 0.55f;
            sparks.add(spark);
        }
    }

    void releaseTouch() {
        mouseActive = false;
    }

    /** Bo'ron: berilgan nuqtadan parchalar portlab chiqadi (nuqta yo'q — markaz). */
    void triggerStorm(float x, float y) {
        stormTimeLeft = 4.5f;
        stormX = x >= 0f ? x : width / 2f;
        stormY = y >= 0f ? y : height * 0.4f;

        int burst = 100;
        for (int i = 0; i < burst; i++) {
            double angle = random.nextDouble() * Math.PI * 2;
            float speed = (260f + random.nextFloat() * 620f) * scale;
            Flake flake = spawn(new Flake(), false);
            flake.x = stormX + (random.nextFloat() - 0.5f) * 90f * scale;
            flake.y = stormY + (random.nextFloat() - 0.5f) * 90f * scale;
            flake.vx = (float) Math.cos(angle) * speed;
            flake.vy = (float) Math.sin(angle) * speed;
            flakes.add(flake);
        }

        for (int i = 0; i < 36 && sparks.size() < 120; i++) {
            double angle = random.nextDouble() * Math.PI * 2;
            float speed = (120f + random.nextFloat() * 420f) * scale;
            Spark spark = new Spark();
            spark.x = stormX;
            spark.y = stormY;
            spark.vx = (float) Math.cos(angle) * speed;
            spark.vy = (float) Math.sin(angle) * speed;
            spark.r = (0.8f + random.nextFloat() * 1.8f) * scale;
            spark.life = 0.5f + random.nextFloat() * 0.7f;
            sparks.add(spark);
        }
    }

    // ---------------------------------------------------------------- chizish

    void draw(Canvas canvas, float time) {
        prepare(canvas.getWidth(), canvas.getHeight());
        drawSky(canvas);
        drawAurora(canvas, time);
        drawGround(canvas);
        drawFlakes(canvas);
        drawSparks(canvas);
    }

    private void drawSky(Canvas canvas) {
        paint.setStyle(Paint.Style.FILL);
        paint.setAlpha(255);
        paint.setShader(skyGradient);
        canvas.drawRect(0f, 0f, width, height, paint);
        paint.setShader(null);
    }

    private void traceGround() {
        path.reset();
        path.moveTo(-colWidth, height - heights[0]);
        for (int i = 0; i < colCount - 1; i++) {
            float x1 = i * colWidth + colWidth / 2f;
            float y1 = height - heights[i];
            float x2 = (i + 1) * colWidth + colWidth / 2f;
            float y2 = height - heights[i + 1];
            path.quadTo(x1, y1, (x1 + x2) / 2f, (y1 + y2) / 2f);
        }
        path.lineTo(width + colWidth, height - heights[colCount - 1]);
    }

    private void drawGround(Canvas canvas) {
        if (groundTop < 1f) return;

        traceGround();
        path.lineTo(width + colWidth, height + 4f);
        path.lineTo(-colWidth, height + 4f);
        path.close();

        paint.setStyle(Paint.Style.FILL);
        paint.setShader(groundGradient);
        paint.setAlpha(255);
        canvas.drawPath(path, paint);

        // Yumshoq ustki qirra — uyum "pard" emas, yumaloq qor bo'lib ko'rinadi.
        traceGround();
        paint.setShader(null);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.1f * Math.max(1f, scale));
        paint.setColor(Color.argb(102, 255, 255, 255));
        canvas.drawPath(path, paint);
        paint.setStyle(Paint.Style.FILL);

        // Uyum ustidagi mayda yaltiroqlar.
        paint.setColor(Color.argb(217, 255, 255, 255));
        for (int i = 0; i < dotX.length; i++) {
            int column = (int) clamp((int) Math.floor(dotX[i] / colWidth), 0, colCount - 1);
            float h = heights[column];
            if (h < 3f * scale) continue;
            float y = height - h + Math.min(dotOffset[i], h - 1f);
            float size = (0.9f + 0.9f * (0.5f + 0.5f * (float) Math.sin(dotPhase[i] + h))) * scale;
            canvas.drawRect(dotX[i], y, dotX[i] + size, y + size, paint);
        }
    }

    private void drawAurora(Canvas canvas, float time) {
        if (!aurora) return;

        int save = canvas.saveLayer(0f, 0f, width, height, null);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
        float base = Math.max(width, height);

        float[] hsv = new float[3];

        for (int i = 0; i < AURORA_PHASE.length; i++) {
            float t = time * AURORA_SPEED[i] + AURORA_PHASE[i];
            float x = (0.5f + 0.45f * (float) Math.sin(t)) * width;
            float y = height * (0.08f + 0.055f * (float) Math.sin(t * 1.7f + AURORA_PHASE[i]));
            float radius = base * (0.3f + 0.07f * (float) Math.sin(t * 0.9f + AURORA_PHASE[i]));
            float hue = (AURORA_HUE[i] + time * 6f) % 360f;

            int c0 = hsla(hsv, hue, 0.92f, 0.66f, 0.16f);
            int c1 = hsla(hsv, hue + 26f, 0.92f, 0.60f, 0.07f);
            int c2 = hsla(hsv, hue + 40f, 0.92f, 0.58f, 0f);

            p.setShader(new RadialGradient(x, y, Math.max(1f, radius),
                    new int[]{c0, c1, c2},
                    new float[]{0f, 0.45f, 1f},
                    Shader.TileMode.CLAMP));
            canvas.drawRect(x - radius, y - radius, x + radius, y + radius, p);
        }

        canvas.restoreToCount(save);
    }

    private static int hsla(float[] hsv, float hue, float saturation, float value, float alpha) {
        hsv[0] = hue;
        hsv[1] = saturation;
        hsv[2] = value;
        int color = Color.HSVToColor(hsv);
        return Color.argb((int) (alpha * 255f),
                Color.red(color), Color.green(color), Color.blue(color));
    }

    private void drawFlakes(Canvas canvas) {
        for (int i = 0; i < flakes.size(); i++) {
            Flake flake = flakes.get(i);
            if (flake.y < -30f || flake.y > height + 30f) continue;

            spritePaint.setAlpha((int) (clamp(flake.alpha, 0f, 1f) * 255f));

            if (flake.z >= CRYSTAL_Z) {
                float size = flake.r * 6.2f;
                canvas.save();
                canvas.translate(flake.x, flake.y);
                canvas.rotate((float) Math.toDegrees(flake.rot));
                canvas.drawBitmap(crystalSprites[flake.kind], null,
                        new android.graphics.RectF(-size / 2f, -size / 2f, size / 2f, size / 2f),
                        spritePaint);
                canvas.restore();
            } else {
                float r = flake.r * 2.1f;
                canvas.drawBitmap(glowSprite, null,
                        new android.graphics.RectF(flake.x - r, flake.y - r, flake.x + r, flake.y + r),
                        spritePaint);
            }
        }
        spritePaint.setAlpha(255);
    }

    private void drawSparks(Canvas canvas) {
        if (sparks.isEmpty()) return;

        int save = canvas.saveLayer(0f, 0f, width, height, null);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.ADD));
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(null);
        paint.setColor(Color.rgb(223, 241, 255));

        for (int i = 0; i < sparks.size(); i++) {
            Spark spark = sparks.get(i);
            paint.setAlpha((int) (Math.min(1f, spark.life * 2f) * 0.85f * 255f));
            canvas.drawCircle(spark.x, spark.y, spark.r, paint);
        }

        canvas.restoreToCount(save);
        paint.setXfermode(null);
        paint.setAlpha(255);
    }
}
