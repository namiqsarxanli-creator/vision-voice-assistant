"""meetings() süzgəc/sıralama/format məntiqini saxta API ilə yoxlayır."""
import datetime as dt, io, json, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, r"C:\Users\USER\PycharmProjects\QL\MainLessons\HumanoidAssistant")
import google_tools as g

T = dt.date.today()
ROWS = [
    [(T).isoformat(), "09:00", "Bu gün görüş", "Ofis", "Yüksək", "Təsdiqlənib", ""],
    [(T + dt.timedelta(days=1)).strftime("%d.%m.%Y"), "12:00", "Sabahkı", "Zoom", "Orta", "", ""],
    [(T + dt.timedelta(days=5)).isoformat(), "15:00", "Həftə içi", "", "", "", "qeyd"],
    [(T + dt.timedelta(days=20)).isoformat(), "10:00", "Ay içi", "", "Aşağı", "", ""],
    [(T + dt.timedelta(days=90)).isoformat(), "10:00", "Çox uzaq", "", "", "", ""],
    [(T - dt.timedelta(days=3)).isoformat(), "10:00", "Keçmiş", "", "", "", ""],
    ["", "", "", "", "", "", ""],                      # boş sətir
    [(T + dt.timedelta(days=2)).isoformat(), "10:00", "", "", "", "", ""],   # adsız
    ["filan-tarix", "10:00", "Tanınmayan tarix", "", "", "", ""],
    [(T + dt.timedelta(days=3)).isoformat(), "08:00"],  # yarımçıq sətir
]

class FakeValues:
    def get(self, spreadsheetId, range): self.r = range; return self
    def execute(self): return {"values": ROWS}
class FakeSheets:
    def values(self): return FakeValues()
class FakeService:
    def spreadsheets(self): return FakeSheets()

g._service = lambda *a, **k: FakeService()
g.sheet_id = lambda: "FAKE"

checks, fails = 0, []
def check(label, ok):
    global checks; checks += 1
    print(("PASS — " if ok else "FAIL — ") + label)
    if not ok: fails.append(label)

out = g.meetings("today")
check("today: yalnız bugünkü", "Bu gün görüş" in out and "Sabahkı" not in out)
out = g.meetings("tomorrow")
check("tomorrow: DD.MM.YYYY formatı oxunur", "Sabahkı" in out)
out = g.meetings("week")
check("week: 5 gün sonrakı var, 20 gün sonrakı yox", "Həftə içi" in out and "Ay içi" not in out)
out = g.meetings("month")
check("month: 20 gün sonrakı var, 90 gün sonrakı yox", "Ay içi" in out and "Çox uzaq" not in out)
check("keçmiş görüş göstərilmir", "Keçmiş" not in out)
check("adsız sətir atılır", out.count("\n- ") == len([l for l in out.split("\n- ")]) - 1)
check("adsız yarımçıq sətir atılır (sınmadan)", "08:00" not in g.meetings("week"))
out_all = g.meetings("all")
check("all: tanınmayan tarix də daxildir", "Tanınmayan tarix" in out_all)
check("all: keçmiş də daxildir", "Keçmiş" in out_all)
out = g.meetings("today")
check("əlavə sütunlar mötərizədə", "(Ofis · Yüksək · Təsdiqlənib)" in out)
g.MAX_MEETINGS = 2
check("limit işləyir", "görüş daha)" in g.meetings("all"))
g.MAX_MEETINGS = 15
g.sheet_id = lambda: None
try:
    g.meetings("month"); check("cədvəl yoxdursa xəta", False)
except g.GoogleError as e:
    check("cədvəl yoxdursa aydın xəta", "setup-sheet" in str(e))

print(f"\nNƏTİCƏ: {checks - len(fails)}/{checks}" + (f" | keçməyən: {fails}" if fails else " — hamısı keçdi"))
