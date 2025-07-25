import os
import tempfile
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import openai
from openai import OpenAI
from dotenv import load_dotenv
import uuid
from datetime import datetime
import uvicorn

load_dotenv()

app = FastAPI(title="Voice AI Chatbot", description="A voice-enabled chatbot using OpenAI Whisper")

# Initialize OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# Data models
class Message(BaseModel):
    id: str
    content: str
    role: str  # 'user' or 'assistant'
    timestamp: datetime
    audio_url: Optional[str] = None


class ChatResponse(BaseModel):
    user_message: Message
    assistant_message: Message
    transcription: str


# In-memory storage (replace with database in production)
messages_storage: List[Message] = []

# Templates
templates = Jinja2Templates(directory="templates")

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/messages", response_model=List[Message])
async def get_messages():
    """Get all chat messages"""
    return messages_storage


@app.post("/api/voice-message", response_model=ChatResponse)
async def process_voice_message(audio: UploadFile = File(...)):
    """Process uploaded audio file using Whisper and generate AI response"""
    try:
        # Validate file type
        if not audio.content_type or not audio.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="Invalid audio file format")

        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            content = await audio.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        try:
            # Transcribe audio using Whisper
            with open(temp_file_path, "rb") as audio_file:
                transcription = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file
                )

            transcribed_text = transcription.text.strip()

            if not transcribed_text:
                raise HTTPException(status_code=400, detail="No speech detected in audio")

            # Create user message
            user_message = Message(
                id=str(uuid.uuid4()),
                content=transcribed_text,
                role="user",
                timestamp=datetime.now()
            )
            messages_storage.append(user_message)

            # Generate AI response using conversation history
            conversation_history = [
                {"role": msg.role, "content": msg.content}
                for msg in messages_storage[-10:]  # Last 10 messages for context
            ]

            response = client.chat.completions.create(
                model="gpt-4o",
                # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
                messages=conversation_history,
                max_tokens=500
            )

            ai_response_text = response.choices[0].message.content or "I'm sorry, I couldn't generate a response."

            # Create assistant message
            assistant_message = Message(
                id=str(uuid.uuid4()),
                content=ai_response_text,
                role="assistant",
                timestamp=datetime.now()
            )
            messages_storage.append(assistant_message)

            return ChatResponse(
                user_message=user_message,
                assistant_message=assistant_message,
                transcription=transcribed_text
            )

        finally:
            # Clean up temporary file
            os.unlink(temp_file_path)

    except openai.APIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process voice message: {str(e)}")


@app.post("/api/text-message", response_model=ChatResponse)
async def process_text_message(message: dict):
    """Process text message and generate AI response"""
    try:
        content = message.get("content", "").strip()

        if not content:
            raise HTTPException(status_code=400, detail="Message content is required")

        # Create user message
        user_message = Message(
            id=str(uuid.uuid4()),
            content=content,
            role="user",
            timestamp=datetime.now()
        )
        messages_storage.append(user_message)

        # Generate AI response using conversation history
        conversation_history = [
            {"role": msg.role, "content": msg.content}
            for msg in messages_storage[-10:]  # Last 10 messages for context
        ]

        response = client.chat.completions.create(
            model="gpt-4o",
            # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=conversation_history,
            max_tokens=500
        )

        ai_response_text = response.choices[0].message.content or "I'm sorry, I couldn't generate a response."

        # Create assistant message
        assistant_message = Message(
            id=str(uuid.uuid4()),
            content=ai_response_text,
            role="assistant",
            timestamp=datetime.now()
        )
        messages_storage.append(assistant_message)

        return ChatResponse(
            user_message=user_message,
            assistant_message=assistant_message,
            transcription=""
        )

    except openai.APIError as e:
        raise HTTPException(status_code=500, detail=f"OpenAI API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process text message: {str(e)}")


@app.delete("/api/messages")
async def clear_messages():
    """Clear all chat messages"""
    global messages_storage
    messages_storage = []
    return {"message": "Chat history cleared"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Voice AI Chatbot"}


if __name__ == "__main__":
    uvicorn.run(app, host="localhost", port=8001)