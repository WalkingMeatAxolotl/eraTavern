import type { GameInfo } from "../types/game";

interface GameSidebarProps {
  games: GameInfo[];
  currentGameId: string;
  onSelect: (gameId: string) => void;
  onClose: () => void;
  maxWidth: number;
}

export default function GameSidebar({
  games,
  currentGameId,
  onSelect,
  onClose,
  maxWidth,
}: GameSidebarProps) {
  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 40,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)",
          zIndex: 99,
        }}
      />
      {/* Sidebar panel */}
      <div
        style={{
          position: "fixed",
          top: 40,
          right: 0,
          bottom: 0,
          width: `calc((100vw - ${maxWidth}px) / 2)`,
          minWidth: 280,
          backgroundColor: "#0f0f23",
          borderLeft: "1px solid #333",
          zIndex: 100,
          overflowY: "auto",
          padding: "12px",
          boxSizing: "border-box",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            color: "#888",
            fontSize: "12px",
            marginBottom: "12px",
            borderBottom: "1px solid #333",
            paddingBottom: "8px",
          }}
        >
          游戏卡
        </div>
        {games.map((g) => {
          const active = g.id === currentGameId;
          return (
            <div
              key={g.id}
              onClick={() => onSelect(g.id)}
              style={{
                padding: "10px",
                marginBottom: "8px",
                border: active ? "1px solid #e94560" : "1px solid #333",
                borderRadius: "4px",
                cursor: "pointer",
                backgroundColor: active ? "#1a1a2e" : "transparent",
              }}
            >
              <div
                style={{
                  color: active ? "#e94560" : "#ddd",
                  fontSize: "13px",
                  fontWeight: active ? "bold" : "normal",
                }}
              >
                {g.name}
              </div>
              {g.description && (
                <div
                  style={{
                    color: "#666",
                    fontSize: "11px",
                    marginTop: "4px",
                  }}
                >
                  {g.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
