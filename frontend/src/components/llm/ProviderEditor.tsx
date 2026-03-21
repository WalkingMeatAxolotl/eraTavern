import { useState } from "react";
import T from "../../theme";
import { t } from "../../i18n/ui";
import type { LLMProvider } from "../../types/game";
import { fetchLLMModels, testLLMConnection } from "../../api/client";
import { inputStyle, sectionStyle } from "./LLMPresetManager";
import { btn, labelStyle } from "../shared/styles";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <span style={{ color: T.accent, fontWeight: "bold", fontSize: "14px" }}>
          == {isNew ? t("editor.newApiService") : t("editor.editApiService")} ==
        </span>
        <button onClick={onBack} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>ID</div>
            <input
              style={{ ...inputStyle, ...(isNew ? {} : { color: T.textDim }) }}
              value={prov.id}
              onChange={(e) => setProv((p) => ({ ...p, id: e.target.value }))}
              disabled={!isNew}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>{t("field.name")}</div>
            <input
              style={inputStyle}
              value={prov.name}
              onChange={(e) => setProv((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "6px" }}>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>API URL</div>
            <input
              style={inputStyle}
              value={prov.baseUrl}
              onChange={(e) => setProv((p) => ({ ...p, baseUrl: e.target.value }))}
              placeholder="http://127.0.0.1:8317/v1"
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>API Key</div>
            <input
              style={inputStyle}
              type="password"
              value={prov.apiKey}
              onChange={(e) => setProv((p) => ({ ...p, apiKey: e.target.value }))}
              placeholder={t("llm.apiPlaceholder")}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", marginBottom: "6px" }}>
          <div style={{ flex: 2 }}>
            <div style={labelStyle}>{t("llm.model")}</div>
            {modelList.length > 0 ? (
              <select
                style={inputStyle}
                value={prov.model}
                onChange={(e) => setProv((p) => ({ ...p, model: e.target.value }))}
              >
                <option value="">{t("llm.selectModel")}</option>
                {modelList.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                style={inputStyle}
                value={prov.model}
                onChange={(e) => setProv((p) => ({ ...p, model: e.target.value }))}
                placeholder={t("llm.modelPlaceholder")}
              />
            )}
          </div>
          <button onClick={handleFetchModels} disabled={modelLoading} style={btn("neutral")}>
            {modelLoading ? `[${t("btn.fetchingModels")}]` : `[${t("btn.fetchModels")}]`}
          </button>
          <button onClick={handleTestConnection} style={btn("neutral")}>
            [{t("btn.testConnection")}]
          </button>
        </div>
        {testResult && (
          <div
            style={{ color: testResult.includes("✓") ? T.success : T.danger, fontSize: "12px", marginBottom: "6px" }}
          >
            {testResult}
          </div>
        )}

        <div>
          <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="checkbox"
              checked={prov.streaming}
              onChange={(e) => setProv((p) => ({ ...p, streaming: e.target.checked }))}
              style={{ accentColor: T.accent }}
            />
            {t("llm.streaming")}
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button onClick={handleSave} style={btn("create")}>
          [{t("btn.save")}]
        </button>
        {!isNew && (
          <button onClick={onDelete} style={btn("danger")}>
            [{t("btn.delete")}]
          </button>
        )}
        <button onClick={onBack} style={btn("neutral")}>
          [{t("btn.back")}]
        </button>
        {message && <span style={{ color: T.danger, fontSize: "12px" }}>{message}</span>}
      </div>
    </div>
  );
}
