"""AI Advisor API routes."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from services.claude_advisor import get_advice

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class AdvisorRequest(BaseModel):
    message: str
    history: Optional[List[ChatMessage]] = None


@router.post("/advisor")
async def advisor(request: AdvisorRequest):
    """Send a message to the AI agricultural advisor."""
    history = None
    if request.history:
        history = [{"role": m.role, "content": m.content} for m in request.history]

    response = await get_advice(request.message, history)
    return {"response": response}
