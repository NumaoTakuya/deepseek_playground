// src/components/chat/styles.ts
export const inputStyles = {
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "#555" },
    "&:hover fieldset": { borderColor: "#888" },
    "&.Mui-focused fieldset": { borderColor: "#aaa" },
  },
  "& .MuiInputLabel-root": { color: "#ddd" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#ddd" },
  "& .MuiOutlinedInput-input": { color: "#fff" },
};

export const selectStyles = {
  minWidth: 160,
  backgroundColor: "transparent",
  "& .MuiOutlinedInput-root": {
    backgroundColor: "transparent",
    "& fieldset": { borderColor: "#555" },
    "&:hover fieldset": { borderColor: "#888" },
    "&.Mui-focused fieldset": { borderColor: "#aaa" },
    "& .MuiSelect-select": {
      display: "inline-block",
      width: "120px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: "#fff",
      padding: "6px 8px",
    },
  },
  "& .MuiFormLabel-root": {
    backgroundColor: "transparent",
    color: "#ddd",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#ddd",
  },
};

export const formControlStyles = {
  minWidth: 160,
  backgroundColor: "transparent",
  "& .MuiOutlinedInput-root": {
    backgroundColor: "transparent",
    "& fieldset": { borderColor: "#555" },
    "&:hover fieldset": { borderColor: "#888" },
    "&.Mui-focused fieldset": { borderColor: "#aaa" },
    "& .MuiSelect-select": {
      display: "inline-block",
      width: "120px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: "#fff",
      padding: "6px 8px",
    },
  },
  "& .MuiFormLabel-root": {
    backgroundColor: "transparent",
    color: "#ddd",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#ddd",
  },
};

export const textFieldStyles = {
  backgroundColor: "#2e2e2e",
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "#555" },
    "&:hover fieldset": { borderColor: "#888" },
    "&.Mui-focused fieldset": { borderColor: "#aaa" },
  },
  "& .MuiInputLabel-root": { color: "#ddd" },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#ddd",
  },
  "& .MuiOutlinedInput-input": {
    color: "#fff",
    fontSize: "0.9rem",
    lineHeight: 1.4,
  },
};
