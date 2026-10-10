"""Dərin səs sintezi: Windows-un öz danışıq mühərriki (SAPI), SSML ilə.

Niyə brauzerin TTS-i yetmir: Web Speech API-də `pitch` 0-a qədər düşür və Chrome-un
uzaq səsləri onu ümumiyyətlə tətbiq etmir. Brauzerin TTS çıxışını Web Audio-ya
yönləndirmək də mümkün deyil, yəni sonradan emal edə bilmirik.

SAPI isə SSML-də `<prosody pitch="-10st">` qəbul edir - pitch sintez anında düşür,
nəticə qat-qat qalın olur. Əlavə paket tələb olunmur (PowerShell + System.Speech).

Yalnız Windows-da işləyir; alınmasa çağıran tərəf brauzer TTS-inə qayıdır.
"""

from __future__ import annotations

import logging
import platform
import subprocess
import tempfile
import uuid
from pathlib import Path
from xml.sax.saxutils import escape

from config import settings

log = logging.getLogger(__name__)

MAX_CHARS = 1200
TIMEOUT_SECONDS = 25


class VoiceError(Exception):
    """İstifadəçiyə göstərilə bilən xəta."""


def available() -> bool:
    return platform.system() == "Windows"


# Səsin XASİYYƏTİ - OpenAI TTS onu sözlə verilən təlimatla ifa edir.
# İstifadəçi istəyi: "AI kimi yox, axıcı, Vecna kimi danışsın". Aktyorun səsini
# təqlid etmirik - xarakterin danışıq tərzini təsvir edirik.
STYLES = {
    "vision": (
        "Voice: an ancient, patient, menacing presence, in the style of a dark fantasy "
        "villain like Vecna. Very deep, low and gravelly, slightly breathy. Speak at a "
        "brisk, natural conversational pace - smooth and flowing, words connected, only "
        "short pauses; never slow or drawn out. Calm and in total control - never "
        "shouting, a quiet and chilling certainty. Natural, fluid human delivery with "
        "every word clear; never robotic or monotone."
    ),
    "groot": (
        "Voice: a gentle giant tree creature. Very deep, warm and slow, cheerful and "
        "playful, full of kindness. Natural, fluid human delivery; never robotic."
    ),
}


def _openai_speech(text: str, persona: str) -> bytes:
    """OpenAI TTS: təbii, axıcı və xarakterli səs. Açar yoxdursa xəta atır."""
    if not settings.openai_api_key:
        raise VoiceError("OPENAI_API_KEY yoxdur.")
    import openai

    client = openai.OpenAI(api_key=settings.openai_api_key, max_retries=1, timeout=30)
    response = client.audio.speech.create(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        input=text,
        instructions=STYLES.get(persona) or STYLES["vision"],
        response_format="wav",
        speed=settings.openai_tts_speed,
    )
    return _fix_wav_sizes(response.read())


def _fix_wav_sizes(data: bytes) -> bytes:
    """OpenAI WAV-ı axınla göndərir və başlıqda ölçünü "naməlum" (0xFFFFFFFF)
    yazır - wave modulu 89 478 saniyəlik səs görürdü. Brauzerin decodeAudioData-sı
    buna həssasdır, ona görə RIFF və data ölçülərini faktiki uzunluğa görə yazırıq."""
    import struct

    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return data
    marker = data.find(b"data", 12)
    if marker < 0:
        return data
    fixed = bytearray(data)
    struct.pack_into("<I", fixed, 4, len(data) - 8)
    struct.pack_into("<I", fixed, marker + 4, len(data) - (marker + 8))
    return bytes(fixed)


def _neural(text: str) -> bytes:
    """Groq Orpheus ilə neyron səs. Alınmasa xəta atır, çağıran SAPI-yə keçir.

    Model ilk istifadədən əvvəl Groq konsolunda şərtlərin qəbulunu tələb edir
    (console.groq.com/playground?model=canopylabs%2Forpheus-v1-english).
    """
    import groq

    if not settings.groq_api_key or not settings.tts_model:
        raise VoiceError("Neyron TTS konfiqurasiya olunmayıb.")
    client = groq.Groq(api_key=settings.groq_api_key)
    response = client.audio.speech.create(
        model=settings.tts_model,
        voice=settings.tts_voice,
        input=text,
        response_format="wav",
    )
    return response.read()


# Səs xasiyyətləri. Ad ALLOWLIST-dir: istifadəçi mətni buradan keçmir, yalnız
# açar seçilir - SSML-ə heç vaxt kənar dəyər yazılmır.
VOICES = {
    "vision": {"pitch": settings.voice_pitch, "rate": settings.voice_rate,
               "sapi_rate": settings.voice_sapi_rate},
    # Groot: ağac kimi qalın və yavaş. Tonu aşağı salırıq; sürəti isə azca -
    # çox yavaş olsa nitq hecalara dağılır.
    "groot": {"pitch": "-18st", "rate": "86%", "sapi_rate": -2},
}


def synthesize(text: str, persona: str = "vision") -> bytes:
    """Mətni WAV bayt massivinə çevirir.

    Əvvəlcə neyron TTS (daha təbii), alınmasa Windows SAPI (oflayn, həmişə var).
    """
    clean = (text or "").strip()
    if not clean:
        raise VoiceError("Boş mətn.")
    clean = clean[:MAX_CHARS]

    # Sıra: OpenAI (Vecna xasiyyəti) -> Groq Orpheus (pulsuz, şərtlərin qəbulunu
    # tələb edir) -> Windows SAPI (robot kimi, amma həmişə var). Əvvəl Orpheus
    # şərtləri qəbul olunmadığı üçün HƏR cavab SAPI-yə düşürdü - "AI kimi"
    # səslənməsinin səbəbi bu idi (2026-10-09, xəta: model_terms_required).
    for engine in (lambda: _openai_speech(clean, persona), lambda: _neural(clean)):
        try:
            return engine()
        except Exception as exc:  # noqa: BLE001 - növbəti mühərrikə keç
            log.info("Neyron TTS alınmadı (%s), növbətisinə keçilir.", str(exc)[:120])

    if not available():
        raise VoiceError("Səs sintezi alınmadı: neyron TTS işləmir, SAPI yalnız Windows-dadır.")

    work = Path(tempfile.gettempdir()) / f"humanoid_{uuid.uuid4().hex}"
    ssml_path = work.with_suffix(".xml")
    wav_path = work.with_suffix(".wav")
    script_path = work.with_suffix(".ps1")

    # TƏHLÜKƏSİZLİK: mətn heç vaxt əmr sətrinə yapışdırılmır. XML-escape edilib
    # fayla yazılır, PowerShell-ə yalnız fayl yolları ötürülür. Beləcə nə əmr
    # inyeksiyası, nə də SSML-in pozulması mümkün olur.
    tone = VOICES.get(persona) or VOICES["vision"]
    ssml = (
        '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">'
        f'<prosody pitch="{tone["pitch"]}" rate="{tone["rate"]}">'
        f"{escape(clean)}"
        "</prosody></speak>"
    )
    ssml_path.write_text(ssml, encoding="utf-8")

    voice_name = settings.voice_name.replace("'", "''")
    script = f"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {{ $synth.SelectVoice('{voice_name}') }} catch {{ }}
$synth.Rate = {tone["sapi_rate"]}
$synth.SetOutputToWaveFile('{wav_path}')
$synth.SpeakSsml([System.IO.File]::ReadAllText('{ssml_path}', [System.Text.Encoding]::UTF8))
$synth.Dispose()
"""
    script_path.write_text(script, encoding="utf-8")

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-File", str(script_path)],
            capture_output=True, timeout=TIMEOUT_SECONDS,
        )
        if result.returncode != 0 or not wav_path.is_file():
            detail = result.stderr.decode("utf-8", errors="replace")[:200]
            raise VoiceError(f"Səs sintezi alınmadı: {detail}")
        return wav_path.read_bytes()
    except subprocess.TimeoutExpired as exc:
        raise VoiceError("Səs sintezi çox uzun çəkdi.") from exc
    finally:
        for path in (ssml_path, wav_path, script_path):
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
