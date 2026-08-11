<div align="center">
  <img src="docs/image.png" alt="" width="1200" height="400" />

  <h1>CodeAtlas</h1>

  <p><strong>An AI-powered Repository Intelligence Platform.</strong><br/>
  Read a whole codebase the way you'd read a map not one file at a time.</p>

  <p>
    <img alt="Next.js 15.3.6" src="https://img.shields.io/badge/Next.js-15.3.6-000?style=flat-square&logo=next.js" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149ECA?style=flat-square&logo=react" />
    <img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" />
    <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-ingestion-059669?style=flat-square&logo=fastapi&logoColor=white" />
    <img alt="MIT" src="https://img.shields.io/badge/License-MIT-10B981?style=flat-square" />
  </p>
</div>

---

## The problem

Dropping into an unfamiliar repository is archaeology. You open files semi-randomly, guess at module boundaries from directory names, and rebuild the author's intent from identifiers. The understanding you assemble is expensive, private, and gone the moment you switch projects.

Most AI coding tools make this worse, not better. They answer one file at a time, so the questions that actually matter *how does this fit together, what breaks if I change this, why is it built this way* are exactly the ones they answer worst.

## The approach

CodeAtlas ingests the **entire** repository in one pass — source, tree, documentation into a single retrievable context, then answers against it.

```
  repository  ──▶  ingest  ──▶  cache  ──▶  ask
                  (whole)      (warm)     (grounded)
```

Three properties follow:

- **Grounded, not recalled.** Answers derive from the code in front of us, not from what projects like this usually look like. When CodeAtlas doesn't know, it says so.
- **Whole-system by default.** The unit of understanding is the repository, not the file.
- **Navigation and explanation on one surface.** The explorer and the assistant share a context, so every answer is anchored to something you can open.

> [!NOTE]
> **Early and unstable.** [`docs/ENGINEERING_NOTEBOOK.md`](docs/ENGINEERING_NOTEBOOK.md) is the source of truth for design, roadmap and known limitations — including an honest account of where this doesn't work yet. Read it before contributing.

---

## What's in the box

| | |
|---|---|
| **Whole-repository context** | Full tree and contents ingested in one pass and cached answers see the project entire |
| **Grounded assistant** | Cites real paths; renders mermaid diagrams for architecture questions |
| **Three-pane workspace** | Resizable explorer / viewer / assistant, each collapsible |
| **More than source** | Code, Jupyter notebooks and PDFs all render in place |
| **Warm by default** | Redis-backed repository cache with a 6h TTL; second visits open immediately |
| **Visible budget** | Per-IP daily quota surfaced live in the UI, with a fallback API key behind it |

---

## Architecture at a glance

Two services, two stateful dependencies.

```
┌────────────────────────────────┐        ┌──────────────────────────┐
│  Web app — Next.js 15          │        │  Ingestion — FastAPI     │
│                                │        │                          │
│  workspace UI                  │◀──────▶│  POST /ingest/           │
│  /api/gemini                   │        │  gitingest.ingest_async  │
│  /api/collect-repo-data        │        └────────────┬─────────────┘
│  /api/file-content             │                     │
└──────┬──────────────┬──────────┘                     │
       │              │                                │
   ┌───▼───┐    ┌─────▼──────┐                  ┌──────▼──────┐
   │ Redis │    │ Gemini API │                  │ GitHub API  │
   └───────┘    └────────────┘                  └─────────────┘
```

The ingestion service is separate because `gitingest` is a Python library. It's stateless; all cache and quota state lives in Redis, reachable only from the web app. Full detail — including request sequences and the retrieval design — is in the [engineering notebook](docs/ENGINEERING_NOTEBOOK.md#3-current-architecture).

---

## Quickstart

**You'll need:** Node 20+ with pnpm · Python 3.10+ · a Redis instance · a [Gemini API key](https://aistudio.google.com/app/apikey) · a GitHub PAT (**classic, no scopes ticked** CodeAtlas only reads public repos, so the token is purely for the higher rate limit).

```bash
# 1 — install
cd frontend && pnpm install && cd ..
pip install -r backend/requirements.txt

# 2 — configure (repo root; one file shared by both services)
cp .env.example .env           # then fill in the values

# 3 — run both services
uvicorn main:app --reload --port 8000 --app-dir backend   # terminal 1
cd frontend && pnpm dev                                    # terminal 2
```

Open `http://localhost:3001`, paste a repository, and the workspace opens at `/{owner}/{name}`.

<details>
<summary><strong>Docker (full stack)</strong></summary>

```bash
cd docker
docker compose --env-file ../.env up --build
```

Six containers: the web app, the ingestion/retrieval backend, Redis, Qdrant, Postgres,
and a one-shot `migrate` service that applies `database/migrations` and exits before
the web app starts. Only the web app is published — on **`http://localhost:3000`**,
not 3001; `pnpm dev` uses 3001 so the two can run side by side.

Sign-in does not work against the Docker stack unless your OAuth app's callback is
registered for port 3000 — see §20 of the engineering notebook.

The ingestion service can also deploy on its own — see `render.yaml`.
</details>

---

## Configuration

Every setting is an environment variable. `.env.example` documents all of them; these are the ones without which nothing runs:

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Answering model |
| `GITHUB_TOKEN` | Repository metadata and file reads |
| `GITINGEST_API_URL` | Where the ingestion service lives (compose sets this itself) |
| `REDIS_URL` | Repository cache **and** rate-limit store (compose sets this itself) |
| `NEXT_PUBLIC_APP_URL` | This deployment's public base URL |

Deploying beyond a laptop needs three more: `INGEST_SERVICE_TOKEN` (without it the
backend's paid `/ingest/`, `/index/` and `/search/` endpoints are unauthenticated),
`AUTH_SECRET` (whenever sign-in is configured), and `POSTGRES_PASSWORD` (it defaults
to `codeatlas`). §20 of the engineering notebook has the full required/optional split
and the production OAuth callback.

Optional: `GEMINI_API_KEY_SECONDARY` (failover) · `NEXT_PUBLIC_CODEATLAS_REPO_OWNER`/`_NAME` (star count in the header) · `NEXT_PUBLIC_RYBBIT_SITE_ID` (analytics; blank disables).

No identifier is hardcoded anywhere — leave a variable unset and its feature switches off cleanly.

---

## Asking good questions

The assistant is scoped to the open repository. It rewards architectural questions:

```
Explain the project structure and what it does
Draw the request flow as a sequence diagram
What are the main dependencies, and why is each one here?
Which files would I need to touch to add X?
Explain this file            ← with a file selected in the explorer
```

Quick-prompt buttons cover the common ones. The first is context-aware: it becomes *Explain this file* whenever a file is open.

---

## Layout

```
frontend/       Next.js web application
  app/          App Router — pages and API route handlers
  components/   Workspace panes, viewers, site sections, shadcn/ui primitives
  lib/          GitHub client, prompt assembly, caching, rate limiting
backend/        FastAPI ingestion service
docker/         Dockerfile + .dockerignore
docs/           Engineering notebook — start here
.env            Shared configuration for both services
```

---

## Contributing

Read [`docs/ENGINEERING_NOTEBOOK.md`](docs/ENGINEERING_NOTEBOOK.md) first. It records the current architecture, nine known limitations, and the decisions already made with their tradeoffs — so a proposal can build on them instead of rediscovering them. Its TODO checklist is the shortest path to a useful first PR.

If a change alters the architecture, update the notebook in the same commit.

## License

MIT.

## Built with

[Next.js](https://nextjs.org/) · [shadcn/ui](https://ui.shadcn.com/) · [gitingest](https://github.com/cyclotruc/gitingest) · [Google Gemini](https://deepmind.google/technologies/gemini/)
