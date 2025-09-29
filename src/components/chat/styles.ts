// src/components/chat/styles.ts
export const inputStyles = {
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "var(--color-border)" },
    "&:hover fieldset": { borderColor: "var(--color-hover)" },
    "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
  },
  "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "var(--color-text)" },
  "& .MuiOutlinedInput-input": { color: "var(--color-text)" },
};

export const selectStyles = {
  minWidth: 160,
  backgroundColor: "transparent",
  "& .MuiOutlinedInput-root": {
    backgroundColor: "transparent",
    "& fieldset": { borderColor: "var(--color-border)" },
    "&:hover fieldset": { borderColor: "var(--color-hover)" },
    "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
    "& .MuiSelect-select": {
      display: "inline-block",
      width: "120px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: "var(--color-text)",
      padding: "6px 8px",
    },
  },
  "& .MuiFormLabel-root": {
    backgroundColor: "transparent",
    color: "var(--color-subtext)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--color-text)",
  },
};

export const formControlStyles = {
  minWidth: 160,
  backgroundColor: "transparent",
  "& .MuiOutlinedInput-root": {
    backgroundColor: "transparent",
    "& fieldset": { borderColor: "var(--color-border)" },
    "&:hover fieldset": { borderColor: "var(--color-hover)" },
    "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
    "& .MuiSelect-select": {
      display: "inline-block",
      width: "120px",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      color: "var(--color-text)",
      padding: "6px 8px",
    },
  },
  "& .MuiFormLabel-root": {
    backgroundColor: "transparent",
    color: "var(--color-subtext)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--color-text)",
  },
};

export const textFieldStyles = {
  backgroundColor: "var(--color-panel)",
  "& .MuiOutlinedInput-root": {
    "& fieldset": { borderColor: "var(--color-border)" },
    "&:hover fieldset": { borderColor: "var(--color-hover)" },
    "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
  },
  "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "var(--color-text)",
  },
  "& .MuiOutlinedInput-input": {
    color: "var(--color-text)",
    fontSize: "0.9rem",
    lineHeight: 1.4,
  },
};
