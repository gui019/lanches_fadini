# Coding conventions

- Use English for technical identifiers, function and variable names, code comments, test descriptions, and developer-facing CLI output.
- Use `snake_case` in Python, `camelCase` in TypeScript, and `PascalCase` for classes, types, and React components. Prefer descriptive names over abbreviations.
- Keep customer and staff interface copy in Brazilian Portuguese, including validation messages returned by the API for display in the site.
- Preserve business names, catalog identifiers, existing public URLs, environment variable names, and stored status values when refactoring technical names. Renaming these contracts requires a separate compatibility change.
- Documentation for the restaurant owner may remain in Portuguese. Test selectors must continue matching the actual Portuguese interface.
- Follow the framework-specific instructions in `frontend/AGENTS.md`. Validate changed code with the existing Ruff, TypeScript, build, pytest, and Playwright checks as appropriate.
