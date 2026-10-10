"""Yaxınlıqdakı yerləri tapır: xəstəxana, aptek, market, bank və s.

Niyə OpenStreetMap: Google Places API açar + ödəniş hesabı (billing) tələb edir.
OSM-in Overpass API-si pulsuzdur, açar istəmir və eyni məlumatı verir.

MƏXFİLİK - burada ən vacib qərar:
    Koordinat AI provayderinə (Groq) HEÇ VAXT getmir.
    Axın belədir:  brauzer → lokal server → OpenStreetMap
    Modelə yalnız hazır nəticə (ad, məsafə, ünvan) çatır, xam koordinat yox.
    Koordinat diskə də yazılmır - yalnız prosesin yaddaşında, bir sorğuluq saxlanılır.

TƏHLÜKƏSİZLİK: Overpass QL bir sorğu dilidir. Model heç vaxt sorğu YAZMIR -
aşağıdakı sabit CATEGORIES siyahısından SEÇİR. Beləcə sorğu inyeksiyası mümkün deyil.
"""

from __future__ import annotations

import json
import logging
import math
import time
import urllib.error
import urllib.parse
import urllib.request

log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
# OSM qaydaları real User-Agent tələb edir; olmadan sorğular bloklanır.
USER_AGENT = "VISION-assistant/1.0 (local personal assistant)"

TIMEOUT = 20
MAX_RESULTS = 8
DEFAULT_RADIUS_M = 2000
MAX_RADIUS_M = 10000
# Overpass-ı yormamaq üçün eyni sorğunu qısa müddət yaddaşda saxlayırıq.
CACHE_SECONDS = 120


class PlacesError(Exception):
    """İstifadəçiyə göstərilə bilən xəta."""


# --- İcazə verilən kateqoriyalar -----------------------------------------
# Açar: modelin seçdiyi ad. Dəyər: (OSM filtrləri, göstəriləcək ad).
CATEGORIES: dict[str, tuple[tuple[str, ...], str]] = {
    "hospital": (('["amenity"="hospital"]', '["amenity"="clinic"]'), "xəstəxana/klinika"),
    "pharmacy": (('["amenity"="pharmacy"]',), "aptek"),
    "supermarket": (('["shop"="supermarket"]', '["shop"="convenience"]'), "market"),
    "restaurant": (('["amenity"="restaurant"]',), "restoran"),
    "cafe": (('["amenity"="cafe"]',), "kafe"),
    "bank": (('["amenity"="bank"]',), "bank"),
    "atm": (('["amenity"="atm"]',), "bankomat"),
    "fuel": (('["amenity"="fuel"]',), "yanacaqdoldurma"),
    "police": (('["amenity"="police"]',), "polis"),
    "hotel": (('["tourism"="hotel"]', '["tourism"="guest_house"]'), "otel"),
    "park": (('["leisure"="park"]',), "park"),
    "school": (('["amenity"="school"]', '["amenity"="university"]'), "təhsil müəssisəsi"),
    "bus_stop": (('["highway"="bus_stop"]', '["amenity"="bus_station"]'), "avtobus dayanacağı"),
    "metro": (('["station"="subway"]', '["railway"="station"]'), "metro/stansiya"),
}


# --- Cari mövqe ----------------------------------------------------------
# Yalnız yaddaşda. Prosess bağlananda itir, diskə yazılmır.
_location: dict | None = None
_cache: dict[tuple, tuple[float, list[dict]]] = {}


def set_location(latitude: float, longitude: float, accuracy: float | None = None) -> None:
    """Brauzerdən gələn mövqeyi saxlayır (hər /api/chat sorğusunda yenilənir)."""
    global _location
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise PlacesError("Koordinat düzgün deyil.")
    _location = {"lat": float(latitude), "lon": float(longitude), "accuracy": accuracy}


def clear_location() -> None:
    global _location
    _location = None


def has_location() -> bool:
    return _location is not None


def _require_location() -> dict:
    if _location is None:
        raise PlacesError(
            "Mövqe məlum deyil. İstifadəçi interfeysdə 'MƏKAN' düyməsinə basıb "
            "brauzerə yer icazəsi verməlidir."
        )
    return _location


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


def _fetch(url: str, data: bytes | None = None) -> dict:
    # Pulsuz Overpass serveri yüklü olanda arabir 504 qaytarır, dərhal təkrar
    # sorğu isə adətən keçir (ölçülüb: 1-ci cəhd 504, 2-ci cəhd 200). Ona görə
    # server xətasında (5xx) BİR dəfə təkrar cəhd edirik. Alternativ serverlər
    # (kumi, private.coffee) yoxlananda 500 verdi - onlara keçmirik.
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
    for attempt in (1, 2):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8", errors="replace"))
        except urllib.error.HTTPError as exc:
            if exc.code >= 500 and attempt == 1:
                time.sleep(1)
                continue
            if exc.code == 429:
                raise PlacesError("Xəritə xidməti limitə çatdı, bir azdan yenidən sına.") from exc
            raise PlacesError(f"Xəritə xidməti cavab vermədi ({exc.code}).") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise PlacesError("Xəritə xidmətinə çıxış alınmadı (internet?).") from exc
        except json.JSONDecodeError as exc:
            raise PlacesError("Xəritə xidməti gözlənilməz cavab verdi.") from exc
    raise PlacesError("Xəritə xidməti cavab vermədi.")


def where_am_i() -> str:
    """Cari mövqeyin ünvanını qaytarır (əks geokodlaşdırma)."""
    location = _require_location()
    query = urllib.parse.urlencode({
        "format": "jsonv2",
        "lat": location["lat"],
        "lon": location["lon"],
        "zoom": 16,
        "accept-language": "az,en",
    })
    data = _fetch(f"{NOMINATIM_URL}?{query}")
    address = data.get("display_name")
    if not address:
        raise PlacesError("Ünvan tapılmadı.")
    accuracy = location.get("accuracy")
    suffix = f" (dəqiqlik ~{int(accuracy)} m)" if accuracy else ""
    return f"Cari yer: {address}{suffix}"


# "health" ayrıca kateqoriya deyil - aptek və xəstəxananı BİR alət çağırışında
# və BİR Overpass sorğusunda qaytarır. Niyə:
#  - model onları iki ayrı çağırışla axtaranda bir sual 3 API sorğusu edirdi
#    (~8K token) və Groq-un dəqiqəlik 8K limitinə dirənib 429 verirdi;
#  - pulsuz Overpass serveri yüklü olanda 504 verir (ölçülüb); iki sorğu əvəzinə
#    bir sorğu həm serverə az yükdür, həm də uğursuzluq ehtimalı yarıdır.
HEALTH = ("pharmacy", "hospital")

# Xidmət xətası "yaxınlıqda heç nə yoxdur" kimi danışılmamalıdır - model əvvəl
# məhz belə edirdi (Overpass 504 verəndə "aptek tapılmadı" dedi).
SERVICE_DOWN = ("Bu, yaxınlıqda belə yer OLMADIĞI demək deyil - xəritə xidməti "
                "müvəqqəti cavab vermir. İstifadəçiyə bir azdan yenidən soruşmasını de.")


def find_nearby(category: str, radius_m: int = DEFAULT_RADIUS_M) -> str:
    """Yaxınlıqdakı yerləri məsafəyə görə sıralayıb qaytarır."""
    location = _require_location()
    key = (category or "").strip().lower()
    keys = HEALTH if key == "health" else (key,)
    if any(item not in CATEGORIES for item in keys):
        raise PlacesError(f"'{category}' kateqoriyası yoxdur. Mövcudlar: "
                          f"{', '.join(sorted([*CATEGORIES, 'health']))}")

    try:
        radius = int(radius_m)
    except (TypeError, ValueError):
        radius = DEFAULT_RADIUS_M
    radius = max(200, min(radius, MAX_RADIUS_M))

    try:
        found = _search(keys, radius, location)
    except PlacesError as exc:
        raise PlacesError(f"{exc} {SERVICE_DOWN}") from None
    return "\n\n".join(_format(found[item], CATEGORIES[item][1], radius) for item in keys)


def _classify(tags: dict, keys: tuple[str, ...]) -> str | None:
    """Element hansı kateqoriyaya aiddir - filtrdəki açar=dəyər cütünə görə."""
    for key in keys:
        for osm_filter in CATEGORIES[key][0]:
            name, value = osm_filter.strip("[]").split("=", 1)
            if tags.get(name.strip('"')) == value.strip('"'):
                return key
    return None


def _search(keys: tuple[str, ...], radius: int, location: dict) -> dict[str, list[dict]]:
    lat, lon = location["lat"], location["lon"]
    cache_key = (keys, radius, round(lat, 4), round(lon, 4))
    cached = _cache.get(cache_key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    # Sorğu yalnız sabit filtrlərdən qurulur - istifadəçi mətni buraya düşmür.
    parts = []
    for key in keys:
        for osm_filter in CATEGORIES[key][0]:
            for element in ("node", "way", "relation"):
                parts.append(f"{element}{osm_filter}(around:{radius},{lat},{lon});")
    query = (f"[out:json][timeout:{TIMEOUT}];({''.join(parts)});"
             f"out center {MAX_RESULTS * 4 * len(keys)};")
    data = _fetch(OVERPASS_URL, data=urllib.parse.urlencode({"data": query}).encode())

    found: dict[str, list[dict]] = {key: [] for key in keys}
    for element in data.get("elements", []):
        tags = element.get("tags", {}) or {}
        name = tags.get("name") or tags.get("brand")
        if not name:
            continue  # adsız nöqtələr istifadəçiyə heç nə demir
        # Tək kateqoriyada təsnifat lazım deyil: sorğu onsuz da yalnız o növü
        # qaytarır. Birləşmiş sorğuda (health) isə element teqinə görə ayrılır.
        key = keys[0] if len(keys) == 1 else _classify(tags, keys)
        if key is None:
            continue
        point_lat = element.get("lat") or (element.get("center") or {}).get("lat")
        point_lon = element.get("lon") or (element.get("center") or {}).get("lon")
        if point_lat is None or point_lon is None:
            continue
        found[key].append({
            "name": name,
            "distance": _haversine_m(lat, lon, point_lat, point_lon),
            "lat": point_lat,
            "lon": point_lon,
            "street": tags.get("addr:street", ""),
            "house": tags.get("addr:housenumber", ""),
            "phone": tags.get("phone") or tags.get("contact:phone", ""),
            "hours": tags.get("opening_hours", ""),
        })

    result: dict[str, list[dict]] = {}
    for key, items in found.items():
        # Eyni obyekt həm node, həm way kimi gələ bilər - adı təkrarlamırıq.
        unique, seen = [], set()
        for item in sorted(items, key=lambda x: x["distance"]):
            if item["name"].lower() in seen:
                continue
            seen.add(item["name"].lower())
            unique.append(item)
        result[key] = unique[:MAX_RESULTS]
    _cache[cache_key] = (time.time(), result)
    return result


def _format(found: list[dict], label: str, radius: int) -> str:
    if not found:
        return f"{radius} metr radiusda {label} tapılmadı. Radiusu artırmağı sınaya bilərsən."

    lines = []
    for index, item in enumerate(found, 1):
        distance = item["distance"]
        away = f"{int(distance)} m" if distance < 1000 else f"{distance / 1000:.1f} km"
        address = " ".join(p for p in (item["street"], item["house"]) if p)
        extra = [bit for bit in (address, item["phone"], item["hours"]) if bit]
        tail = (" — " + " · ".join(extra)) if extra else ""
        lines.append(f"{index}. {item['name']} — {away}{tail}")

    body = "\n".join(lines)
    return (
        f"--- Yaxınlıqdakı {label} ({radius} m radius, OpenStreetMap məlumatı) ---\n"
        f"{body}\n"
        "Qeyd: bu, xəritə bazasından gələn məlumatdır; iş saatları və nömrələr köhnə ola bilər."
    )


SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "where_am_i",
            "description": "Cari ünvanı qaytarır.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_nearby",
            "description": "Yaxınlıqdakı yerləri məsafəyə görə tapır.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "enum": sorted([*CATEGORIES, "health"]),
                                 "description": "health = aptek + xəstəxana birlikdə."},
                    "radius_m": {"type": "integer", "description": f"Metr, 200-{MAX_RADIUS_M}."},
                },
                "required": ["category"],
            },
        },
    },
]

HANDLERS = {
    "where_am_i": where_am_i,
    "find_nearby": find_nearby,
}
