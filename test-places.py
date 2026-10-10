"""Yer xidmətinin testi: kateqoriya siyahısı, radius, məsafə və MƏXFİLİK.

Şəbəkə saxta cavabla əvəz olunur - internet lazım deyil, nəticə təkrarlanandır.

Ən vacib yoxlama: modelə gedən mətndə XAM KOORDİNAT olmamalıdır. Tool-un
qaytardığı sətir birbaşa Groq-a mesaj kimi ötürülür, ona görə məhz onu yoxlayırıq.

İşə salmaq:  .venv/Scripts/python.exe test-places.py
"""

from __future__ import annotations

import io
import re
import sys
import urllib.parse

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import places

# --- saxta şəbəkə --------------------------------------------------------

REQUESTS: list[tuple[str, bytes | None]] = []

LAT, LON = 40.3709, 49.8366

FAKE_OVERPASS = {
    "elements": [
        {"type": "node", "lat": 40.3712, "lon": 49.8371,
         "tags": {"name": "Aptek Bir", "addr:street": "Nizami küç", "phone": "+994501112233"}},
        # eyni obyekt həm node, həm way kimi - təkrar sayılmamalıdır
        {"type": "way", "center": {"lat": 40.3713, "lon": 49.8372}, "tags": {"name": "Aptek Bir"}},
        {"type": "node", "lat": 40.3782, "lon": 49.8446, "tags": {"name": "Aptek İki"}},
        # adsız nöqtə - siyahıya düşməməlidir
        {"type": "node", "lat": 40.3710, "lon": 49.8367, "tags": {"amenity": "pharmacy"}},
    ]
}

FAKE_NOMINATIM = {"display_name": "Şamil Əzizbəyov küçəsi, Yasamal, Bakı, Azərbaycan"}


def fake_fetch(url: str, data: bytes | None = None) -> dict:
    REQUESTS.append((url, data))
    return FAKE_OVERPASS if data is not None else FAKE_NOMINATIM


places._fetch = fake_fetch


def check(label: str, condition: bool) -> None:
    print(("PASS — " if condition else "FAIL — ") + label)
    if not condition:
        sys.exit(1)


# --- mövqe olmadan -------------------------------------------------------

places.clear_location()
check("mövqe yoxdursa has_location() False", places.has_location() is False)
for name, call in [("find_nearby", lambda: places.find_nearby("pharmacy")),
                   ("where_am_i", places.where_am_i)]:
    try:
        call()
        check(f"mövqesiz {name} xəta verir", False)
    except places.PlacesError as exc:
        check(f"mövqesiz {name} aydın xəta verir", "MƏKAN" in str(exc))

# --- mövqe ilə -----------------------------------------------------------

places.set_location(LAT, LON, 25)
check("mövqe təyin olundu", places.has_location() is True)

try:
    places.set_location(95, 0)
    check("yanlış koordinat rədd edilir", False)
except places.PlacesError:
    check("yanlış koordinat rədd edilir", True)
places.set_location(LAT, LON, 25)

# Kateqoriya siyahısı: model sorğu YAZMIR, siyahıdan SEÇİR.
try:
    places.find_nearby('node["amenity"="bank"];out;')
    check("siyahıda olmayan kateqoriya bloklanır", False)
except places.PlacesError as exc:
    check("siyahıda olmayan kateqoriya bloklanır (sorğu inyeksiyası mümkün deyil)",
          "kateqoriyası yoxdur" in str(exc))

places._cache.clear()
REQUESTS.clear()
result = places.find_nearby("pharmacy", 800)

check("nəticədə yer adı var", "Aptek Bir" in result)
check("adsız nöqtə siyahıya düşmür", result.count("Aptek") == 2)
check("təkrar obyekt bir dəfə görünür", result.count("Aptek Bir") == 1)
check("məsafə metrlə göstərilir", re.search(r"Aptek Bir — \d+ m", result) is not None)
check("yaxın olan birinci sıralanır", result.index("Aptek Bir") < result.index("Aptek İki"))
check("əlavə məlumat (ünvan/telefon) əlavə olunur", "Nizami küç" in result and "+994501112233" in result)

# --- MƏXFİLİK: modelə gedən mətndə koordinat olmamalıdır -----------------

coordinate_pattern = re.compile(r"\b\d{1,3}\.\d{3,}\b")
leaked = coordinate_pattern.findall(result)
check(f"tool cavabında xam koordinat yoxdur (tapılan: {leaked or 'yoxdur'})", not leaked)
check("istifadəçinin en/uzunluq dərəcəsi mətndə keçmir",
      str(LAT) not in result and str(LON) not in result)

address = places.where_am_i()
check("ünvan qaytarılır", "Bakı" in address)
check("ünvanda da xam koordinat yoxdur", not coordinate_pattern.findall(address))

# Koordinat yalnız OSM-ə gedən sorğuda olmalıdır - bu, funksiyanın işidir.
overpass_calls = [d for url, d in REQUESTS if d is not None]
check("koordinat yalnız xəritə xidmətinə göndərilir",
      any("49.836" in urllib.parse.unquote(d.decode()) for d in overpass_calls))

# --- radius sərhədləri ---------------------------------------------------

places._cache.clear()
REQUESTS.clear()
places.find_nearby("pharmacy", 999999)
# Gövdə URL-kodlanmış gedir (around%3A10000), ona görə açırıq.
sent = urllib.parse.unquote(REQUESTS[-1][1].decode())
check(f"həddindən böyük radius {places.MAX_RADIUS_M} m-ə endirilir",
      f"around:{places.MAX_RADIUS_M}," in sent)

places._cache.clear()
REQUESTS.clear()
places.find_nearby("pharmacy", 5)
# Gövdə URL-kodlanmış gedir (around%3A10000), ona görə açırıq.
sent = urllib.parse.unquote(REQUESTS[-1][1].decode())
check("çox kiçik radius 200 m-ə qaldırılır", "around:200," in sent)

# --- keş ----------------------------------------------------------------

places._cache.clear()
REQUESTS.clear()
places.find_nearby("pharmacy", 800)
places.find_nearby("pharmacy", 800)
check("eyni sorğu təkrarlananda şəbəkəyə bir dəfə gedilir", len(REQUESTS) == 1)

# --- mövqenin təmizlənməsi ----------------------------------------------

places.clear_location()
check("clear_location() mövqeyi silir", places.has_location() is False)

# --- məsafə hesabı ------------------------------------------------------

# Bakı - Gəncə arası ~ 300 km (yoxlama üçün kobud aralıq)
distance = places._haversine_m(40.4093, 49.8671, 40.6828, 46.3606) / 1000
check(f"məsafə hesabı düzgündür (Bakı-Gəncə {distance:.0f} km)", 280 < distance < 320)

print("\nPASS: kateqoriya allowlist, radius sərhədləri, təkrarların silinməsi,")
print("      keş, məsafə hesabı və MƏXFİLİK (koordinat modelə getmir)")
