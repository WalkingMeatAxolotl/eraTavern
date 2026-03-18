import T from "../../theme";

export const inputStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: T.bg3,
  color: T.text,
  border: `1px solid ${T.borderLight}`,
  borderRadius: "3px",
  fontSize: "12px",
};

export const labelStyle: React.CSSProperties = {
  color: T.textSub,
  fontSize: "11px",
  marginBottom: "2px",
};

export const btnBase: React.CSSProperties = {
  padding: "5px 16px",
  backgroundColor: T.bg2,
  color: T.text,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "13px",
};

export const addBtnStyle: React.CSSProperties = {
  padding: "2px 8px",
  backgroundColor: "#0a1a0a",
  color: T.successDim,
  border: "1px solid #2a4a2a",
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
};

export const delBtnStyle: React.CSSProperties = {
  padding: "2px 8px",
  backgroundColor: "#1a0a0a",
  color: T.danger,
  border: "1px solid #4a2a2a",
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
};

export const smallBtnStyle = (color: string): React.CSSProperties => ({
  padding: "2px 8px",
  backgroundColor: T.bg2,
  color,
  border: `1px solid ${T.border}`,
  borderRadius: "3px",
  cursor: "pointer",
  fontSize: "11px",
});

export const rowBg = (idx: number) => (idx % 2 === 0 ? T.bg1 : T.bg2);

export const listRowStyle = (idx: number, last: boolean): React.CSSProperties => ({
  backgroundColor: rowBg(idx),
  borderBottom: last ? "none" : `1px solid ${T.borderDim}`,
  padding: "3px 4px",
  borderRadius: "2px",
});
