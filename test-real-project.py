""""Let's go real project" əmri - SAXTA mini-layihə ilə (əsl Layihe5 işə düşmür).

İşə salmaq: python test-real-project.py
"""
import io
import socket
import sys
import tempfile
import time
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import ai
import tools

results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS — " if ok else "FAIL — ") + label)


# --- 1) İfadənin tanınması ---------------------------------------------------
for text in ("Let's go real project", "Let's go, real project!", "lets go real projects",
             "Let’s go to the real project.", "LET'S GO REAL PROJECT", "Okay, let's go real project"):
    check(f"tanınır: {text!r}", ai._REAL_PROJECT.search(text))
for text in ("Let's go", "What is a real project?", "Go to the real estate site",
             "Let's go to YouTube", "real project haqqında danış"):
    check(f"tanınmır: {text!r}", not ai._REAL_PROJECT.search(text))

# --- 2) Saxta layihə: kiçik HTTP server --------------------------------------
with socket.socket() as probe:
    probe.bind(("127.0.0.1", 0))
    port = probe.getsockname()[1]
fake = Path(tempfile.mkdtemp(prefix="fake-real-project-"))
(fake / "main.py").write_text(
    "import http.server, time\n"
    "time.sleep(1.5)   # real server kimi bir az gec qalxır\n"
    f"http.server.HTTPServer(('127.0.0.1', {port}), http.server.SimpleHTTPRequestHandler).serve_forever()\n",
    encoding="utf-8")

tools.REAL_PROJECT_DIR, tools.REAL_PROJECT_PORT = fake, port
opened = []
tools._open_in_browser = opened.append                 # brauzer açılmır, ünvan yazılır
model_calls = []
ai._complete = lambda *a, **k: model_calls.append(1)   # model çağırılsa görünsün

t = time.time()
en, az, src, performed = ai.reply("Let's go real project", [])
first = tools._real_project
check("layihə işə düşdü və port cavab verir", first is not None and tools._port_open(port))
check("server hazır olana qədər gözlədi, sonra açdı", opened == [f"http://127.0.0.1:{port}"])
check("cavab: işə düşdü", en.startswith("Let's go!") and performed[0]["ok"])
check("model ÇAĞIRILMADI (token yox)", not model_calls)
print(f"       {time.time() - t:.1f} s · EN: {en} · AZ: {az}")

en, az, src, performed = ai.reply("Let's go real project", [])
check("ikinci dəfə: yeni nüsxə başlatmır", tools._real_project is first)
check("ikinci dəfə: 'onsuz da işləyir' deyir və yenə açır", "already running" in en and len(opened) == 2)

first.terminate()
first.wait(timeout=10)

# --- 3) Dərhal çökən layihə: proses sınmır, aydın mesaj ----------------------
(fake / "main.py").write_text("raise SystemExit('broken')\n", encoding="utf-8")
en, az, src, performed = ai.reply("Let's go real project", [])
check("çökən layihə: aydın xəta, istisna yox", "couldn't start" in en and not performed[0]["ok"])
print(f"       AZ: {az}")

# --- 4) Əsl Layihe5 yolu düzgündür (işə salmadan) ---------------------------
real_dir = Path(ai.__file__).resolve().parent.parent / "Layihe5"
check("əsl Layihe5/main.py mövcuddur", (real_dir / "main.py").is_file())
check("PyCharm-ın QL\\.venv interpretatoru tapılır", Path(tools._project_python()).name == "python.exe")

print(f"\nNƏTİCƏ: {sum(results)}/{len(results)}")
sys.exit(0 if all(results) else 1)
