"""AgentCart agent service — smart price checks for the Node backend.

Run locally:
    pip install -r requirements.txt
    uvicorn main:app --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from scanner import ScanResult, PriceItem, llm_enabled, scan

app = FastAPI(title="AgentCart Agent Service", version="0.1.0")


class ScanRequest(BaseModel):
    items: list[PriceItem] = Field(max_length=500)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "llm": "enabled" if llm_enabled() else "disabled"}


@app.post("/scan", response_model=ScanResult)
async def scan_endpoint(request: ScanRequest) -> ScanResult:
    """Return one price decision per item (LLM when configured, else fallback)."""
    return await scan(request.items)
