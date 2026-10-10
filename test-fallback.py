"""Groq -> OpenAI ehtiyat keçidi - saxta klientlərlə, pulsuz və internetsiz.

İşə salmaq: python test-fallback.py
"""
import io
import sys
import time
import types

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import groq
import httpx
import openai

import ai
from config import settings

results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS — " if ok else "FAIL — ") + label)


def reply_obj(text=None, tool_calls=None, extra=None):
    """Hər iki SDK-nın cavab formasını təqlid edir."""
    message = types.SimpleNamespace(content=text, tool_calls=tool_calls)
    dump = {"role": "assistant", "content": text, **(extra or {})}
    if tool_calls:
        dump["tool_calls"] = [{"id": c.id, "type": "function",
                               "function": {"name": c.function.name, "arguments": c.function.arguments}}
                              for c in tool_calls]
    message.model_dump = lambda **_: dump
    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message, finish_reason="stop")],
                                 usage=None)


def rate_limit(msg="Error code: 429 - {'error': {'message': 'Rate limit reached for model on tokens per day (TPD): Limit 200000, Used 199800. Please try again in 6m22.3s.', 'code': 'rate_limit_exceeded'}}"):
    return groq.RateLimitError(msg, response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body=None)


class FakeClient:
    def __init__(self, behaviour):
        self.calls, self.behaviour = [], behaviour
        self.chat = types.SimpleNamespace(completions=types.SimpleNamespace(create=self.create))

    def with_options(self, **_):
        return self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        result = self.behaviour(kwargs, len(self.calls))
        if isinstance(result, Exception):
            raise result
        return result


def setup(groq_behaviour, openai_behaviour=None, groq2_behaviour=None):
    for name in ai._down_until:
        ai._down_until[name] = 0.0
    ai._openai_reasoning_ok = True
    g, o = FakeClient(groq_behaviour), (FakeClient(openai_behaviour) if openai_behaviour else None)
    g2 = FakeClient(groq2_behaviour) if groq2_behaviour else None
    ai._get_client = lambda: g
    ai._get_fallback = lambda: o
    ai._get_client2 = lambda: g2
    setup.groq2 = g2
    return g, o


answer = lambda text: (lambda kw, n: reply_obj(text))

# --- 1) Ehtiyat yoxdursa: hər şey əvvəlki kimidir ---------------------------
g, o = setup(answer("Hello there.\n---AZ---\nSalam."))
en, az, src, _ = ai.reply("Hi", [])
check("ehtiyatsız: Groq cavab verir", en == "Hello there." and src == "ai")
check("ehtiyatsız: reasoning_effort=low Groq-a gedir", g.calls[0].get("reasoning_effort") == "low")

g, o = setup(lambda kw, n: rate_limit())
en, az, src, _ = ai.reply("Hi", [])
check("ehtiyatsız + 429: əvvəlki kimi aydın limit mesajı", "Rate limit" in en or "quota" in en.lower())

# --- 2) Groq 429 -> OpenAI ---------------------------------------------------
g, o = setup(lambda kw, n: rate_limit(), answer("Backup answer.\n---AZ---\nEhtiyat cavab."))
before = time.time()
en, az, src, _ = ai.reply("Hi", [])
check("429-da OpenAI cavab verir", en == "Backup answer." and az == "Ehtiyat cavab.")
check("mənbə 'openai' (ekranda EHTİYAT görünür)", src == "openai")
check("OpenAI-yə ehtiyat modeli göndərilir", o.calls[0]["model"] == settings.fallback_model)
check("OpenAI-yə temperature göndərilmir", "temperature" not in o.calls[0])
check("OpenAI-də max_completion_tokens işlənir", "max_completion_tokens" in o.calls[0] and "max_tokens" not in o.calls[0])
check("Groq-un gözləmə müddəti mesajdan oxunur (~382 s)", 370 < ai._down_until["groq"] - before < 395)

groq_calls = len(g.calls)
en, az, src, _ = ai.reply("Again", [])
check("gözləmə müddətində Groq ümumiyyətlə çağırılmır", len(g.calls) == groq_calls and src == "openai")

# --- 3) Sual ortasında keçid: Groq-un əlavə sahələri təmizlənir --------------
call = types.SimpleNamespace(id="call_1", function=types.SimpleNamespace(name="system_info", arguments="{}"))
def groq_then_limit(kw, n):
    return reply_obj(None, [call], extra={"reasoning": "gizli düşüncə", "channel": "x"}) if n == 1 else rate_limit()
g, o = setup(groq_then_limit, answer("Done.\n---AZ---\nHazırdır."))
en, az, src, performed = ai.reply("System info", [])
sent = o.calls[0]["messages"]
assistant_msg = next(m for m in sent if m["role"] == "assistant")
check("alət Groq-da icra olunub, cavab OpenAI-dən", performed and en == "Done." and src == "openai")
check("Groq-un 'reasoning' sahəsi OpenAI-yə getmir", "reasoning" not in assistant_msg and "channel" not in assistant_msg)
check("alət çağırışı və nəticəsi OpenAI-yə ötürülür",
      assistant_msg["tool_calls"][0]["id"] == "call_1" and any(m["role"] == "tool" for m in sent))

# --- 4) Model reasoning_effort qəbul etmirsə: bir dəfə öyrənir ---------------
def picky(kw, n):
    if "reasoning_effort" in kw:
        return openai.BadRequestError("Unsupported parameter: 'reasoning_effort'",
                                      response=httpx.Response(400, request=httpx.Request("POST", "https://x")), body=None)
    return reply_obj("Fine.\n---AZ---\nYaxşı.")
g, o = setup(lambda kw, n: rate_limit(), picky)
en, *_ = ai.reply("Hi", [])
check("reasoning_effort rədd olunanda onsuz təkrar", en == "Fine.")
calls_now = len(o.calls)
ai.reply("Hi again", [])
check("sonrakı çağırışda reasoning_effort artıq göndərilmir",
      len(o.calls) == calls_now + 1 and "reasoning_effort" not in o.calls[-1])

# --- 5) Hər iki provayder uğursuz: proses sınmır, aydın mesaj --------------
g, o = setup(lambda kw, n: rate_limit(),
             lambda kw, n: openai.AuthenticationError("Incorrect API key",
                 response=httpx.Response(401, request=httpx.Request("POST", "https://x")), body=None))
en, az, src, _ = ai.reply("Hi", [])
check("hər ikisi uğursuz: istisna yox, mesaj qaytarılır", en and src == "demo")

# --- 6) Gözləmə müddətinin oxunması ----------------------------------------
check("'try again in 14.17s' -> 14 s", 14 <= ai._retry_after(Exception("try again in 14.17s")) <= 15)
check("'try again in 1h2m' -> 30 dəq tavan", ai._retry_after(Exception("try again in 1h2m")) == 1800)
check("mesajsız -> 60 s", ai._retry_after(Exception("boom")) == 60)

# --- 7) Üçüncü pillə: Groq 2 (yalnız Groq 1 və OpenAI alınmayanda) ------------
def insufficient(kw, n):
    return openai.RateLimitError("Error code: 429 - insufficient_quota: You exceeded your current quota",
                                 response=httpx.Response(429, request=httpx.Request("POST", "https://x")), body=None)


g, o = setup(lambda kw, n: rate_limit(), insufficient, answer("Third.\n---AZ---\nÜçüncü."))
en, az, src, _ = ai.reply("Hi", [])
check("Groq 1 limit + OpenAI balans bitib -> Groq 2 cavab verir", en == "Third." and src == "groq2")
check("OpenAI balans bitəndə uzun fasilə (30 dəq)", ai._down_until["openai"] - time.time() > 1700)
g2_calls = len(setup.groq2.calls)
ai.reply("Again", [])
check("sonrakı sual birbaşa Groq 2-yə gedir (1 və OpenAI atlanır)",
      len(setup.groq2.calls) == g2_calls + 1 and len(o.calls) == 1)

g, o = setup(answer("Primary.\n---AZ---\nƏsas."), answer("x"), answer("y"))
en, *_ = ai.reply("Hi", [])
check("Groq 1 işləyəndə nə OpenAI, nə Groq 2 çağırılır",
      en == "Primary." and not o.calls and not setup.groq2.calls)

g, o = setup(lambda kw, n: rate_limit(), answer("Backup.\n---AZ---\nEhtiyat."), answer("y"))
en, az, src, _ = ai.reply("Hi", [])
check("OpenAI işləyirsə Groq 2-yə toxunulmur", src == "openai" and not setup.groq2.calls)


def suspended(kw, n):
    return groq.AuthenticationError("Error code: 401 - invalid_api_key (organization suspended)",
                                    response=httpx.Response(401, request=httpx.Request("POST", "https://x")), body=None)


g, o = setup(suspended, None, answer("Second account.\n---AZ---\nİkinci hesab."))
en, az, src, _ = ai.reply("Hi", [])
check("Groq 1 hesabı dayandırılıbsa (401) Groq 2-yə keçir", src == "groq2" and en == "Second account.")

g, o = setup(lambda kw, n: rate_limit(), insufficient, lambda kw, n: rate_limit())
en, az, src, _ = ai.reply("Hi", [])
check("üçü də limitdə: istisna yox, aydın limit mesajı", src == "demo" and en)
for name in ai._down_until:
    ai._down_until[name] = time.time() + 999
g.calls.clear()
ai.reply("Hi", [])
check("hamısı gözləmədə olsa da birincisi yenidən sınanır", len(g.calls) == 1)

print(f"\nNƏTİCƏ: {sum(results)}/{len(results)}")
sys.exit(0 if all(results) else 1)
