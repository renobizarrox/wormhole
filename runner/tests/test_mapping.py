"""Tests for template resolution."""

import pytest

from runner.mapping.template import resolve_template


def test_resolve_template_simple():
    assert resolve_template("hello {{ input.name }}", {"input": {"name": "world"}}) == "hello world"


def test_resolve_template_nested():
    assert (
        resolve_template("id={{ steps.a.output.id }}", {"steps": {"a": {"output": {"id": 123}}}})
        == "id=123"
    )


def test_resolve_template_missing_key():
    assert resolve_template("{{ input.missing }}", {"input": {}}) == ""
