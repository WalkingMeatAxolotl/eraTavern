import T from "../../theme";
import { useState } from "react";
import type { GameTime, GameMap, CharacterState } from "../../types/game";
import s from "./LocationHeader.module.css";

interface LocationHeaderProps {
  time: GameTime;
  map: GameMap;
  cellId: number;
  charactersAtLocation: CharacterState[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string | null) => void;
}

const PAGE_SIZE = 3;

export default function LocationHeader({
  time,
  map,
  cellId,
  charactersAtLocation,
  selectedCharacterId,
  onSelectCharacter,
}: LocationHeaderProps) {
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
    <div className={s.wrapper}>
      {/* Background image or gradient fallback */}
      {bgImage ? (
        <img src={`/assets/${bgImage}`} alt="" className={s.bgImage} />
      ) : (
        <div
          className={s.bgFallback}
          style={{
            background: `linear-gradient(135deg, ${T.bg2} 0%, ${T.bg1} 50%, ${T.bg2} 100%)`,
          }}
        />
      )}

      {/* Dark gradient overlay for text readability */}
      <div className={s.overlay} />

      {/* Top-left: time info */}
      <div className={s.timeInfo}>
        <div>{time.displayText}</div>
      </div>

      {/* Character portraits — max 3, each 20% width, with arrows */}
      {portraitChars.length > 0 && (
        <div className={s.portraitArea}>
          {showNav && safePage > 0 && (
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} className={s.navBtnLeft}>
              &lt;
            </button>
          )}

          {visibleChars.map((char) => {
            const isSelected = selectedCharacterId === char.id;
            return (
              <img
                key={char.id}
                src={`/assets/${char.portrait}`}
                alt={(char.basicInfo.name?.value as string) ?? char.id}
                onClick={() => onSelectCharacter(isSelected ? null : char.id)}
                className={isSelected ? s.portraitSelected : s.portrait}
                style={isSelected ? { outline: `2px solid ${T.accent}` } : undefined}
              />
            );
          })}

          {showNav && safePage < totalPages - 1 && (
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className={s.navBtnRight}
            >
              &gt;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
