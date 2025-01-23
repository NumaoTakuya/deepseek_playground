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
          backgroundColor: "#333",
          color: "#fff",
          p: 1,
        }}
      >
        <Box sx={{ fontWeight: 600 }}>System Prompt</Box>
        <IconButton
          onClick={() => setShowSystemBox(!showSystemBox)}
          sx={{ color: "#fff", ml: "auto" }}
        >
          {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>

      {showSystemBox && (
        <Box sx={{ backgroundColor: "#2e2e2e", p: 2 }}>
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
                "& fieldset": { borderColor: "#555" },
                "&:hover fieldset": { borderColor: "#888" },
                "&.Mui-focused fieldset": { borderColor: "#aaa" },
              },
              "& .MuiInputLabel-root": {
                color: "#ddd",
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: "#ddd",
              },
              "& .MuiOutlinedInput-input": {
                color: "#fff",
              },
            }}
          />
        </Box>
      )}
    </>
  );
}
