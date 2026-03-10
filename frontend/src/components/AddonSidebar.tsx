import { useState, useEffect, useCallback } from "react";
import type { AddonInfo } from "../types/game";
import { fetchAddons } from "../api/client";

interface AddonSidebarProps {
  enabledAddons: { id: string; version: string }[];
  stagedAddons: { id: string; version: string }[];
  onStagedChange: (addons: { id: string; version: string }[]) => void;
  onEditAddon: (addonId: string, version: string) => void;
  worldId: string;
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{
        width: "36px",
        height: "18px",
        borderRadius: "9px",
        border: "1px solid #444",
        background: enabled ? "#0f3460" : "#1a1a2e",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        transition: "background 0.15s",
      }}
    >
      <div style={{
        width: "14px",
        height: "14px",
        borderRadius: "50%",
        background: enabled ? "#e94560" : "#555",
        position: "absolute",
        top: "1px",
        left: enabled ? "19px" : "1px",
        transition: "left 0.15s, background 0.15s",
      }} />
    </button>
  );
}

export default function AddonSidebar({ enabledAddons, stagedAddons, onStagedChange, onEditAddon, worldId }: AddonSidebarProps) {
  const [allAddons, setAllAddons] = useState<AddonInfo[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchAddons().then(setAllAddons);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const hasAddonChanges = JSON.stringify(stagedAddons) !== JSON.stringify(enabledAddons);

  const isStagedEnabled = (addonId: string) =>
    stagedAddons.some((a) => a.id === addonId);

  const handleToggle = (addon: AddonInfo) => {
    if (isStagedEnabled(addon.id)) {
      onStagedChange(stagedAddons.filter((a) => a.id !== addon.id));
    } else {
      onStagedChange([...stagedAddons, { id: addon.id, version: addon.version }]);
    }
  };

  return (
    <div style={{
      width: "100%",
      height: "100vh",
      borderLeft: "1px solid #333",
      display: "flex",
      flexDirection: "column",
      fontSize: "12px",
      overflow: "hidden",
      paddingTop: 40,
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{ padding: "8px", borderBottom: "1px solid #222", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ color: "#888", fontSize: "11px" }}>Add-on</div>
        {hasAddonChanges && (
          <button
            onClick={() => onStagedChange(enabledAddons)}
            style={{
              padding: "4px 8px",
              backgroundColor: "#16213e",
              color: "#888",
              border: "1px solid #333",
              borderRadius: "3px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "11px",
            }}
          >
            [撤销开关变更]
          </button>
        )}
      </div>

      {/* Addon cards */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}>
        {allAddons.length === 0 ? (
          <div style={{ color: "#666", fontSize: "11px", padding: "8px 0" }}>
            没有已安装的 Add-on
          </div>
        ) : (
          allAddons.map((addon) => {
            const enabled = isStagedEnabled(addon.id);
            const expanded = expandedId === addon.id;
            return (
              <div key={`${addon.id}@${addon.version}`}>
                {/* Card row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 8px",
                    backgroundColor: expanded ? "#16213e" : "#0a0a1a",
                    border: "1px solid #222",
                    borderRadius: expanded ? "3px 3px 0 0" : "3px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedId(expanded ? null : addon.id)}
                >
                  <ToggleSwitch enabled={enabled} onChange={() => handleToggle(addon)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px",
                      color: enabled ? "#ddd" : "#666",
                      fontWeight: enabled ? "bold" : "normal",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {addon.name}
                    </div>
                    <div style={{ fontSize: "10px", color: "#555" }}>v{addon.version}</div>
                  </div>
                  <span style={{ color: "#555", fontSize: "10px" }}>
                    {expanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
                {/* Expanded details */}
                {expanded && (
                  <div style={{
                    padding: "8px",
                    backgroundColor: "#0f0f20",
                    border: "1px solid #222",
                    borderTop: "none",
                    borderRadius: "0 0 3px 3px",
                    fontSize: "11px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}>
                    {addon.description && (
                      <div style={{ color: "#888" }}>{addon.description}</div>
                    )}
                    {addon.author && (
                      <div style={{ color: "#666" }}>Author: {addon.author}</div>
                    )}
                    {addon.dependencies && addon.dependencies.length > 0 && (
                      <div style={{ color: "#666" }}>
                        Deps: {addon.dependencies.map(d => `${d.id}@${d.version}`).join(", ")}
                      </div>
                    )}
                    {addon.categories && addon.categories.length > 0 && (
                      <div style={{ color: "#666" }}>
                        Categories: {addon.categories.join(", ")}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditAddon(addon.id, addon.version);
                        }}
                        style={{
                          padding: "3px 10px",
                          backgroundColor: "#16213e",
                          color: "#e94560",
                          border: "1px solid #333",
                          borderRadius: "3px",
                          cursor: "pointer",
                          fontFamily: "monospace",
                          fontSize: "11px",
                        }}
                      >
                        [编辑]
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
