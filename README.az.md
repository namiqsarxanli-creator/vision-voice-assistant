# VISION

🇬🇧 [English](README.md)

Hissəcik interfeysli səsli köməkçi: alqışla oyanır, İngiliscə danışır, kompüterdə
proqram/sayt açır, fayl axtarır və **əl ilə idarə olunur**.

## Başlatmaq

PyCharm-da `main.py` faylını Run et → `http://127.0.0.1:8040/`

İlk dəfə paketlər:

```
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`.env` faylında `GROQ_API_KEY` olmalıdır. Açar yoxdursa sistem sınmır — demo cavablara
keçir, interfeys tam işləyir.

## Rejimlər

Üç giriş üsulu var, hamısı eyni səhifədə, birlikdə işləyir:

| Düymə | Nə edir |
|---|---|
| **ALQIŞLA OYAT** | Mikrofon qulaq asır; iki alqış → model yaranır və dinləməyə başlayır |
| **ƏL İLƏ İDARƏ** | Kamera açılır; baş əli izləyir, jestlər işığı/rəngi dəyişir |
| **DANIŞ** / **YAZ** | Birbaşa sual vermək |

### Əl ilə idarə

| Jest | Nəticə |
|---|---|
| Əli tərpətmək | Baş əlin mövqeyini izləyir |
| **Əli yumub açmaq** (və ya barmaqları sıxıb buraxmaq) | Nüvə işığını yandırır/söndürür. Hər iki jest tək bir 900 ms soyuma sayğacından keçir — bir hərəkət = bir dəyişiklik |
| **Açıq əli sürətlə yana sürüşdürmək** | Rəng palitrası dəyişir (sağa növbəti, sola əvvəlki) |
| ✌ jestini ~0.75 s saxlamaq | Rəng palitrası dəyişir |
| Əl kadra girmək | Model yuxudaykən oyadır |
| <kbd>L</kbd> düyməsi | İşığı kamerasız yandırıb-söndürür (jestlə eyni kod yolu) |


> **Mail göndərmə barədə vacib qeyd.** Gmail-də "yalnız qaralama yarat" adlı icazə
> (scope) YOXDUR: `gmail.compose` qaralama yaratmağa imkan verdiyi kimi göndərməyə də
> imkan verir. Ona görə "heç vaxt göndərmir" zəmanəti Google-dan deyil, **bu koddan**
> gəlir — `drafts().send()` və `messages().send()` heç yerdə çağırılmır, alət
> siyahısında göndərmə aləti yoxdur, model isə əmr yazmır, yalnız hazır siyahıdan
> seçir. Göndərmək həmişə sənin Gmail-də etdiyin bir kliklə olur.
>
> Qaralama icazəsi sonradan əlavə olunduğu üçün **köhnə token işləmir** —
> interfeysdə `GOOGLE QOŞ` düyməsinə bir daha basmaq lazımdır.

### İdarə olunan brauzer

Əvvəl saytlar `webbrowser.open()` ilə açılırdı — pəncərə açılıb **unudulurdu**,
ona görə "birinciyə gir", "aşağı sürüşdür", "bağla" işləmirdi. İndi VISION
Playwright ilə öz brauzer pəncərəsini sürür.

| Əmr | Alət |
|---|---|
| "Googleda X axtar" | `search_web` — nəticələri açır **və siyahını qaytarır** |
| "birincisinə gir" | `open_result(1)` |
| "aşağı sürüşdür" / "sona get" | `scroll_page` |
| "geri qayıt" | `go_back` |
| "bu səhifədə nə yazılıb" | `read_page_text` |
| "dayandır" / "davam et" / "səsi kəs" | `media_control` (YouTube) |
| "bağla" / "söndür" | `close_browser` |

**Üç dizayn qərarı:**

1. **Ayrıca thread.** Playwright-ın sync API-si onu yaradan thread-ə bağlıdır,
   FastAPI isə sync endpoint-ləri thread-pool-da işlədir və hər sorğu fərqli
   thread-ə düşə bilər. Ona görə brauzeri bir dedicated thread saxlayır,
   qalanları ona növbə (queue) ilə əmr göndərir.

2. **Sistemdəki Chrome** (`channel="chrome"`), paketlə gələn Chromium yox:
   Chromium-da H.264/AAC kodekləri yoxdur, yəni **YouTube videoları oynamır**.
   Profil ayrıdır (`.browser-profile/`), ona görə şəxsi Chrome sessiyana toxunmur.

3. **Nəticə linkləri saxlanılır, klik edilmir.** `open_result(1)` axtarış
   zamanı toplanmış URL-ə keçir — kliklə koordinat tutmaqdan qat-qat etibarlıdır.

**Bir tələ:** `domcontentloaded` axtarış motorunun JS-i nəticələri çəkməzdən
**əvvəl** işə düşür, ona görə nəticələr bəzən boş qayıdırdı — indi linklərin
görünməsi gözlənilir. Həmçinin DuckDuckGo-da `a:has(h3)` video kartlarını da
tutur və başlıq kimi videonun **müddətini** ("16:23") qaytarırdı; hər motor üçün
ayrıca seçici sırası və başlıq filtri var.

**Razılıq pəncərələri:** çıxarsa avtomatik olaraq **rədd edilir** (ən məxfi
variant). "Hamısını qəbul et" istifadəçinin qərarıdır, kod onu basmır.

Quraşdırma: `pip install playwright` və `python -m playwright install chromium`.
Playwright yoxdursa sistem brauzerinə qayıdır — yalnız idarəetmə itir.

### Təqdimat rejimi

Səhifə açılanda **açılış ekranı** çıxır: `TAM EKRANDA BAŞLAT` və
`PƏNCƏRƏDƏ DAVAM ET`. Bu ekran təsadüfi deyil — brauzer həm `requestFullscreen`,
həm də mikrofon icazəsini **yalnız istifadəçi jestindən sonra** verir, ona görə
eyni klikdən hər ikisi alınır.

**İki dil.** Assistent cavabı bir çağırışda iki dildə qaytarır:

```
<İngiliscə cavab>
---AZ---
<Azərbaycanca tərcümə>
```

İngiliscə hissə **ucadan oxunur** (dərin səs saxlanılır), Azərbaycanca hissə
**ekranda göstərilir**. Model ayırıcını unutsa `_translate_az()` ehtiyat yolu işə
düşür və mətni ayrıca tərcümə edir. Söhbət tarixçəsinə İngiliscə yazılır —
model onunla işləyir.

**Görünüş.** Cavab mətni 21px-dir və arxasında yumşaq qaranlıq halqa var
(`#transcript::before`) — mətn modelin üstünə düşəndə də uzaqdan oxunur.
HUD və düymə yazıları da təqdimat üçün böyüdülüb.

### Yer xidməti

İnterfeysdəki `KONUM` düyməsi brauzerin yer icazəsini istəyir. Ondan sonra
"yaxınlıqda xəstəxana varmı?", "ən yaxın aptek", "haradayam?" kimi suallar işləyir.

| Alət | Nə edir |
|---|---|
| `where_am_i` | Cari ünvanı qaytarır (Nominatim əks-geokodlaşdırma) |
| `find_nearby` | Yaxınlıqdakı yerləri məsafəyə görə sıralayır (Overpass) |

Kateqoriyalar: xəstəxana, aptek, market, restoran, kafe, bank, bankomat,
yanacaqdoldurma, polis, otel, park, təhsil, avtobus dayanacağı, metro.

**Niyə Google Places yox:** Google Places API ödəniş hesabı (billing) tələb edir.
OpenStreetMap-in Overpass API-si pulsuzdur və açar istəmir.

> **Məxfilik.** Koordinat AI provayderinə (Groq) **heç vaxt getmir**. Axın:
> brauzer → lokal server → OpenStreetMap. Modelə yalnız hazır nəticə (ad, məsafə,
> ünvan) çatır. Koordinat diskə də yazılmır — yalnız prosesin yaddaşında, bir
> sorğuluq saxlanılır və növbəti sorğuda mövqe gəlmirsə silinir.
> `test-places.py` bunu ayrıca yoxlayır: tool-un qaytardığı mətndə xam koordinat
> olmamalıdır.

**Təhlükəsizlik:** Overpass QL bir sorğu dilidir. Model heç vaxt sorğu yazmır —
sabit kateqoriya siyahısından seçir, ona görə sorğu inyeksiyası mümkün deyil.
Radius 200–10000 m aralığına sıxılır, eyni sorğu 2 dəqiqə keşlənir.

### Davranış

| Nə | Necə işləyir |
|---|---|
| **Söz kəsmə** | VISION danışarkən danışsan susub dinləməyə keçir. Əks-səs problemi mikrofon səviyyəsini öz çıxışımızın səviyyəsi ilə **müqayisə** etməklə həll olunur (`peak > selfLevel * 2.2`, 220 ms davamlı). Alqış rejimi açıq olmalıdır |
| **Yaddaş** | `remember` aləti faktları `memory.json`-a yazır, hər cavabdan əvvəl sistem promptuna əlavə olunur. Fayl istifadəçi datası kimi işlənir — içindəki əmrlərə əməl edilmir |
| **Diqqət dövrü** | 90 saniyə sükutdan sonra işıq və enerji 0.3-ə düşür, baş azca əyilir. İstənilən təmas (səs, jest, siçan, düymə) dərhal dirildir |
| **Sinir impulsları** | Düşünərkən sinədən başa doğru qızıl damarlarla parlaq impulslar qaçır (`uThink`) |
| **Mahnı açmaq** | `play_youtube` axtarış səhifəsinin HTML-indən birinci `videoId`-ni çıxarır və videonun ÖZÜNÜ açır. Alınmasa adi axtarışa qayıdır |
| **Mailə cavab** | `read_mail` son məktubun tam mətnini oxuyur, `draft_reply` cavab QARALAMASI yaradır. Qaralama orijinal thread-ə bağlanır (In-Reply-To / References). **Göndərmə yoxdur** — bax aşağıdakı qeyd |

Kamera görüntüsü **ekranda göstərilmir** — nə önizləmə, nə əl skeleti. `<video>`
elementi yalnız MediaPipe-ın kadrları oxuması üçündür, görünməz saxlanılır.
Görüntü cihazdan da çıxmır: model `static/vendor/hands` içindədir, internet
tələb olunmur.

Şıqqıldatma səsdən tanınmır: kamera barmaqların təmasdan ayrılmasını izləyir — bu,
tam etibarlı "snap" tanıma deyil, sıxıb-burax approksimasiyasıdır.

## Quruluş

```
HumanoidAssistant/
  main.py            FastAPI: səhifə + /api/chat, /api/listen, /api/speak
  ai.py              LLM + alət çağırışı dövrü (Groq)
  tools.py           İcazə siyahısı: proqram/sayt/fayl/sistem
  google_tools.py    Gmail + Calendar (yalnız oxuma)
  voice.py           Dərin səs (Windows SAPI + SSML)
  config.py          .env oxunuşu
  static/
    index.html       tək səhifə
    assistant.js     vəziyyət maşını, materializasiya, səs, ƏL İDARƏSİ
    clap.js          iki alqışla oyatma
    gestures.js      jest tanıma (FX-dən)
    renderer.js      WebGL hissəcik renderer
    vendor/hands/    MediaPipe, lokal
  test-clap.cjs      alqış alqoritmi
  test-gestures.cjs  jest tanıma
```

## Dil və səs

Assistent **həmişə İngiliscə** cavab verir — sən Azərbaycanca soruşsan belə.
Səs tanıma isə avtomatik dil aşkarlamasındadır (`STT_LANGUAGE=""`), yəni hər iki
dildə danışa bilərsən. Konkret dil vermək istəsən `.env` → `STT_LANGUAGE="en"`.

### Səs necə qalınlaşdırılır

Brauzerin TTS-i kifayət etmir: Web Speech API-də `pitch` 0-a qədər düşür (daha aşağı
yoxdur), Chrome-un uzaq səsləri onu ümumiyyətlə tətbiq etmir, üstəlik TTS çıxışını
Web Audio-ya yönləndirib sonradan emal etmək mümkün deyil.

Səs **backend-də** yaradılır, iki mərhələli:

1. **Neyron TTS — Groq Orpheus** (`canopylabs/orpheus-v1-english`, səs: `troy`).
   Daha təbii səslənir. **Bir dəfəlik addım lazımdır:** model Groq konsolunda şərtlərin
   qəbulunu tələb edir → https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
   Qəbul edən kimi avtomatik işə düşür, kod hazırdır.
2. **Windows SAPI + SSML** — ehtiyat yol. Neyron TTS alınmasa (şərtlər qəbul olunmayıb,
   internet yoxdur, xəta) səssizcə buna keçir. Oflayn işləyir.

SAPI variantı SSML ilə:

```
mətn → /api/speak → SAPI + SSML <prosody pitch="-10st"> → WAV
WAV  → brauzer Web Audio → playbackRate 0.94 → lowpass 2.4 kHz
     → lowshelf +9 dB @220 Hz → sub-bas uğultu (52 + 78.5 Hz)
```

Yəni pitch sintez anında 10 yarımton aşağı salınır — brauzerin bacardığından qat-qat
qalın. Üstəlik nüvə artıq söz sərhədinə yox, **səsin real amplitüduna** (RMS) görə
döyünür.

Tənzimləmə (`.env` və ya `config.py`):

| Parametr | Default | Nə edir |
|---|---|---|
| `VOICE_PITCH` | `-10st` | Daha mənfi = daha qalın (`-14st` sına) |
| `VOICE_RATE` | `-12%` | SSML daxili sürət |
| `VOICE_SAPI_RATE` | `-2` | SAPI sürəti, `-10..10` |
| `VOICE_NAME` | `Microsoft David Desktop` | SAPI səsi |
| `TTS_MODEL` | `canopylabs/orpheus-v1-english` | Neyron TTS modeli (boş = söndür) |
| `TTS_VOICE` | `troy` | Orpheus səsi: `troy`, `austin`, `hannah` |

Brauzerdəki əlavə emal: `assistant.js` → `speakDeep()` (filtr tezlikləri) və
`startRumble()` (uğultu həcmi).

**Fallback:** `/api/speak` alınmasa (Windows deyil, SAPI xətası və s.) avtomatik
brauzerin öz TTS-inə keçir — assistent səssiz qalmır. Sınaqda təsdiqləndi.

**Təhlükəsizlik:** mətn heç vaxt PowerShell əmr sətrinə yapışdırılmır — XML-escape
edilib fayla yazılır, PowerShell-ə yalnız fayl yolu ötürülür. `& calc.exe` və
`$(Remove-Item C:\)` kimi mətnlər sadəcə ucadan oxunur, icra olunmur (sınanıb).

**Dürüst məhdudiyyət:** bu, *Thanos üslubunda* dərin bədxah səsidir — Josh Brolin-in
əsl səsi deyil və ola da bilməz. Real aktyorun səsini klonlamaq konkret bir insanın
şəxsiyyətini təqlid etmək olardı; onu qurmuram. Brauzerin TTS-i onsuz da bunu
bacarmır. Daha "kinematik" nəticə istəsən, yol neyron TTS-dir (məs. ElevenLabs-in
dərin bədxah presetləri) — amma yenə generik personaj səsi kimi, aktyor klonu kimi yox.

## Yığılma animasiyası (materializasiya)

**Səhifə açılanda ekran boşdur** — model görünmür. İki alqış eşidiləndə **sıfırdan
yığılır**: hissəciklər dağınıq orbitlərdən insan formasına axır, nüvə işığı sıfırdan
qalxır, fon yenidən parlayır. Videonun başlanğıcındakı effektin qarşılığı.

- Yuxu rejimində səhnə ümumiyyətlə çəkilmir — boş ekran, GPU da boş yerə işləmir.
- Danışmaq və ya yazmaq da oyadır (yalnız alqışla məhdud deyil).
- **`Esc`** — assistent boşdursa modeli yenidən yuxuya salır (ekran boşalır).
- **`R`** düyməsi — animasiyanı istənilən vaxt təkrar oynadır (nümayiş üçün).
- Səs sintez olunur (fayl yoxdur): qalxan uğultu + hissəcik pıçıltısı + sonda
  qısa parıltı akkordu. `formSound()` funksiyasında.
- Texniki: shader-də `erupt = sin(uScatter*π)` olduğu üçün tam dağınıqlıq
  `uScatter = 0.5`-dir. Yığılma `0.5 → 0` gedir (kub əyri ilə), yəni əvvəlcə
  partlayış yoxdur — yalnız toplanma.

**Qeyd:** kadr sürəti aşağı olanda animasiya real vaxtda daha uzun çəkir (`dt`
0.05 s ilə məhdudlaşdırılıb ki, ləng kadrlarda sıçrayış olmasın).

## İki alqışla oyatma

**ALQIŞLA OYAT** düyməsinə bas → mikrofon fasiləsiz qulaq asır → **iki dəfə əl çal** →
assistent dinləməyə başlayır. Düyməyə təkrar bas → söndürülür, mikrofon buraxılır.

**Məxfilik:** səs **brauzerdə** analiz olunur, heç yerə göndərilmir. Yalnız alqış
tanınandan sonra yazma başlayır və o zaman səs Whisper-ə gedir. Rejim öz-özünə
açılmır — düymə ilə açırsan, düymə sarı yanır ki, mikrofonun açıq olduğunu görəsən.

**Necə tanıyır:** alqış qısa, güclü və genişzolaqlı partlayışdır. Danışıq enerjisi
əsasən 2.5 kHz-dən aşağıdadır, alqışda isə yuxarı tezliklərin payı yüksəkdir. Ona görə
yalnız səs həcminə baxılmır — spektrin yuxarı/aşağı balansı da yoxlanılır. Həssaslıq
otağın fon səviyyəsinə görə özünü avtomatik tənzimləyir.

Yalançı tetiklənməyə qarşı:
- Assistent danışarkən/düşünərkən tanıma **dayanır** (öz səsi özünü oyatmasın).
- 130 ms-lik "refractory" — əks-səda ikinci alqış sayılmır.
- İki alqış arasındakı ara 140–900 ms olmalıdır.
- Fon səviyyəsi yalnız sakit anlarda yenilənir.

### Sınaq (`node test-clap.cjs`)

| Ssenari | Nəticə |
|---|---|
| İki alqış, 240 ms ara | ✓ oyadır |
| Tək alqış | ✓ oyatmır |
| Ara çox uzun (>900 ms) | ✓ oyatmır |
| Danışıq kimi güclü, aşağı tezlikli səs | ✓ oyatmır |
| Əks-səda (48 ms sonra ikinci partlayış) | ✓ tək sayılır |
| Assistent danışarkən | ✓ oyatmır |
| Sakit otaq xışıltısı (200 kadr) | ✓ oyatmır |

Bu test ilk buraxılışda **real qüsur tapdı:** spektr müqayisəsində bin cəmləri
toplanırdı, yuxarı zolaqda bin sayı çox olduğu üçün (459 vs 53) danışıq da
"genişzolaqlı" görünürdü. Ortalamaya keçirildi.

**Yoxlanılmayıb:** real mikrofonla, real əl çalmaqla. Alqoritm süni siqnallarla
test olunub; otağın akustikası və mikrofonun xüsusiyyətləri həssaslığı dəyişə bilər.
Lazım olsa `clap.js`-dəki `minPeak` / `highBandMin` dəyərləri tənzimlənir.

## İdarəetmə

- **ALQIŞLA OYAT** — fasiləsiz qulaq asma; iki alqış → dinləmə başlayır.
- **DANIŞ** / `V` — mikrofonu başlat, təkrar bas → dayandır və göndər (20 saniyədən sonra avtomatik dayanır).
- **SUS** / `Esc` — danışığı və yazmanı dərhal dayandır.
- **YAZ** / `T` — mikrofonsuz, mətnlə sual göndər.
- **RƏNG** / `M` — palitra dəyişir. `F` — tam ekran. `H` — idarələri gizlət.
- Siçanı tərpətmək — baş siçanı izləyir.

## Niyə brauzerin öz səs tanıması yox?

Chrome-un `SpeechRecognition`-u **az-AZ dilini tanımır**. Ona görə səs brauzerdə yazılıb
backend-ə göndərilir və Groq Whisper (`whisper-large-v3`) ilə mətnə çevrilir — Whisper
Azərbaycan dilini dəstəkləyir. Dil `.env`-də `STT_LANGUAGE` ilə dəyişdirilə bilər.

Səsli cavab isə brauzerin öz `speechSynthesis`-i ilə oxunur — pulsuz və əlavə
infrastruktur tələb etmir. Azərbaycan dili üçün sistemdə uyğun səs yoxdursa,
brauzer ən yaxın dili seçir (məs. türk) və tələffüz qüsurlu ola bilər.

## Yoxlanılıb

- `/api/status` → açar oxunur (`{"ai":true}`).
- `/api/chat` → real Groq cavabı gəldi (`source: "ai"`), Azərbaycan dilində.
- `/api/listen` → SAPI ilə yaradılmış sınaq WAV faylı Whisper tərəfindən Azərbaycan
  mətninə çevrildi. **Qeyd:** sınaq səsi robot TTS idi, ona görə tanıma qüsurlu çıxdı;
  real insan səsi ilə dəqiqlik daha yüksək olmalıdır — bu, canlı mikrofonla
  təsdiqlənməyib.
- Brauzerdə tam dövr: mətn sualı → DÜŞÜNÜR → AI cavabı → HAZIR.


## Gmail / Google Calendar

**Kod hazırdır.** Google hesabını bir dəfə qoşmaq lazımdır:

1. https://console.cloud.google.com → yeni layihə yarat
2. "APIs & Services" → **Gmail API** və **Google Calendar API**-ni aktivləşdir
3. "Credentials" → "Create credentials" → **OAuth client ID** → tip: **Desktop app**
4. JSON-u yüklə, adını `credentials.json` qoy, bu qovluğa at

Sonra: səhifəni yenilə → aşağıda **GOOGLE QOŞ** düyməsi görünəcək → bas → brauzerdə
Google icazə pəncərəsi açılır → icazə ver. Bundan sonra işləyir:

- "Sabah nə işim var?" → `calendar_events`
- "Son mail-lərdə nə var?" / "Oxunmamış mailim varmı?" → `recent_mail`

Detallar:
- **İcazələr yalnız oxumadır** (`gmail.readonly`, `calendar.readonly`). Assistent mail
  göndərə, silə və ya təqvimi dəyişə bilmir.
- **Parol saxlanılmır** — `token.json` saxlanılır, istənilən an
  https://myaccount.google.com/permissions -dən ləğv edirsən. Düymə ilə də silinir
  (qoşulduqdan sonra düymə "GOOGLE ✓" olur, təkrar basanda bağlantını silir).
- `credentials.json` və `token.json` `.gitignore`-dadır.
- Fayl olmadıqda bu alətlər modelə **ümumiyyətlə göstərilmir** — model edə bilmədiyi
  şeyi vəd etməsin deyə.

### Bu hissədə yoxlanılan / yoxlanılmayan

| Yoxlanılıb | Nəticə |
|---|---|
| `credentials.json` yoxdurkən alətlər gizlədilir | ✓ modelə göstərilmir |
| `credentials.json` əlavə olunanda alətlər qeydiyyata düşür (restart olmadan) | ✓ |
| Fayl silinəndə alətlər siyahıdan çıxır, dublikat yaranmır | ✓ |
| Token yoxdurkən aydın mesaj ("GOOGLE QOŞ düyməsinə bas") | ✓ |
| `/api/google/connect` credentials olmadan → 400 + izahlı mesaj | ✓ |
| UI düyməsi yalnız credentials olanda görünür | ✓ |

**Yoxlanılmayıb:** real Google hesabı ilə canlı OAuth axını və həqiqi mail/təqvim
oxunuşu — bunun üçün sənin `credentials.json` faylın lazımdır. Kod yazılıb, amma
real API cavabı ilə sınanmayıb.

## Bilinən məhdudiyyətlər

- Canlı mikrofonla (real insan səsi) tam dövr fiziki olaraq sınanmayıb.
- Səs tanıma (Whisper) və LLM Groq API-yə gedir — internet və açar tələb olunur.
  Səs yazısı yalnız sorğu anında göndərilir, saxlanılmır.
- `speechSynthesis` Azərbaycan səsi olmayan sistemlərdə qüsurlu tələffüz edir.
  Daha yaxşı səs üçün backend TTS (məs. ElevenLabs) lazımdır — hazırda yoxdur.
- Söhbət yaddaşı yalnız brauzer səhifəsində saxlanılır (son 20 növbə), baza yoxdur.
- `search_files` böyük qovluqlarda yavaş ola bilər (rekursiv gəzir, 12 nəticə ilə məhdudlaşır).
- Alət seçimini model edir — bəzən səhv alət seçə bilər. İcra olunan əməliyyat
  ekranda göstərilir ki, nə baş verdiyini görəsən.
- Telefon inteqrasiyası yoxdur.
