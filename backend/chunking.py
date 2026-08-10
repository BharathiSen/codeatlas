"""AST-aware chunking of repository files.

Splitting code on a fixed character window cuts through the middle of functions,
which produces chunks that retrieve well on keywords and explain nothing. This
module walks the tree-sitter syntax tree instead and emits one chunk per
top-level definition, so a retrieved chunk is a thing a developer would
recognise: a whole function, class or method.

Files in languages without a grammar, and prose files, fall back to a
paragraph-aware window — still better than a blind character split.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field, asdict
from typing import Iterable

try:
    from tree_sitter_language_pack import get_parser
    _PARSERS_AVAILABLE = True
except Exception:  # pragma: no cover - exercised only when the wheel is missing
    _PARSERS_AVAILABLE = False

logger = logging.getLogger(__name__)

# Extension -> tree-sitter grammar. Only languages we can actually parse.
LANGUAGE_BY_EXTENSION: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "javascript",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
}

# Node types that represent a nameable, self-contained definition.
DEFINITION_NODES = {
    "function_definition",
    "function_declaration",
    "function_item",
    "method_definition",
    "method_declaration",
    "class_definition",
    "class_declaration",
    "class_specifier",
    "struct_item",
    "impl_item",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "lexical_declaration",       # exported consts, common in TS/JS
    "variable_declaration",
    "export_statement",
}

# A chunk larger than this is split further; smaller ones merge with a sibling.
MAX_CHUNK_CHARS = 6_000
MIN_CHUNK_CHARS = 120
# Prose/unknown-language window.
FALLBACK_WINDOW_CHARS = 2_400
FALLBACK_OVERLAP_CHARS = 240


@dataclass
class Chunk:
    """One retrievable unit, with enough metadata to cite and to filter on."""

    id: str
    path: str
    language: str
    kind: str                    # "definition" | "block" | "prose"
    symbol: str | None
    start_line: int
    end_line: int
    text: str
    file_sha: str
    symbols: list[str] = field(default_factory=list)

    def to_payload(self) -> dict:
        payload = asdict(self)
        payload.pop("id", None)
        return payload


def file_sha(content: str) -> str:
    """Content hash for a single file — the unit of incremental re-indexing."""
    return hashlib.sha256(content.encode("utf-8", "replace")).hexdigest()[:16]


def chunk_id(path: str, start_line: int, sha: str) -> str:
    """Stable, collision-resistant id. Qdrant needs an unsigned 64-bit int."""
    raw = f"{path}:{start_line}:{sha}".encode("utf-8")
    return str(int(hashlib.sha256(raw).hexdigest()[:15], 16))


def language_for(path: str) -> str | None:
    for ext, lang in LANGUAGE_BY_EXTENSION.items():
        if path.endswith(ext):
            return lang
    return None


def _node_name(node, source: bytes) -> str | None:
    """Best-effort identifier for a definition node."""
    for child in node.children:
        if child.type in {"identifier", "type_identifier", "field_identifier", "property_identifier"}:
            return source[child.start_byte:child.end_byte].decode("utf-8", "replace")
    # `export const x = …` and similar wrap the real declaration one level down.
    for child in node.children:
        name = _node_name(child, source) if child.children else None
        if name:
            return name
    return None


def _window(text: str, path: str, sha: str, language: str, kind: str, line_offset: int = 0) -> list[Chunk]:
    """Split oversized or unparseable text on blank lines where possible."""
    chunks: list[Chunk] = []
    step = FALLBACK_WINDOW_CHARS - FALLBACK_OVERLAP_CHARS
    position = 0

    while position < len(text):
        window = text[position:position + FALLBACK_WINDOW_CHARS]

        # Prefer to end on a blank line so a chunk rarely stops mid-thought.
        if position + FALLBACK_WINDOW_CHARS < len(text):
            split = window.rfind("\n\n")
            if split > FALLBACK_WINDOW_CHARS // 2:
                window = window[:split]

        start_line = line_offset + text[:position].count("\n") + 1
        end_line = start_line + window.count("\n")

        if len(window.strip()) >= MIN_CHUNK_CHARS:
            chunks.append(
                Chunk(
                    id=chunk_id(path, start_line, sha),
                    path=path,
                    language=language,
                    kind=kind,
                    symbol=None,
                    start_line=start_line,
                    end_line=end_line,
                    text=window,
                    file_sha=sha,
                )
            )

        position += max(len(window), step)

    return chunks


def chunk_file(path: str, content: str) -> list[Chunk]:
    """Chunk a single file, AST-aware where a grammar exists."""
    if not content or not content.strip():
        return []

    sha = file_sha(content)
    language = language_for(path)

    if not language or not _PARSERS_AVAILABLE:
        return _window(content, path, sha, language or "text", "prose")

    try:
        parser = get_parser(language)
        source = content.encode("utf-8", "replace")
        tree = parser.parse(source)
    except Exception as exc:  # a broken grammar must not lose the file
        logger.warning("Parse failed for %s (%s); windowing instead: %s", path, language, exc)
        return _window(content, path, sha, language, "prose")

    chunks: list[Chunk] = []
    covered_end = 0

    for node in tree.root_node.children:
        if node.type not in DEFINITION_NODES:
            continue

        text = source[node.start_byte:node.end_byte].decode("utf-8", "replace")
        if len(text.strip()) < MIN_CHUNK_CHARS:
            continue

        start_line = node.start_point[0] + 1
        symbol = _node_name(node, source)

        if len(text) > MAX_CHUNK_CHARS:
            # A very large class still needs splitting, but keep its identity.
            for part in _window(text, path, sha, language, "block", line_offset=start_line - 1):
                part.symbol = symbol
                chunks.append(part)
        else:
            chunks.append(
                Chunk(
                    id=chunk_id(path, start_line, sha),
                    path=path,
                    language=language,
                    kind="definition",
                    symbol=symbol,
                    start_line=start_line,
                    end_line=node.end_point[0] + 1,
                    text=text,
                    file_sha=sha,
                    symbols=[symbol] if symbol else [],
                )
            )

        covered_end = max(covered_end, node.end_byte)

    # Imports, module-level constants and config live outside any definition and
    # are exactly what "how is this wired up" questions need.
    preamble = source[:min(covered_end, len(source))] if covered_end else source
    if not chunks:
        return _window(content, path, sha, language, "prose")

    header = source[:tree.root_node.children[0].start_byte].decode("utf-8", "replace") if tree.root_node.children else ""
    if len(header.strip()) >= MIN_CHUNK_CHARS:
        chunks.insert(
            0,
            Chunk(
                id=chunk_id(path, 1, sha),
                path=path,
                language=language,
                kind="block",
                symbol="<module>",
                start_line=1,
                end_line=header.count("\n") + 1,
                text=header,
                file_sha=sha,
            ),
        )

    return chunks


_FILE_HEADER = re.compile(r"^={10,}\s*\nFILE:\s*(.+?)\s*\n={10,}\s*$", re.MULTILINE)


def split_gitingest_content(content: str) -> list[tuple[str, str]]:
    """Recover per-file text from gitingest's concatenated output.

    gitingest emits one flat blob separated by `====\\nFILE: path\\n====`
    banners. Chunking needs file boundaries back, because a chunk without a
    path cannot be cited.
    """
    matches = list(_FILE_HEADER.finditer(content))
    if not matches:
        return [("repository", content)]

    files: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        path = match.group(1).strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        files.append((path, content[start:end]))

    return files


def chunk_repository(content: str) -> list[Chunk]:
    """Chunk a whole ingested repository."""
    chunks: list[Chunk] = []
    for path, text in split_gitingest_content(content):
        chunks.extend(chunk_file(path, text))
    return chunks


def chunk_texts(chunks: Iterable[Chunk]) -> list[str]:
    """Embedding input: the path and symbol are part of what makes a chunk findable."""
    return [
        f"{chunk.path}"
        + (f" — {chunk.symbol}" if chunk.symbol else "")
        + f"\n\n{chunk.text}"
        for chunk in chunks
    ]
