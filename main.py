from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Passwort aus Umgebungsvariable (auf Render setzen)
ADMIN_PASSWORD = os.environ.get("BOM_ADMIN_PASSWORD", "fritsch2024")

# Daten im Speicher – beim Start aus data.json laden
DATA_FILE = "data.json"
bom_store = {}

def load_initial_data():
    global bom_store
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            bom_store = json.load(f)
        print(f"Geladen: {len(bom_store.get('boms', []))} BOMs")
    else:
        bom_store = {"boms": [], "verpackung_map": {}}
        print("Keine data.json gefunden – leerer Start")

load_initial_data()


@app.get("/bom")
def get_bom():
    return bom_store


@app.post("/bom")
def save_bom(payload: dict, password: str = ""):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Falsches Passwort")
    global bom_store
    bom_store = payload
    # Optional: auch auf Disk speichern (bei Render ephemeral)
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(bom_store, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "boms": len(bom_store.get("boms", []))} 
