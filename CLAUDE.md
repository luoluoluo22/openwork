# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Environment Setup
- **Install dependencies:** `pnpm install`
- **Requirements:** Node.js, `pnpm`, Rust toolchain (for Tauri), `tauri-cli`, and `opencode` CLI on PATH.

### Build & Dev
- **Full Desktop Dev (UI + Tauri):** `pnpm dev`
- **Web UI Dev only:** `pnpm dev:ui`
- **Build Desktop App:** `pnpm build`
- **Build Web UI:** `pnpm build:ui`
- **Typecheck:** `pnpm typecheck`
- **Run Tauri commands:** `pnpm tauri <command>` (e.g., `pnpm tauri info`)

### Testing
- **Run E2E tests:** `pnpm test:e2e`
- **Targeted Tests:**
  - Sessions: `pnpm test:sessions`
  - Events: `pnpm test:events`
  - FS Engine: `pnpm test:fs-engine`
  - Permissions: `pnpm test:permissions`
- **Headless Web Dev:** `bun scripts/dev-headless-web.ts`

## Code Architecture

### Repository Structure
OpenWork is a monorepo managed with `pnpm` workspaces:
- [packages/app/](packages/app/): The core UI (SolidJS). Contains the chat interface, session management, and skill manager.
- [packages/desktop/](packages/desktop/): Tauri wrapper (Rust). Handles native OS integrations like the tray, file picker, and spawning the `opencode` process.
- [packages/server/](packages/server/): Backend service for filesystem-backed operations and remote client support.
- [packages/headless/](packages/headless/): CLI host (`openwrk`) for running without a GUI.

### Core Primitives & Integration
OpenWork acts as a GUI/Host for the **OpenCode** engine. It communicates with OpenCode via the `@opencode-ai/sdk/v2`.

1. **Host Mode:** The desktop app spawns `opencode serve` locally on a loopback port and connects via SSE for real-time updates.
2. **Sessions:** Every "Task Run" in the UI maps to an OpenCode Session.
3. **Extensibility:**
   - **Skills:** Plain-English patterns/prompts stored in `.opencode/skills/`.
   - **Plugins:** Guarded tools defined in `opencode.json` (Project or Global scope).
   - **MCP:** Used for authenticated third-party tool integrations.
4. **Permissions:** The UI intercepts permission requests from the engine (via SSE) and prompts the user for "Allow Once", "Always", or "Deny".

### Tech Stack Details
- **Frontend:** SolidJS with `@opencode-ai/sdk/v2/client`.
- **Backend/Native:** Rust (Tauri).
- **Runtime:** Node.js/Bun for scripts and server components.
