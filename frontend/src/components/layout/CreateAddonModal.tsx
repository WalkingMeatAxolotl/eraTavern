import { useState } from "react";
import { t } from "../../i18n/ui";
import { createAddon } from "../../api/client";
import { Overlay } from "../shared/Modal";
import s from "./CreateAddonModal.module.css";

export default function CreateAddonModal({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [busy, setBusy] = useState(false);

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
      <div className={s.title}>{t("addon.createTitle")}</div>
      <div className={s.form}>
        <div>
          <div className={s.label}>{t("addon.idLabel")}</div>
          <input className={s.input} value={id} onChange={(e) => setId(e.target.value)} placeholder="my-addon" />
        </div>
        <div>
          <div className={s.label}>{t("field.name")}</div>
          <input className={s.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("addon.myAddon")} />
        </div>
        <div>
          <div className={s.label}>{t("addon.initialVersion")}</div>
          <input className={s.input} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" />
        </div>
      </div>
      <div className={s.actions}>
        <button onClick={onCancel} className={s.cancelBtn}>
          {t("btn.cancel")}
        </button>
        <button onClick={handleCreate} disabled={busy || !id.trim() || !name.trim()} className={s.createBtn}>
          {busy ? t("btn.creating") : t("btn.create")}
        </button>
      </div>
    </Overlay>
  );
}
