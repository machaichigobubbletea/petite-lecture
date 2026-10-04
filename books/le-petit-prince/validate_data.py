#!/usr/bin/env python3
"""Validate the Le Petit Prince book data without changing any files."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CHAPTER_DIR = ROOT / "chapters"
CHAPTER_COUNT = 27
CHAPTER_FILE = re.compile(r"chapters/chapter-(\d{2})\.json\Z")


class Validator:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.ids: dict[str, str] = {}

    def error(self, location: str, message: str) -> None:
        self.errors.append(f"ERROR {location}: {message}")

    def warning(self, location: str, message: str) -> None:
        self.warnings.append(f"WARNING {location}: {message}")

    def load_json(self, path: Path) -> Any | None:
        location = path.relative_to(ROOT).as_posix()
        if not path.is_file():
            self.error(location, "required JSON file is missing")
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
            self.error(location, f"cannot read valid JSON ({exc})")
            return None

    def require_object(self, value: Any, location: str) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            self.error(location, "must be a JSON object")
            return None
        return value

    def require_string(self, obj: dict[str, Any], key: str, location: str) -> str | None:
        value = obj.get(key)
        if not isinstance(value, str) or not value.strip():
            self.error(f"{location}.{key}", "must be a non-empty string")
            return None
        return value

    def require_list(self, obj: dict[str, Any], key: str, location: str) -> list[Any] | None:
        value = obj.get(key)
        if not isinstance(value, list):
            self.error(f"{location}.{key}", "must be an array")
            return None
        return value

    def optional_text(self, obj: dict[str, Any], key: str, location: str) -> None:
        if key not in obj:
            return
        value = obj[key]
        if value is not None and (not isinstance(value, str) or not value.strip()):
            self.error(f"{location}.{key}", "must be null or a non-empty string")

    def register_id(self, value: Any, location: str) -> str | None:
        if not isinstance(value, str) or not value.strip():
            self.error(f"{location}.id", "must be a non-empty string")
            return None
        previous = self.ids.get(value)
        if previous is not None:
            self.error(f"{location}.id", f"duplicate ID {value!r}; first used at {previous}")
        else:
            self.ids[value] = location
        return value

    def validate(self) -> int:
        manifest_path = ROOT / "book.json"
        manifest = self.require_object(self.load_json(manifest_path), "book.json")
        if manifest is None:
            return self.finish()

        self.register_id(manifest.get("bookId"), "book.json")
        for key in ("title", "author", "language", "textVersion"):
            self.require_string(manifest, key, "book.json")
        for key in ("source", "masterEdition"):
            if not isinstance(manifest.get(key), dict):
                self.error(f"book.json.{key}", "must be a JSON object")

        planned_count = manifest.get("plannedChapterCount")
        if type(planned_count) is not int or planned_count != CHAPTER_COUNT:
            self.error("book.json.plannedChapterCount", f"must be the integer {CHAPTER_COUNT}")
        if manifest.get("frontMatter") != "front-matter.json":
            self.error("book.json.frontMatter", "must reference front-matter.json")

        entries = self.require_list(manifest, "chapters", "book.json")
        if entries is None:
            entries = []
        if len(entries) != CHAPTER_COUNT:
            self.error("book.json.chapters", f"must contain {CHAPTER_COUNT} chapter entries; found {len(entries)}")

        entry_numbers: list[int] = []
        manifest_by_number: dict[int, dict[str, Any]] = {}
        for index, raw_entry in enumerate(entries, start=1):
            location = f"book.json.chapters[{index}]"
            entry = self.require_object(raw_entry, location)
            if entry is None:
                continue
            number = entry.get("number")
            if type(number) is not int:
                self.error(f"{location}.number", "must be an integer")
                continue
            entry_numbers.append(number)
            if number in manifest_by_number:
                self.error(f"{location}.number", f"duplicate chapter number {number}")
            manifest_by_number[number] = entry
            self.require_string(entry, "id", location)
            self.require_string(entry, "title", location)
            expected_file = f"chapters/chapter-{number:02d}.json"
            if entry.get("file") != expected_file:
                self.error(f"{location}.file", f"must reference {expected_file}")

        if entry_numbers != list(range(1, CHAPTER_COUNT + 1)):
            self.error("book.json.chapters", "chapter numbers must be consecutive from 1 through 27 in order")

        front_path = ROOT / "front-matter.json"
        front = self.require_object(self.load_json(front_path), "front-matter.json")
        if front is not None:
            front_location = "front-matter.json"
            self.register_id(front.get("id"), front_location)
            for key in ("title", "language", "sourceEdition", "sourceReference"):
                self.require_string(front, key, front_location)
            paragraphs = self.require_list(front, "paragraphs", front_location)
            if paragraphs is not None:
                if not paragraphs:
                    self.error(f"{front_location}.paragraphs", "must contain at least one paragraph")
                for i, paragraph in enumerate(paragraphs, start=1):
                    if not isinstance(paragraph, str) or not paragraph.strip():
                        self.error(f"{front_location}.paragraphs[{i}]", "must be a non-empty string")

        for number in range(1, CHAPTER_COUNT + 1):
            path = CHAPTER_DIR / f"chapter-{number:02d}.json"
            location = path.relative_to(ROOT).as_posix()
            chapter = self.require_object(self.load_json(path), location)
            if chapter is None:
                continue
            self.validate_chapter(chapter, number, manifest_by_number.get(number), location)

        if CHAPTER_DIR.is_dir():
            for path in sorted(CHAPTER_DIR.glob("*.json")):
                if not CHAPTER_FILE.fullmatch(path.relative_to(ROOT).as_posix()):
                    self.error(path.relative_to(ROOT).as_posix(), "unexpected chapter JSON filename")
        return self.finish()

    def validate_chapter(
        self,
        chapter: dict[str, Any],
        expected_number: int,
        manifest_entry: dict[str, Any] | None,
        location: str,
    ) -> None:
        chapter_id = self.register_id(chapter.get("id"), location)
        number = chapter.get("number")
        if type(number) is not int or number != expected_number:
            self.error(f"{location}.number", f"must match filename chapter-{expected_number:02d}.json")
        if chapter_id is not None and manifest_entry is not None and chapter_id != manifest_entry.get("id"):
            self.error(f"{location}.id", "does not match the chapter ID in book.json")
        for key in ("title", "language", "textVersion", "sourceEdition", "sourceReference"):
            self.require_string(chapter, key, location)
        if manifest_entry is not None and chapter.get("title") != manifest_entry.get("title"):
            self.error(f"{location}.title", "does not match the title in book.json")

        paragraphs = self.require_list(chapter, "paragraphs", location)
        sentences = self.require_list(chapter, "sentences", location)
        if paragraphs is None:
            paragraphs = []
        if sentences is None:
            sentences = []
        if not paragraphs:
            self.error(f"{location}.paragraphs", "must contain at least one paragraph record")
        if not sentences:
            self.error(f"{location}.sentences", "must contain at least one sentence")

        paragraph_ids: set[str] = set()
        paragraph_sentence_refs: list[str] = []
        for index, raw_paragraph in enumerate(paragraphs, start=1):
            item_location = f"{location}.paragraphs[{index}]"
            paragraph = self.require_object(raw_paragraph, item_location)
            if paragraph is None:
                continue
            paragraph_id = self.register_id(paragraph.get("id"), item_location)
            if paragraph_id is not None:
                paragraph_ids.add(paragraph_id)
            self.require_string(paragraph, "sourceReference", item_location)
            sentence_ids = self.require_list(paragraph, "sentenceIds", item_location)
            if sentence_ids is not None:
                for ref_index, sentence_id in enumerate(sentence_ids, start=1):
                    if not isinstance(sentence_id, str) or not sentence_id.strip():
                        self.error(f"{item_location}.sentenceIds[{ref_index}]", "must be a non-empty sentence ID")
                    else:
                        paragraph_sentence_refs.append(sentence_id)

        sentence_ids: set[str] = set()
        for index, raw_sentence in enumerate(sentences, start=1):
            item_location = f"{location}.sentences[{index}]"
            sentence = self.require_object(raw_sentence, item_location)
            if sentence is None:
                continue
            sentence_id = self.register_id(sentence.get("id"), item_location)
            if sentence_id is not None:
                sentence_ids.add(sentence_id)
            french = self.require_string(sentence, "originalFrench", item_location)
            for key in ("modernFrench", "japanese", "english", "grammarNotes"):
                self.optional_text(sentence, key, item_location)
            for key in ("sourceEdition", "sourceReference", "textVersion", "paragraphId"):
                self.require_string(sentence, key, item_location)
            paragraph_id = sentence.get("paragraphId")
            if isinstance(paragraph_id, str) and paragraph_id and paragraph_id not in paragraph_ids:
                self.error(f"{item_location}.paragraphId", f"references missing paragraph ID {paragraph_id!r}")

            phrases = self.require_list(sentence, "phrases", item_location)
            if phrases is not None:
                for phrase_index, raw_phrase in enumerate(phrases, start=1):
                    self.validate_phrase(raw_phrase, phrase_index, french, item_location)

        for sentence_id in sorted(set(paragraph_sentence_refs)):
            if sentence_id not in sentence_ids:
                self.error(f"{location}.paragraphs", f"references missing sentence ID {sentence_id!r}")
        for sentence_id in sorted(sentence_ids):
            if paragraph_sentence_refs.count(sentence_id) != 1:
                self.error(f"{location}.sentences", f"sentence ID {sentence_id!r} must be referenced by exactly one paragraph")

    def validate_phrase(self, raw_phrase: Any, index: int, sentence_text: str | None, sentence_location: str) -> None:
        location = f"{sentence_location}.phrases[{index}]"
        phrase = self.require_object(raw_phrase, location)
        if phrase is None:
            return
        self.register_id(phrase.get("id"), location)
        phrase_text = self.require_string(phrase, "originalFrench", location)
        for key in ("modernFrench", "japanese", "english", "grammarNotes"):
            self.optional_text(phrase, key, location)
        for key in ("phraseType", "segmentationMethod", "sourceReference"):
            self.require_string(phrase, key, location)

        text_range = phrase.get("characterRange")
        if not isinstance(text_range, dict):
            self.error(f"{location}.characterRange", "must be an object with integer start and end")
        else:
            start, end = text_range.get("start"), text_range.get("end")
            if type(start) is not int or type(end) is not int or start < 0 or end < start:
                self.error(f"{location}.characterRange", "start and end must be non-negative integers with end >= start")
            elif sentence_text is not None and phrase_text is not None:
                if end > len(sentence_text) or sentence_text[start:end] != phrase_text:
                    self.error(f"{location}.characterRange", "does not select the phrase text from its sentence")

        words = self.require_list(phrase, "words", location)
        if words is not None:
            for word_index, raw_word in enumerate(words, start=1):
                word_location = f"{location}.words[{word_index}]"
                word = self.require_object(raw_word, word_location)
                if word is None:
                    continue
                self.register_id(word.get("id"), word_location)
                self.require_string(word, "originalFrench", word_location)
                for key in ("modernFrench", "japanese", "english", "grammarNotes"):
                    self.optional_text(word, key, word_location)

    def finish(self) -> int:
        for message in self.errors:
            print(message, file=sys.stderr)
        for message in self.warnings:
            print(message)
        print(f"Validation: {len(self.errors)} error(s), {len(self.warnings)} warning(s)")
        return 1 if self.errors else 0


def main() -> int:
    return Validator().validate()


if __name__ == "__main__":
    raise SystemExit(main())
