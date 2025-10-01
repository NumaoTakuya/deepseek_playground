// src/components/chat/SystemPromptSection.tsx
import { TextField } from "@mui/material";

interface SystemPromptSectionProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
}

export default function SystemPromptSection({
  systemPrompt,
  setSystemPrompt,
}: SystemPromptSectionProps) {
  return (
    <TextField
      fullWidth
      multiline
      minRows={2}
      value={systemPrompt}
      onChange={(e) => setSystemPrompt(e.target.value)}
      label="System Prompt"
      variant="outlined"
      sx={{
        "& .MuiOutlinedInput-root": {
          "& fieldset": { borderColor: "var(--color-border)" },
          "&:hover fieldset": { borderColor: "var(--color-hover)" },
          "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
        },
        "& .MuiInputLabel-root": {
          color: "var(--color-subtext)",
        },
        "& .MuiInputLabel-root.Mui-focused": {
          color: "var(--color-text)",
        },
        "& .MuiOutlinedInput-input": {
          color: "var(--color-text)",
        },
      }}
    />
  );
}
