import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import clsx from "clsx";
import s from "./App.module.css";
import type { GameState, GameAction, ActionResult, NarrativeEntry } from "./types/game";
import type { DetailTab } from "./components/character/CharacterPanel";
import {
  fetchConfig,
  fetchGameState,
  fetchActions,
  fetchSession,
  performAction,
  restartGame,
  connectSSE,
} from "./api/client";
import type { AppConfig } from "./api/client";
import LocationHeader from "./components/map/LocationHeader";
import MapView from "./components/map/MapView";
import CompactCharacterInfo from "./components/character/CompactCharacterInfo";
import CharacterPanel from "./components/character/CharacterPanel";
import ActionMenu from "./components/action/ActionMenu";
import NarrativePanel from "./components/llm/NarrativePanel";
import type { LLMDebugEntry } from "./components/llm/LLMDebugPanel";
import NavBar from "./components/layout/NavBar";
import WorldSidebar from "./components/layout/WorldSidebar";
import AddonSidebar from "./components/layout/AddonSidebar";
import AddonTabBar from "./components/layout/AddonTabBar";
import CharacterManager from "./components/character/CharacterManager";
import TraitManager from "./components/trait/TraitManager";
import ClothingManager from "./components/trait/ClothingManager";
import ItemManager from "./components/item/ItemManager";
import ActionManager from "./components/action/ActionManager";
import VariableManager from "./components/variable/VariableManager";
import EventManager from "./components/variable/EventManager";
import LorebookManager from "./components/variable/LorebookManager";
import MapManager from "./components/map/MapManager";
import SettingsPage from "./components/settings/SettingsPage";
import FloatingActions from "./components/layout/FloatingActions";
import LLMPresetManager from "./components/llm/LLMPresetManager";
import AiDrawer from "./components/ai/AiDrawer";

type NavPage =
  | "characters"
  | "traits"
  | "clothing"
  | "items"
  | "actions"
  | "variables"
  | "events"
  | "maps"
  | "settings"
  | "llm"
  | "system";

export default function App() {
  const [config, setConfig] = useState<AppConfig>({ maxWidth: 1200 });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>("");
  const [narrativeEntries, setNarrativeEntries] = useState<NarrativeEntry[]>([]);
  const [llmStates, setLlmStates] = useState<Record<number, { text: string; status: string; error: string }>>({});
  const [debugEntries, setDebugEntries] = useState<LLMDebugEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [topView, setTopView] = useState<"location" | string>("location");
  const [compactTab, setCompactTab] = useState<"basic" | "clothing">("basic");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("basic");
  const [navPage, setNavPage] = useState<NavPage | null>(null);
  const [editorClosing, setEditorClosing] = useState(false);
  const editorClosingRef = useRef(false);
  const [editorAnimating, setEditorAnimating] = useState(false);
  const closeEditor = useCallback(() => {
    if (editorClosingRef.current) return;
    editorClosingRef.current = true;
    setEditorClosing(true);
    setTimeout(() => {
      setNavPage(null);
      setEditorClosing(false);
      editorClosingRef.current = false;
    }, 250);
  }, []);
  const [mountedPages, setMountedPages] = useState<Set<NavPage>>(new Set());
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Sidebar state
  const [leftOpen, setLeftOpen] = useState(false);
  const [leftClosing, setLeftClosing] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightClosing, setRightClosing] = useState(false);

  // AI Assist drawer state
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  // Session state (current world + addons)
  const [currentWorldId, setCurrentWorldId] = useState("");
  const [currentWorldName, setCurrentWorldName] = useState("");
  const [currentAddons, setCurrentAddons] = useState<{ id: string; version: string }[]>([]);
  const [stagedAddons, setStagedAddons] = useState<{ id: string; version: string }[]>([]);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const [addonListKey] = useState(0);
  const [selectedAddonTab, setSelectedAddonTab] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const addonIds = useMemo(() => stagedAddons.map((a) => a.id), [stagedAddons]);

  const esRef = useRef<EventSource | null>(null);

  // AI drawer: mutually exclusive with addon sidebar
  const closeSidebar = useCallback((side: "left" | "right", cb: () => void) => {
    if (side === "left") setLeftClosing(true);
    else setRightClosing(true);
    setTimeout(() => {
      cb();
      if (side === "left") setLeftClosing(false);
      else setRightClosing(false);
    }, 200);
  }, []);

  const toggleAiDrawer = useCallback(() => {
    if (aiDrawerOpen) {
      closeSidebar("right", () => setAiDrawerOpen(false));
    } else {
      setRightClosing(false);
      setRightOpen(false);
      setAiDrawerOpen(true);
    }
  }, [aiDrawerOpen, closeSidebar]);

  const player = gameState ? (Object.values(gameState.characters).find((c) => c.isPlayer) ?? null) : null;

  const charactersAtLocation =
    gameState && player
      ? [
          player,
          ...Object.values(gameState.characters).filter(
            (c) =>
              !c.isPlayer && c.position.mapId === player.position.mapId && c.position.cellId === player.position.cellId,
          ),
        ]
      : [];

  // Load config on mount
  useEffect(() => {
    fetchConfig().then(setConfig);
  }, []);

  // Refresh session info from backend
  const refreshSession = useCallback(async () => {
    const session = await fetchSession();
    setCurrentWorldId(session.worldId);
    setCurrentWorldName(session.worldName);
    setCurrentAddons(session.addons);
    setStagedAddons(session.addons);
    setSessionDirty(session.dirty);
  }, []);

  // Handle game state updates
  const handleStateUpdate = useCallback((state: GameState) => {
    setGameState(state);
    setSessionDirty(state.dirty);
  }, []);

  const handleGameChanged = useCallback((state: GameState) => {
    setGameState(state);
    setNarrativeEntries([]);
    setSessionKey((k) => k + 1);
    const p = Object.values(state.characters).find((c) => c.isPlayer);
    if (p) setActiveMapId(p.position.mapId);
    fetchSession().then((s) => {
      setCurrentWorldId(s.worldId);
      setCurrentWorldName(s.worldName);
      setCurrentAddons(s.addons);
      setStagedAddons(s.addons);
      setSessionDirty(s.dirty);
    });
  }, []);

  const handleDirtyUpdate = useCallback((dirty: boolean) => {
    setSessionDirty(dirty);
  }, []);

  // SSE — always connected
  useEffect(() => {
    esRef.current = connectSSE(handleStateUpdate, handleGameChanged, handleDirtyUpdate);
    return () => {
      esRef.current?.close();
    };
  }, [handleStateUpdate, handleGameChanged, handleDirtyUpdate]);

  // Initial load
  useEffect(() => {
    fetchGameState().then((state) => {
      setGameState(state);
      const p = Object.values(state.characters).find((c) => c.isPlayer);
      if (p) setActiveMapId(p.position.mapId);
    });
    refreshSession();
  }, []);

  // Fetch actions when state changes
  const selectedNpcForActions = selectedCharacterId && selectedCharacterId !== player?.id ? selectedCharacterId : null;
  useEffect(() => {
    if (!player) return;
    fetchActions(player.id, selectedNpcForActions).then((data) => setActions(data.actions));
  }, [gameState, selectedNpcForActions]);

  // Reset activeMapId when worldId changes
  useEffect(() => {
    if (!gameState || !player) return;
    if (!gameState.maps[activeMapId]) {
      setActiveMapId(player.position.mapId);
    }
  }, [gameState?.worldId]);

  useEffect(() => {
    if (navPage && !mountedPages.has(navPage)) {
      setMountedPages((prev) => new Set(prev).add(navPage));
    }
  }, [navPage, mountedPages]);

  useEffect(() => {
    setMountedPages(new Set());
  }, [sessionKey]);

  const addResultMessages = useCallback((result: ActionResult, targetId?: string) => {
    const raw: string[] = [];
    raw.push(result.success ? result.message : `[失败] ${result.message}`);
    if (result.npcLog) {
      for (const line of result.npcLog) {
        raw.push(line);
      }
    }
    const entry: NarrativeEntry = { raw };
    if (result.success) {
      const parts: string[] = [];
      if (result.message) parts.push(result.message);
      if (result.effectsSummary?.length) parts.push(result.effectsSummary.join("\n"));
      if (result.npcLog?.length) parts.push(result.npcLog.join("\n"));
      entry.llmRawOutput = parts.join("\n\n");
      entry.autoTriggerLLM = !!result.triggerLLM;
      entry.targetId = targetId;
      entry.presetId = result.llmPreset || undefined;
      entry.actionId = result.actionId || undefined;
    }
    setNarrativeEntries((prev) => [...prev, entry]);
  }, []);

  const handleMove = useCallback(
    async (targetCell: number, targetMap?: string) => {
      if (!player || loading) return;
      setLoading(true);
      try {
        const result = await performAction(player.id, "move", targetCell, targetMap);
        addResultMessages(result);
        if (result.success) {
          setSelectedCharacterId(null);
          if (targetMap) setActiveMapId(targetMap);
        }
      } finally {
        setLoading(false);
      }
    },
    [player, loading, addResultMessages],
  );

  const handleLook = useCallback(
    async (targetCell: number, targetMap?: string) => {
      if (!player || loading) return;
      setLoading(true);
      try {
        const result = await performAction(player.id, "look", targetCell, targetMap);
        addResultMessages(result);
      } finally {
        setLoading(false);
      }
    },
    [player, loading, addResultMessages],
  );

  const handleAction = useCallback(
    async (actionId: string, targetId?: string) => {
      if (!player || loading) return;
      setLoading(true);
      try {
        const result = await performAction(player.id, "configured", undefined, undefined, actionId, targetId);
        addResultMessages(result, targetId);
      } finally {
        setLoading(false);
      }
    },
    [player, loading, addResultMessages],
  );

  const handleChangeOutfit = useCallback(
    async (outfitId: string, selections: Record<string, string>) => {
      if (!player || loading) return;
      setLoading(true);
      try {
        const result = await performAction(
          player.id,
          "changeOutfit",
          undefined,
          undefined,
          undefined,
          undefined,
          outfitId,
          selections,
        );
        addResultMessages(result);
      } finally {
        setLoading(false);
      }
    },
    [player, loading, addResultMessages],
  );

  const handleCellClick = useCallback(
    (cellId: number) => {
      if (!player) return;
      const moveAction = actions.find((a) => a.type === "move");
      const target = moveAction?.targets?.find((t) => t.targetCell === cellId);
      if (target) handleMove(target.targetCell, target.targetMap);
    },
    [player, actions, handleMove],
  );

  // Called when world/addons change from sidebars
  const handleWorldChanged = useCallback(async () => {
    setNarrativeEntries([]);
    setSessionKey((k) => k + 1); // Force remount editor components
    // Directly fetch new state (don't rely solely on SSE)
    const [state, session] = await Promise.all([fetchGameState(), fetchSession()]);
    setGameState(state);
    setCurrentWorldId(session.worldId);
    setCurrentWorldName(session.worldName);
    setCurrentAddons(session.addons);
    setStagedAddons(session.addons);
    setSessionDirty(session.dirty);
    const p = Object.values(state.characters).find((c) => c.isPlayer);
    if (p) setActiveMapId(p.position.mapId);
  }, []);

  const hasAddonChanges = (() => {
    if (stagedAddons.length !== currentAddons.length) return true;
    const currentMap = new Map(currentAddons.map((a) => [a.id, a.version]));
    for (const staged of stagedAddons) {
      if (currentMap.get(staged.id) !== staged.version) return true;
    }
    return false;
  })();

  // --- Render ---

  if (!gameState) {
    return <div className={s.loading}>加载中...</div>;
  }

  const activeMap = gameState.maps[activeMapId];
  const playerMap = player ? gameState.maps[player.position.mapId] : undefined;
  const playerCell = playerMap?.cells.find((c) => c.id === player?.position.cellId);
  const playerCellName = playerCell?.name ?? (player ? `${player.position.cellId}号` : "");

  const addonTab =
    currentWorldId && !editorOpen ? (
      <AddonTabBar addons={stagedAddons} selectedAddon={selectedAddonTab} onSelect={setSelectedAddonTab} />
    ) : null;

  const editorPages: { page: NavPage; hasAddonTab: boolean }[] = [
    { page: "characters", hasAddonTab: true },
    { page: "traits", hasAddonTab: true },
    { page: "clothing", hasAddonTab: true },
    { page: "items", hasAddonTab: true },
    { page: "actions", hasAddonTab: true },
    { page: "variables", hasAddonTab: true },
    { page: "events", hasAddonTab: true },
    { page: "lorebook", hasAddonTab: true },
    { page: "maps", hasAddonTab: true },
    { page: "llm", hasAddonTab: false },
    { page: "settings", hasAddonTab: false },
    { page: "system", hasAddonTab: false },
  ];

  const renderEditorPage = (page: NavPage) => {
    if (page === "characters")
      return <CharacterManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "traits")
      return <TraitManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "clothing")
      return <ClothingManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "items")
      return <ItemManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "actions")
      return <ActionManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "variables")
      return <VariableManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "events")
      return <EventManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "lorebook")
      return <LorebookManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "maps")
      return <MapManager key={sessionKey} selectedAddon={selectedAddonTab} onEditingChange={setEditorOpen} addonIds={addonIds} />;
    if (page === "llm") return <LLMPresetManager key={sessionKey} debugEntries={debugEntries} />;
    if (page === "settings")
      return (
        <SettingsPage
          worldId={currentWorldId}
          addonRefs={currentAddons}
          onRestart={async () => {
            if (!confirm("确认重新开始游戏？所有运行时状态将重置。")) return;
            const result = await restartGame();
            if (result.success) {
              setNarrativeEntries([]);
              setNavPage(null);
            }
          }}
        />
      );
    if (page === "system")
      return (
        <div className={s.systemPage}>
          <span className={s.systemTitle}>== 系统设置 ==</span>
          <div className={s.systemEmpty}>暂无系统设置项。</div>
        </div>
      );
    return null;
  };

  const renderCenter = () => {

    // No player
    if (!player) {
      return (
        <div className={s.noPlayer}>
          没有活跃的玩家角色。请在 [人物] 页面中设置一个 Player。
        </div>
      );
    }

    // Game view
    return (
      <>
        <div className={s.topView}>
          {topView === "location"
            ? playerMap && (
                <LocationHeader
                  time={gameState.time}
                  map={playerMap}
                  cellId={player.position.cellId}
                  charactersAtLocation={charactersAtLocation}
                  selectedCharacterId={selectedCharacterId}
                  onSelectCharacter={setSelectedCharacterId}
                />
              )
            : activeMap &&
              (() => {
                const mapViewCell =
                  player.position.mapId === activeMapId
                    ? activeMap.cells.find((c) => c.id === player.position.cellId)
                    : undefined;
                const mapViewBg = mapViewCell?.backgroundImage ?? activeMap.backgroundImage;
                return (
                  <>
                    {mapViewBg && (
                      <>
                        <img
                          src={`/assets/${mapViewBg}`}
                          alt=""
                          className={s.mapBgImage}
                        />
                        <div className={s.mapBgOverlay} />
                      </>
                    )}
                    <div className={s.mapViewRelative}>
                      <MapView
                        map={activeMap}
                        playerCellId={player.position.mapId === activeMapId ? player.position.cellId : null}
                        onCellClick={handleCellClick}
                      />
                    </div>
                  </>
                );
              })()}
        </div>

        <div className={s.bottomHalf}>
          <div className={s.leftColumn}>
            {/* Map/location tabs */}
            <div className={s.tabBar}>
              <button
                onClick={() => setTopView("location")}
                className={clsx(s.tabBtn, topView === "location" ? s.tabBtnActive : s.tabBtnInactive)}
              >
                [{playerMap?.name ?? ""} - {playerCellName}]
              </button>
              {Object.values(gameState.maps).map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setTopView(m.id);
                    setActiveMapId(m.id);
                  }}
                  className={clsx(s.tabBtn, topView === m.id ? s.tabBtnActive : s.tabBtnInactive)}
                >
                  [{m.name}]
                </button>
              ))}
            </div>
            {detailOpen ? (
              <CharacterPanel
                character={
                  selectedCharacterId && gameState.characters[selectedCharacterId]
                    ? gameState.characters[selectedCharacterId]
                    : player
                }
                activeTab={detailTab}
                onTabChange={setDetailTab}
                onClose={() => setDetailOpen(false)}
              />
            ) : (
              <NarrativePanel
                entries={narrativeEntries}
                llmStates={llmStates}
                onLlmStatesChange={setLlmStates}
                onDebugEntry={(e) => setDebugEntries((prev) => [...prev, e])}
              />
            )}
          </div>

          <div className={s.rightColumn}>
            <CompactCharacterInfo
              character={
                selectedCharacterId && gameState.characters[selectedCharacterId]
                  ? gameState.characters[selectedCharacterId]
                  : player
              }
              playerId={player.id}
              activeTab={compactTab}
              onTabChange={setCompactTab}
              detailOpen={detailOpen}
              onToggleDetail={() => setDetailOpen((v) => !v)}
            />
            <ActionMenu
              actions={actions}
              onMove={handleMove}
              onLook={handleLook}
              onAction={handleAction}
              onChangeOutfit={handleChangeOutfit}
              disabled={loading}
              selectedNpcId={selectedCharacterId && selectedCharacterId !== player.id ? selectedCharacterId : null}
            />
          </div>
        </div>
      </>
    );
  };

  // Sidebar animation helpers
  const leftAnim = leftClosing ? "sidebarSlideOut 0.2s ease-in forwards" : leftOpen ? "sidebarSlideIn 0.25s ease-out" : undefined;
  const rightVisible = aiDrawerOpen || rightOpen;
  const showRight = rightVisible || rightClosing;
  const rightAnim = rightClosing ? "sidebarSlideOut 0.2s ease-in forwards" : rightVisible ? "sidebarSlideIn 0.25s ease-out" : undefined;

  // Editor overlay animation
  const overlayAnim = editorClosing ? "overlayFadeOut 0.25s ease-in forwards" : editorAnimating ? "overlayFadeIn 0.2s ease-out" : "none";
  const panelAnim = editorClosing ? "editorSlideOut 0.25s ease-in forwards" : editorAnimating ? "editorSlideIn 0.3s ease-out" : "none";

  return (
    <div className={s.root}>
      <NavBar
        navPage={navPage}
        onNavChange={(p) => {
          if (p === null && navPage !== null) {
            closeEditor();
          } else {
            const isOpening = navPage === null && p !== null;
            setEditorClosing(false);
            editorClosingRef.current = false;
            setEditorAnimating(isOpening);
            setNavPage(p);
            if (isOpening) setTimeout(() => setEditorAnimating(false), 300);
          }
          setEditorOpen(false);
        }}
        worldName={currentWorldId ? currentWorldName || currentWorldId : ""}
        maxWidth={config.maxWidth}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => {
          if (leftOpen) {
            closeSidebar("left", () => setLeftOpen(false));
          } else {
            setLeftClosing(false);
            setLeftOpen(true);
          }
        }}
        aiOpen={aiDrawerOpen}
        onToggleAi={toggleAiDrawer}
        onToggleRight={() => {
          if (rightOpen) {
            closeSidebar("right", () => setRightOpen(false));
          } else {
            setRightClosing(false);
            if (aiDrawerOpen) {
              closeSidebar("right", () => {
                setAiDrawerOpen(false);
                setRightOpen(true);
              });
            } else {
              setRightOpen(true);
            }
          }
        }}
      />

      {/* Left area: sidebar or spacer */}
      <div className={s.sidebarArea}>
        <div
          className={clsx(s.sidebarInner, !(leftOpen || leftClosing) && s.sidebarHidden)}
          style={{ animation: leftAnim }}
        >
          <WorldSidebar
            currentWorldId={currentWorldId}
            currentAddons={currentAddons}
            onWorldChanged={handleWorldChanged}
          />
        </div>
      </div>

      {/* Center content (fixed maxWidth) */}
      <div
        className={s.center}
        style={{ flex: `0 1 ${config.maxWidth}px`, maxWidth: config.maxWidth }}
      >
        {renderCenter()}
      </div>

      {/* Right area: addon sidebar, AI drawer, or spacer */}
      <div className={s.sidebarArea}>
        <div
          className={clsx(s.sidebarInner, !showRight && s.sidebarHidden)}
          style={{ animation: rightAnim }}
        >
          <div className={s.fullHeight} style={{ display: aiDrawerOpen ? "block" : "none" }}>
            <AiDrawer
              onEntityChanged={() => setSessionKey((k) => k + 1)}
              onDebugEntry={(e) => setDebugEntries((prev) => [...prev, e as any])}
            />
          </div>
          <div className={s.fullHeight} style={{ display: !aiDrawerOpen && rightOpen ? "block" : "none" }}>
            <AddonSidebar
              key={addonListKey}
              enabledAddons={currentAddons}
              stagedAddons={stagedAddons}
              onStagedChange={setStagedAddons}
              worldId={currentWorldId}
            />
          </div>
        </div>
      </div>

      {/* Editor overlay */}
      {navPage !== null && (
        <div
          className={s.editorOverlay}
          style={{ animation: overlayAnim }}
          onClick={closeEditor}
        >
          <div
            className={s.editorPanel}
            style={{ maxWidth: config.maxWidth, animation: panelAnim }}
            onClick={(e) => e.stopPropagation()}
          >
            {editorPages.map(({ page, hasAddonTab }) => {
              if (!mountedPages.has(page)) return null;
              const active = navPage === page;
              return (
                <div key={page} style={{ display: active ? "block" : "none" }}>
                  {hasAddonTab && addonTab}
                  {renderEditorPage(page)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Floating apply/save panel */}
      <FloatingActions
        dirty={sessionDirty}
        hasAddonChanges={hasAddonChanges}
        stagedAddons={stagedAddons}
        worldId={currentWorldId}
        onApplied={handleWorldChanged}
        onRevert={() => setStagedAddons(currentAddons)}
      />
    </div>
  );
}
