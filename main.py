"""VISION Assistant - PyCharm-dan bu faylı Run et."""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import ai
import browser
from config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# VISION-un öz portu. 8020 DEYİL: ElRegreso da 8020-dən istifadə edir, ikisi
# eyni anda işləyəndə brauzer 8020-ni açırdı və ekranda BAŞQA layihə görünürdü.
#
# SABİTDİR, axtarılmır. Əvvəl boş port skan edilirdi, amma ünvan hər dəfə
# dəyişirdi (8040, 8041, 8024...) - təqdimatda bu yaramır. İndi ünvan həmişə
# eynidir; port məşğuldursa bu, yalnız bir şey deməkdir: VISION-un əvvəlki
# nüsxəsi hələ işləyir. Səssizcə başqa porta qaçmaq orada zərərlidir -
# brauzerdə KÖHNƏ server açıq qalır və kodda etdiyin dəyişiklik görünmür.
PORT = 8040


def _port_is_free(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        # SO_REUSEADDR QOYULMUR: Windows-da o, MƏŞĞUL porta da bağlanmağa
        # icazə verir - yoxlama mənasız olur. Xam bind düzgün cavab verir.
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _open_when_ready(url: str, port: int, timeout: float = 60.0) -> None:
    """Brauzeri yalnız server CAVAB VERƏNDƏ açır.

    Sabit gecikmə (Timer(1.5, ...)) etibarsızdır: server gec qalxsa boş
    qapı döyülür, port başqası tərəfindən tutulubsa isə ekranda tamam
    başqa layihə açılır. Portu qısa fasilələrlə yoxlamaq hər ikisini həll edir.
    """
    import socket
    import time
    import webbrowser

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.4):
                webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.25)
    logging.warning("Server vaxtında qalxmadı. Brauzeri əl ilə aç: %s", url)


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title=settings.app_name)


class Turn(BaseModel):
    role: str
    content: str


class Location(BaseModel):
    """Brauzerdən gələn mövqe. Yalnız yaddaşda saxlanılır, diskə yazılmır."""

    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Turn] = Field(default_factory=list, max_length=20)
    # İstifadəçi yer icazəsi veribsə hər sorğu ilə gəlir; yoxdursa None.
    location: Location | None = None
    persona: str = Field(default="vision", max_length=20)


@app.get("/api/status")
def status():
    return {
        "ai": bool(settings.groq_api_key),
        "model": settings.ai_model,
        "google": google_status(),
    }


def google_status() -> dict:
    try:
        import google_tools
    except ImportError:
        return {"available": False, "connected": False}
    return {
        "available": google_tools.has_credentials(),
        "connected": google_tools.is_connected(),
    }


@app.post("/api/google/connect")
def google_connect():
    """Brauzerdə Google icazə pəncərəsi açır.

    Qəsdən ayrı endpoint: söhbət ortasında çağırılsaydı, icazə pəncərəsi
    bağlanana qədər sorğu kilidlənərdi.
    """
    import google_tools

    try:
        message = google_tools.connect()
    except google_tools.GoogleError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).warning("Google qoşulma xətası: %s", exc)
        raise HTTPException(status_code=502, detail="Google icazəsi alınmadı.") from exc
    # Alət siyahısı yenilənsin: qoşulmadan əvvəl credentials.json yeni əlavə
    # olunmuş ola bilər.
    import tools as tools_module

    tools_module.refresh_google()
    return {"ok": True, "message": message, "google": google_status()}


@app.post("/api/google/disconnect")
def google_disconnect():
    import google_tools

    return {"ok": True, "message": google_tools.disconnect(), "google": google_status()}


@app.post("/api/chat")
def chat(request: ChatRequest):
    import places

    # Mövqe hər sorğuda yenilənir. Köhnə koordinatın yaddaşda qalmaması üçün
    # gəlmədikdə təmizlənir - istifadəçi icazəni geri alsa dərhal itir.
    if request.location is None:
        places.clear_location()
    else:
        places.set_location(request.location.lat, request.location.lon, request.location.accuracy)

    history = [turn.model_dump() for turn in request.history if turn.role in ("user", "assistant")]
    english, azeri, source, performed = ai.reply(request.message.strip(), history,
                                                 request.persona)
    # Hansı əməliyyatın icra olunduğu interfeysdə görünsün - istifadəçi nə baş
    # verdiyini görməlidir, yalnız eşitməməlidir.
    # Uğursuz əməliyyatın SƏBƏBİ də göndərilir (ekranda görünsün - əvvəl yalnız
    # "✕" görünürdü və səbəbi yalnız server konsolunda qalırdı). Uğurlu
    # nəticələr göndərilmir: onlarda mail mətni kimi şəxsi data ola bilər.
    actions = [{"tool": item["tool"], "ok": item["ok"],
                **({} if item["ok"] else {"error": str(item["result"])[:200]})}
               for item in performed]
    # reply = səsləndirilən mətn (İngiliscə), reply_az = ekranda görünən.
    return {"reply": english, "reply_az": azeri, "source": source, "actions": actions}


MAX_AUDIO_BYTES = 8 * 1024 * 1024


@app.post("/api/listen")
async def listen(audio: UploadFile):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Boş səs faylı.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Səs faylı çox böyükdür.")
    try:
        text = ai.transcribe(data, audio.filename or "speech.webm")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # groq API xətaları
        logging.getLogger(__name__).warning("Səs tanıma alınmadı: %s", exc)
        raise HTTPException(status_code=502, detail="Səs tanıma xidmətinə müraciət alınmadı.") from exc
    return {"text": text}


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    # Ad allowlist-dən seçilir (voice.VOICES); naməlum ad sakitcə "vision"a düşür.
    persona: str = Field(default="vision", max_length=20)


@app.post("/api/speak")
def speak(request: SpeakRequest):
    """Dərin səsi WAV kimi qaytarır. Alınmasa 503 - brauzer öz TTS-inə qayıdır."""
    import voice

    try:
        data = voice.synthesize(request.text, request.persona)
    except voice.VoiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).warning("Səs sintezi xətası: %s", exc)
        raise HTTPException(status_code=503, detail="Səs sintezi alınmadı.") from exc
    return Response(content=data, media_type="audio/wav",
                    headers={"Cache-Control": "no-store"})


@app.get("/")
def index():
    # Dev rahatlığı: brauzer köhnə app.js-i keşdən götürməsin.
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store"})


class NoCacheStatic(StaticFiles):
    """Redaktə edilən JS/CSS brauzer keşindən gəlməsin deyə."""

    def is_not_modified(self, response_headers, request_headers) -> bool:
        return False

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-store, must-revalidate"
        return response


app.mount("/", NoCacheStatic(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import threading
    import uvicorn

    # Səhv interpretator seçilibsə bunu indi bilmək lazımdır, təqdimatın
    # ortasında "bacarmıram" cavabı ilə yox.
    if not browser.available():
        logging.warning("DİQQƏT: %s", browser.MISSING_PLAYWRIGHT)

    if not _port_is_free(PORT):
        raise SystemExit(
            f"\n  {PORT} portu məşğuldur — VISION artıq işləyir.\n"
            f"  Köhnəsini dayandır (PyCharm-da qırmızı kvadrat) və yenidən başlat,\n"
            f"  və ya sadəcə http://127.0.0.1:{PORT} ünvanını aç.\n")

    url = f"http://127.0.0.1:{PORT}"
    logging.info("VISION: %s", url)
    threading.Thread(target=_open_when_ready, args=(url, PORT), daemon=True).start()
    uvicorn.run("main:app", host="127.0.0.1", port=PORT, reload=True, reload_dirs=["."])
