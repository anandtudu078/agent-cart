import os

from fastapi.testclient import TestClient

from main import app
from scanner import MAX_DELTA, PriceItem, fallback_scan

client = TestClient(app)


def _items() -> list[dict]:
    return [
        {"id": "a1", "title": "Keyboard", "retailer": "Amazon", "price": 100.0, "targetPrice": 90.0},
        {"id": "b2", "title": "Headphones", "retailer": "BestBuy", "price": 328.0, "targetPrice": 300.0},
    ]


def test_health_reports_llm_disabled_without_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    body = client.get("/health").json()
    assert body == {"status": "ok", "llm": "disabled"}


def test_scan_returns_one_update_per_item_and_clamps(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/scan", json={"items": _items()})
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "fallback"
    assert {u["id"] for u in body["updates"]} == {"a1", "b2"}
    for item, update in zip(_items(), body["updates"]):
        assert update["price"] >= 1.0
        assert abs(update["price"] - item["price"]) <= item["price"] * MAX_DELTA + 0.01
        assert update["reason"]


def test_scan_rejects_bad_input():
    res = client.post("/scan", json={"items": [{"id": "x", "price": -5}]})
    assert res.status_code == 422


def test_fallback_is_deterministic_in_bounds():
    updates = fallback_scan([PriceItem(id="z", title="t", retailer="r", price=50, targetPrice=40)])
    assert len(updates) == 1
    assert 50 * (1 - MAX_DELTA) <= updates[0].price <= 50 * (1 + MAX_DELTA)
