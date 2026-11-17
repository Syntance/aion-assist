# Graph Report - aion assist  (2026-11-17)

## Corpus Check
- 90 files · ~78,652 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 868 nodes · 1635 edges · 42 communities (36 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `301c5a78`
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
- [[_COMMUNITY_decodePlayerInfo|decodePlayerInfo]]
- [[_COMMUNITY_history.ts|history.ts]]
- [[_COMMUNITY_Wydawanie aktualizacji (GitHub Releases)|Wydawanie aktualizacji (GitHub Releases)]]
- [[_COMMUNITY_petTrackerImport.ts|petTrackerImport.ts]]
- [[_COMMUNITY_opcodes.ts|opcodes.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_gen-pet-assets.py|gen-pet-assets.py]]
- [[_COMMUNITY_gen-pet-data.py|gen-pet-data.py]]
- [[_COMMUNITY_App.tsx|App.tsx]]
- [[_COMMUNITY_settings.test.ts|settings.test.ts]]
- [[_COMMUNITY_ControlApp.tsx|ControlApp.tsx]]
- [[_COMMUNITY_fpsAccess.ts|fpsAccess.ts]]
- [[_COMMUNITY_Panel.tsx|Panel.tsx]]

## God Nodes (most connected - your core abstractions)
1. `Engine` - 61 edges
2. `OverlayApi` - 34 edges
3. `PetBook` - 21 edges
4. `GameEvent` - 18 edges
5. `compilerOptions` - 16 edges
6. `Bindings` - 15 edges
7. `HistoryStore` - 14 edges
8. `W` - 14 edges
9. `EncounterRecord` - 13 edges
10. `Reader` - 13 edges

## Surprising Connections (you probably didn't know these)
- `book()` --calls--> `emptyPetStore()`  [EXTRACTED]
  tests/pets.test.ts → src/core/pets/petBook.ts
- `Props` --references--> `PlayerCard`  [EXTRACTED]
  src/renderer/src/components/PlayerRow.tsx → src/shared/types.ts
- `main()` --calls--> `Settings`  [EXTRACTED]
  src/main/index.ts → src/shared/types.ts
- `OpponentFight` --references--> `EncounterSummary`  [EXTRACTED]
  src/shared/opponents.ts → src/shared/types.ts
- `EngineOptions` --references--> `EncounterRecord`  [EXTRACTED]
  src/core/engine/engine.ts → src/shared/types.ts

## Import Cycles
- None detected.

## Communities (42 total, 6 thin omitted)

### Community 0 - "panels.tsx"
Cohesion: 0.07
Nodes (40): CLASS_LEGEND, ClassIcon(), emblems, emblemUrl(), GLYPHS, LABEL, TONE, DeathPopup() (+32 more)

### Community 1 - "protocol.test.ts"
Cohesion: 0.07
Nodes (34): contains(), Direction, Discovery, findNameField(), hex(), stamp(), Stat, WATCH_OPCODES (+26 more)

### Community 2 - "Engine"
Cohesion: 0.05
Nodes (29): buildDetail(), DailyRecord, emptyDaily(), Engine, EngineContext, EngineOptions, Fight, HitInfo (+21 more)

### Community 3 - "decoders.ts"
Cohesion: 0.17
Nodes (11): Candidate, CapturePipeline, flowKey(), hasHeartbeat(), looksLikeTls(), PipelineStatus, ipOffset(), parseTcpSegment() (+3 more)

### Community 4 - "devDependencies"
Cohesion: 0.04
Nodes (47): build, appId, files, productName, publish, win, dependencies, electron-updater (+39 more)

### Community 5 - "pipeline.ts"
Cohesion: 0.11
Nodes (9): LockedFlow, TcpReassembler, Pending, RttTracker, seqAtOrAfter(), StreamDelay, StreamDelayReading, beat() (+1 more)

### Community 6 - "PetBook"
Cohesion: 0.08
Nodes (25): emptyPetStore(), META, PetBook, PetBookOptions, PetProfile, PetState, PetStoreData, stageGoal() (+17 more)

### Community 7 - "index.ts"
Cohesion: 0.12
Nodes (8): Bindings, CapturedPacket, cString(), listDevices(), load(), PcapDevice, PcapHandle, Ptr

### Community 8 - "PetsPanel.tsx"
Cohesion: 0.15
Nodes (18): FAMILIES, PetFinderWindow(), RANK_LABEL, RankFilter, Sort, crystals, crystalUrl(), FamilyChip() (+10 more)

### Community 9 - "Settings.tsx"
Cohesion: 0.10
Nodes (5): MODIFIER_LABEL, PANEL_LABEL, REGIONS, TabId, TABS

### Community 10 - "types.ts"
Cohesion: 0.12
Nodes (9): abyssRankTile(), CAPTURE_TEXT, CLASS_LABEL, FACTION_TEXT, FocusStrip(), lookupNote(), MeterMode, TargetPanel() (+1 more)

### Community 12 - "fps.ts"
Cohesion: 0.12
Nodes (14): FpsCounter, advapi, CloseTrace, ControlTraceW, DXGI_PROVIDER, EnableTraceEx2, EventRecordCb, FILTER (+6 more)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+11 more)

### Community 14 - "armory.ts"
Cohesion: 0.21
Nodes (17): DAMAGE_BLOCK, decodeAbyssPoints(), decodeCast(), decodeDamage(), decodeDeath(), decodeDotTick(), decodeHp(), decodeNpcSpawn() (+9 more)

### Community 15 - "history.ts"
Cohesion: 0.13
Nodes (5): isWorldNpc(), HistoryStore, Run, EncounterRecord, EncounterRow

### Community 16 - "store.ts"
Cohesion: 0.06
Nodes (30): EngineStore, Armory, equipmentSchema, fetchCharacter(), fetchSkillNames(), findCharacter(), Found, getJson() (+22 more)

### Community 17 - "index.ts"
Cohesion: 0.14
Nodes (13): CaptureToMain, MainToCapture, CaptureState, CLASS_NAMES, DaySummary, HitRect, LobbyMember, MeterRow (+5 more)

### Community 18 - "win32.ts"
Cohesion: 0.18
Nodes (14): CursorInfo, CURSORINFO_SIZE, ForegroundWindow, GetCursorInfo, getCursorState(), getForegroundWindow, GetWindowRect, GetWindowTextW (+6 more)

### Community 19 - "HistoryStore"
Cohesion: 0.16
Nodes (8): DEMO_LOOKUPS, DemoSource, ENEMIES, PARTY, GameEvent, RosterMember, factionFromServer(), T0

### Community 20 - "catalog.ts"
Cohesion: 0.18
Nodes (6): catalogSchema, dungeonEntry, DungeonInfo, NpcCatalog, npcEntry, NpcInfo

### Community 22 - "Aion Assist"
Cohesion: 0.18
Nodes (10): Aion Assist, Aktualizacje, Architektura, Bezpieczeństwo konta — stan faktyczny, Skąd pochodzą dane i czego nie ma, Sterowanie, Tryb odkrywania (karta celu po zaznaczeniu), Uruchomienie (+2 more)

### Community 23 - "daily.test.ts"
Cohesion: 0.12
Nodes (14): capture, demoMode, hitRects, HOTKEY_MARK_CANDIDATES, primaryInstance, api, IPC, CaptureStatus (+6 more)

### Community 24 - "catalogImport.ts"
Cohesion: 0.27
Nodes (7): abyssProgramPath(), CatalogDungeon, CatalogFile, CatalogNpc, extractCatalog(), importCatalogFromAbyss(), ImportResult

### Community 25 - "Updater"
Cohesion: 0.29
Nodes (3): firstLine(), Updater, UpdateSnapshot

### Community 27 - "decodePlayerInfo"
Cohesion: 0.21
Nodes (16): decodeKill(), decodePartyRoster(), decodePlayerInfo(), decodeSelfInfo(), findLegionRun(), isGlobalServerId(), isServerId(), peekU8() (+8 more)

### Community 28 - "history.ts"
Cohesion: 0.17
Nodes (8): dict, namesSchema, NamesStore, writeJson(), HistoryData, NameKind, NamesData, RunSummary

### Community 29 - "Wydawanie aktualizacji (GitHub Releases)"
Cohesion: 0.40
Nodes (4): Co znajomy powinien wiedzieć, Każda nowa wersja, Konfiguracja (zrobiona), Wydawanie aktualizacji (GitHub Releases)

### Community 31 - "opcodes.ts"
Cohesion: 0.18
Nodes (6): Held, Decoder, PacketDecoder, DEFAULT_OPCODES, OPCODE_NAMES, OpcodeName

### Community 32 - "index.ts"
Cohesion: 0.29
Nodes (9): Device, devices, discoveryLines, drainAll(), post(), queue, rawLines, scanDevices() (+1 more)

### Community 37 - "App.tsx"
Cohesion: 0.18
Nodes (8): App(), isToolbarShown(), DailyPanel(), MeterPanel(), NearbyPanel(), PANEL_META, Toolbar(), PANEL_IDS

### Community 38 - "settings.test.ts"
Cohesion: 0.24
Nodes (10): acceleratorLabel(), buildAccelerator(), DEFAULT_HOTKEYS, HOTKEY_KEYS, isValidAccelerator(), MODIFIERS, splitAccelerator(), onlySent() (+2 more)

### Community 39 - "ControlApp.tsx"
Cohesion: 0.24
Nodes (7): FpsAccess(), Stage, SettingsWindow(), CAPTURE_TEXT, ControlApp(), control, root

### Community 40 - "fpsAccess.ts"
Cohesion: 0.46
Nodes (7): currentUser(), FpsAccessResult, fpsGroupState(), grantFpsAccess(), logOffWindows(), powershell(), main()

### Community 41 - "Panel.tsx"
Cohesion: 0.38
Nodes (6): Drag, Panel(), Props, ViewContext, PanelId, PanelLayout

## Knowledge Gaps
- **198 isolated node(s):** `name`, `version`, `description`, `license`, `private` (+193 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GameEvent` connect `HistoryStore` to `protocol.test.ts`, `decoders.ts`, `PetBook`, `armory.ts`, `index.ts`, `opcodes.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `Engine` connect `Engine` to `store.ts`, `HistoryStore`, `history.ts`, `opcodes.ts`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Why does `OverlayApi` connect `OverlayApi` to `index.ts`, `daily.test.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _201 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `panels.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0677555958862674 - nodes in this community are weakly interconnected._
- **Should `protocol.test.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07307692307692308 - nodes in this community are weakly interconnected._
- **Should `Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05393258426966292 - nodes in this community are weakly interconnected._