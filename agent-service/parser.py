"""Plain-language commands -> one structured intent.

Two sources, mirroring scanner.py:
1. An LLM (any OpenAI-compatible endpoint) when OPENAI_API_KEY is set —
   reads the sentence plus the caller's watchlist and answers one JSON object.
2. A deterministic keyword/regex fallback, so the command bar works with
   zero keys and zero network calls.

Both paths return the same pydantic model, and the Node backend re-validates
every field before it touches the database.
"""

from __future__ import annotations

import json
import os
import re
from typing import Literal

from pydantic import BaseModel, Field

Action = Literal["watch", "pause", "resume", "set_target", "auto_buy", "unknown"]

MAX_TITLE = 500
MAX_RETAILER = 100
MAX_URL = 2000
# same 5s..86400s window the Node scheduler enforces
MIN_POLL_SEC = 5
MAX_POLL_SEC = 86_400


class CommandContext(BaseModel):
    """One existing watch item, offered so the parser can match by title."""

    id: str
    title: str
    retailer: str = ""


class CommandIntent(BaseModel):
    action: Action = "unknown"
    reply: str = ""
    itemId: str | None = None
    title: str | None = None
    retailer: str | None = None
    price: float | None = None
    targetPrice: float | None = None
    url: str | None = None
    autoBuy: bool | None = None
    pollIntervalSec: int | None = None
    source: Literal["llm", "fallback"] = "fallback"


def llm_enabled() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


# --- deterministic fallback -------------------------------------------------

URL_RE = re.compile(r"https?://[^\s,;]+", re.I)
# $300 / 4,000 / ₹4,000 / 300 usd — currency optional, hint keywords decide
MONEY_RE = re.compile(
    r"(?:(?:[$€£¥₹]|\b(?:usd|inr|eur|gbp)\b)\s*)?\b(\d[\d,]*(?:\.\d+)?)",
    re.I,
)
TARGET_HINT = re.compile(
    r"\b(?:under|below|beneath|less\s+than|target|goal|max|upto|up\s+to|to)\b", re.I
)
PRICE_HINT = re.compile(
    r"\b(?:now|at|price|currently|costs?|priced|buying\s+at|for)\b", re.I
)
EVERY_RE = re.compile(
    r"\bevery\s+(\d+)\s*(sec(?:ond)?s?|min(?:ute)?s?|h|hr|hours?|d|days?)\b", re.I
)
_UNIT_SEC = {
    "s": 1, "sec": 1, "secs": 1, "second": 1, "seconds": 1,
    "m": 60, "min": 60, "mins": 60, "minute": 60, "minutes": 60,
    "h": 3600, "hr": 3600, "hours": 3600, "hour": 3600,
    "d": 86_400, "day": 86_400, "days": 86_400,
}
PHRASE_POLL = [
    (re.compile(r"\btwice\s+a\s+day\b", re.I), 43_200),
    (re.compile(r"\bhourly|\bevery\s+hour\b", re.I), 3600),
    (re.compile(r"\bdaily|\bevery\s+day\b|\bonce\s+a\s+day\b", re.I), 86_400),
]
NEG_AUTO = re.compile(
    r"\b(?:no|not|don'?t|without|disable|off|stop)\s+auto\s*-?\s*buy\b", re.I
)
POS_AUTO = re.compile(
    r"\b(?:auto\s*-?\s*buy|buy\s+(?:it\s+)?automatically|purchase\s+automatically)\b",
    re.I,
)
RE_PAUSE = re.compile(r"\b(?:pause|hold|suspend|stop)\b", re.I)
RE_RESUME = re.compile(r"\b(?:resume|unpause|restart|continue)\b", re.I)
RE_TARGET = re.compile(
    r"\b(?:set|change|update|lower|raise|adjust)\b[^.]*\b(?:target|goal)\b"
    r"|\btarget\s+(?:price\s+)?(?:to|at)\b",
    re.I,
)
RE_WATCH = re.compile(
    r"\b(?:watch|track|follow|alert(?:\s+me)?|notify(?:\s+me)?|find|get\s+me)\b",
    re.I,
)
# filler stripped out of a extracted title
FILLER_RE = re.compile(
    r"\b(?:please|for\s+me|the|a|an|under|below|less\s+than|target(?:\s+price)?"
    r"|goal|now|at|price|currently|costs?|priced|auto\s*-?\s*buy|watch|track"
    r"|follow|when|it|me|to|of|my|and|if|can|you|could|would|get|find|check"
    r"|every|please)\b",
    re.I,
)


def _money(text: str) -> tuple[float | None, float | None]:
    """(targetPrice, price) from the sentence.

    A number is a target when a target keyword sits just before it, else a
    current price when a price keyword does. Target wins when both appear.
    """
    target: float | None = None
    price: float | None = None
    prev_end = 0
    for match in MONEY_RE.finditer(text):
        # look back only as far as the previous number, so one number's hint
        # ("under $300") can't claim the next one ("$328")
        window = text[max(prev_end, match.start() - 40) : match.start()]
        prev_end = match.end()
        try:
            value = float(match.group(1).replace(",", ""))
        except ValueError:
            continue
        if value < 0:
            continue
        if target is None and TARGET_HINT.search(window):
            target = value
        elif price is None and PRICE_HINT.search(window):
            price = value
    return target, price


def _poll_sec(text: str) -> int | None:
    match = EVERY_RE.search(text)
    if match:
        unit = match.group(2).lower()
        seconds = _UNIT_SEC.get(unit)
        if seconds:
            value = int(match.group(1)) * seconds
            return max(MIN_POLL_SEC, min(MAX_POLL_SEC, value))
    for pattern, seconds in PHRASE_POLL:
        if pattern.search(text):
            return seconds
    return None


def _match_item(text: str, items: list[CommandContext]) -> CommandContext | None:
    """Longest existing title mentioned in the sentence (case-insensitive)."""
    lower = text.lower()
    best: CommandContext | None = None
    for item in items:
        title = item.title.strip().lower()
        if title and title in lower:
            if best is None or len(title) > len(best.title.strip().lower()):
                best = item
    return best


def _strip_money(text: str) -> str:
    """Remove prices from a sentence, but keep model numbers (WH-1000XM5).

    A number leaves the title when it carries a currency sign/code or when a
    price/target keyword sits right before it — otherwise it belongs to the
    product name.
    """
    pieces: list[str] = []
    last = 0
    prev_end = 0
    for match in MONEY_RE.finditer(text):
        matched = match.group(0)
        currency = bool(re.match(r"[$€£¥₹]|(?:usd|inr|eur|gbp)", matched, re.I))
        window = text[max(prev_end, match.start() - 40) : match.start()]
        prev_end = match.end()
        if currency or TARGET_HINT.search(window) or PRICE_HINT.search(window):
            pieces.append(text[last : match.start()])
            last = match.end()
    pieces.append(text[last:])
    return "".join(pieces)


def _title_from(text: str) -> str | None:
    """Best-effort product title: sentence minus everything recognized."""
    cleaned = URL_RE.sub(" ", text)
    cleaned = _strip_money(cleaned)
    cleaned = EVERY_RE.sub(" ", cleaned)
    for pattern, _ in PHRASE_POLL:
        cleaned = pattern.sub(" ", cleaned)
    cleaned = FILLER_RE.sub(" ", cleaned)
    cleaned = re.sub(r"[^0-9A-Za-zÀ-ÿ&+'\-./ ]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -–,.")
    return cleaned[:MAX_TITLE] or None


def fallback_parse(text: str, items: list[CommandContext]) -> CommandIntent:
    """Deterministic keyword parse — the zero-key safety net."""
    intent = CommandIntent(action="unknown", source="fallback")
    target, price = _money(text)
    intent.targetPrice = target
    intent.price = price
    intent.pollIntervalSec = _poll_sec(text)
    url_match = URL_RE.search(text)
    intent.url = url_match.group(0) if url_match else None
    if NEG_AUTO.search(text):
        intent.autoBuy = False
    elif POS_AUTO.search(text):
        intent.autoBuy = True

    if RE_PAUSE.search(text):
        action: Action = "pause"
    elif RE_RESUME.search(text):
        action = "resume"
    elif RE_TARGET.search(text):
        action = "set_target"
    elif RE_WATCH.search(text):
        action = "watch"
    else:
        action = "unknown"

    if action in ("pause", "resume", "set_target", "auto_buy"):
        matched = _match_item(text, items)
        if matched is None:
            intent.action = "unknown"
            intent.reply = (
                "I couldn't find that item in your watchlist — "
                "name it as it appears there (e.g. \"pause Sony WH-1000XM5\")"
            )
            return intent
        intent.itemId = matched.id
        intent.title = matched.title
    elif action == "watch":
        intent.title = _title_from(text)
        intent.retailer = None

    intent.action = action
    return intent


# --- LLM path ---------------------------------------------------------------

_SYSTEM_PROMPT = """\
You convert a shopping command into one JSON object. Fields:
action: "watch" | "pause" | "resume" | "set_target" | "auto_buy" | "unknown"
itemId: id of an existing watch item the command acts on (ONLY from the
  provided list; null otherwise)
title, retailer, price, targetPrice, url, autoBuy, pollIntervalSec:
  only when the sentence gives them, else null
reply: one short sentence the user should see

Rules:
- "watch/track X under Y" -> action "watch", targetPrice = Y. Set price only
  when the sentence states the current price; set url only when one is pasted.
- pause / resume / set-target / auto-buy commands must set itemId from the
  list; if no listed item matches, action = "unknown".
- Never invent ids or prices. Numbers, not strings. autoBuy is a boolean.
- pollIntervalSec: seconds between checks (e.g. "every 10 minutes" -> 600).
Answer with ONLY the JSON object, no prose.
"""


async def llm_parse(text: str, items: list[CommandContext]) -> CommandIntent:
    """Ask the LLM for an intent; validate and clamp every field.

    Raises on any failure — callers fall back to `fallback_parse`.
    """
    # lazy import: the service must boot (and test) without langchain when
    # no key is configured
    from langchain_core.messages import HumanMessage, SystemMessage
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(
        model=os.getenv("AGENT_MODEL", "gpt-4o-mini"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,
        temperature=0,
    )
    payload = json.dumps(
        {"text": text, "items": [item.model_dump() for item in items]}
    )
    response = await llm.ainvoke(
        [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=payload)]
    )
    raw = str(response.content).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].removeprefix("json").strip()
    intent = CommandIntent.model_validate(json.loads(raw))
    intent.source = "llm"
    return intent


def _clamp(intent: CommandIntent, items: list[CommandContext]) -> CommandIntent:
    """Drop anything untrustworthy: bad numbers, over-long strings, unknown ids."""
    known = {item.id for item in items}

    def num(value: float | None) -> float | None:
        if value is None or not isinstance(value, (int, float)) or value < 0:
            return None
        return round(float(value), 2)

    intent.targetPrice = num(intent.targetPrice)
    intent.price = num(intent.price)
    intent.title = intent.title.strip()[:MAX_TITLE] or None if intent.title else None
    intent.retailer = (
        intent.retailer.strip()[:MAX_RETAILER] or None if intent.retailer else None
    )
    intent.url = intent.url.strip()[:MAX_URL] or None if intent.url else None
    if intent.pollIntervalSec is not None:
        try:
            intent.pollIntervalSec = max(
                MIN_POLL_SEC, min(MAX_POLL_SEC, int(intent.pollIntervalSec))
            )
        except (TypeError, ValueError):
            intent.pollIntervalSec = None
    if intent.autoBuy is not None:
        intent.autoBuy = bool(intent.autoBuy)
    # acting on an item we weren't given (or the LLM hallucinated) is unknown
    if intent.action in ("pause", "resume", "set_target", "auto_buy"):
        if intent.itemId not in known:
            intent.action = "unknown"
            intent.itemId = None
            intent.reply = (
                "I couldn't find that item in your watchlist — "
                "name it as it appears there (e.g. \"pause Sony WH-1000XM5\")"
            )
    return intent


async def parse(text: str, items: list[CommandContext]) -> CommandIntent:
    """Best-effort LLM parse with an unconditional deterministic fallback."""
    if llm_enabled():
        try:
            return _clamp(await llm_parse(text, items), items)
        except Exception as exc:  # noqa: BLE001 — any LLM failure must still answer
            print(f"[agent] LLM parse failed, falling back: {exc}")
    return _clamp(fallback_parse(text, items), items)
