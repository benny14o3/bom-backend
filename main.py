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

ADMIN_PASSWORD = os.environ.get("BOM_ADMIN_PASSWORD", "Lg06031936.!")
GITHUB_TOKEN   = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO    = "benny14o3/fritsch-corteco"
GITHUB_FILE    = "Produktions_BOM_App/data.json"
GITHUB_BRANCH  = "main"
RAW_URL        = f"https://raw.githubusercontent.com/{GITHUB_REPO}/{GITHUB_BRANCH}/{GITHUB_FILE}"


def github_get():
    # Datei direkt per raw URL laden (umgeht 1MB Limit)
    req = urllib.request.Request(RAW_URL, headers={
        "Authorization": f"token {GITHUB_TOKEN}",
        "User-Agent": "fritsch-bom-backend",
        "Cache-Control": "no-cache"
    })
    with urllib.request.urlopen(req) as resp:
        content = json.loads(resp.read().decode("utf-8"))

    # SHA separat holen (wird fuer Commits benoetigt)
    sha_url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}?ref={GITHUB_BRANCH}"
    sha_req = urllib.request.Request(sha_url, headers={
        "Authorization": f"token {GITHUB_TOKEN}",
        "User-Agent": "fritsch-bom-backend"
    })
    with urllib.request.urlopen(sha_req) as resp:
        info = json.loads(resp.read())
        sha = info["sha"]

    return content, sha


@app.get("/bom")
def get_bom():
    try:
        content, _ = github_get()
        return content
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/bom")
async def save_bom(payload: dict, password: str = ""):
    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Falsches Passwort")
    try:
        _, sha = github_get()
        b64 = base64.b64encode(
            json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        ).decode("utf-8")
        headers = {
            "Authorization": f"token {GITHUB_TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "fritsch-bom-backend"
        }
        async with httpx.AsyncClient(timeout=30) as client:
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
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
