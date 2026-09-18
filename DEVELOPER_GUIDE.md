# 🧠 AI Studio - Developer Guide

Welcome to the technical core of AI Studio. This document outlines the architecture, design decisions, and implementation details for developers looking to extend or understand the system.

## 🚀 Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/) (Desktop Core)
- **Frontend**: [React](https://react.dev/) + [Vite](https://vite.dev/)
- **Styling**: [TailwindCSS](https://tailwindcss.com/) (Custom UI Logic)
- **Layout Engine**: [FlexLayout-React](https://github.com/caplin/FlexLayout)
- **Editor**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **LLM Backend**: [Ollama](https://ollama.com/) (Local-first)
- **State Management**: React Hooks + `useRef` persistence for async loops.

## 🏗️ Architecture

AI Studio follows a strictly decoupled architecture between the system-level capabilities and the agentic logic.

### 1. Main Process (`electron/main.ts`)
The Main process acts as the **System Guardian**. It exposes "Stateless Tools" to the renderer and enforces security boundaries.
- **Tool Handlers**: Implementation of `read_file`, `write_file`, `execute_command`, etc.
- **Security**: `isPathSafe` checks to ensure the agent doesn't escape the workspace.
- **HITL (Human-In-The-Loop)**: A global approval mechanism (`pendingApprovals`) that pauses tool execution until the user grants permission via the UI.
- **Session Management**: Uses `AbortController` to kill stale LLM streams when switching models or resetting panes.

### 2. Renderer Process (`src/App.tsx`)
The Renderer acts as the **Agentic Orchestrator**. Unlike traditional implementations where the backend loops, AI Studio runs the agentic logic on the client.
- **Agentic Loop**: A `while` loop that manages the dialogue between the user, the LLM, and the system tools.
- **State Persistence**: Uses `useRef` (`panesRef`) to provide the async loop with access to the latest UI state (like model changes) without triggering re-renders or suffering from stale closures.
- **FlexLayout Integration**: Manages multiple independent agent instances (panes), each with its own history, model, and tool queue.

## 🤖 The Agentic Loop

The core of the intelligence resides in `runAgenticLoop`:
1. **Model Check**: Fetches the freshest model name from `panesRef`.
2. **Context Assembly**: Merges user prompt with `getWorkspaceContextString()` (file tree).
3. **LLM Call**: Invokes `ollama-chat`.
4. **Tool Detection**: If `tool_calls` are present:
   - Populates the `toolQueue` UI.
   - Iteratively calls `window.electronAPI.executeTool`.
   - Appends tool results to the message history.
   - Loops back to step 1.
5. **Final Response**: Updates the output and stops the generator.

## 🛡️ Security Features

- **Path Jailing**: All file operations are resolved and checked against the `workspacePath`.
- **Command Sanitization**: Dangerous commands (e.g., `rm -rf /`) are blocked at the Main process level.
- **HITL Verification**: Critical operations (writing files, running shell commands) require explicit user approval with a diff-view for safety.

## 🛠️ Development & Extension

### Adding a New Tool
1. Define the tool schema in `electron/main.ts` (the `tools` array).
2. Implement the tool logic in the `execute-tool` IPC handler.
3. The renderer will automatically detect and handle the new tool if the model supports it.

### UI Customization
The UI uses a custom "Glassmorphic" design system defined in `src/index.css`. We avoid standard Tailwind utility classes for core aesthetics to maintain a premium, state-of-the-art look.

---

*AI Studio: Built by developers, for developers.*
