# Forge — Getting Started (دليل البداية)

> لو بتشغّل Forge على جهاز جديد — ابدأ من هنا.
>
> For technical deep-dive: see [INSTALL.md](INSTALL.md)
> For compliance details: see [docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md](docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md)

---

## مرحباً — What is Forge?

Forge هو نظام ذكاء اصطناعي بيشتغل على جهازك كـ Windows service.
بيبدأ تلقائياً مع Windows، وبتوصله من أي browser على:

```
http://127.0.0.1:3100/
```

لو الجهاز ده جديد — اتبع الخطوات دي بالترتيب. كل خطوة مش بتاخد أكتر من 5 دقايق.

---

## ✅ اللي محتاجه قبل ما تبدأ

- Windows 10 أو Windows 11
- حساب Administrator (مش Guest)
- اتصال بالإنترنت
- وقت تقريباً 30–60 دقيقة للـ install الأول

---

## الخطوة 1 — تثبيت Node.js

Forge بيشتغل على Node.js. لو مش متأكد إنه موجود:

📋 افتح PowerShell وكتب:
```powershell
node -v
```

**Expected output:** رقم version زي `v24.0.0` أو أحدث.

لو ظهرت رسالة `not recognized`:
1. روح [https://nodejs.org/](https://nodejs.org/)
2. حمّل **LTS** (الزرّار الأخضر الكبير)
3. شغّل الـ installer — Next, Next, Next, Finish
4. **أقفل PowerShell وافتحه تاني**، ثم تحقق تاني:

```powershell
node -v
```

✓ لازم تشوف رقم — يعني Node.js تثبّت.

---

## الخطوة 2 — تحميل الـ Forge Repo

لو عندك Git:

📋 Copy this:
```powershell
git clone <repo-url> C:\Forge-Source
cd C:\Forge-Source
```

لو مش عندك Git أو مش مرتاح بيه:
- حمّل [GitHub Desktop](https://desktop.github.com/) — أسهل بكتير
- Clone المشروع منه، وخليه في مجلد زي `C:\Forge-Source`

> **ملحوظة:** الـ installer هيـ copy الـ repo تلقائياً إلى `C:\Forge\` — مش محتاج تعمل ده يدوياً.

---

## الخطوة 3 — تحميل NSSM 2.24 (مرة واحدة بس)

NSSM بيخلي Forge يشتغل كـ Windows service ويبدأ تلقائياً مع Windows.

**ده بتعمله مرة واحدة بس على أي جهاز.**

1. روح: [https://nssm.cc/release/nssm-2.24.zip](https://nssm.cc/release/nssm-2.24.zip)
2. حمّل الـ zip
3. **اتحقق من الـ SHA-256** قبل ما تفتح الـ zip:

📋 Copy this:
```powershell
Get-FileHash "$env:USERPROFILE\Downloads\nssm-2.24.zip" -Algorithm SHA256
```

**Expected output:**
```
727D1E42275C605E0F04ABA98095C38A8E1E46DEF453CDFFCE42869428AA6743
```

لو الرقم مختلف — لا تكمّل، حمّل الـ zip تاني.

4. Extract الـ zip إلى: `C:\tools\`

بعد الـ extract، لازم يكون الـ file ده موجود:
```
C:\tools\nssm-2.24\win64\nssm.exe
```

📋 تحقق:
```powershell
Test-Path "C:\tools\nssm-2.24\win64\nssm.exe"
```

✓ Expected: `True`

---

## الخطوة 4 — افتح PowerShell كـ Administrator

الـ installer محتاج Admin rights عشان يثبّت الـ service.

1. ابحث عن **PowerShell** في Start Menu
2. كليك يمين → **Run as Administrator**
3. لو ظهر UAC prompt — قول **Yes**

📋 تأكد إنك Admin:
```powershell
net session
```

✓ Expected: أي output بدون "Access is denied"

---

## الخطوة 5 — شغّل الـ Installer

📋 Copy this:
```powershell
cd C:\Forge-Source
node bin/forge-install.js
```

الـ installer هيـ run وهتشوف steps زي كده:

```
═══════════════════════════════════════════════════════════════════
  FORGE INSTALLER — Production Setup
  Install location: C:\Forge
═══════════════════════════════════════════════════════════════════

[preflight] Running... ✓
[node_install] Running... ✓
[copy_repo] Running... ✓
[npm_install] Running... ✓
[nssm_locate_or_wait] Running... ✓
[nssm_verify] Running...
  Detected: Version 2.24 64-bit, 2014-08-31
 ✓
[service_install] Running... ✓
[service_start] Running... ✓
[post_verify] Running... ✓
[open_browser] Running... ✓
[success_print] Running...
═══════════════════════════════════════════════════════════════════
  FORGE INSTALLED SUCCESSFULLY
  ...
═══════════════════════════════════════════════════════════════════
```

> **لو الـ installer طلب منك مكان NSSM:** اتبع رسالة الـ error — هتقولك الـ path الصح. لو وضعت NSSM في `C:\tools\nssm-2.24\win64\nssm.exe` (الخطوة 3) هيلاقيه تلقائياً.

---

## الخطوة 6 — تحقق إن كل حاجة شغّالة

### Browser
المفروض يفتح تلقائياً على:
```
http://127.0.0.1:3100/
```

لو ما فتحش — افتحه يدوياً.

### Service Status
📋 Copy this:
```powershell
Get-Service forge-api
```

**Expected output:**
```
Status   Name               DisplayName
------   ----               -----------
Running  forge-api          forge-api
```

### Doctor Check
📋 Copy this:
```powershell
cd C:\Forge
node bin/forge-doctor.js
```

**Expected:** آخر سطر يقول `✓ HEALTHY` أو يقول عدد الـ warnings.

---

## لو حاجة غلطت

### الـ Installer راح بـ rollback تلقائي

الـ installer بـ يـ rollback نفسه لو حصل error. يعني جهازك بيرجع نظيف.
مفيش حاجة اتحصلتلها ومحتاج تـ undo يدوياً.

### الـ Diagnostic Dump

لو حصل failure، في مجلد اتعمل تلقائياً خارج الـ repo:
```
C:\Forge_install_failure_<date>\
```

ابعت المجلد ده للـ CTO للـ diagnosis.

### أكثر الأخطاء الشائعة

| الخطأ | السبب | الحل |
|---|---|---|
| "Administrator privileges required" | PowerShell مش Admin | الخطوة 4 — Run as Administrator |
| "NSSM not found" | NSSM مش في المكان الصح | الخطوة 3 — تأكد من `C:\tools\nssm-2.24\win64\nssm.exe` |
| "Port 3100 is already in use" | process تاني شاغل البورت | `netstat -ano \| findstr 3100` وشوف إيه الـ PID |
| "Insufficient disk space" | المساحة مش كفاية | فضّي على الأقل 1 GB على C:\ |

---

## بعد الـ Install — الاستخدام اليومي

**Forge بيبدأ تلقائياً مع Windows** — مفيش حاجة تعملها.

كل ما تحتاجه:
1. افتح browser
2. روح: `http://127.0.0.1:3100/`
3. استخدم Forge

لو Forge مش شغّال (مثلاً بعد restart غير متوقع):
```powershell
Start-Service forge-api
```

---

## جهاز جديد؟

نفس الخطوات. الـ repo portable تماماً.

1. على الجهاز الجديد: `git clone <repo-url> C:\Forge-Source`
2. اتبع الخطوات 1–6 بالكامل
3. جهب NSSM 2.24 (أو انقل نفس الـ zip لو عندك — بس لازم تـ verify الـ SHA-256)

الـ settings والـ configuration موجودة في `C:\Forge-Source` — لو commit إيه هيـ sync تلقائياً مع `git pull`.

---

## إزالة Forge (Uninstall)

📋 Copy this (كـ Administrator):
```powershell
nssm stop forge-api
nssm remove forge-api confirm
Remove-Item -Recurse -Force C:\Forge
```

**ملحوظة:** `C:\Forge-Source` (الـ repo) مش بيتحذف — ده عندك. حذفه يدوي لو محتاج.

---

## Advanced Setup

للإعداد المتقدم (SSL, environment variables, multiple machines):
→ [INSTALL.md](INSTALL.md)

للـ compliance والـ security requirements:
→ [docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md](docs/12_ai_os/23_PRODUCTION_SETUP_CONTRACT.md)

لفهم الـ installer وقرارات التصميم:
→ [artifacts/decisions/DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md](artifacts/decisions/DECISION-2026-05-20T10-00-stage-12-7-amendment-automated-installer.md)

---

*آخر تحديث: 2026-05-20 — Stage 12.7 (Amended Installer)*
