import React, { useState } from "react";
import { t } from "../../i18n/ui";
import type { LLMProvider } from "../../types/game";
import { fetchLLMModels, testLLMConnection } from "../../api/client";
import { btnClass } from "../shared/buttons";
import clsx from "clsx";
import s from "./ProviderEditor.module.css";
import sh from "../shared/shared.module.css";

export default function ProviderEditor({
  provider,
  isNew,
  onSave,
  onDelete,
  onBack,
}: {
  provider: LLMProvider;
  isNew: boolean;
  onSave: (p: LLMProvider) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [prov, setProv] = useState<LLMProvider>(provider);
  const [modelList, setModelList] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [message, setMessage] = useState("");

  const handleFetchModels = async () => {
    const url = prov.baseUrl.trim();
    if (!url) {
      setTestResult(t("msg.fillApiUrl"));
      return;
    }
    setModelLoading(true);
    setTestResult("");
    try {
      const models = await fetchLLMModels(url, prov.apiKey);
      setModelList(models);
      if (models.length === 0) setTestResult(t("msg.noModels"));
    } catch (e) {
      setTestResult(t("llm.fetchModelsFailed", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setModelLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const url = prov.baseUrl.trim();
    if (!url) {
      setTestResult(t("msg.fillApiUrl"));
      return;
    }
    if (!prov.model) {
      setTestResult(t("msg.selectModel"));
      return;
    }
    setTestResult(t("llm.testing"));
    try {
      const result = await testLLMConnection({ baseUrl: url, apiKey: prov.apiKey, model: prov.model });
      setTestResult(result.success ? t("llm.connectSuccess") : result.message || t("llm.connectFailed"));
    } catch (e) {
      setTestResult(t("llm.connectFailedDetail", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const handleSave = () => {
    if (!prov.id.trim()) {
      setMessage(t("val.idRequired"));
      return;
    }
    if (!prov.name.trim()) {
      setMessage(t("val.nameRequired"));
      return;
    }
    onSave(prov);
  };

  return (
    <div>
      <div className={s.header}>
        <span className={s.title}>
          == {isNew ? t("editor.newApiService") : t("editor.editApiService")} ==
        </span>
        <button onClick={onBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>

      <div className={s.section} style={{ "--sec-color": "var(--sec-blue)" } as React.CSSProperties}>
        <div className={s.sectionTitle}>
          <span className={s.sectionTitleText}>{t("llm.apiService")}</span>
        </div>
        <div className={s.sectionContent}>
        <div className={s.flexRow}>
          <div className={s.flex1}>
            <div className={sh.label}>ID</div>
            <input
              className={clsx(s.inputFull, !isNew && s.inputDisabled)}
              value={prov.id}
              onChange={(e) => setProv((p) => ({ ...p, id: e.target.value }))}
              disabled={!isNew}
            />
          </div>
          <div className={s.flex1}>
            <div className={sh.label}>{t("field.name")}</div>
            <input
              className={s.inputFull}
              value={prov.name}
              onChange={(e) => setProv((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
        </div>

        <div className={s.flexRow}>
          <div className={s.flex2}>
            <div className={sh.label}>API URL</div>
            <input
              className={s.inputFull}
              value={prov.baseUrl}
              onChange={(e) => setProv((p) => ({ ...p, baseUrl: e.target.value }))}
              placeholder="http://127.0.0.1:8317/v1"
            />
          </div>
          <div className={s.flex1}>
            <div className={sh.label}>API Key</div>
            <input
              className={s.inputFull}
              type="password"
              value={prov.apiKey}
              onChange={(e) => setProv((p) => ({ ...p, apiKey: e.target.value }))}
              placeholder={t("llm.apiPlaceholder")}
            />
          </div>
        </div>

        <div className={s.modelRow}>
          <div className={s.flex2}>
            <div className={sh.label}>{t("llm.model")}</div>
            {modelList.length > 0 ? (
              <select
                className={s.inputFull}
                value={prov.model}
                onChange={(e) => setProv((p) => ({ ...p, model: e.target.value }))}
              >
                <option value="">{t("llm.selectModel")}</option>
                {modelList.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input
                className={s.inputFull}
                value={prov.model}
                onChange={(e) => setProv((p) => ({ ...p, model: e.target.value }))}
                placeholder={t("llm.modelPlaceholder")}
              />
            )}
          </div>
          <button onClick={handleFetchModels} disabled={modelLoading} className={btnClass("neutral")}>
            {modelLoading ? `[${t("btn.fetchingModels")}]` : `[${t("btn.fetchModels")}]`}
          </button>
          <button onClick={handleTestConnection} className={btnClass("neutral")}>
            [{t("btn.testConnection")}]
          </button>
        </div>
        {testResult && (
          <div className={s.testResult} style={{ color: testResult.includes("✓") ? "var(--success)" : "var(--danger)" }}>
            {testResult}
          </div>
        )}

        <div>
          <label className={clsx(sh.label, s.checkRow)}>
            <input
              type="checkbox"
              checked={prov.streaming}
              onChange={(e) => setProv((p) => ({ ...p, streaming: e.target.checked }))}
              style={{ accentColor: "var(--accent)" }}
            />
            {t("llm.streaming")}
          </label>
        </div>
        </div>
      </div>

      <div className={s.actionsRow}>
        <button onClick={handleSave} className={btnClass("create")}>
          [{t("btn.save")}]
        </button>
        {!isNew && (
          <button onClick={onDelete} className={btnClass("danger")}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} className={btnClass("neutral")}>
          [{t("btn.back")}]
        </button>
        {message && <span className={s.inlineError}>{message}</span>}
      </div>
    </div>
  );
}
