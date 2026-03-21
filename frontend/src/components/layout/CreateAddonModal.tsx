import { useState } from "react";
import { t } from "../../i18n/ui";
import { createAddon } from "../../api/client";
import T from "../../theme";
import { Overlay } from "../shared/Modal";

export default function CreateAddonModal({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [busy, setBusy] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    fontSize: "12px",
    boxSizing: "border-box",
    backgroundColor: T.bg2,
    color: T.text,
    border: `1px solid ${T.borderDim}`,
    borderRadius: "4px",
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: T.textSub,
    marginBottom: "2px",
  };

  const handleCreate = async () => {
    if (!id.trim() || !name.trim()) return;
    setBusy(true);
    const result = await createAddon({ id: id.trim(), name: name.trim(), version: version.trim() || "1.0.0" });
    setBusy(false);
    if (!result.success) {
      alert(result.message);
      return;
    }
    onCreated();
  };

  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{t("addon.createTitle")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div>
          <div style={labelStyle}>{t("addon.idLabel")}</div>
          <input style={inputStyle} value={id} onChange={(e) => setId(e.target.value)} placeholder="my-addon" />
        </div>
        <div>
          <div style={labelStyle}>{t("field.name")}</div>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("addon.myAddon")} />
        </div>
        <div>
          <div style={labelStyle}>{t("addon.initialVersion")}</div>
          <input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: "transparent",
            color: T.textSub,
            border: `1px solid ${T.textFaint}`,
          }}
        >
          {t("btn.cancel")}
        </button>
        <button
          onClick={handleCreate}
          disabled={busy || !id.trim() || !name.trim()}
          style={{
            padding: "6px 14px",
            fontSize: "12px",
            borderRadius: "4px",
            cursor: "pointer",
            backgroundColor: T.accent,
            color: T.bg0,
            border: "none",
            opacity: busy || !id.trim() || !name.trim() ? 0.5 : 1,
          }}
        >
          {busy ? t("btn.creating") : t("btn.create")}
        </button>
      </div>
    </Overlay>
  );
}
