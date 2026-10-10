"""Sağlamlıq axını və cavab formatı qoruyucuları - modelsiz, internetsiz.

İşə salmaq: python test-health.py
"""
import io
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import ai
import places
import tools

results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS — " if ok else "FAIL — ") + label)


# --- 1) Təkrar öskürək: modelsiz qısa arzu ---------------------------------
offered = [{"role": "user", "content": "*cough*"},
           {"role": "assistant", "content": "Would you like me to find nearby pharmacies and hospitals?"}]
clean = [{"role": "assistant", "content": "YouTube is open."}]
for message in ("*cough*", "(coughing)", "[COUGH]", "Cough, cough.", "*öskürür*", "Öhö öhö"):
    check(f"təkrar öskürək tanınır: {message!r}", ai._repeat_cough_reply(message, offered) is not None)
check("ilk öskürək modelə gedir (təklif üçün)", ai._repeat_cough_reply("*cough*", clean) is None)
check("əsl sual modelə gedir", ai._repeat_cough_reply("I have a cough, find a pharmacy", offered) is None)
check("razılıq modelə gedir", ai._repeat_cough_reply("Bəli, tap", offered) is None)

# --- 2) AZ hissəsinə düşmüş ingiliscə cümlə səsləndirilən hissəyə köçür ------
en, az, moved = ai._rescue_english(
    "Get well soon!", "Tezliklə sağal! Would you like me to find nearby pharmacies and hospitals?")
check("ingiliscə sual EN-ə köçür", "Would you like" in en and "Would" not in az and moved)
en, az, moved = ai._rescue_english("Done.", "Hazırdır. Aptekləri tapımmı?")
check("azərbaycanca cümləyə toxunulmur", not moved and az == "Hazırdır. Aptekləri tapımmı?")

# --- 3) Uzunluq həddi -------------------------------------------------------
check("4 cümlə 3-ə qısalır", ai._trim_spoken("One. Two. Three. Four.") == "One. Two. Three.")
check("saat və onluq ədəd bölünmür",
      ai._trim_spoken("It is at 10:00. It costs 3.5 AZN.") == "It is at 10:00. It costs 3.5 AZN.")
check("çox uzun cümlə söz sərhədində kəsilir",
      len(ai._trim_spoken("word " * 120)) <= ai.MAX_SPOKEN_CHARS + 1)

# --- 4) health: bir sorğu, iki bölmə, xidmət xətası "yoxdur" deyil ----------
REQUESTS = []
FAKE = {"elements": [
    {"type": "node", "lat": 40.3714, "lon": 49.8367, "tags": {"amenity": "pharmacy", "name": "Aptek A"}},
    {"type": "node", "lat": 40.3724, "lon": 49.8377, "tags": {"amenity": "hospital", "name": "Xəstəxana B"}},
    {"type": "way", "center": {"lat": 40.3734, "lon": 49.8387}, "tags": {"amenity": "clinic", "name": "Klinika C"}},
]}


def fake_fetch(url, data=None):
    REQUESTS.append(url)
    return FAKE


original = places._fetch
places._fetch = fake_fetch
places.set_location(40.3709, 49.8366, 50)
places._cache.clear()
text, ok = tools.run("find_nearby", {"category": "health"})
pharmacy_part, _, hospital_part = text.partition("\n\n")
check("health bir HTTP sorğusu edir", ok and len(REQUESTS) == 1)
check("aptek öz bölməsindədir", "Aptek A" in pharmacy_part and "Xəstəxana B" not in pharmacy_part)
check("xəstəxana və klinika öz bölməsindədir", "Xəstəxana B" in hospital_part and "Klinika C" in hospital_part)


def down(url, data=None):
    raise places.PlacesError("Xəritə xidməti cavab vermədi (504).")


places._fetch = down
places._cache.clear()
text, ok = tools.run("find_nearby", {"category": "health"})
check("xidmət xətası 'yer yoxdur' kimi deyil", not ok and "OLMADIĞI demək deyil" in text)
places._fetch = original
places.clear_location()

print(f"\nNƏTİCƏ: {sum(results)}/{len(results)}")
sys.exit(0 if all(results) else 1)
