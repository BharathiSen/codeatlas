"""A small labelled corpus for measuring retrieval quality.

The corpus is written here rather than pulled from a real repository so results
are reproducible: a GitHub repo changes underneath you and makes two runs
incomparable, which is the one thing an evaluation fixture must never do.

Each query names the file that *should* come back. The queries are deliberately
mixed in kind, because retrieval fails differently for each:

- **exact symbol** — `validate_session`. Dense retrieval alone is unreliable here;
  this is what the keyword half of hybrid search exists for.
- **paraphrase** — "check whether a login is still valid". No lexical overlap
  with the answer; this is what the dense half exists for.
- **conceptual** — "where does rate limiting happen". Neither the symbol nor the
  words appear verbatim; needs real semantic matching.
"""

REPO = "eval/fixture"

# One flat blob in gitingest's format, so the real chunker runs over it.
CORPUS = """====================
FILE: lib/session.py
====================
import hashlib
import time

SESSION_TTL_SECONDS = 3600


def validate_session(token: str) -> bool:
    \"\"\"Return whether a session token is still live and well-formed.\"\"\"
    if not token or len(token) < 16:
        return False
    digest = hashlib.sha256(token.encode()).hexdigest()
    record = SESSION_STORE.get(digest)
    if record is None:
        return False
    return time.time() - record["created"] < SESSION_TTL_SECONDS


def create_session(user_id: int) -> str:
    \"\"\"Mint an opaque session token for a user and record its creation time.\"\"\"
    raw = hashlib.sha256(f"{user_id}:{time.time()}".encode()).hexdigest()
    SESSION_STORE[raw] = {"user": user_id, "created": time.time()}
    return raw

====================
FILE: lib/throttle.py
====================
import time
from collections import defaultdict

BUCKETS = defaultdict(list)
WINDOW_SECONDS = 60
MAX_CALLS = 100


def allow_request(client_key: str) -> bool:
    \"\"\"Decide whether a caller may proceed under the rolling call budget.\"\"\"
    now = time.time()
    recent = [t for t in BUCKETS[client_key] if now - t < WINDOW_SECONDS]
    BUCKETS[client_key] = recent
    if len(recent) >= MAX_CALLS:
        return False
    recent.append(now)
    return True

====================
FILE: api/billing.py
====================
from decimal import Decimal


def compute_invoice_total(line_items) -> Decimal:
    \"\"\"Sum line items and apply the customer's tax rate to produce a total.\"\"\"
    subtotal = sum(Decimal(str(item["amount"])) for item in line_items)
    tax = subtotal * Decimal("0.2")
    return subtotal + tax


def issue_refund(invoice_id: str, amount: Decimal) -> dict:
    \"\"\"Record a refund against an invoice and return the resulting ledger entry.\"\"\"
    return {"invoice": invoice_id, "refunded": str(amount), "status": "processed"}

====================
FILE: api/users.py
====================
def register_user(payload: dict) -> dict:
    \"\"\"Create an account from a registration payload and return the new record.\"\"\"
    email = payload["email"].strip().lower()
    if "@" not in email:
        raise ValueError("invalid email address supplied during registration")
    return {"id": 1, "email": email, "name": payload.get("name", "")}


def deactivate_user(user_id: int) -> None:
    \"\"\"Mark an account inactive so it can no longer authenticate.\"\"\"
    USERS[user_id]["active"] = False

====================
FILE: storage/cache.py
====================
import json


def write_through(key: str, value: dict, ttl: int = 300) -> None:
    \"\"\"Persist a value to the backing store and mirror it into the fast cache.\"\"\"
    DATABASE.put(key, json.dumps(value))
    MEMORY[key] = {"value": value, "expires": ttl}


def evict_expired(now: float) -> int:
    \"\"\"Drop cache entries whose lifetime has elapsed and report how many went.\"\"\"
    stale = [k for k, v in MEMORY.items() if v["expires"] < now]
    for key in stale:
        del MEMORY[key]
    return len(stale)

====================
FILE: lib/tokens.py
====================
import secrets


def generate_api_token(prefix: str = "ca") -> str:
    \"\"\"Produce a random API token for machine callers, unrelated to logins.\"\"\"
    return f"{prefix}_{secrets.token_urlsafe(32)}"


def revoke_api_token(token: str) -> bool:
    \"\"\"Invalidate a machine API token so future calls with it are rejected.\"\"\"
    return API_TOKENS.pop(token, None) is not None

====================
FILE: api/subscriptions.py
====================
from decimal import Decimal


def monthly_charge(plan: str, seats: int) -> Decimal:
    \"\"\"Work out the recurring subscription charge for a plan and seat count.\"\"\"
    rates = {"team": Decimal("12"), "business": Decimal("24")}
    return rates[plan] * seats


def cancel_subscription(account_id: str) -> dict:
    \"\"\"End a recurring subscription and stop further charges to the account.\"\"\"
    return {"account": account_id, "status": "cancelled"}

====================
FILE: storage/session_store.py
====================
def purge_stale_sessions(now: float) -> int:
    \"\"\"Remove session records whose lifetime has elapsed from the store.\"\"\"
    stale = [k for k, v in SESSION_STORE.items() if v["created"] < now - 3600]
    for key in stale:
        del SESSION_STORE[key]
    return len(stale)

====================
FILE: storage/migrations.py
====================
def apply_pending(connection, migrations) -> list:
    \"\"\"Run every migration that has not yet been recorded, in declared order.\"\"\"
    applied = []
    for migration in migrations:
        if not _already_applied(connection, migration.name):
            migration.run(connection)
            applied.append(migration.name)
    return applied
"""

# (query, expected path, kind)
QUERIES: list[tuple[str, str, str]] = [
    # Exact symbol — keyword search should carry these.
    ("validate_session", "lib/session.py", "symbol"),
    ("compute_invoice_total", "api/billing.py", "symbol"),
    ("evict_expired", "storage/cache.py", "symbol"),
    ("register_user", "api/users.py", "symbol"),
    ("apply_pending", "storage/migrations.py", "symbol"),
    ("allow_request", "lib/throttle.py", "symbol"),

    # Paraphrase — dense search should carry these.
    ("check whether a login is still valid", "lib/session.py", "paraphrase"),
    ("work out how much a customer owes including tax", "api/billing.py", "paraphrase"),
    ("create a new account from signup details", "api/users.py", "paraphrase"),
    ("remove cache entries that have timed out", "storage/cache.py", "paraphrase"),
    ("give a user a fresh login token", "lib/session.py", "paraphrase"),
    ("send money back to a customer", "api/billing.py", "paraphrase"),

    # Conceptual — neither symbol nor wording appears verbatim.
    ("where does rate limiting happen", "lib/throttle.py", "conceptual"),
    ("how are database schema changes rolled out", "storage/migrations.py", "conceptual"),
    ("how do we stop someone logging in again", "api/users.py", "conceptual"),
    ("how is data kept in both the database and memory", "storage/cache.py", "conceptual"),

    # Discriminating pairs — each has a topically adjacent distractor that a
    # weak retriever will confuse it with.
    ("clear out expired user sessions", "storage/session_store.py", "discriminating"),
    ("drop stale cached values", "storage/cache.py", "discriminating"),
    ("invalidate a machine credential", "lib/tokens.py", "discriminating"),
    ("end a user's logged-in session", "lib/session.py", "discriminating"),
    ("how much does a customer pay each month", "api/subscriptions.py", "discriminating"),
    ("total up what is owed on a single bill", "api/billing.py", "discriminating"),
    ("stop billing an account going forward", "api/subscriptions.py", "discriminating"),
    ("return money already collected", "api/billing.py", "discriminating"),
]
