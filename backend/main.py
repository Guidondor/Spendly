import os
import traceback
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Spendly API")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGIN", "").split(",")
if not any(ALLOWED_ORIGINS):
    ALLOWED_ORIGINS = ["http://localhost:8081", "http://localhost:19006"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

_api_key = os.getenv("ANTHROPIC_API_KEY")
print(f"ANTHROPIC_API_KEY present: {bool(_api_key)} (len={len(_api_key) if _api_key else 0})", flush=True)
client = anthropic.Anthropic(api_key=_api_key)

VALID_CATEGORIES = [
    "food", "transport", "health", "housing",
    "entertainment", "shopping", "education", "income", "other",
]


class CategorizeRequest(BaseModel):
    description: str
    type: str


class InsightRequest(BaseModel):
    income: float
    expenses: float
    top_category: str
    tx_count: int
    lang: str = "es"


@app.post("/categorize")
async def categorize(req: CategorizeRequest):
    if not req.description.strip():
        raise HTTPException(status_code=400, detail="description vacía")

    prompt = f"""Categorizá esta transacción en UNA de estas claves: food, transport, health, housing, entertainment, shopping, education, income, other.

Movimiento: "{req.description}"
Tipo: {"ingreso" if req.type == "income" else "gasto"}

Respondé SOLO con la clave, sin puntos ni explicaciones."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": prompt}],
        )
        category = message.content[0].text.strip().lower()
        if category not in VALID_CATEGORIES:
            category = "income" if req.type == "income" else "other"
        return {"category": category}
    except Exception as e:
        print(f"[/categorize] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error interno al categorizar")


@app.post("/insight")
async def insight(req: InsightRequest):
    cat_names = {
        "food": "comida", "transport": "transporte", "health": "salud",
        "housing": "vivienda", "entertainment": "ocio", "shopping": "compras",
        "education": "educación", "income": "ingresos", "other": "otros",
    }
    top = cat_names.get(req.top_category, req.top_category)

    if req.lang == "en":
        summary = f"Income: ${req.income:.0f}. Expenses: ${req.expenses:.0f}. Top category: {top}. Transactions: {req.tx_count}."
        prompt = f'You are a personal finance advisor. User data this month: "{summary}". Give ONE practical, brief (max 2 sentences), motivating financial tip. No emojis. Just the tip.'
    else:
        summary = f"Ingresos: ${req.income:.0f}. Gastos: ${req.expenses:.0f}. Top categoría: {top}. Movimientos: {req.tx_count}."
        prompt = f'Sos un asesor financiero personal. Datos del usuario este mes: "{summary}". Dá UN consejo financiero práctico, breve (máximo 2 oraciones), motivador y personalizado. Sin emojis. Solo el consejo.'

    try:
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        return {"insight": message.content[0].text.strip()}
    except Exception as e:
        print(f"[/insight] {type(e).__name__}: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error interno al generar consejo")


@app.get("/health")
async def health():
    return {"status": "ok"}
