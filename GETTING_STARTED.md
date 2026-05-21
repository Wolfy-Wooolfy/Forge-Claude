# Forge — Getting Started (دليل البداية)

> For compliance details: see [docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md](docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md)

---

## ما هو Forge؟

Forge هو نظام ذكاء اصطناعي بيشتغل على جهازك كـ background process.
بيبدأ تلقائياً مع Windows، وبتوصله من أي browser على:

```
http://127.0.0.1:3100/
```

---

## التثبيت — أول مرة على أي جهاز

### الخطوة الوحيدة

1. **حمّل `INSTALL_FORGE.bat`:**

   ```
   https://raw.githubusercontent.com/Wolfy-Wooolfy/Forge-Claude/main/INSTALL_FORGE.bat
   ```

2. **دابل-كليك** عليه.

3. **خلاص** — Forge شغّال، وبيبدأ تلقائياً مع Windows.
   Desktop shortcuts اتعملت (RUN_FORGE وSTOP_FORGE).

**الوقت المتوقع:** 3–5 دقايق (حسب سرعة الإنترنت).
**المتطلبات:** Windows 10/11 — مفيش حاجة تاني تحمّله يدوياً.

> الـ installer بيكتشف تلقائياً لو Node.js أو git مش موجودين ويثبّتهم.
> لو طلب منك تقفل وتفتح التاني → افعل كده وشغّله تاني (PATH refresh).

---

## الاستخدام اليومي

| العملية | الطريقة |
|---|---|
| تشغيل Forge يدوياً | دابل-كليك **RUN_FORGE** على الـ Desktop |
| إيقاف Forge | دابل-كليك **STOP_FORGE** على الـ Desktop |
| Auto-start مع Windows | تلقائي — مفيش حاجة تعمله |

---

## مكان التثبيت

| الـ Drive | مكان التثبيت |
|---|---|
| D: موجود | `D:\ForgeAI` |
| D: مش موجود | `C:\ForgeAI` |

---

## جهاز جديد؟

نفس الخطوة — حمّل `INSTALL_FORGE.bat` وشغّله.
الـ installer بيعمل `git clone` تلقائياً.

لو Forge مثبّت بالفعل ومحتاج تحديث → الـ installer بيعمل `git pull` تلقائياً.

---

## إزالة Forge (Uninstall)

```batch
pm2 stop forge
pm2 delete forge
pm2 save --force
```

ثم احذف مجلد التثبيت (`D:\ForgeAI` أو `C:\ForgeAI`) يدوياً.
احذف `forge-resurrect.bat` من:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\`

---

## روابط مفيدة

- Decision artifact (pm2 migration): [DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md](artifacts/decisions/DECISION-2026-05-21-pm2-two-file-setup-supersedes-nssm.md)
- Production contract: [docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md](docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md)

---

*آخر تحديث: 2026-05-21 — تم الانتقال من NSSM إلى pm2 (two-file setup)*
