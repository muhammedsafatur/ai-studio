# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

AI Studio is a local-first desktop IDE for autonomous AI-powered development. It runs multiple LLM agents simultaneously via Ollama (all local, no cloud), with each agent able to read/write files and execute terminal commands through a Human-in-the-Loop approval system.

## Commands

```bash
npm run dev       # Start Vite dev server + Electron (requires Ollama running locally)
npm run build     # Compile all TS configs + Vite production build
npm run lint      # ESLint check
npm run preview   # Preview production Vite build
```

No test suite is configured.

Dev starts three parallel processes: Vite on port 5173, TypeScript watcher for Electron, and Electron itself (waits for port 5173 before launching).

## Architecture

The app is split into two Electron processes and a renderer:

### `electron/main.ts` — Main Process (System Guardian)
Exposes stateless IPC tools to the renderer:
- File operations (read/write/create/delete/rename) with `isPathSafe` path jailing to the workspace root
- Terminal command execution with streamed output
- Ollama API integration (model management, streaming chat)
- Hardware monitoring (RAM, VRAM, CPU via `systeminformation`)
- HITL approval events for critical operations (writes, commands)

### `electron/preload.ts` — Context Bridge
Context-isolated IPC bridge that exposes `window.electronAPI` to the renderer. All renderer↔main communication goes through this typed interface.

### `src/App.tsx` — Renderer / Agentic Orchestrator
The largest file (~1000+ lines). Runs the autonomous LLM loop entirely in the client:
1. Assembles context (workspace file tree + conversation history + system prompt)
2. Streams response from Ollama chat API
3. Parses tool calls from the streamed response
4. Queues tools and shows HITL approval dialogs for destructive operations
5. Executes approved tools via `electronAPI`, appends results, loops back

State is stored in `localStorage` (pane configs, workspace path). Multiple independent agent panes run concurrently via `AbortController` per pane to cancel stale streams.

### `src/constants/teamScenarios.ts`
Pre-configured multi-agent team setups (single/double/triple/quad/pentad panes). Each entry defines model, role label, and a full system prompt. Extend this to add new team templates.

### `src/components/ModelLibrary.tsx`
Ollama model management UI (pull, create, delete models).

## Key Design Constraints

- **Path jailing**: All file operations validate against the workspace root in `isPathSafe` (main process). Always use forward slashes in paths even on Windows — the Electron main process normalizes them.
- **Tool call format**: The `MASTER_PROMPT` (defined in `App.tsx`) enforces XML-style tool calls (`<write_file>`, `<execute_command>`, etc.). The renderer parses these from streamed text.
- **Windows-first**: PowerShell is the terminal backend. Path separators and command execution assume Windows.
- **No cloud**: All LLM inference runs through Ollama (`http://localhost:11434`). There are no external API calls to AI providers.
- **React 19**: Uses the new React 19 APIs. Avoid patterns from older React versions.

## TypeScript Configuration

Four separate tsconfig files:
- `tsconfig.app.json` — React renderer (bundler module resolution, ES2023, JSX)
- `tsconfig.electron.json` — Electron main process (CommonJS output to `dist-electron/`, esnext target)
- `tsconfig.node.json` — Vite config file only
- `tsconfig.json` — Root references to app and node configs

When adding files to the Electron main process, ensure they're covered by `tsconfig.electron.json`.

## UI System

- TailwindCSS v4 with a custom glassmorphic design system defined in `src/index.css`
- FlexLayout-React for the multi-pane window management
- Monaco Editor for code editing
- No component library — all UI is custom
