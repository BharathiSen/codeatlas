"""Smoke test for the CodeAtlas ingestion service.

Usage:
    CODEATLAS_INGEST_API_URL=http://localhost:8000 python test_api.py [owner] [repo]
"""

import json
import os
import sys

import requests

API_URL = os.environ.get("CODEATLAS_INGEST_API_URL", "http://localhost:8000")
OWNER = sys.argv[1] if len(sys.argv) > 1 else "vercel"
REPO = sys.argv[2] if len(sys.argv) > 2 else "next.js"

print("Testing CodeAtlas ingestion API...")
try:
    url = f"{API_URL.rstrip('/')}/ingest/"
    data = {"github_link": f"https://github.com/{OWNER}/{REPO}"}

    print(f"Sending request to {url}")
    print(f"Request data: {json.dumps(data, indent=2)}")

    response = requests.post(url, json=data)

    print(f"Status Code: {response.status_code}")
    print("Response:")
    print(json.dumps(response.json(), indent=2))

except Exception as e:
    print(f"Error: {str(e)}")
