# Workbench Modular Prompts (`prompts/`)

This directory stores first-class, task-specific AI prompts organized by domain subfolder (e.g. `analysis/`, `documents/`, `workflows/`).

## How On-Demand Loading Works

1. **Dynamic Discovery at Priming Time**: When you prime a chat, `PromptRegistryService` scans `prompts/` recursively and injects a compact 1-line index of available prompts (`id`, `relativePath`, and `whenToUse`) into the priming guide.
2. **Loaded Only When Needed**: The full prompt is **not** inlined into every priming session. Instead, when your request matches a prompt's `whenToUse` trigger, the AI reads/loads that specific prompt on demand using `load_prompt` (or `read_file` / `fetch_official_docs`).

## Adding a New Prompt (Zero Code Changes)

Create a new `.md` file inside `prompts/<category>/<your-prompt-id>.md` with YAML frontmatter:

```markdown
---
id: your-prompt-id
category: analysis
name: Human-Readable Prompt Title
description: One-sentence summary of what this prompt accomplishes.
whenToUse: Load this prompt ONLY when the user asks to [describe trigger condition].
---

[Full prompt instructions here. You can include placeholders like [PACKAGE NAME] or [TOPIC].]
```

