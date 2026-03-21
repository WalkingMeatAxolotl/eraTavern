import { t } from "../../i18n/ui";
import type { AddonInfo } from "../../types/game";
import T from "../../theme";
import { Overlay, modalBtnStyle } from "../shared/Modal";

export default function DependencyModal({
  action,
  addon,
  related,
  onChain,
  onOnly,
  onCancel,
}: {
  action: "enable" | "disable";
  addon: AddonInfo;
  related: AddonInfo[];
  onChain: () => void;
  onOnly: () => void;
  onCancel: () => void;
}) {
  const isEnable = action === "enable";
  return (
    <Overlay onClose={onCancel}>
      <div style={{ color: T.text, fontSize: "14px", fontWeight: "bold" }}>{isEnable ? t("addon.depCheck") : t("addon.depWarning")}</div>
      <div style={{ color: T.text, fontSize: "12px", lineHeight: 1.6 }}>
        {isEnable ? (
          <>
            {t("addon.depNeeded", { name: <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span> })}
          </>
        ) : (
          <>
            {t("addon.depBy", { name: <span style={{ color: T.accent, fontWeight: "bold" }}>{addon.name}</span> })}
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: "8px",
          backgroundColor: T.bg1,
          borderRadius: "4px",
          maxHeight: "200px",
          overflowY: "auto",
        }}
      >
        {related.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <span style={{ color: isEnable ? T.accent : T.danger, fontWeight: "bold" }}>{r.name}</span>
            <span style={{ color: T.textDim, fontSize: "11px" }}>({r.id})</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={onChain}
          style={{
            ...modalBtnStyle(isEnable ? T.bg2 : T.dangerBg, isEnable ? T.success : T.danger),
            width: "100%",
            textAlign: "center",
          }}
        >
          {isEnable ? t("addon.enableAll", { count: related.length + 1 }) : t("addon.disableAll", { count: related.length + 1 })}
        </button>
        <button
          onClick={onOnly}
          style={{
            ...modalBtnStyle(T.bg2, T.accent),
            width: "100%",
            textAlign: "center",
          }}
        >
          {isEnable ? t("addon.enableOnly", { name: addon.name }) : t("addon.disableOnly", { name: addon.name })}
        </button>
        <button
          onClick={onCancel}
          style={{
            ...modalBtnStyle("transparent", T.textSub),
            width: "100%",
            textAlign: "center",
            border: `1px solid ${T.textFaint}`,
          }}
        >
          {t("btn.cancel")}
        </button>
      </div>
    </Overlay>
  );
}
