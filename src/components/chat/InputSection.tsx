import {
  Box,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Alert,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import StopIcon from "@mui/icons-material/Stop"; // ← 追加
import { useApiKey } from "../../contexts/ApiKeyContext";

interface InputSectionProps {
  input: string;
  setInput: (input: string) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  model: string;
  handleModelChange: (model: string) => void;
  // 追加: thinking中かどうか (ボタンアイコン切替)
  assistantThinking?: boolean;
}

export default function InputSection({
  input,
  setInput,
  handleSend,
  handleKeyDown,
  model,
  handleModelChange,
  assistantThinking = false,
}: InputSectionProps) {
  const { apiKey } = useApiKey();

  return (
    <Box p={2}>
      {!apiKey?.trim() && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          No API Key provided. Enter it in the sidebar. You can obtain it from{" "}
          <a
            href="https://platform.deepseek.com/api_keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#fff", textDecoration: "underline" }}
          >
            https://platform.deepseek.com/api_keys
          </a>
        </Alert>
      )}

      <Box display="flex" gap={1} sx={{ m: 0 }}>
        <FormControl
          variant="outlined"
          margin="none"
          size="small"
          sx={{
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
          }}
        >
          <InputLabel shrink>Model</InputLabel>
          <Select
            label="Model"
            value={model}
            onChange={(e) => handleModelChange(e.target.value as string)}
            autoWidth={false}
          >
            <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
            <MenuItem value="deepseek-reasoner">deepseek-reasoner</MenuItem>
          </Select>
        </FormControl>

        <TextField
          margin="none"
          multiline
          minRows={1}
          maxRows={6}
          fullWidth
          label="Type your message (Shift+Enter for newline)"
          variant="outlined"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{
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
