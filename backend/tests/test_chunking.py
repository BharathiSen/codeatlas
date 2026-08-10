"""Behaviour tests for AST-aware chunking.

These assert what chunking is *for* — that a retrieved chunk is a whole,
citable definition — rather than that the functions merely run.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from chunking import (  # noqa: E402
    chunk_file,
    chunk_repository,
    file_sha,
    language_for,
    split_gitingest_content,
)

PYTHON_SOURCE = '''import os
from typing import Any


def alpha(value):
    """Return a running total, padded out past the minimum chunk threshold."""
    total = 0
    for index in range(value):
        total += index * 2
    return total


class Beta:
    """A class with a body long enough to clear the minimum chunk size."""

    def method_one(self):
        return 1

    def method_two(self):
        return 2
'''

TS_SOURCE = """import { useState } from "react";

export function useCounter(initial: number) {
  const [count, setCount] = useState(initial);
  const increment = () => setCount((c) => c + 1);
  const reset = () => setCount(initial);
  return { count, increment, reset };
}

export class Registry {
  private items: string[] = [];
  add(item: string) { this.items.push(item); }
  all() { return [...this.items]; }
}
"""


class TestLanguageDetection:
    @pytest.mark.parametrize(
        "path,expected",
        [
            ("a/b.py", "python"),
            ("src/x.ts", "typescript"),
            ("src/x.tsx", "tsx"),
            ("main.go", "go"),
            ("lib.rs", "rust"),
            ("README.md", None),
            ("noextension", None),
        ],
    )
    def test_detects_language_from_extension(self, path, expected):
        assert language_for(path) == expected


class TestDefinitionChunking:
    def test_splits_python_into_whole_definitions(self):
        chunks = chunk_file("src/example.py", PYTHON_SOURCE)
        symbols = {c.symbol for c in chunks}

        assert "alpha" in symbols
        assert "Beta" in symbols

    def test_a_definition_chunk_contains_the_entire_definition(self):
        """The point of AST chunking: never cut through the middle of a function."""
        chunks = chunk_file("src/example.py", PYTHON_SOURCE)
        alpha = next(c for c in chunks if c.symbol == "alpha")

        assert alpha.text.startswith("def alpha(")
        assert "return total" in alpha.text          # the whole body
        assert "class Beta" not in alpha.text        # and nothing beyond it

    def test_line_numbers_locate_the_definition_in_the_original_file(self):
        chunks = chunk_file("src/example.py", PYTHON_SOURCE)
        alpha = next(c for c in chunks if c.symbol == "alpha")
        lines = PYTHON_SOURCE.splitlines()

        assert lines[alpha.start_line - 1].startswith("def alpha")
        assert alpha.end_line > alpha.start_line

    def test_handles_typescript(self):
        chunks = chunk_file("src/hooks.ts", TS_SOURCE)
        symbols = {c.symbol for c in chunks}

        assert any(s and "useCounter" in s for s in symbols) or any(
            "useCounter" in c.text for c in chunks
        )

    def test_every_chunk_carries_citation_metadata(self):
        for chunk in chunk_file("src/example.py", PYTHON_SOURCE):
            assert chunk.path == "src/example.py"
            assert chunk.language == "python"
            assert chunk.start_line >= 1
            assert chunk.end_line >= chunk.start_line
            assert chunk.file_sha
            assert chunk.id


class TestFallbacks:
    def test_prose_is_windowed_not_dropped(self):
        markdown = "# Title\n\n" + ("Body paragraph with real content. " * 60)
        chunks = chunk_file("README.md", markdown)

        assert chunks, "prose must still be retrievable"
        assert all(c.kind == "prose" for c in chunks)

    def test_empty_and_whitespace_files_produce_nothing(self):
        assert chunk_file("empty.py", "") == []
        assert chunk_file("blank.py", "   \n\n  ") == []

    def test_unparseable_source_still_yields_chunks(self):
        """A syntax error must not lose the file — it falls back to windowing."""
        broken = "def (((( totally not python " + ("padding text " * 40)
        chunks = chunk_file("broken.py", broken)

        assert chunks


class TestFileShaAndIdentity:
    def test_identical_content_hashes_identically(self):
        assert file_sha("abc") == file_sha("abc")

    def test_one_character_change_changes_the_hash(self):
        """SHA drives incremental indexing — it must be sensitive."""
        assert file_sha("abc") != file_sha("abd")

    def test_chunk_ids_are_stable_across_runs(self):
        first = chunk_file("src/example.py", PYTHON_SOURCE)
        second = chunk_file("src/example.py", PYTHON_SOURCE)

        assert [c.id for c in first] == [c.id for c in second]

    def test_chunk_ids_are_numeric_for_qdrant(self):
        for chunk in chunk_file("src/example.py", PYTHON_SOURCE):
            assert chunk.id.isdigit()


class TestRepositorySplitting:
    def test_recovers_file_boundaries_from_gitingest_output(self):
        blob = (
            "=" * 20 + "\nFILE: a/first.py\n" + "=" * 20 + "\n" + PYTHON_SOURCE
            + "\n" + "=" * 20 + "\nFILE: b/second.ts\n" + "=" * 20 + "\n" + TS_SOURCE
        )
        paths = [path for path, _ in split_gitingest_content(blob)]

        assert paths == ["a/first.py", "b/second.ts"]

    def test_content_without_banners_is_kept_as_one_unit(self):
        files = split_gitingest_content("just some text with no file headers")

        assert len(files) == 1

    def test_chunks_from_a_repository_carry_their_real_paths(self):
        blob = "=" * 20 + "\nFILE: pkg/mod.py\n" + "=" * 20 + "\n" + PYTHON_SOURCE
        chunks = chunk_repository(blob)

        assert chunks
        assert all(c.path == "pkg/mod.py" for c in chunks)
