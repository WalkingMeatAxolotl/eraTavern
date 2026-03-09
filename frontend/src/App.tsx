import { useEffect, useState, useCallback, useRef } from "react";
import type { GameState, GameAction, GameInfo } from "./types/game";
import type { DetailTab } from "./components/CharacterPanel";
import {
  fetchConfig,
  fetchGameState,
  fetchActions,
  fetchGames,
  selectGame,
  performAction,
  restartGame,
  connectWebSocket,
} from "./api/client";
import type { AppConfig } from "./api/client";
import LocationHeader from "./components/LocationHeader";
import MapView from "./components/MapView";
import CompactCharacterInfo from "./components/CompactCharacterInfo";
import CharacterPanel from "./components/CharacterPanel";
import ActionMenu from "./components/ActionMenu";
import NarrativePanel from "./components/NarrativePanel";
import NavBar from "./components/NavBar";
import GameSidebar from "./components/GameSidebar";
import CharacterManager from "./components/CharacterManager";
import TraitManager from "./components/TraitManager";
import ClothingManager from "./components/ClothingManager";
import ItemManager from "./components/ItemManager";
import ActionManager from "./components/ActionManager";
import MapManager from "./components/MapManager";

type NavPage = "characters" | "traits" | "clothing" | "items" | "actions" | "maps" | "settings";

export default function App() {
  const [config, setConfig] = useState<AppConfig>({ maxWidth: 1200 });
  const [games, setGames] = useState<GameInfo[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [activeMapId, setActiveMapId] = useState<string>("");
  const [messages, setMessages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [topView, setTopView] = useState<"location" | string>("location"); // "location" or a mapId
  const [compactTab, setCompactTab] = useState<"basic" | "clothing">("basic");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("basic");
  const [navPage, setNavPage] = useState<NavPage | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const player = gameState
    ? Object.values(gameState.characters).find((c) => c.isPlayer) ?? null
    : null;

  // Characters at player's current location (player first)
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

  // Load config + games + initial state
  useEffect(() => {
    fetchConfig().then(setConfig);
    fetchGames().then(setGames);
    fetchGameState().then((state) => {
      setGameState(state);
      const p = Object.values(state.characters).find((c) => c.isPlayer);
      if (p) setActiveMapId(p.position.mapId);
    });
  }, []);

  // Handle game state updates (including game changes)
  const handleStateUpdate = useCallback((state: GameState) => {
    setGameState(state);
  }, []);

  const handleGameChanged = useCallback((state: GameState) => {
    setGameState(state);
    setMessages([]);
    // Reset active map to player's map
    const p = Object.values(state.characters).find((c) => c.isPlayer);
    if (p) setActiveMapId(p.position.mapId);
  }, []);

  // WebSocket
  useEffect(() => {
    wsRef.current = connectWebSocket(handleStateUpdate, handleGameChanged);
    return () => { wsRef.current?.close(); };
  }, [handleStateUpdate, handleGameChanged]);

  // Fetch actions whenever game state changes (position, clothing, etc.) or target changes
  const selectedNpcForActions = selectedCharacterId && selectedCharacterId !== player?.id ? selectedCharacterId : null;
  useEffect(() => {
    if (!player) return;
    fetchActions(player.id, selectedNpcForActions).then((data) => setActions(data.actions));
  }, [gameState, selectedNpcForActions]);

  // Reset activeMapId when gameId changes
  useEffect(() => {
    if (!gameState || !player) return;
    // If activeMapId is not in the new maps, reset it
    if (!gameState.maps[activeMapId]) {
      setActiveMapId(player.position.mapId);
    }
  }, [gameState?.gameId]);

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

  const handleSelectGame = useCallback(async (gameId: string) => {
    await selectGame(gameId);
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

  const navPageLabels: Record<NavPage, string> = {
    characters: "",
    traits: "",
    clothing: "",
    items: "",
    actions: "",
    maps: "",
    settings: "",
  };

  const renderNavPage = () => {
    if (navPage === "characters") {
      return <CharacterManager />;
    }
    if (navPage === "traits") {
      return <TraitManager />;
    }
    if (navPage === "clothing") {
      return <ClothingManager />;
    }
    if (navPage === "items") {
      return <ItemManager />;
    }
    if (navPage === "actions") {
      return <ActionManager />;
    }
    if (navPage === "maps") {
      return <MapManager />;
    }
    if (navPage === "settings") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ color: "#e94560", fontSize: "15px", fontWeight: "bold" }}>
            == 系统设置 ==
          </div>
          <div>
            <button
              onClick={async () => {
                if (!confirm("确认重新开始游戏？所有运行时状态将重置。")) return;
                const result = await restartGame();
                if (result.success) {
                  setMessages([]);
                  setNavPage(null);
                }
              }}
              style={{
                background: "#3d0a0a",
                border: "1px solid #6a2a2a",
                color: "#f88",
                padding: "8px 16px",
                fontFamily: "monospace",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              [重新开始游戏]
            </button>
            <span style={{ marginLeft: "8px", fontSize: "12px", color: "#666" }}>
              重新加载所有数据，重置时间和角色状态
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#0f0f23",
      }}
    >
      <NavBar
        navPage={navPage}
        onNavChange={setNavPage}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        gameName={games.find((g) => g.id === gameState.gameId)?.name ?? ""}
        maxWidth={config.maxWidth}
      />
      {sidebarOpen && (
        <GameSidebar
          games={games}
          currentGameId={gameState.gameId}
          onSelect={(id) => {
            handleSelectGame(id);
            setSidebarOpen(false);
          }}
          onClose={() => setSidebarOpen(false)}
          maxWidth={config.maxWidth}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: config.maxWidth,
          color: "#ddd",
          fontFamily: "monospace",
          padding: "8px",
          paddingTop: 48,
          gap: "8px",
          boxSizing: "border-box",
        }}
      >
        {navPage !== null ? renderNavPage() : !player ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#666", fontSize: "14px" }}>
            没有活跃的玩家角色。请在 [人物] 页面中设置一个 Player。
          </div>
        ) : (
        <>
        {/* Top: tabbed Location / Map views */}
        <div>
          {/* Tab bar */}
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

          {/* Content */}
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

        {/* Main content: Left + Right */}
        <div style={{ display: "flex", gap: "8px", minHeight: "50vh" }}>
          {/* Left: Narrative or Detail panel */}
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

          {/* Right: Compact Info + Actions (always visible) */}
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
        )}
      </div>
    </div>
  );
}
