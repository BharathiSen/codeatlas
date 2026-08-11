import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

# Configuration lives in the repository root and is shared with the frontend.
# Loaded before any module reads os.environ. `override=False` keeps a real
# environment (Docker, Render) authoritative over the file.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
from sys import prefix
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from pydantic import BaseModel, validator
import asyncio
import httpx  # For making async HTTP requests
from typing import Optional

from gitingest import ingest_async
from uvicorn.main import logger

from retrieval import get_service

# Configure logging
logging.basicConfig(level=logging.INFO)

# httpx logs every outbound request at INFO as `HTTP Request: <method> <url>`, and
# the Gemini embeddings API takes its credential as a `key` query parameter
# (embeddings.py). That one line therefore writes a live API key into the log
# stream — a single 24-chunk repository produced 26 such lines, all readable via
# `docker logs`.
#
# The fix is to stop the client emitting request URLs rather than to redact them
# downstream: a redaction filter has to keep being correct for every future call
# site and every log sink, whereas a logger that never emits the URL cannot leak
# it. The level is pinned on these loggers specifically, so raising the root
# logger to DEBUG for diagnosis still cannot surface the key.
#
# Nothing useful is lost. Errors still propagate — httpx WARNING and ERROR records
# pass this filter, embeddings.py logs its own retry/failure lines from the
# response body rather than the request URL, and uvicorn's access log (which
# carries the inbound request line) is untouched.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

app = FastAPI()

# Enable CORS to allow cross-origin requests from the frontend
# Origins permitted to call this service from a browser. Defaults to local
# development; set CORS_ALLOWED_ORIGINS (comma-separated) in production.
#
# The previous configuration was `allow_origins=["*"]` with
# `allow_credentials=True`, which browsers reject outright as a combination, and
# which would have let any site on the internet drive /index/ — an endpoint that
# spends money on embeddings.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Service-Token"],
)

# Shared secret between the web app and this service. Unset means open, which is
# fine on a private network and not fine on a public one — the service is warned
# about at startup in that case.
SERVICE_TOKEN = os.environ.get("INGEST_SERVICE_TOKEN", "")

if not SERVICE_TOKEN:
    logging.warning(
        "INGEST_SERVICE_TOKEN is not set — /index/ and /search/ are unauthenticated. "
        "Set it before exposing this service beyond localhost."
    )


def require_service_token(x_service_token: str = Header(default="")) -> None:
    """Guard the endpoints that cost money. No-op when no token is configured."""
    if SERVICE_TOKEN and x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing service token")


# Owner/repo come from user input and are interpolated into a URL, so constrain
# them to what GitHub actually permits before they can reach the network layer.
REPO_SEGMENT = re.compile(r"^[A-Za-z0-9._-]{1,100}$")


def validate_repo_key(repo_key: str) -> str:
    """Accept only `owner/name` built from GitHub-legal characters."""
    parts = repo_key.split("/")
    if len(parts) != 2 or not all(REPO_SEGMENT.match(p) for p in parts):
        raise HTTPException(status_code=400, detail=f"Invalid repository key: {repo_key!r}")
    if any(p in {".", ".."} for p in parts):
        raise HTTPException(status_code=400, detail="Invalid repository key")
    return repo_key


class IngestRequest(BaseModel):
    github_link: str
    max_file_size: int = 50 * 1024 * 1024  # default to 50MB

    @validator('github_link')
    def validate_github_link(cls, v):
        if not v.startswith("https://github.com/"):
            raise ValueError("URL must start with https://github.com/")
        return v


async def fetch_github_content(github_link: str, max_file_size: int) -> dict:
    try:
        summary, tree, content = await ingest_async(source=github_link, max_file_size=max_file_size)
        
        # Log the tree structure to see what files were ingested
        logging.info(f"Ingestion complete for {github_link}")
        logging.info(f"Summary: {summary}")
        logging.info(f"Tree structure:\n{tree}")
        logging.info(f"Total content length: {len(content)} characters")

        return {
            "summary": summary,
            "tree": tree,
            "content": content
        }
    except Exception as e:
        logging.error(f"Error fetching content for {github_link}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to ingest repository: {str(e)}")

class IndexRequest(BaseModel):
    repo: str
    content: str
    force: bool = False


class SearchRequest(BaseModel):
    repo: str
    query: str
    limit: int = 12


@app.post("/index/", dependencies=[Depends(require_service_token)])
async def index_repository(request: IndexRequest) -> dict:
    """Chunk, embed and store a repository for retrieval.

    Incremental: files whose SHA already matches are skipped without being
    re-embedded. Safe to call on every ingestion.
    """
    validate_repo_key(request.repo)
    try:
        stats = await get_service().index_repository(
            request.repo, request.content, force=request.force
        )
        return {"success": True, "data": stats}
    except Exception as exc:
        logging.exception("Indexing failed for %s", request.repo)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc


@app.post("/search/", dependencies=[Depends(require_service_token)])
async def search_repository(request: SearchRequest) -> dict:
    """Hybrid retrieval over an indexed repository."""
    validate_repo_key(request.repo)
    try:
        hits = await get_service().search(request.repo, request.query, limit=request.limit)
        return {"success": True, "data": {"chunks": [h.to_dict() for h in hits]}}
    except Exception as exc:
        logging.exception("Search failed for %s", request.repo)
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc


@app.get("/index/status")
async def index_status(repo: str) -> dict:
    validate_repo_key(repo)
    try:
        return {"success": True, "data": await get_service().status(repo)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Status failed: {exc}") from exc


@app.post("/ingest/", dependencies=[Depends(require_service_token)])
async def ingest_github_link(ingest_request: IngestRequest) -> dict:
    github_link = ingest_request.github_link
    max_file_size = ingest_request.max_file_size
    logging.info(f"Received ingest request for github_link: {github_link}")
    return await fetch_github_content(github_link, max_file_size)


#  ping endpoint here
@app.api_route("/ping", methods=["GET", "HEAD"])
async def ping():
    return JSONResponse(content={"message": "pong"})

# 🚀 Add this block to start the server (required for Render)
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))  # Render sets PORT dynamically
    uvicorn.run("main:app", host="0.0.0.0", port=port)