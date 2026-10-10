"""add_meeting: yoxlamalar + "yalnız append" zəmanəti (saxta API)."""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, r"C:\Users\USER\PycharmProjects\QL\MainLessons\HumanoidAssistant")
import google_tools as g

CALLS, ROWS = [], []

class FakeValues:
    def append(self, spreadsheetId, range, valueInputOption, insertDataOption, body):
        CALLS.append(("append", insertDataOption)); ROWS.append(body["values"][0]); return self
    def update(self, **k): CALLS.append(("update", k)); return self
    def clear(self, **k): CALLS.append(("clear", k)); return self
    def get(self, **k): CALLS.append(("get", k)); return self
    def execute(self): return {}
class FakeSheets:
    def values(self): return FakeValues()
    def batchUpdate(self, **k): CALLS.append(("batchUpdate", k)); return FakeValues()
class FakeService:
    def spreadsheets(self): return FakeSheets()

g._service = lambda *a, **k: FakeService()
g.sheet_id = lambda: "FAKE"

checks, fails = 0, []
def check(label, ok):
    global checks; checks += 1
    print(("PASS — " if ok else "FAIL — ") + label)
    if not ok: fails.append(label)

def rejects(label, **kwargs):
    try:
        g.add_meeting(**kwargs); check(label, False)
    except g.GoogleError: check(label, True)

out = g.add_meeting("2026-10-03", "Diş həkimi", time="14:30", who="Klinika",
                    priority="yüksək", note="sənədləri götür")
check("əlavə olunur", "2026-10-03 14:30" in out and "Diş həkimi" in out)
check("tarix normallaşır (ISO)", ROWS[-1][0] == "2026-10-03")
check("vaciblik siyahıya uyğunlaşır (kiçik hərf -> Yüksək)", ROWS[-1][4] == "Yüksək")
check("status avtomatik dolur", ROWS[-1][5] == "Planlaşdırılıb")
check("7 sütun yazılır", len(ROWS[-1]) == 7)

g.add_meeting("03.10.2026", "İkinci format")
check("DD.MM.YYYY qəbul olunur", ROWS[-1][0] == "2026-10-03")
g.add_meeting("2026-10-04", "Nöqtəli saat", time="9.15")
check("nöqtə iki nöqtəyə çevrilir (9.15 -> 9:15)", ROWS[-1][1] == "9:15")
g.add_meeting("2026-10-05", "Uydurma vaciblik", priority="ÇOX VACİB")
check("siyahıdan kənar vaciblik boş qalır", ROWS[-1][4] == "")
g.add_meeting("2026-10-06", "  çox   boşluqlu    ad  ")
check("boşluqlar səliqəyə salınır", ROWS[-1][2] == "çox boşluqlu ad")
g.add_meeting("2026-10-07", "X" * 500)
check("uzun mətn kəsilir", len(ROWS[-1][2]) == g.MAX_FIELD_CHARS)

rejects("tanınmayan tarix rədd edilir", date="filan vaxt", name="Test")
rejects("boş ad rədd edilir", date="2026-10-03", name="   ")
rejects("yanlış saat rədd edilir", date="2026-10-03", name="Test", time="25:99")
rejects("saat mətn olsa rədd edilir", date="2026-10-03", name="Test", time="axşam")

kinds = {call[0] for call in CALLS}
check("YALNIZ append çağırılıb (update/clear/batchUpdate yoxdur)", kinds == {"append"})
check("sətir əlavə rejimi INSERT_ROWS", all(c[1] == "INSERT_ROWS" for c in CALLS))
check("modelin alət siyahısında silmə/redaktə yoxdur",
      not any(w in t["function"]["name"] for t in g.SCHEMA for w in ("delete", "update", "remove")))

g.sheet_id = lambda: None
rejects("cədvəl yoxdursa aydın xəta", date="2026-10-03", name="Test")

print(f"\nNƏTİCƏ: {checks - len(fails)}/{checks}" + (f" | keçməyən: {fails}" if fails else " — hamısı keçdi"))
