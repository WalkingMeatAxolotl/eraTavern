import T from "../theme";
import { useState } from "react";
import type { GameTime, GameMap, CharacterState } from "../types/game";

interface LocationHeaderProps {
  time: GameTime;
  map: GameMap;
  cellId: number;
  charactersAtLocation: CharacterState[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
}

const PAGE_SIZE = 3;

export default function LocationHeader({ time, map, cellId, charactersAtLocation, selectedCharacterId, onSelectCharacter }: LocationHeaderProps) {
  const [page, setPage] = useState(0);

  const cell = map.cells.find((c) => c.id === cellId);
  const bgImage = cell?.backgroundImage ?? map.backgroundImage;

  // Characters with portraits at this location
  const portraitChars = charactersAtLocation.filter((c) => c.portrait);
  const totalPages = Math.max(1, Math.ceil(portraitChars.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleChars = portraitChars.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const showNav = portraitChars.length > PAGE_SIZE;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        maxHeight: "50vh",
        borderRadius: "4px",
        overflow: "hidden",
        backgroundColor: T.bg0,
      }}
    >
      {/* Background image or gradient fallback */}
      {bgImage ? (
        <img
          src={`/assets/${bgImage}`}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, ${T.bg2} 0%, ${T.bg1} 50%, ${T.bg2} 100%)`,
          }}
        />
      )}

      {/* Dark gradient overlay for text readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Top-left: time info */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "12px",
          fontSize: "13px",
          color: T.text,
          textShadow: "1px 1px 3px rgba(0,0,0,0.9)",
          lineHeight: "1.6",
          zIndex: 2,
        }}
      >
        <div>{time.displayText}</div>
      </div>

      {/* Character portraits — max 3, each 20% width, with arrows */}
      {portraitChars.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "100%",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: "2%",
            padding: "0 4%",
            zIndex: 1,
          }}
        >
          {showNav && safePage > 0 && (
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              style={{
                position: "absolute",
                left: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.5)",
                color: T.text,
                border: "none",
                borderRadius: "4px",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: "18px",
                zIndex: 3,
              }}
            >
              &lt;
            </button>
          )}

          {visibleChars.map((char) => {
            const isSelected = selectedCharacterId === char.id;
            return (
              <img
                key={char.id}
                src={`/assets/${char.portrait}`}
                alt={char.basicInfo.name?.value as string ?? char.id}
                onClick={() => onSelectCharacter(isSelected ? null : char.id)}
                style={{
                  width: "30%",
                  maxHeight: "85%",
                  objectFit: "contain",
                  objectPosition: "bottom",
                  cursor: "pointer",
                  filter: isSelected ? "brightness(1.2)" : "none",
                  outline: isSelected ? `2px solid ${T.accent}` : "none",
                  outlineOffset: "-2px",
                }}
              />
            );
          })}

          {showNav && safePage < totalPages - 1 && (
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(0,0,0,0.5)",
                color: T.text,
                border: "none",
                borderRadius: "4px",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: "18px",
                zIndex: 3,
              }}
            >
              &gt;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
