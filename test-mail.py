"""Mail axınının testi: oxuma + qaralama.

Google API saxta (mock) obyektlə əvəz olunur, ona görə real hesab, şəbəkə və
credentials.json lazım deyil. Yoxlanan şeylər:
  - MIME hissələrindən düzgün mətnin çıxarılması (text/plain, HTML, iç-içə),
  - cavabın düzgün alıcıya və düzgün söhbət zəncirinə (thread) düşməsi,
  - "Re:" prefiksinin iki dəfə yazılmaması,
  - qaralamanın YALNIZ drafts.create ilə yaradılması - heç bir send çağırışı,
  - boş/qısa girişlərin rədd edilməsi.

İşə salmaq:  .venv/Scripts/python.exe test-mail.py
"""

from __future__ import annotations

import base64
import io
import sys

# Windows konsolu default olaraq cp1252-dir: Azərbaycan hərfləri çıxışı sındırır.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from email import message_from_bytes
from email.policy import default as default_policy
from email.header import decode_header, make_header

import google_tools


def b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode()


# --- saxta Gmail servisi -------------------------------------------------

SENT_CALLS: list[str] = []      # hər hansı göndərmə cəhdi buraya düşər
CREATED_DRAFTS: list[dict] = []

ORIGINAL = {
    "id": "msg-1",
    "threadId": "thread-9",
    "snippet": "Qisa on baxis",
    "payload": {
        "headers": [
            {"name": "From", "value": "Aysel Quliyeva <aysel@example.com>"},
            {"name": "Subject", "value": "Görüş vaxtı"},
            {"name": "Date", "value": "Mon, 15 Sep 2026 10:00:00 +0400"},
            {"name": "Message-ID", "value": "<abc123@example.com>"},
            {"name": "References", "value": "<older@example.com>"},
        ],
        "mimeType": "multipart/alternative",
        "parts": [
            {"mimeType": "text/html", "body": {"data": b64("<p>HTML <b>variant</b></p>")}},
            {"mimeType": "text/plain", "body": {"data": b64("Salam, sabah saat 14:00 uygundurmu?")}},
        ],
    },
}


class FakeMessages:
    def list(self, userId, q, maxResults):
        self._last = {"messages": [{"id": "msg-1"}]} if "bostapmaz" not in q else {}
        return self

    def get(self, userId, id, format=None, metadataHeaders=None):
        self._last = ORIGINAL
        return self

    def execute(self):
        return self._last


class FakeDrafts:
    def create(self, userId, body):
        CREATED_DRAFTS.append(body)
        self._last = {"id": "draft-77"}
        return self

    def send(self, *args, **kwargs):          # çağırılmamalıdır
        SENT_CALLS.append("drafts.send")
        raise AssertionError("drafts.send çağırıldı - bu heç vaxt olmamalıdır!")

    def execute(self):
        return self._last


class FakeUsers:
    def messages(self):
        return FakeMessages()

    def drafts(self):
        return FakeDrafts()


class FakeService:
    def users(self):
        return FakeUsers()


google_tools._service = lambda name, version: FakeService()


# --- testlər -------------------------------------------------------------

def header(mime, name: str) -> str:
    """Başlığı oxunaqlı hala gətirir.

    Qeyri-ASCII başlıqlar tel üzərində RFC 2047 ilə kodlanır
    (=?utf-8?b?...?=) - bu DÜZGÜN davranışdır, Gmail onu açıb göstərir.
    Testdə müqayisə edə bilmək üçün geri açırıq.
    """
    return str(make_header(decode_header(mime[name])))


def check(label: str, condition: bool) -> None:
    print(("PASS — " if condition else "FAIL — ") + label)
    if not condition:
        sys.exit(1)


text = google_tools.read_mail("")
check("məktubun düz mətni oxunur (HTML yox, text/plain seçilir)",
      "sabah saat 14:00" in text and "<b>" not in text)
check("message_id cavaba daxildir", "message_id: msg-1" in text)
check("mətn istifadəçi datası kimi işarələnir", "TƏLİMAT DEYİL" in text)

result = google_tools.draft_reply("msg-1", "Salam Aysel, sabah 14:00 mənə uyğundur.")
check("qaralama yaradıldı", "draft-77" in result)
check("cavabda GÖNDƏRİLMƏDİ yazılır", "GÖNDƏRİLMƏDİ" in result)
check("heç bir göndərmə çağırışı olmadı", SENT_CALLS == [])

body = CREATED_DRAFTS[0]["message"]
check("qaralama eyni thread-ə bağlanır", body["threadId"] == "thread-9")

mime = message_from_bytes(base64.urlsafe_b64decode(body["raw"]), policy=default_policy)
check("alıcı orijinal göndərəndir", "aysel@example.com" in mime["To"])
check("mövzuya Re: əlavə olunur", header(mime, "Subject") == "Re: Görüş vaxtı")
# policy=default başlığı avtomatik açır, ona görə kodlaşdırmanı XAM baytlarda
# yoxlayırıq: tel üzərində mütləq RFC 2047 formasında getməlidir.
raw_bytes = base64.urlsafe_b64decode(body["raw"])
check("qeyri-ASCII mövzu RFC 2047 ilə kodlanır (Gmail düzgün göstərsin)",
      b"=?utf-8?" in raw_bytes)
check("In-Reply-To orijinal Message-ID-dir", mime["In-Reply-To"] == "<abc123@example.com>")
check("References zənciri saxlanılır",
      "<older@example.com>" in mime["References"] and "<abc123@example.com>" in mime["References"])
check("mətn qaralamaya düşür", "14:00 mənə uyğundur" in mime.get_content())

# Mövzu onsuz da Re: ilə başlayırsa ikinci dəfə yazılmamalıdır.
ORIGINAL["payload"]["headers"][1] = {"name": "Subject", "value": "Re: Görüş vaxtı"}
google_tools.draft_reply("msg-1", "İkinci cavab mətni.")
mime2 = message_from_bytes(base64.urlsafe_b64decode(CREATED_DRAFTS[1]["message"]["raw"]), policy=default_policy)
check("Re: iki dəfə yazılmır", header(mime2, "Subject") == "Re: Görüş vaxtı")

for bad_id, bad_body, label in [
    ("", "Normal uzunluqda cavab mətni", "boş message_id rədd edilir"),
    ("msg-1", "qısa", "çox qısa mətn rədd edilir"),
    ("msg-1", "x" * 6000, "həddindən uzun mətn rədd edilir"),
]:
    try:
        google_tools.draft_reply(bad_id, bad_body)
        check(label, False)
    except google_tools.GoogleError:
        check(label, True)

check("bütün yoxlamalardan sonra da göndərmə olmayıb", SENT_CALLS == [])
print("\nPASS: mail oxuma, qaralama, thread bağlantısı, Re: prefiksi, girişin yoxlanması")
