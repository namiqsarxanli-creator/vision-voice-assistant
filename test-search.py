"""İnternet axtarışı: browser_search, brauzerə keçid və "Google" marşrutu - oflayn.

İşə salmaq: python test-search.py
"""
import io
import sys
import types

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import groq

import ai
import browser
import tools

results = []


def check(label, ok):
    results.append(bool(ok))
    print(("PASS — " if ok else "FAIL — ") + label)


def message(text):
    return types.SimpleNamespace(choices=[types.SimpleNamespace(
        message=types.SimpleNamespace(content=text, executed_tools=None))])


class FakeGroq:
    """groq.Groq əvəzi: hər çağırışı yazır, cavabı behaviour verir."""
    calls, behaviour = [], None

    def __init__(self, **_):
        self.chat = types.SimpleNamespace(completions=types.SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        FakeGroq.calls.append(kwargs)
        result = FakeGroq.behaviour(kwargs)
        if isinstance(result, Exception):
            raise result
        return result


groq.Groq = FakeGroq
shown = []
browser.search_web = lambda q: shown.append(q) or "Nəticələr açıldı:\n1. AI News\n2. MIT AI"

# --- 1) Əsas yol: gpt-oss + daxili browser_search ---------------------------
FakeGroq.calls, shown[:] = [], []
FakeGroq.behaviour = lambda kw: message("AI regulation talks began this week【1†L1-L4】.")
text, ok = tools.run("web_search", {"query": "AI news"})
first = FakeGroq.calls[0]
check("ilk cəhd əsas model + browser_search", first["model"] == tools.settings.ai_model
      and first.get("tools") == [{"type": "browser_search"}])
check("istinad işarələri təmizlənir", ok and "【" not in text and "AI regulation" in text)
check("brauzer AÇILMIR (sakit axtarış)", not shown)

# --- 2) browser_search alınmasa köhnə compound adları sınanır ----------------
FakeGroq.calls = []
FakeGroq.behaviour = lambda kw: (RuntimeError("browser_search unavailable") if kw.get("tools")
                                 else message("Compound answer."))
text, ok = tools.run("web_search", {"query": "AI news"})
check("compound ehtiyatı işləyir", ok and text.startswith("Compound answer") and len(FakeGroq.calls) == 2)

# --- 3) Hamısı alınmasa: nəticələr EKRANDA açılır ----------------------------
FakeGroq.calls, shown[:] = [], []
FakeGroq.behaviour = lambda kw: RuntimeError("Error code: 429 - rate_limit_exceeded")
text, ok = tools.run("web_search", {"query": "AI news"})
check("Groq uğursuz: brauzer axtarışına keçir", ok and shown == ["AI news"] and "AI News" in text)

# --- 4) "Google" deyiləndə model web_search seçsə də search_web işləyir ------
executed = []
real_run = tools.run
tools.run = ai.tools.run = lambda n, a: executed.append((n, a)) or ("Nəticələr açıldı.", True)
call = types.SimpleNamespace(id="c1", function=types.SimpleNamespace(name="web_search",
                                                                     arguments='{"query": "AI articles"}'))
def scripted(messages, **_):
    first_round = not any(m.get("role") == "tool" for m in messages)
    msg = types.SimpleNamespace(content=None if first_round else "Results are on screen.\n---AZ---\nNəticələr ekrandadır.",
                                tool_calls=[call] if first_round else None)
    msg.model_dump = lambda **_: {"role": "assistant", "content": msg.content,
                                  "tool_calls": [{"id": "c1", "type": "function",
                                                  "function": {"name": "web_search", "arguments": '{"query": "AI articles"}'}}]}
    return types.SimpleNamespace(choices=[types.SimpleNamespace(message=msg)], usage=None), "groq"
ai._complete = scripted
ai.reply("Search AR articles on Google.", [])
check("'on Google' -> search_web icra olunur", executed and executed[0][0] == "search_web"
      and executed[0][1] == {"query": "AI articles"})
executed.clear()
ai.reply("What's the weather in Baku?", [])
check("Google yoxdursa web_search toxunulmur", executed and executed[0][0] == "web_search")

print(f"\nNƏTİCƏ: {sum(results)}/{len(results)}")
sys.exit(0 if all(results) else 1)
