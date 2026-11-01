from fastapi.testclient import TestClient

from main import app
from parser import CommandContext, fallback_parse, parse

client = TestClient(app)

ITEMS = [
    CommandContext(id="a1", title="Keychron K2", retailer="Amazon"),
    CommandContext(id="b2", title="Sony WH-1000XM5", retailer="BestBuy"),
]


def test_watch_with_target_only():
    intent = fallback_parse("watch Sony WH-1000XM5 under $300", ITEMS)
    assert intent.action == "watch"
    assert intent.targetPrice == 300
    assert intent.price is None
    assert intent.title and "Sony WH-1000XM5" in intent.title


def test_watch_full_sentence():
    intent = fallback_parse(
        "track https://example.com/p/1 at $328 under $300, auto-buy, check every 10 minutes",
        ITEMS,
    )
    assert intent.action == "watch"
    assert intent.price == 328
    assert intent.targetPrice == 300
    assert intent.url == "https://example.com/p/1"
    assert intent.autoBuy is True
    assert intent.pollIntervalSec == 600


def test_watch_without_currency_and_negative_auto_buy():
    intent = fallback_parse("watch the keyboard under 79, no auto-buy", ITEMS)
    assert intent.action == "watch"
    assert intent.targetPrice == 79
    assert intent.autoBuy is False


def test_pause_matches_longest_existing_title():
    intent = fallback_parse("pause the Keychron K2", ITEMS)
    assert intent.action == "pause"
    assert intent.itemId == "a1"


def test_resume_unknown_item_is_unknown():
    intent = fallback_parse("resume the iPhone", ITEMS)
    assert intent.action == "unknown"
    assert intent.itemId is None
    assert "watchlist" in intent.reply


def test_set_target_extracts_number():
    intent = fallback_parse("set target for Keychron K2 to $79", ITEMS)
    assert intent.action == "set_target"
    assert intent.itemId == "a1"
    assert intent.targetPrice == 79


def test_daily_phrase_sets_poll_interval():
    intent = fallback_parse("check the keyboard twice a day", ITEMS)
    assert intent.pollIntervalSec == 43_200


def test_title_keeps_model_numbers_and_drops_interval_phrases():
    # regression: the lookback window for "10 minutes" used to see "under",
    # swallow the number, and leave "check every minutes" in the title
    intent = fallback_parse(
        "watch Keychron K2 now 99 under 79, auto-buy, check every 10 minutes",
        ITEMS,
    )
    assert intent.action == "watch"
    assert intent.title == "Keychron K2"
    assert intent.price == 99
    assert intent.targetPrice == 79
    assert intent.pollIntervalSec == 600


def test_garbage_is_unknown():
    intent = fallback_parse("hello there", ITEMS)
    assert intent.action == "unknown"


def test_parse_endpoint_returns_fallback_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/parse", json={"text": "watch K2 under 79", "items": []})
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "watch"
    assert body["source"] == "fallback"
    assert body["targetPrice"] == 79


def test_parse_endpoint_rejects_empty_and_oversized_text():
    assert client.post("/parse", json={"text": ""}).status_code == 422
    assert client.post("/parse", json={"text": "x" * 501}).status_code == 422


def test_clamp_drops_hallucinated_item_ids():
    # an id the caller never sent must not survive clamping
    intent = fallback_parse("pause the Keychron K2", [])
    assert intent.action == "unknown"
    assert intent.itemId is None
