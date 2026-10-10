from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    app_name: str = "VISION Assistant"
    groq_api_key: str = ""
    # Son ehtiyat: ikinci Groq hesabı. Yalnız Groq 1 VƏ OpenAI alınmayanda işləyir.
    groq_api_key_2: str = ""
    # Ehtiyat provayder: Groq limiti dolanda (429) və ya əlçatmaz olanda.
    # Açar boşdursa ehtiyat SÖNÜLÜDÜR və hər şey əvvəlki kimi işləyir.
    openai_api_key: str = ""
    fallback_model: str = "gpt-6-luna"   # ən ucuz: $0.10/M giriş, $0.50/M çıxış
    ai_model: str = "openai/gpt-oss-120b"
    stt_model: str = "whisper-large-v3"
    stt_language: str = ""  # bos = avtomatik askarlama

    # Canli internet axtarisi. Groq-un "compound" modelleri daxili web search
    # ile gelir - elave acar/xidmet teleb etmir, eyni GROQ_API_KEY isleyir.
    # Kohne adlar (compound-beta) hele qebul olunur; siyahi ilk isleyeni secir.
    search_model: str = "groq/compound"
    search_model_fallback: str = "compound-beta"

    # Neyron TTS (Groq Orpheus). Bos ise / alinmirsa Windows SAPI-ye kecir.
    # Qeyd: model Groq konsolunda birdefelik sertler qebulu teleb edir.
    # Təbii səs: OpenAI TTS təlimatla idarə olunur (Vecna xasiyyəti). OPENAI_API_KEY
    # yoxdursa bu addım atlanır. ~$0.0025 / 10 saniyəlik cavab.
    openai_tts_model: str = "gpt-4o-mini-tts"
    openai_tts_voice: str = "onyx"
    # Danışıq sürəti (1.0 = normal). İstifadəçi: "daha sürətli və axıcı danışsın".
    openai_tts_speed: float = 1.2
    tts_model: str = "canopylabs/orpheus-v1-english"
    tts_voice: str = "troy"

    # Deep "titan" sesi (Windows SAPI + SSML) - ehtiyat yol.
    voice_name: str = "Microsoft David Desktop"
    # VACIB: qalinligi YALNIZ pitch ile alrq, suret ile YOX. Evvel uc yerde
    # (SSML rate, SAPI rate, brauzerde playbackRate) ayri-ayri yavaslatma var
    # idi; onlar toplanib nitqi ~0.66x-e salir ve ses hecalara bolunurdu.
    voice_pitch: str = "-10st"   # yarimton: daha menfi = daha qalin (surete tesiri yoxdur)
    voice_rate: str = "100%"     # SSML-de 100% = NORMAL suret. Diqqet: "0%" sifir
                                 # suret demekdir, "-12%" ise etibarsizdir - hər
                                 # ikisi nitqi dartib hecalara bolurdu.
    voice_sapi_rate: int = 0     # SAPI suret: -10..10, 0 = tebii

    # Assistentin fayl axtara biləcəyi qovluqlar (";" ilə ayrılır).
    # Yalnız bunların içi oxunur - kənarda qalan hər şey bloklanır.
    file_roots: str = "%USERPROFILE%\\Documents;%USERPROFILE%\\Desktop"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
