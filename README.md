# ❄️ SNOWY DESKTOP

**Ish stoli orqasida yog'adigan interaktiv qor — o'yin paytida FPS'ni o'g'irlamaydi.**

Windows uchun Electron ilova: shaffof qor qatlami ish stolining eng orqa foniga (WorkerW/Progman) joylashadi, shuning uchun u ochiq oynalar va o'yinlar orqasida ko'rinadi, sichqoncha bosishlarini esa hech qachon to'smaydi.

---

## Xususiyatlar

- **Ish stoli qatlami** — qor oynalar *orqasida* turadi (Snowhush uslubi: `WorkerW`/`Progman`ga `SetParent`). Tray'dan `Overlay` rejimiga ham o'tish mumkin.
- **FPS tejamkor** — 30 fps (yoki 20 fps) cap, 1× piksel canvas, `desynchronized` kontekst, oldindan kesh qilingan gradientlar. O'yin paytida 150 → 30 fps tushishi tuzatilgan.
- **Qor "oq parda" emas** — gradientli fon yo'q: faqat qor parchalari, uyumlar, aurora, bo'ron. Pastdagi panel/interfeys to'silmaydi.
- **Har qanday resolution'ga avtomatik moslash** — barcha o'lchamlar `scale = clamp(min(W/1920, H/1080), 0.55, 2)` orqali proportsional hisoblanadi (1080p = 1×). Resolution almashtirilsa, oyna faqat `setBounds` bilan yangilanadi — qor uzilib qolmaydi. Monitor qo'shilsa/uzilsa qatlamlar qayta quriladi.
- **Boshqarish** — tray menyusi: qor zichligi (yengil / o'rtacha / kuchli), shamol, bo'ron, qatlam rejimi, pauza, autostart.
- **Global hotkey'lar** — qor va bo'ron uchun tezkor tugmalar (tray menyusida ko'rsatilgan).
- **Bir nechta monitor** — har bir displey uchun alohida qatlam.

## O'rnatish (foydalanuvchi uchun)

1. `Qor-Setup-*.exe` faylini yuklab oling.
2. Ikki marta bosing — bir bosishda o'rnatiladi (admin paroli kerak emas).
3. Ish stolida **Qor** yorlig'i paydo bo'ladi. Qor darhol ko'rinadi, ilova tray'da turadi.

O'chirish: **Settings → Apps → Qor → Uninstall**. Sozlamalar `%APPDATA%\qor-desktop\qor-settings.json` da saqlanadi.

> Installer imzolanmagan, shuning uchun Windows SmartScreen ogohlantirishi chiqishi mumkin: *More info → Run anyway*.

## Manbadan ishga tushirish

```bash
npm install
npm start
```

Diagnostika (headless smoke-test — qatlam, canvas, bo'ron, resize):

```bash
npx electron . --smoke
```

## Yig'ish

```bash
npm run setup   # dist-installer/Qor-Setup-<versiya>.exe  (NSIS installer)
npm run dist    # dist/Qor-win32-x64/  (portativ papka + ZIP)
```

## Tuzilishi

```
src/
  main.js              # overlay oynalar, tray, hotkey, sozlamalar, autostart, --smoke
  preload.js           # xavfsiz IPC ko'prigi (onSettings / onStorm)
  renderer/
    index.html         # shaffof oyna + #sky canvas
    snow.js            # qor dvigateli (zarra, uyum, shamol, bo'ron, aurora)
scripts/
  desktop-layer.ps1    # WorkerW/Progman topib, oynani ish stoli qatlamiga biriktirish (P/Invoke)
  make-icon.js         # .ico generator
  make-tray-icon.js    # tray PNG generator
assets/                # icon.ico, tray.png
```

## Texnik eslatmalar

- Native FFI yo'q: ish stoli qatlami PowerShell + `SetParent` orqali biriktiriladi; biriktirish muvaffaqiyatsiz bo'lsa, ilova avtomatik `Overlay` rejimiga qaytadi.
- `asar` ichidagi `.ps1` ishga tushmaydi — skript ishga tushishda `%TEMP%` ga chiqariladi.
- 30 fps cap ataylab qo'yilgan: qor sekin harakatlanadi, lekin o'yinda FPSga ta'sir qilmaydi.

## Litsenziya

Shaxsiy foydalanish uchun. Savollar va takliflar — Issue oching.
