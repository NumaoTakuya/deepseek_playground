// src/components/chat/InputSection.tsx

import { Box, TextField, IconButton, Alert } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import StopIcon from "@mui/icons-material/Stop"; // ← 追加
import { useApiKey } from "../../contexts/ApiKeyContext";
import { useTranslation } from "../../contexts/LanguageContext";

interface InputSectionProps {
  input: string;
  setInput: (input: string) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  // 追加: thinking中かどうか (ボタンアイコン切替)
  assistantThinking?: boolean;
}

export default function InputSection({
  input,
  setInput,
  handleSend,
  handleKeyDown,
  assistantThinking = false,
}: InputSectionProps) {
  const { apiKey } = useApiKey();
  const { t } = useTranslation();

  return (
    <Box p={2}>
      {!apiKey?.trim() && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          {t("chat.errors.apiKeyMissing")} {t("chat.errors.apiKeyHint")} {" "}
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--color-text)", textDecoration: "underline" }}
          >
            {t("chat.errors.apiKeyLinkLabel")}
          </a>
        </Alert>
      )}

      <Box display="flex" gap={1} sx={{ m: 0 }}>
        <TextField
          margin="none"
          multiline
          minRows={1}
          maxRows={6}
          fullWidth
          label={t("chat.placeholders.message")}
          variant="outlined"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{
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
          }}
        />

        <IconButton
          onClick={handleSend}
          sx={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            "&:hover": { backgroundColor: "var(--color-hover)" },
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {assistantThinking ? <StopIcon /> : <ArrowUpwardIcon />}
        </IconButton>
      </Box>
    </Box>
  );
}
