from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import base64
import httpx
import urllib.request

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

ADMIN_PASSWORD = os.environ.get("BOM_ADMIN_PASSWORD", "fritsch2024")
GITHUB_TOKEN   = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO    = "benny14o3/fritsch-corteco"
GITHUB_FILE    = "Produktions_BOM_App/data.json"
GITHUB_BRANCH  = "main"
DATA_FILE      = "data.json"
bom_store      = {}


def load_initial_data():
    global bom_store
    if GITHUB_TOKEN:
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}?ref={GITHUB_BRANCH}"
            req = urllib.request.Request(url, headers={
                "Authorization": f"token {GITHUB_TOKEN}",
                "User-Agent": "fritsch-bom-backend"
            })
            with urllib.request.urlopen(req) as resp:
                info = json.loads(resp.read())
                bom_store = json.loads(base64.b64decode(info["content"].replace("\n", "")).decode("utf-8"))
                print(f"Von GitHub geladen: {len(bom_store.get('boms', []))} BOMs")
                return
        except Exception as e:
            print(f"GitHub load Fehler: {e}")
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            bom_store = json.load(f)
        print(f"Lokal geladen: {len(bom_store.get('boms', []))} BOMs")
    else:
        bom_store = {"boms": [], "verpackung_map": {}}
        print("Keine data.json gefunden – leerer Start")


load_initial_data()


@app.get("/bom")
def get_bom():
    return bom_store


@app.post("/bom")
async def save_bom(payload: dict, password: str = ""):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Falsches Passwort")
    global bom_store
    bom_store = payload
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(bom_store, f, ensure_ascii=False, indent=2)
    except Exception:
        pass
    if GITHUB_TOKEN:
        try:
            json_str = json.dumps(bom_store, ensure_ascii=False, indent=2)
            b64 = base64.b64encode(json_str.encode("utf-8")).decode("utf-8")
            headers = {
                "Authorization": f"token {GITHUB_TOKEN}",
                "Content-Type": "application/json",
                "User-Agent": "fritsch-bom-backend"
            }
            async with httpx.AsyncClient() as client:
                info = await client.get(
                    f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}?ref={GITHUB_BRANCH}",
                    headers=headers
                )
                sha = info.json().get("sha", "")
                await client.put(
                    f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}",
                    headers=headers,
                    json={
                        "message": "BOM Update via Backend",
                        "content": b64,
                        "sha": sha,
                        "branch": GITHUB_BRANCH
                    }
                )
                print("GitHub sync OK")
        except Exception as e:
            print(f"GitHub sync Fehler: {e}")
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "boms": len(bom_store.get("boms", []))}
