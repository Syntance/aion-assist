# Graph Report - aion assist  (2026-11-17)

## Corpus Check
- 88 files · ~77,669 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 857 nodes · 1646 edges · 34 communities (27 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e126a823`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_panels.tsx|panels.tsx]]
- [[_COMMUNITY_protocol.test.ts|protocol.test.ts]]
- [[_COMMUNITY_Engine|Engine]]
- [[_COMMUNITY_decoders.ts|decoders.ts]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_pipeline.ts|pipeline.ts]]
- [[_COMMUNITY_PetBook|PetBook]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_PetsPanel.tsx|PetsPanel.tsx]]
- [[_COMMUNITY_Settings.tsx|Settings.tsx]]
- [[_COMMUNITY_types.ts|types.ts]]
- [[_COMMUNITY_OverlayApi|OverlayApi]]
- [[_COMMUNITY_fps.ts|fps.ts]]
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_armory.ts|armory.ts]]
- [[_COMMUNITY_history.ts|history.ts]]
- [[_COMMUNITY_store.ts|store.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_win32.ts|win32.ts]]
- [[_COMMUNITY_HistoryStore|HistoryStore]]
- [[_COMMUNITY_catalog.ts|catalog.ts]]
- [[_COMMUNITY_Reader|Reader]]
- [[_COMMUNITY_Aion Assist|Aion Assist]]
- [[_COMMUNITY_daily.test.ts|daily.test.ts]]
- [[_COMMUNITY_catalogImport.ts|catalogImport.ts]]
- [[_COMMUNITY_Updater|Updater]]
- [[_COMMUNITY_opponents.ts|opponents.ts]]
- [[_COMMUNITY_Wydawanie aktualizacji (GitHub Releases)|Wydawanie aktualizacji (GitHub Releases)]]
- [[_COMMUNITY_petTrackerImport.ts|petTrackerImport.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_gen-pet-assets.py|gen-pet-assets.py]]
- [[_COMMUNITY_gen-pet-data.py|gen-pet-data.py]]

## God Nodes (most connected - your core abstractions)
1. `Engine` - 62 edges
2. `OverlayApi` - 33 edges
3. `PetBook` - 21 edges
4. `GameEvent` - 18 edges
5. `compilerOptions` - 16 edges
6. `Bindings` - 15 edges
7. `compact()` - 15 edges
8. `HistoryStore` - 14 edges
9. `W` - 14 edges
10. `EncounterRecord` - 13 edges

## Surprising Connections (you probably didn't know these)
- `book()` --calls--> `emptyPetStore()`  [EXTRACTED]
  tests/pets.test.ts → src/core/pets/petBook.ts
- `Props` --references--> `PlayerCard`  [EXTRACTED]
  src/renderer/src/components/PlayerRow.tsx → src/shared/types.ts
- `EngineStore` --references--> `KillEntry`  [EXTRACTED]
  src/core/engine/engine.ts → src/shared/types.ts
- `LookupResult` --references--> `PlayerCard`  [EXTRACTED]
  src/core/engine/engine.ts → src/shared/types.ts
- `EngineOptions` --references--> `EncounterRecord`  [EXTRACTED]
  src/core/engine/engine.ts → src/shared/types.ts

## Import Cycles
- None detected.

## Communities (34 total, 7 thin omitted)

### Community 0 - "panels.tsx"
Cohesion: 0.05
Nodes (53): App(), isToolbarShown(), CLASS_LEGEND, ClassIcon(), emblems, emblemUrl(), GLYPHS, LABEL (+45 more)

### Community 1 - "protocol.test.ts"
Cohesion: 0.07
Nodes (34): contains(), Direction, Discovery, findNameField(), hex(), stamp(), Stat, WATCH_OPCODES (+26 more)

### Community 3 - "decoders.ts"
Cohesion: 0.05
Nodes (57): Candidate, CapturePipeline, flowKey(), hasHeartbeat(), looksLikeTls(), PipelineStatus, Held, ipOffset() (+49 more)

### Community 4 - "devDependencies"
Cohesion: 0.04
Nodes (47): build, appId, files, productName, publish, win, dependencies, electron-updater (+39 more)

### Community 5 - "pipeline.ts"
Cohesion: 0.11
Nodes (9): LockedFlow, TcpReassembler, Pending, RttTracker, seqAtOrAfter(), StreamDelay, StreamDelayReading, beat() (+1 more)

### Community 6 - "PetBook"
Cohesion: 0.05
Nodes (43): emptyPetStore(), META, PetBook, PetBookOptions, PetProfile, PetState, PetStoreData, stageGoal() (+35 more)

### Community 7 - "index.ts"
Cohesion: 0.12
Nodes (8): Bindings, CapturedPacket, cString(), listDevices(), load(), PcapDevice, PcapHandle, Ptr

### Community 8 - "PetsPanel.tsx"
Cohesion: 0.16
Nodes (5): EngineOptions, isWorldNpc(), FocusSnapshot, MeterSnapshot, NearbyRow

### Community 9 - "Settings.tsx"
Cohesion: 0.05
Nodes (22): api, Drag, Panel(), Props, ViewContext, MODIFIER_LABEL, PANEL_LABEL, REGIONS (+14 more)

### Community 10 - "types.ts"
Cohesion: 0.11
Nodes (16): DailyRecord, emptyDaily(), EngineContext, HitInfo, LookupResult, PlayerTally, Profile, SkillTally (+8 more)

### Community 12 - "fps.ts"
Cohesion: 0.12
Nodes (14): FpsCounter, advapi, CloseTrace, ControlTraceW, DXGI_PROVIDER, EnableTraceEx2, EventRecordCb, FILTER (+6 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+11 more)

### Community 14 - "armory.ts"
Cohesion: 0.18
Nodes (14): Armory, equipmentSchema, fetchCharacter(), fetchSkillNames(), findCharacter(), Found, getJson(), infoSchema (+6 more)

### Community 15 - "history.ts"
Cohesion: 0.08
Nodes (15): dict, HistoryStore, namesSchema, NamesStore, Run, writeJson(), dayLabel(), PvpDays() (+7 more)

### Community 16 - "store.ts"
Cohesion: 0.06
Nodes (26): EngineStore, AppData, contextSchema, dailySchema, fileSchema, identitySchema, killSchema, memberSchema (+18 more)

### Community 17 - "index.ts"
Cohesion: 0.08
Nodes (27): buildDetail(), capture, demoMode, hitRects, HOTKEY_MARK_CANDIDATES, main(), primaryInstance, CaptureToMain (+19 more)

### Community 18 - "win32.ts"
Cohesion: 0.18
Nodes (14): CursorInfo, CURSORINFO_SIZE, ForegroundWindow, GetCursorInfo, getCursorState(), getForegroundWindow, GetWindowRect, GetWindowTextW (+6 more)

### Community 19 - "HistoryStore"
Cohesion: 0.28
Nodes (4): DeathSnapshot, factionFromServer(), PlayerCard, TargetSnapshot

### Community 20 - "catalog.ts"
Cohesion: 0.18
Nodes (6): catalogSchema, dungeonEntry, DungeonInfo, NpcCatalog, npcEntry, NpcInfo

### Community 22 - "Aion Assist"
Cohesion: 0.18
Nodes (10): Aion Assist, Aktualizacje, Architektura, Bezpieczeństwo konta — stan faktyczny, Skąd pochodzą dane i czego nie ma, Sterowanie, Tryb odkrywania (karta celu po zaznaczeniu), Uruchomienie (+2 more)

### Community 23 - "daily.test.ts"
Cohesion: 0.43
Nodes (3): Fight, newSkill(), skillBase()

### Community 24 - "catalogImport.ts"
Cohesion: 0.27
Nodes (7): abyssProgramPath(), CatalogDungeon, CatalogFile, CatalogNpc, extractCatalog(), importCatalogFromAbyss(), ImportResult

### Community 25 - "Updater"
Cohesion: 0.29
Nodes (3): firstLine(), Updater, UpdateSnapshot

### Community 29 - "Wydawanie aktualizacji (GitHub Releases)"
Cohesion: 0.40
Nodes (4): Co znajomy powinien wiedzieć, Każda nowa wersja, Konfiguracja (zrobiona), Wydawanie aktualizacji (GitHub Releases)

### Community 32 - "index.ts"
Cohesion: 0.29
Nodes (9): Device, devices, discoveryLines, drainAll(), post(), queue, rawLines, scanDevices() (+1 more)

## Knowledge Gaps
- **194 isolated node(s):** `name`, `version`, `description`, `license`, `private` (+189 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Engine` connect `Engine` to `decoders.ts`, `PetsPanel.tsx`, `types.ts`, `history.ts`, `store.ts`, `index.ts`, `HistoryStore`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `GameEvent` connect `decoders.ts` to `protocol.test.ts`, `PetBook`, `index.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `OverlayApi` connect `OverlayApi` to `Settings.tsx`, `index.ts`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _197 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `panels.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.05443037974683544 - nodes in this community are weakly interconnected._
- **Should `protocol.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07307692307692308 - nodes in this community are weakly interconnected._
- **Should `decoders.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05078855920876771 - nodes in this community are weakly interconnected._