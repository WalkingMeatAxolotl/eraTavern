import { useEffect, useState, useCallback, useRef } from "react";
import type { GameState, GameAction } from "./types/game";
import type { DetailTab } from "./components/CharacterPanel";
import {
  fetchConfig,
  fetchGameState,
  fetchActions,
  fetchSession,
  performAction,
  restartGame,
  connectWebSocket,
  fetchBackups,
  restoreBackup,
} from "./api/client";
import type { AppConfig } from "./api/client";
import LocationHeader from "./components/LocationHeader";
import MapView from "./components/MapView";
import CompactCharacterInfo from "./components/CompactCharacterInfo";
import CharacterPanel from "./components/CharacterPanel";
import ActionMenu from "./components/ActionMenu";
import NarrativePanel from "./components/NarrativePanel";
import NavBar from "./components/NavBar";
import WorldSidebar from "./components/WorldSidebar";
import AddonSidebar from "./components/AddonSidebar";
import AddonTabBar from "./components/AddonTabBar";
import CharacterManager from "./components/CharacterManager";
import TraitManager from "./components/TraitManager";
import ClothingManager from "./components/ClothingManager";
import ItemManager from "./components/ItemManager";
import ActionManager from "./components/ActionManager";
import MapManager from "./components/MapManager";
import SettingsPage from "./components/SettingsPage";
import FloatingActions from "./components/FloatingActions";

type NavPage = "characters" | "traits" | "clothing" | "items" | "actions" | "maps" | "settings";

export default function App() {
  const [config, setConfig] = useState<AppConfig>({ maxWidth: 1200 });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [topView, setTopView] = useState<"location" | string>("location");
  const [compactTab, setCompactTab] = useState<"basic" | "clothing">("basic");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("basic");
  const [navPage, setNavPage] = useState<NavPage | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);

  // Sidebar state
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // Session state (current world + addons)
  const [currentWorldId, setCurrentWorldId] = useState("");
  const [currentAddons, setCurrentAddons] = useState<{ id: string; version: string }[]>([]);
  const [stagedAddons, setStagedAddons] = useState<{ id: string; version: string }[]>([]);
  const [sessionDirty, setSessionDirty] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const [addonListKey, setAddonListKey] = useState(0);
  const [selectedAddonTab, setSelectedAddonTab] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const player = gameState
    ? Object.values(gameState.characters).find((c) => c.isPlayer) ?? null
    : null;

  const charactersAtLocation = gameState && player
    ? [
        player,
        ...Object.values(gameState.characters).filter(
          (c) =>
            !c.isPlayer &&
            c.position.mapId === player.position.mapId &&
            c.position.cellId === player.position.cellId
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
    setMessages([]);
    setSessionKey((k) => k + 1);
    const p = Object.values(state.characters).find((c) => c.isPlayer);
    if (p) setActiveMapId(p.position.mapId);
    fetchSession().then((s) => {
      setCurrentWorldId(s.worldId);
      setCurrentAddons(s.addons);
      setStagedAddons(s.addons);
      setSessionDirty(s.dirty);
    });
  }, []);

  const handleDirtyUpdate = useCallback((dirty: boolean) => {
    setSessionDirty(dirty);
  }, []);

  // WebSocket — always connected
  useEffect(() => {
    wsRef.current = connectWebSocket(handleStateUpdate, handleGameChanged, handleDirtyUpdate);
    return () => { wsRef.current?.close(); };
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

  const addMessage = useCallback((msg: string) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const addResultMessages = useCallback((result: { success: boolean; message: string; npcLog?: string[] }) => {
    addMessage(result.success ? result.message : `[失败] ${result.message}`);
    if (result.npcLog) {
      for (const line of result.npcLog) {
        addMessage(line);
      }
    }
  }, [addMessage]);

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
    [player, loading, addMessage]
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
    [player, loading, addMessage]
  );

  const handleAction = useCallback(async (actionId: string, targetId?: string) => {
    if (!player || loading) return;
    setLoading(true);
    try {
      const result = await performAction(player.id, "configured", undefined, undefined, actionId, targetId);
      addResultMessages(result);
    } finally {
      setLoading(false);
    }
  }, [player, loading, addMessage]);

  const handleCellClick = useCallback(
    (cellId: number) => {
      if (!player) return;
      const moveAction = actions.find((a) => a.type === "move");
      const target = moveAction?.targets?.find((t) => t.targetCell === cellId);
      if (target) handleMove(target.targetCell, target.targetMap);
    },
    [player, actions, handleMove]
  );

  // Called when world/addons change from sidebars
  const handleWorldChanged = useCallback(async () => {
    setMessages([]);
    setSessionKey((k) => k + 1); // Force remount editor components
    // Directly fetch new state (don't rely solely on WebSocket)
    const [state, session] = await Promise.all([fetchGameState(), fetchSession()]);
    setGameState(state);
    setCurrentWorldId(session.worldId);
    setCurrentAddons(session.addons);
    setStagedAddons(session.addons);
    setSessionDirty(session.dirty);
    const p = Object.values(state.characters).find((c) => c.isPlayer);
    if (p) setActiveMapId(p.position.mapId);
  }, []);

  const hasAddonChanges = (() => {
    if (stagedAddons.length !== currentAddons.length) return true;
    const currentMap = new Map(currentAddons.map(a => [a.id, a.version]));
    for (const staged of stagedAddons) {
      if (currentMap.get(staged.id) !== staged.version) return true;
    }
    return false;
  })();

  // --- Render ---

  if (!gameState) {
    return (
      <div style={{ color: "#ddd", fontFamily: "monospace", padding: "20px", backgroundColor: "#0f0f23", minHeight: "100vh" }}>
        加载中...
      </div>
    );
  }

  const activeMap = gameState.maps[activeMapId];
  const playerMap = player ? gameState.maps[player.position.mapId] : undefined;
  const playerCell = playerMap?.cells.find((c) => c.id === player?.position.cellId);
  const playerCellName = playerCell?.name ?? (player ? `${player.position.cellId}号` : "");

  const settingsBtnStyle: React.CSSProperties = {
    padding: "8px 16px",
    fontFamily: "monospace",
    fontSize: "13px",
    cursor: "pointer",
    border: "1px solid #333",
  };

  const renderNavPage = () => {
    const addonTab = currentWorldId ? (
      <AddonTabBar
        addons={stagedAddons}
        selectedAddon={selectedAddonTab}
        onSelect={setSelectedAddonTab}
      />
    ) : null;

    if (navPage === "characters") return <>{addonTab}<CharacterManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "traits") return <>{addonTab}<TraitManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "clothing") return <>{addonTab}<ClothingManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "items") return <>{addonTab}<ItemManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "actions") return <>{addonTab}<ActionManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "maps") return <>{addonTab}<MapManager key={sessionKey} selectedAddon={selectedAddonTab} /></>;
    if (navPage === "settings") {
      return <SettingsPage
        worldId={currentWorldId}
        onRestart={async () => {
          if (!confirm("确认重新开始游戏？所有运行时状态将重置。")) return;
          const result = await restartGame();
          if (result.success) {
            setMessages([]);
            setNavPage(null);
          }
        }}
        onWorldChanged={handleWorldChanged}
        settingsBtnStyle={settingsBtnStyle}
      />;
    }
    return null;
  };

  const renderCenter = () => {
    // Nav page (editors)
    if (navPage !== null) return renderNavPage();

    // No player
    if (!player) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#666", fontSize: "14px" }}>
          没有活跃的玩家角色。请在 [人物] 页面中设置一个 Player。
        </div>
      );
    }

    // Game view
    return (
      <>
        <div>
          <div style={{ display: "flex", gap: "2px", marginBottom: "4px" }}>
            <button
              onClick={() => setTopView("location")}
              style={{
                padding: "6px 16px",
                backgroundColor: topView === "location" ? "#16213e" : "#0f3460",
                color: topView === "location" ? "#e94560" : "#eee",
                border: "1px solid #333",
                borderBottom: topView === "location" ? "2px solid #e94560" : "1px solid #333",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "13px",
              }}
            >
              [{playerMap?.name ?? ""} - {playerCellName}]
            </button>
            {Object.values(gameState.maps).map((m) => (
              <button
                key={m.id}
                onClick={() => { setTopView(m.id); setActiveMapId(m.id); }}
                style={{
                  padding: "6px 16px",
                  backgroundColor: topView === m.id ? "#16213e" : "#0f3460",
                  color: topView === m.id ? "#e94560" : "#eee",
                  border: "1px solid #333",
                  borderBottom: topView === m.id ? "2px solid #e94560" : "1px solid #333",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "13px",
                }}
              >
                [{m.name}]
              </button>
            ))}
          </div>

          {topView === "location" ? (
            playerMap && (
              <LocationHeader
                time={gameState.time}
                map={playerMap}
                cellId={player.position.cellId}
                charactersAtLocation={charactersAtLocation}
                selectedCharacterId={selectedCharacterId}
                onSelectCharacter={setSelectedCharacterId}
              />
            )
          ) : (
            activeMap && (
              <MapView
                map={activeMap}
                playerCellId={player.position.mapId === activeMapId ? player.position.cellId : null}
                onCellClick={handleCellClick}
              />
            )
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", minHeight: "50vh" }}>
          <div style={{ flex: "1 1 60%", display: "flex", flexDirection: "column", minWidth: 0 }}>
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
              <NarrativePanel messages={messages} />
            )}
          </div>

          <div style={{ flex: "1 1 40%", display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, overflowY: "auto" }}>
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
              disabled={loading}
              selectedNpcId={
                selectedCharacterId && selectedCharacterId !== player.id
                  ? selectedCharacterId
                  : null
              }
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        backgroundColor: "#0f0f23",
      }}
    >
      <NavBar
        navPage={navPage}
        onNavChange={(p) => setNavPage(p)}
        worldName={currentWorldId ? gameState.worldId : ""}
        maxWidth={config.maxWidth}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((v) => !v)}
        onToggleRight={() => setRightOpen((v) => !v)}
      />

      {/* Left area: sidebar or spacer */}
      {leftOpen ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <WorldSidebar
            currentWorldId={currentWorldId}
            currentAddons={currentAddons}
            onWorldChanged={handleWorldChanged}
          />
        </div>
      ) : (
        <div style={{ flex: 1 }} />
      )}

      {/* Center content (fixed maxWidth) */}
      <div
        style={{
          flex: `0 1 ${config.maxWidth}px`,
          maxWidth: config.maxWidth,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          color: "#ddd",
          fontFamily: "monospace",
          padding: "8px",
          paddingTop: 48,
          gap: "8px",
          boxSizing: "border-box",
          minWidth: 0,
        }}
      >
        {renderCenter()}
      </div>

      {/* Right area: sidebar or spacer */}
      {rightOpen ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <AddonSidebar
            key={addonListKey}
            enabledAddons={currentAddons}
            stagedAddons={stagedAddons}
            onStagedChange={setStagedAddons}
            worldId={currentWorldId}
          />
        </div>
      ) : (
        <div style={{ flex: 1 }} />
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
