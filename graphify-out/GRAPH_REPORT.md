# Graph Report - aion assist  (2026-11-17)

## Corpus Check
- 85 files · ~75,167 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 835 nodes · 1724 edges · 37 communities (31 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `997f937a`
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

## God Nodes (most connected - your core abstractions)
1. `Engine` - 63 edges
2. `OverlayApi` - 31 edges
3. `GameEvent` - 26 edges
4. `PetBook` - 22 edges
5. `main()` - 16 edges
6. `compilerOptions` - 16 edges
7. `Bindings` - 15 edges
8. `HistoryStore` - 15 edges
9. `compact()` - 15 edges
10. `W` - 14 edges

## Surprising Connections (you probably didn't know these)
- `book()` --calls--> `emptyPetStore()`  [EXTRACTED]
  tests/pets.test.ts → src/core/pets/petBook.ts
- `EngineContext` --references--> `GameEvent`  [EXTRACTED]
  src/core/engine/engine.ts → src/core/protocol/events.ts
- `Run` --references--> `EncounterRecord`  [EXTRACTED]
  src/main/history.ts → src/shared/types.ts
- `dayLabel()` --calls--> `dayKey()`  [EXTRACTED]
  src/renderer/src/components/History.tsx → src/shared/day.ts
- `PvpDays()` --calls--> `dayKey()`  [EXTRACTED]
  src/renderer/src/components/History.tsx → src/shared/day.ts

## Import Cycles
- None detected.

## Communities (37 total, 6 thin omitted)

### Community 0 - "panels.tsx"
Cohesion: 0.07
Nodes (43): App(), isToolbarShown(), ClassIcon(), GLYPHS, DeathPopup(), DetailWindow(), Props, bossLabel() (+35 more)

### Community 1 - "protocol.test.ts"
Cohesion: 0.08
Nodes (32): contains(), Direction, Discovery, findNameField(), hex(), stamp(), Stat, WATCH_OPCODES (+24 more)

### Community 2 - "Engine"
Cohesion: 0.08
Nodes (9): buildDetail(), emptyDaily(), Engine, EngineOptions, dayKey(), EncounterRow, PlayerCard, PlayerDetail (+1 more)

### Community 3 - "decoders.ts"
Cohesion: 0.08
Nodes (42): DAMAGE_BLOCK, decodeAbyssPoints(), decodeCast(), decodeDamage(), decodeDeath(), decodeDotTick(), decodeHp(), decodeKill() (+34 more)

### Community 4 - "devDependencies"
Cohesion: 0.04
Nodes (47): build, appId, files, productName, publish, win, dependencies, electron-updater (+39 more)

### Community 5 - "pipeline.ts"
Cohesion: 0.07
Nodes (20): Candidate, CapturePipeline, flowKey(), hasHeartbeat(), LockedFlow, looksLikeTls(), PipelineStatus, Held (+12 more)

### Community 6 - "PetBook"
Cohesion: 0.09
Nodes (21): emptyPetStore(), META, PetBook, PetBookOptions, PetProfile, PetState, PetStoreData, stageGoal() (+13 more)

### Community 7 - "index.ts"
Cohesion: 0.08
Nodes (22): Device, devices, discoveryLines, drainAll(), post(), queue, rawLines, scanDevices() (+14 more)

### Community 8 - "PetsPanel.tsx"
Cohesion: 0.08
Nodes (29): Drag, Panel(), Props, ViewContext, FAMILIES, PetFinderWindow(), RANK_LABEL, RankFilter (+21 more)

### Community 9 - "Settings.tsx"
Cohesion: 0.08
Nodes (23): About(), HotkeyRow(), MODIFIER_LABEL, PANEL_LABEL, REGIONS, SettingsWindow(), TabId, TABS (+15 more)

### Community 10 - "types.ts"
Cohesion: 0.08
Nodes (31): DailyRecord, EngineContext, HitInfo, LookupResult, PlayerTally, Profile, SkillTally, CLASS_NAMES (+23 more)

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
Cohesion: 0.16
Nodes (9): dict, namesSchema, NamesStore, Run, writeJson(), HistoryData, NameKind, NamesData (+1 more)

### Community 16 - "store.ts"
Cohesion: 0.15
Nodes (16): main(), contextSchema, dailySchema, fileSchema, identitySchema, killSchema, memberSchema, opcodeFileSchema (+8 more)

### Community 17 - "index.ts"
Cohesion: 0.13
Nodes (12): capture, demoMode, hitRects, HOTKEY_MARK_CANDIDATES, primaryInstance, onlySent(), CaptureStatus, hitRectsSchema (+4 more)

### Community 18 - "win32.ts"
Cohesion: 0.18
Nodes (14): CursorInfo, CURSORINFO_SIZE, ForegroundWindow, GetCursorInfo, getCursorState(), getForegroundWindow, GetWindowRect, GetWindowTextW (+6 more)

### Community 19 - "HistoryStore"
Cohesion: 0.19
Nodes (3): isWorldNpc(), HistoryStore, EncounterRecord

### Community 20 - "catalog.ts"
Cohesion: 0.18
Nodes (6): catalogSchema, dungeonEntry, DungeonInfo, NpcCatalog, npcEntry, NpcInfo

### Community 22 - "Aion Assist"
Cohesion: 0.18
Nodes (10): Aion Assist, Aktualizacje, Architektura, Bezpieczeństwo konta — stan faktyczny, Skąd pochodzą dane i czego nie ma, Sterowanie, Tryb odkrywania (karta celu po zaznaczeniu), Uruchomienie (+2 more)

### Community 23 - "daily.test.ts"
Cohesion: 0.20
Nodes (3): EngineStore, AppData, RivalRecord

### Community 24 - "catalogImport.ts"
Cohesion: 0.27
Nodes (7): abyssProgramPath(), CatalogDungeon, CatalogFile, CatalogNpc, extractCatalog(), importCatalogFromAbyss(), ImportResult

### Community 25 - "Updater"
Cohesion: 0.29
Nodes (3): firstLine(), Updater, UpdateSnapshot

### Community 26 - "opponents.ts"
Cohesion: 0.31
Nodes (6): fightResult, groupByOpponent(), OpponentFight, OpponentGroup, EncounterSummary, KillEntry

### Community 27 - "demo.ts"
Cohesion: 0.29
Nodes (5): DEMO_LOOKUPS, demoLookup(), DemoSource, ENEMIES, PARTY

### Community 28 - "Fight"
Cohesion: 0.43
Nodes (3): Fight, newSkill(), skillBase()

### Community 29 - "Wydawanie aktualizacji (GitHub Releases)"
Cohesion: 0.40
Nodes (4): Co znajomy powinien wiedzieć, Każda nowa wersja, Konfiguracja (zrobiona), Wydawanie aktualizacji (GitHub Releases)

### Community 30 - "petTrackerImport.ts"
Cohesion: 0.50
Nodes (4): ImportedProfile, isInt(), RawPet, readPetTrackerProfiles()

## Knowledge Gaps
- **184 isolated node(s):** `Uruchomienie`, `Sterowanie`, `Bezpieczeństwo konta — stan faktyczny`, `Tryb odkrywania (karta celu po zaznaczeniu)`, `Zwierzaki (Pet Tracker)` (+179 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameEvent` connect `decoders.ts` to `protocol.test.ts`, `Engine`, `pipeline.ts`, `PetBook`, `index.ts`, `types.ts`, `demo.ts`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `index.ts`, `types.ts`, `decoders.ts`, `daily.test.ts`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `OverlayApi` connect `OverlayApi` to `index.ts`, `types.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `Uruchomienie`, `Sterowanie`, `Bezpieczeństwo konta — stan faktyczny` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `panels.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0675990675990676 - nodes in this community are weakly interconnected._
- **Should `protocol.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07629288274449565 - nodes in this community are weakly interconnected._
- **Should `Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.08408249603384453 - nodes in this community are weakly interconnected._