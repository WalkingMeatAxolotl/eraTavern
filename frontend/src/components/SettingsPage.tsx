import { useState, useEffect } from "react";
import { fetchBackups, restoreBackup } from "../api/client";
import T from "../theme";

interface Props {
  worldId: string;
  onRestart: () => void;
  onWorldChanged: () => void;
  settingsBtnStyle: React.CSSProperties;
}

export default function SettingsPage({ worldId, onRestart, onWorldChanged, settingsBtnStyle }: Props) {
  const [backups, setBackups] = useState<string[]>([]);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (worldId) {
      fetchBackups().then(setBackups);
    } else {
      setBackups([]);
    }
  }, [worldId]);

  const handleRestore = async (timestamp: string) => {
    if (!confirm(`确认回滚到 ${timestamp}？当前运行时状态将被替换。`)) return;
    setRestoring(true);
    setMessage("");
    try {
      const result = await restoreBackup(timestamp);
      setMessage(result.success ? "已回滚" : result.message);
      if (result.success) {
        onWorldChanged();
        fetchBackups().then(setBackups);
      }
    } catch (e) {
      setMessage(`回滚失败: ${e}`);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontFamily: "monospace", fontSize: "13px", color: T.text }}>
      <div style={{ color: T.accent, fontSize: "15px", fontWeight: "bold" }}>
        == 世界设置 ==
      </div>

      {/* Restart */}
      <div>
        <button
          onClick={onRestart}
          style={{
            ...settingsBtnStyle,
            background: T.dangerBg,
            color: T.danger,
            borderColor: `${T.danger}66`,
          }}
        >
          [重新开始游戏]
        </button>
        <span style={{ marginLeft: "8px", fontSize: "12px", color: T.textDim }}>
          重新加载所有数据，重置时间和角色状态
        </span>
      </div>

      {/* Backup & Rollback */}
      {worldId && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ color: T.accent, fontSize: "14px", fontWeight: "bold" }}>
            -- 备份与回滚 --
          </div>
          <div style={{ color: T.textSub, fontSize: "12px", lineHeight: "1.6" }}>
            每次 [保存变更] 时自动创建备份（保留最近 5 份）。
            <br />
            回滚将恢复世界设置（addon 列表、实体定义）到备份时的状态。
            <br />
            <span style={{ color: T.textDim }}>注意：回滚不影响运行时存档数据（位置、库存等）。</span>
          </div>

          {backups.length === 0 ? (
            <div style={{ color: T.textDim, fontSize: "12px", padding: "4px 0" }}>
              暂无备份
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {backups.map((ts) => (
                <div
                  key={ts}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    backgroundColor: T.bg3,
                    border: `1px solid ${T.borderDim}`,
                    borderRadius: "3px",
                  }}
                >
                  <span style={{ color: T.textSub, fontSize: "12px" }}>{ts}</span>
                  <button
                    onClick={() => handleRestore(ts)}
                    disabled={restoring}
                    style={{
                      padding: "3px 10px",
                      backgroundColor: T.bg2,
                      color: T.accent,
                      border: `1px solid ${T.border}`,
                      borderRadius: "3px",
                      cursor: restoring ? "not-allowed" : "pointer",
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                  >
                    [回滚]
                  </button>
                </div>
              ))}
            </div>
          )}

          {message && (
            <span style={{ color: message === "已回滚" ? T.success : T.accent, fontSize: "12px" }}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
