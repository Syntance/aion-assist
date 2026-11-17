# Graph Report - aion assist  (2026-11-17)

## Corpus Check
- 87 files · ~76,432 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 849 nodes · 1650 edges · 38 communities (32 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8cea56ef`
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
- [[_COMMUNITY_demo.ts|demo.ts]]
- [[_COMMUNITY_Fight|Fight]]
- [[_COMMUNITY_Wydawanie aktualizacji (GitHub Releases)|Wydawanie aktualizacji (GitHub Releases)]]
- [[_COMMUNITY_petTrackerImport.ts|petTrackerImport.ts]]
- [[_COMMUNITY_Store|Store]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_gen-pet-assets.py|gen-pet-assets.py]]
- [[_COMMUNITY_gen-pet-data.py|gen-pet-data.py]]
- [[_COMMUNITY_Toolbar.tsx|Toolbar.tsx]]

## God Nodes (most connected - your core abstractions)
1. `Engine` - 62 edges
2. `OverlayApi` - 33 edges
3. `GameEvent` - 25 edges
4. `PetBook` - 21 edges
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
- `EngineContext` --references--> `GameEvent`  [EXTRACTED]
  src/core/engine/engine.ts → src/core/protocol/events.ts
- `OpponentBlock()` --calls--> `compact()`  [EXTRACTED]
  src/renderer/src/components/History.tsx → src/renderer/src/format.ts
- `main()` --calls--> `Settings`  [EXTRACTED]
  src/main/index.ts → src/shared/types.ts

## Import Cycles
- None detected.

## Communities (38 total, 6 thin omitted)

### Community 0 - "panels.tsx"
Cohesion: 0.12
Nodes (13): abyssRankTile(), CAPTURE_TEXT, CLASS_LABEL, DailyPanel(), FACTION_TEXT, FocusStrip(), lookupNote(), MeterMode (+5 more)

### Community 1 - "protocol.test.ts"
Cohesion: 0.07
Nodes (34): contains(), Direction, Discovery, findNameField(), hex(), stamp(), Stat, WATCH_OPCODES (+26 more)

### Community 2 - "Engine"
Cohesion: 0.07
Nodes (10): buildDetail(), emptyDaily(), Engine, EngineOptions, Fight, newSkill(), skillBase(), PlayerCard (+2 more)

### Community 3 - "decoders.ts"
Cohesion: 0.06
Nodes (49): DEMO_LOOKUPS, DemoSource, ENEMIES, PARTY, DAMAGE_BLOCK, decodeAbyssPoints(), decodeCast(), decodeDamage() (+41 more)

### Community 4 - "devDependencies"
Cohesion: 0.04
Nodes (47): build, appId, files, productName, publish, win, dependencies, electron-updater (+39 more)

### Community 5 - "pipeline.ts"
Cohesion: 0.07
Nodes (20): Candidate, CapturePipeline, flowKey(), hasHeartbeat(), LockedFlow, looksLikeTls(), PipelineStatus, Held (+12 more)

### Community 6 - "PetBook"
Cohesion: 0.05
Nodes (43): emptyPetStore(), META, PetBook, PetBookOptions, PetProfile, PetState, PetStoreData, stageGoal() (+35 more)

### Community 7 - "index.ts"
Cohesion: 0.12
Nodes (8): Bindings, CapturedPacket, cString(), listDevices(), load(), PcapDevice, PcapHandle, Ptr

### Community 8 - "PetsPanel.tsx"
Cohesion: 0.38
Nodes (6): Drag, Panel(), Props, ViewContext, PanelId, PanelLayout

### Community 9 - "Settings.tsx"
Cohesion: 0.10
Nodes (5): MODIFIER_LABEL, PANEL_LABEL, REGIONS, TabId, TABS

### Community 10 - "types.ts"
Cohesion: 0.09
Nodes (29): DailyRecord, EngineContext, HitInfo, LookupResult, PlayerTally, Profile, SkillTally, CLASS_NAMES (+21 more)

### Community 12 - "fps.ts"
Cohesion: 0.12
Nodes (14): FpsCounter, advapi, CloseTrace, ControlTraceW, DXGI_PROVIDER, EnableTraceEx2, EventRecordCb, FILTER (+6 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+11 more)

### Community 14 - "armory.ts"
Cohesion: 0.16
Nodes (15): Armory, equipmentSchema, fetchCharacter(), fetchSkillNames(), findCharacter(), Found, getJson(), infoSchema (+7 more)

### Community 15 - "history.ts"
Cohesion: 0.06
Nodes (29): isWorldNpc(), dict, HistoryStore, namesSchema, NamesStore, Run, writeJson(), bossLabel() (+21 more)

### Community 16 - "store.ts"
Cohesion: 0.11
Nodes (12): contextSchema, dailySchema, fileSchema, identitySchema, killSchema, memberSchema, opcodeFileSchema, rivalSchema (+4 more)

### Community 17 - "index.ts"
Cohesion: 0.12
Nodes (14): capture, demoMode, hitRects, HOTKEY_MARK_CANDIDATES, primaryInstance, api, IPC, CaptureStatus (+6 more)

### Community 18 - "win32.ts"
Cohesion: 0.18
Nodes (14): CursorInfo, CURSORINFO_SIZE, ForegroundWindow, GetCursorInfo, getCursorState(), getForegroundWindow, GetWindowRect, GetWindowTextW (+6 more)

### Community 19 - "HistoryStore"
Cohesion: 0.20
Nodes (10): ClassIcon(), GLYPHS, DeathPopup(), KdaButtons(), GearLine(), PlayerRow(), Props, TONE (+2 more)

### Community 20 - "catalog.ts"
Cohesion: 0.18
Nodes (6): catalogSchema, dungeonEntry, DungeonInfo, NpcCatalog, npcEntry, NpcInfo

### Community 22 - "Aion Assist"
Cohesion: 0.18
Nodes (10): Aion Assist, Aktualizacje, Architektura, Bezpieczeństwo konta — stan faktyczny, Skąd pochodzą dane i czego nie ma, Sterowanie, Tryb odkrywania (karta celu po zaznaczeniu), Uruchomienie (+2 more)

### Community 23 - "daily.test.ts"
Cohesion: 0.33
Nodes (3): EngineStore, AppData, RivalRecord

### Community 24 - "catalogImport.ts"
Cohesion: 0.27
Nodes (7): abyssProgramPath(), CatalogDungeon, CatalogFile, CatalogNpc, extractCatalog(), importCatalogFromAbyss(), ImportResult

### Community 25 - "Updater"
Cohesion: 0.29
Nodes (3): firstLine(), Updater, UpdateSnapshot

### Community 26 - "opponents.ts"
Cohesion: 0.24
Nodes (10): acceleratorLabel(), buildAccelerator(), DEFAULT_HOTKEYS, HOTKEY_KEYS, isValidAccelerator(), MODIFIERS, splitAccelerator(), onlySent() (+2 more)

### Community 27 - "demo.ts"
Cohesion: 0.23
Nodes (9): App(), isToolbarShown(), HistoryWindow(), NearbyPanel(), SettingsWindow(), CAPTURE_TEXT, ControlApp(), control (+1 more)

### Community 28 - "Fight"
Cohesion: 0.32
Nodes (9): DetailWindow(), Props, dateText(), PlayersWindow(), PvpFightRow(), MeterPanel(), clock(), compact() (+1 more)

### Community 29 - "Wydawanie aktualizacji (GitHub Releases)"
Cohesion: 0.40
Nodes (4): Co znajomy powinien wiedzieć, Każda nowa wersja, Konfiguracja (zrobiona), Wydawanie aktualizacji (GitHub Releases)

### Community 32 - "index.ts"
Cohesion: 0.29
Nodes (9): Device, devices, discoveryLines, drainAll(), post(), queue, rawLines, scanDevices() (+1 more)

### Community 37 - "Toolbar.tsx"
Cohesion: 0.29
Nodes (3): PANEL_META, Toolbar(), PANEL_IDS

## Knowledge Gaps
- **191 isolated node(s):** `Uruchomienie`, `Sterowanie`, `Bezpieczeństwo konta — stan faktyczny`, `Tryb odkrywania (karta celu po zaznaczeniu)`, `Zwierzaki (Pet Tracker)` (+186 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameEvent` connect `decoders.ts` to `protocol.test.ts`, `Engine`, `pipeline.ts`, `PetBook`, `types.ts`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `types.ts`, `decoders.ts`, `daily.test.ts`, `history.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `OverlayApi` connect `OverlayApi` to `index.ts`, `types.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `Uruchomienie`, `Sterowanie`, `Bezpieczeństwo konta — stan faktyczny` to the rest of the system?**
  _193 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `panels.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1225296442687747 - nodes in this community are weakly interconnected._
- **Should `protocol.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07307692307692308 - nodes in this community are weakly interconnected._
- **Should `Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.07462686567164178 - nodes in this community are weakly interconnected._