## QA review result
I did a static-only review of the latest merged state on the current branch. The repo is clean and I found no literal conflict markers, but several merge-conflict fallout issues remain and look build-breaking.

## Findings

### 1. `src/types.ts` contains duplicated and conflicting type declarations
`ContentType`, `NodeSource`, `ImportedThread`, and `ImportManifest` are declared twice, and `ChatNode` repeats several properties with incompatible optionality/trust aliases. This looks like two PR versions were concatenated instead of reconciled. TypeScript should reject duplicate exported type aliases, and downstream import/manifest code cannot reliably know which schema is intended.

### 2. The toolbar import flow is internally inconsistent and references missing state/functions
`src/components/Toolbar.tsx` calls `setImportError`, `setPreview`, `preview`, and `commitPreview`, but none are defined in the component. It also renders a rich `ImportPreview` shape (`provider`, `file_name`, `patch.add_nodes`, `warnings`, etc.) while `src/importers/types.ts` currently defines `ImportPreview` as only `{ title, description, thread }`. This is likely a botched merge between the old confirm-based import flow and a newer preview-modal flow.

### 3. Importer APIs were partially merged and no longer agree
`src/importers/importer.ts` imports `isChatGraphBackup`, `buildGenericJsonPreview`, and `buildMessageArrayPreview`, but the inspected files expose `isGraphState` privately, `previewGenericJson`, and `previewMessageArray` instead. It also calls `detectImporter(data)` without the required `filename` argument and compares the returned object directly to strings. This will not compile and suggests an older detector API was merged with a newer detector implementation.

### 4. `GraphPatch` has two incompatible shapes across the app
`src/types.ts` defines `GraphPatch` with array fields (`add_nodes`, `add_edges`, `add_threads`, `add_import_manifests`), while `src/importers/types.ts` defines `GraphPatch` with record fields (`nodes`, `edges`). `src/state/graphReducer.ts` imports the importer version and only applies `patch.nodes`/`patch.edges`, so newer importers like `src/importers/chatGptImporter.ts` that build `add_nodes`/`add_edges` patches will not actually import anything if passed to the reducer.

### 5. Context compiler implementation is duplicated, and `ChatPanel` likely receives the old bundle shape
`src/utils/context.ts` re-exports everything from `src/graph/contextCompiler.ts`, then defines its own `DEFAULT_CONTEXT_TRAVERSAL`, `buildContextBundle`, indexes, and stats helpers. Because local exports with the same names shadow/redeclare the re-exported symbols, consumers such as `src/components/ChatPanel.tsx` can end up with the older `ContextBundle` implementation that does not include `items`, while `ChatPanel` renders `bundle.items.map(...)`.

### 6. `src/state/graphReducer.ts` has duplicate action/case remnants
`GraphAction` includes `apply_patch` twice, and `graphReducer` has two identical `case 'apply_patch'` blocks. `normalizeNode` also sets `content_type` twice. These are smaller than the type/importer issues, but they are clear signs of unresolved merge duplication and should be cleaned up while repairing the patch flow.

## What looked okay

- No literal conflict markers were found.
- The working tree was clean before review.
- Recent merge history shows the relevant PR merges are present on the current branch.
- The new `src/graph/contextCompiler.ts` itself appears conceptually coherent, but it is currently undermined by the duplicate legacy implementation in `src/utils/context.ts`.

## Checks
✅ `pwd; rg --files -g 'AGENTS.md' -g '!node_modules' -g '!vendor'; git status --short --branch; git log --oneline --decorate -n 12` — completed; repo is on branch `work`, working tree appeared clean, and recent merge commits were visible.
✅ `printf 'AGENTS files:\n'; find .. -name AGENTS.md -print -maxdepth 4 2>/dev/null | sort; printf '\nBranches:\n'; git branch -vv; printf '\nTop files:\n'; rg --files -g '!node_modules' -g '!dist' -g '!build' | sed -n '1,120p'; printf '\nConflict markers:\n'; rg -n '^(<<<<<<<|=======|>>>>>>>)' -g '!node_modules' -g '!dist' -g '!build' . || true` — completed; no `AGENTS.md` or conflict markers were found in the inspected scope.
✅ `git show --stat --oneline --summary HEAD; printf '\npackage.json\n'; sed -n '1,220p' package.json; printf '\nREADME head\n'; sed -n '1,220p' README.md; printf '\nROADMAP relevant\n'; sed -n '1,260p' ROADMAP.md` — completed; reviewed latest merge summary and documentation.
✅ `sed -n '1,260p' src/types.ts; printf '\n--- ChatPanel ---\n'; sed -n '1,260p' src/components/ChatPanel.tsx; printf '\n--- contextCompiler ---\n'; sed -n '1,360p' src/graph/contextCompiler.ts; printf '\n--- context util ---\n'; sed -n '1,220p' src/utils/context.ts` — completed; found duplicate type/context definitions and likely bundle-shape mismatch.
✅ `sed -n '1,260p' src/state/graphReducer.ts; printf '\n--- GraphProvider ---\n'; sed -n '1,220p' src/state/GraphProvider.tsx; printf '\n--- import types usage ---\n'; rg -n 'ImportedThread|ImportManifest|ContentType|NodeTrust|TrustLevel' src -g '!node_modules'` — completed; found duplicate reducer remnants and type/schema drift.
✅ `sed -n '1,220p' src/importers/types.ts; printf '\n--- importUtils ---\n'; sed -n '1,200p' src/importers/importUtils.ts; printf '\n--- importer ---\n'; sed -n '1,220p' src/importers/importer.ts; printf '\n--- detect ---\n'; sed -n '1,180p' src/importers/detectImporter.ts` — completed; found incompatible importer API versions.
✅ `rg -n "buildImportPreview|detectImporter\(|apply_patch|previewToPatch|createPatch|ImportPreview" src -g '!node_modules'; sed -n '1,300p' src/App.tsx` — completed; traced import/patch usage sites.
✅ `sed -n '1,180p' src/components/Toolbar.tsx; printf '\n--- chatgpt ---\n'; sed -n '1,220p' src/importers/chatGptImporter.ts; printf '\n--- message array ---\n'; sed -n '1,140p' src/importers/messageArrayImporter.ts; printf '\n--- generic json ---\n'; sed -n '1,120p' src/importers/genericJsonImporter.ts` — completed; confirmed Toolbar and importers expect incompatible preview/patch shapes.
⚠️ No `npm install`, `npm run build`, or tests were run because this was a read-only QA review per the repository task instructions.