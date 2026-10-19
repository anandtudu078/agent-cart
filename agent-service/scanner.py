"""Price decisions for the scan cycle.

Two sources, in order of preference:
1. An LLM (LangChain + any OpenAI-compatible endpoint) when OPENAI_API_KEY
   is set — reasons about each item and proposes a small price nudge.
2. A deterministic random walk (±3%) — the same behaviour the Node agent
   used before, so the service runs with zero keys and zero network calls.

Both paths bound every change to ±3% of the current price: this service
suggests, it never invents prices.
"""

from __future__ import annotations

import json
import os
import random
from typing import Literal

from pydantic import BaseModel, Field

# shortcut: ±3% matches the Node agent's JITTER; widen when the LLM gets a
# real price feed to reason over
MAX_DELTA = 0.03
MIN_PRICE = 1.0


class PriceItem(BaseModel):
    id: str
    title: str
    retailer: str
    price: float = Field(gt=0)
    targetPrice: float = Field(ge=0)


class PriceUpdate(BaseModel):
    id: str
    price: float
    reason: str


class ScanResult(BaseModel):
    source: Literal["llm", "fallback"]
    updates: list[PriceUpdate]


def llm_enabled() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def _clamp(current: float, proposed: float) -> float:
    """Keep any proposed price within ±MAX_DELTA of the current one."""
    lo = current * (1 - MAX_DELTA)
    hi = current * (1 + MAX_DELTA)
    return max(MIN_PRICE, round(min(max(proposed, lo), hi), 2))


def fallback_scan(items: list[PriceItem]) -> list[PriceUpdate]:
    """Local random walk — the pre-LLM behaviour, kept as the safety net."""
    updates = []
    for item in items:
        delta = random.uniform(-MAX_DELTA, MAX_DELTA)
        updates.append(
            PriceUpdate(
                id=item.id,
                price=_clamp(item.price, item.price * (1 + delta)),
                reason="local random walk (no LLM configured)",
            )
        )
    return updates


_SYSTEM_PROMPT = """\
You are the pricing engine of a price-watch shopping agent.
For each item you receive the current price and the buyer's target price.
Propose the next observed price as a small nudge (a few percent) that is
realistic for retail price movement: drift slightly toward the target when
the gap is large, wander otherwise. Never propose a price more than 3%
away from the current one, and never below 1.0.

Answer with ONLY a JSON array, no prose, one object per item:
[{"id": "<id>", "nextPrice": <number>, "reason": "<short reason>"}]
"""


async def llm_scan(items: list[PriceItem]) -> list[PriceUpdate]:
    """Ask the LLM for price nudges; validate and clamp every proposal.

    Raises on any failure — callers fall back to `fallback_scan`.
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
    payload = json.dumps([item.model_dump() for item in items])
    response = await llm.ainvoke(
        [
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=payload),
        ]
    )
    text = str(response.content).strip()
    if text.startswith("```"):
        text = text.split("```")[1].removeprefix("json").strip()
    raw = json.loads(text)

    by_id = {item.id: item for item in items}
    updates = []
    for entry in raw:
        item = by_id.get(str(entry.get("id")))
        proposed = float(entry.get("nextPrice", 0))
        if item is None or proposed <= 0:
            continue  # ignore hallucinated ids/prices instead of crashing
        updates.append(
            PriceUpdate(
                id=item.id,
                price=_clamp(item.price, proposed),
                reason=str(entry.get("reason", "llm nudge"))[:200],
            )
        )
    if not updates:
        raise ValueError("LLM returned no usable updates")
    return updates


async def scan(items: list[PriceItem]) -> ScanResult:
    """Best-effort LLM scan with an unconditional fallback."""
    if llm_enabled():
        try:
            return ScanResult(source="llm", updates=await llm_scan(items))
        except Exception as exc:  # noqa: BLE001 — any LLM failure must not stall the cycle
            print(f"[agent] LLM scan failed, falling back: {exc}")
    return ScanResult(source="fallback", updates=fallback_scan(items))
