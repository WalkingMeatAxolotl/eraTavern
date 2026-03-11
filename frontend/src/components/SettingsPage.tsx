import { useState, useEffect } from "react";
import { fetchBackups, restoreBackup } from "../api/client";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", fontFamily: "monospace", fontSize: "13px", color: "#ddd" }}>
      <div style={{ color: "#e94560", fontSize: "15px", fontWeight: "bold" }}>
        == 系统设置 ==
      </div>

      {/* Restart */}
      <div>
        <button
          onClick={onRestart}
          style={{
            ...settingsBtnStyle,
            background: "#3d0a0a",
            color: "#f88",
            borderColor: "#6a2a2a",
          }}
        >
          [重新开始游戏]
        </button>
        <span style={{ marginLeft: "8px", fontSize: "12px", color: "#666" }}>
          重新加载所有数据，重置时间和角色状态
        </span>
      </div>

      {/* Backup & Rollback */}
      {worldId && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ color: "#e94560", fontSize: "14px", fontWeight: "bold" }}>
            -- 备份与回滚 --
          </div>
          <div style={{ color: "#888", fontSize: "12px", lineHeight: "1.6" }}>
            每次 [保存变更] 时自动创建备份（保留最近 5 份）。
            <br />
            回滚将恢复世界设置（addon 列表、实体定义）到备份时的状态。
            <br />
            <span style={{ color: "#666" }}>注意：回滚不影响运行时存档数据（位置、库存等）。</span>
          </div>

          {backups.length === 0 ? (
            <div style={{ color: "#666", fontSize: "12px", padding: "4px 0" }}>
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
                    backgroundColor: "#0a0a1a",
                    border: "1px solid #222",
                    borderRadius: "3px",
                  }}
                >
                  <span style={{ color: "#aaa", fontSize: "12px" }}>{ts}</span>
                  <button
                    onClick={() => handleRestore(ts)}
                    disabled={restoring}
                    style={{
                      padding: "3px 10px",
                      backgroundColor: "#16213e",
                      color: "#e94560",
                      border: "1px solid #333",
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
            <span style={{ color: message === "已回滚" ? "#0f0" : "#e94560", fontSize: "12px" }}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
