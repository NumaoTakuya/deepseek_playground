// src/components/chat/SystemPromptSection.tsx
import { Box, TextField, IconButton } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

interface SystemPromptSectionProps {
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  showSystemBox: boolean;
  setShowSystemBox: (show: boolean) => void;
}

export default function SystemPromptSection({
  systemPrompt,
  setSystemPrompt,
  showSystemBox,
  setShowSystemBox,
}: SystemPromptSectionProps) {
  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "var(--color-panel)",
          color: "var(--color-text)",
          p: 1,
        }}
      >
        <Box sx={{ fontWeight: 600 }}>System Prompt</Box>
        <IconButton
          onClick={() => setShowSystemBox(!showSystemBox)}
          sx={{ color: "var(--color-text)", ml: "auto" }}
        >
          {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {showSystemBox && (
        <Box sx={{ backgroundColor: "var(--color-panel)", p: 2 }}>
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
        </Box>
      )}
    </>
  );
}
