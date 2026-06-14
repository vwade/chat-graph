# Changelog

All notable changes to Chat Graph will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows a push/build-oriented release log. Add entries under `Unreleased` while preparing a change, then move them into a dated build section when that push or build is cut.

## [Unreleased]

### Added

- Added this changelog so future pushes and builds have a single place to record user-facing features, fixes, refactors, and operational notes.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

### Removed

- Nothing yet.

## [0.1.0] - 2026-06-14

### Added

- Built the initial frontend-first Chat Graph prototype as a React, TypeScript, Vite, and Three.js application.
- Added a 2D graph canvas with draggable nodes, canvas panning, mouse-wheel zoom, multi-select, branching, merging, and manual reference or contradiction edge creation.
- Added graph-native conversation primitives for user, assistant, system, summary, memory, artifact, JSON, decision, question, claim, reference, branch, thread, agent, semantic cluster, and context bundle nodes.
- Added semantic edge kinds for replies, references, support, contradictions, revisions, branching, variants, summaries, containment, context usage, generation, semantic matches, and tool input/output relationships.
- Added a node inspector for editing titles, semantic node kinds, bodies, tags, context radius, and agent settings.
- Added a composer and chat panel that project selected graph nodes into a conversational workflow.
- Added a mock agent mode so the interface works without backend setup.
- Added an HTTP agent adapter that posts compiled messages and graph context to a configurable endpoint and accepts common response shapes.
- Added a Context Compiler that builds prompt bundles from selected graph neighborhoods with traversal options.
- Added local semantic relevance and context candidate recommendations for discovering related graph nodes.
- Added additive import flows for ChatGPT-style exports, message arrays, and generic JSON so imported conversations preserve thread identity instead of replacing the graph.
- Added JSON import/export support for graph portability.
- Added IndexedDB autosave for local-first persistence.
- Added sample graph data for immediate exploration.
- Added project documentation covering the mental model, run/build commands, real-agent integration, roadmap, and suggested next steps.

### Changed

- Refactored graph mutation handling around the canonical `GraphPatch` shape.
- Deduplicated context compiler exports and removed duplicate importer declarations.
- Cleaned up leftover merge artifacts in the graph reducer.

### Fixed

- Fixed duplicated context implementation paths so context compilation uses the canonical implementation.
- Fixed duplicate importer type declarations left over from earlier refactors.
