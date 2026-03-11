import { useEffect, useState } from "react";
import { fetchMapsRaw, createMap } from "../api/client";
import MapEditor from "./MapEditor";

export default function MapManager({ selectedAddon }: { selectedAddon: string | null }) {
  const [maps, setMaps] = useState<{ id: string; name: string; source?: string }[]>([]);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newRows, setNewRows] = useState(15);
  const [newCols, setNewCols] = useState(40);

  const loadMaps = () => {
    fetchMapsRaw().then(setMaps);
  };

  useEffect(() => {
    loadMaps();
  }, []);

  const handleCreate = async () => {
    if (!newId.trim() || !newName.trim()) return;
    const result = await createMap(newId.trim(), newName.trim(), newRows, newCols);
    if (result.success) {
      setCreating(false);
      setNewId("");
      setNewName("");
      setNewRows(15);
      setNewCols(40);
      loadMaps();
    } else {
      alert(result.message);
    }
  };

  const readOnly = selectedAddon === null;
  const filteredMaps = selectedAddon ? maps.filter(m => m.source === selectedAddon) : maps;

  if (editingMapId) {
    return (
      <MapEditor
        mapId={editingMapId}
        onBack={() => {
          setEditingMapId(null);
          loadMaps();
        }}
      />
    );
  }

  const inputStyle: React.CSSProperties = {
    background: "#1a1a2e",
    border: "1px solid #333",
    color: "#ddd",
    padding: "4px 8px",
    fontFamily: "monospace",
    fontSize: "13px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ color: "#e94560", fontSize: "15px", fontWeight: "bold" }}>
        == 地图管理 ==
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {filteredMaps.map((m) => (
          <button
            key={m.id}
            onClick={() => setEditingMapId(m.id)}
            style={{
              background: "#1a1a2e",
              border: "1px solid #444",
              color: "#ddd",
              padding: "8px 16px",
              fontFamily: "monospace",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {m.name}
            <span style={{ color: "#666", marginLeft: "6px" }}>({m.id})</span>
          </button>
        ))}
        {!readOnly && (
          <button
            onClick={() => setCreating(true)}
            style={{
              background: "#0a3d0a",
              border: "1px solid #2a6a2a",
              color: "#8f8",
              padding: "8px 16px",
              fontFamily: "monospace",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            [+ 新建地图]
          </button>
        )}
      </div>

      {creating && (
        <div
          style={{
            background: "#16213e",
            border: "1px solid #333",
            padding: "12px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxWidth: "400px",
          }}
        >
          <div style={{ color: "#aaa", fontSize: "13px" }}>新建地图</div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ width: "40px", fontSize: "12px", color: "#888" }}>ID</span>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="map-id"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ width: "40px", fontSize: "12px", color: "#888" }}>名称</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="地图名称"
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ width: "40px", fontSize: "12px", color: "#888" }}>行数</span>
            <input
              type="number"
              value={newRows}
              onChange={(e) => setNewRows(Number(e.target.value))}
              min={1}
              max={100}
              style={{ ...inputStyle, width: "60px" }}
            />
            <span style={{ width: "40px", fontSize: "12px", color: "#888" }}>列数</span>
            <input
              type="number"
              value={newCols}
              onChange={(e) => setNewCols(Number(e.target.value))}
              min={1}
              max={100}
              style={{ ...inputStyle, width: "60px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleCreate}
              style={{
                background: "#0a3d0a",
                border: "1px solid #2a6a2a",
                color: "#8f8",
                padding: "4px 12px",
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              创建
            </button>
            <button
              onClick={() => setCreating(false)}
              style={{
                background: "#333",
                border: "1px solid #555",
                color: "#aaa",
                padding: "4px 12px",
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
