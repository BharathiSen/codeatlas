import logging
import os
from pathlib import Path

from dotenv import load_dotenv

# Configuration lives in the repository root and is shared with the frontend.
# Loaded before any module reads os.environ. `override=False` keeps a real
# environment (Docker, Render) authoritative over the file.
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
from sys import prefix
from fastapi import FastAPI, HTTPException
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

app = FastAPI()

# Enable CORS to allow cross-origin requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


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


@app.post("/index/")
async def index_repository(request: IndexRequest) -> dict:
    """Chunk, embed and store a repository for retrieval.

    Incremental: files whose SHA already matches are skipped without being
    re-embedded. Safe to call on every ingestion.
    """
    try:
        stats = await get_service().index_repository(
            request.repo, request.content, force=request.force
        )
        return {"success": True, "data": stats}
    except Exception as exc:
        logging.exception("Indexing failed for %s", request.repo)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc


@app.post("/search/")
async def search_repository(request: SearchRequest) -> dict:
    """Hybrid retrieval over an indexed repository."""
    try:
        hits = await get_service().search(request.repo, request.query, limit=request.limit)
        return {"success": True, "data": {"chunks": [h.to_dict() for h in hits]}}
    except Exception as exc:
        logging.exception("Search failed for %s", request.repo)
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc


@app.get("/index/status")
async def index_status(repo: str) -> dict:
    try:
        return {"success": True, "data": await get_service().status(repo)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Status failed: {exc}") from exc


@app.post("/ingest/")
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