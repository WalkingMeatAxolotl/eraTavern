import { useEffect, useState } from "react";
import { t } from "../../i18n/ui";
import { fetchMapsRaw, createMap } from "../../api/client";
import MapEditor from "./MapEditor";
import s from "./MapManager.module.css";

export default function MapManager({
  selectedAddon,
  onEditingChange,
  addonIds: _addonIds,
}: {
  selectedAddon: string | null;
  onEditingChange?: (editing: boolean) => void;
  addonIds?: string[];
}) {
  void _addonIds; // reserved for future map clone support
  const [maps, setMaps] = useState<{ id: string; name: string; source?: string }[]>([]);
  const [editingMapId, setEditingMapId] = useState<string | null>(null);

  useEffect(() => {
    onEditingChange?.(editingMapId !== null);
  }, [editingMapId, onEditingChange]);

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
    // Prefix with addon namespace so backend assigns correct source
    const fullId = selectedAddon ? `${selectedAddon}.${newId.trim()}` : newId.trim();
    const result = await createMap(fullId, newName.trim(), newRows, newCols);
    if (result.success) {
      setCreating(false);
      setNewId("");
      setNewName("");
      setNewRows(15);
      setNewCols(40);
      loadMaps();
      // Enter editor for the newly created map
      setEditingMapId(fullId);
    } else {
      alert(result.message);
    }
  };

  const readOnly = selectedAddon === null;
  const filteredMaps = selectedAddon ? maps.filter((m) => m.source === selectedAddon) : maps;

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

  return (
    <div className={s.wrapper}>
      <div className={s.header}>
        <span className={s.title}>== {t("header.mapMgmt")} ==</span>
        {!readOnly && (
          <button onClick={() => setCreating(true)} className={s.createBtn}>
            [{t("btn.newMap")}]
          </button>
        )}
      </div>

      <div className={s.mapList}>
        {filteredMaps.map((m) => (
          <div key={m.id} className={s.mapRow}>
            <button onClick={() => setEditingMapId(m.id)} className={s.mapBtn}>
              {m.name}
              <span className={s.mapId}>({m.id})</span>
            </button>
          </div>
        ))}
      </div>

      {creating && (
        <div className={s.createForm}>
          <div className={s.createTitle}>{t("map.newMapTitle")}</div>
          <div className={s.formRow}>
            <span className={s.formLabel}>ID</span>
            <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="map-id" className={s.formInput} />
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>{t("field.name")}</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("map.mapNamePlaceholder")}
              className={s.formInput}
            />
          </div>
          <div className={s.formRow}>
            <span className={s.formLabel}>{t("map.rowCount")}</span>
            <input
              type="number"
              value={newRows}
              onChange={(e) => setNewRows(Number(e.target.value))}
              min={1}
              max={100}
              className={s.formInputSm}
            />
            <span className={s.formLabel}>{t("map.colCount")}</span>
            <input
              type="number"
              value={newCols}
              onChange={(e) => setNewCols(Number(e.target.value))}
              min={1}
              max={100}
              className={s.formInputSm}
            />
          </div>
          <div className={s.createBtnRow}>
            <button onClick={handleCreate} className={s.createBtn}>
              {t("btn.create")}
            </button>
            <button onClick={() => setCreating(false)} className={s.cancelBtn}>
              {t("btn.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
