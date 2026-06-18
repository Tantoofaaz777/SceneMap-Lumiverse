# SceneMap Lumiverse

SceneMap is a Lumiverse Spindle extension that tracks roleplay scene state as structured JSON.

## Features

- Generate a scene tracker for the latest assistant message.
- Store tracker data in message metadata.
- Display the current tracker in a Lumiverse drawer tab.
- Edit, delete, and regenerate tracker JSON.
- Configure connection, prompt, schema, display layout, context window, and auto-generation.
- Expose the latest tracker as the `{{scenemap}}` macro for prompts.

## Install

Install this repository through Lumiverse's Extensions panel:

```txt
https://github.com/Tantoofaaz777/SceneMap-Lumiverse
```

Required permissions:

- `generation`
- `chats`
- `chat_mutation`
- `ui_panels`

## Development

Build the backend and frontend bundles:

```bash
bun run build
```

Lumiverse loads `dist/backend.js` and `dist/frontend.js` from `spindle.json`.
