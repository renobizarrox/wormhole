"""
Simple variable substitution for path/query/body templates.

Supports placeholders like {{ input.foo }}, {{ steps.step1.output.id }}.
MVP: string replace; phase 2: full expression language.
"""

import re
from typing import Any


def resolve_template(template: str, context: dict[str, Any]) -> str:
    """
    Replace {{ path.to.value }} placeholders with values from context.

    context may contain: input, steps, env, etc.
    """
    if not template or not isinstance(template, str):
        return template

    def replacer(match: re.Match) -> str:
        path = match.group(1).strip().split(".")
        try:
            value = context
            for key in path:
                value = value[key]
            return str(value) if value is not None else ""
        except (KeyError, TypeError):
            return ""

    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", replacer, template)
