// src/components/ApiKeyOnboardingDialog.tsx
import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  TextField,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

interface Props {
  open: boolean; // Whether the dialog is open
  onClose: () => void; // Callback to close the dialog
  onApiKeySave: (key: string) => void; // Called when user finishes entering their key
}

export default function ApiKeyOnboardingDialog({
  open,
  onClose,
  onApiKeySave,
}: Props) {
  const [step, setStep] = useState(1);
  const [tempKey, setTempKey] = useState("");

  const handleNext = () => setStep((prev) => prev + 1);
  const handleBack = () => setStep((prev) => prev - 1);

  // Finish wizard: Save key & close
  const handleFinish = () => {
    onApiKeySave(tempKey.trim());
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          backgroundColor: "#2e2e2e",
          color: "#fff",
          textAlign: "center",
          p: 3,
          borderRadius: 2,
          minWidth: { xs: "300px", sm: "500px" },
        },
      }}
    >
      {step === 1 && (
        <>
          <DialogTitle sx={{ fontWeight: "bold", fontSize: "1.4rem" }}>
            1. Hello & Welcome to Deepseek Playground! 🎉
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              We're thrilled to have you here! To start crafting AI responses,
              you'll need a Deepseek API key. Don't worry—your key is{" "}
              <strong>only stored locally</strong> in your browser. We never
              send it anywhere else.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "flex-end" }}>
            <Button onClick={onClose} sx={{ mr: 1 }}>
              Cancel
            </Button>
            <Button variant="contained" onClick={handleNext}>
              Next
            </Button>
          </DialogActions>
        </>
      )}

      {step === 2 && (
        <>
          <DialogTitle sx={{ fontWeight: "bold", fontSize: "1.4rem" }}>
            2. Generate Your Deepseek API Key 🔑
          </DialogTitle>
          <DialogContent>
            {/* Replace with your own GIF or image */}
            <Box
              component="img"
              src="/images/deepseek-playground-apikey.gif"
              alt="Deepseek Explanation"
              sx={{
                display: "block",
                mx: "auto",
                mb: 2,
                maxWidth: "100%",
                maxHeight: "200px",
                borderRadius: 1,
              }}
            />

            <Typography sx={{ mb: 2 }}>
              Head over to Deepseek's console, then click{" "}
              <strong>"Create new API key"</strong> to get your shiny new key.
              Once you've copied it, pop back here!
            </Typography>

            {/* "Go to Deepseek Page" button */}
            <Button
              variant="contained"
              onClick={() =>
                window.open("https://platform.deepseek.com/api_keys", "_blank")
              }
              endIcon={<OpenInNewIcon />}
              sx={{
                backgroundColor: "#fff",
                color: "#000",
                borderRadius: 2,
                fontWeight: "bold",
                mb: 2,
                "&:hover": {
                  backgroundColor: "#f0f0f0",
                },
              }}
            >
              Go to Deepseek Page
            </Button>

            <Typography variant="body2" sx={{ color: "#aaa" }}>
              Pro tip: You can always create multiple keys if you like.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "space-between" }}>
            <Button onClick={handleBack}>Back</Button>
            <Button variant="contained" onClick={handleNext}>
              Next
            </Button>
          </DialogActions>
        </>
      )}

      {step === 3 && (
        <>
          <DialogTitle sx={{ fontWeight: "bold", fontSize: "1.4rem" }}>
            3. Paste Your Brand-New Key! 🚀
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              Almost there! Just drop your freshly-generated Deepseek key below.
              We'll keep it <strong>safely stored</strong> in your browser so
              you can focus on building awesome stuff.
            </Typography>

            <TextField
              fullWidth
              variant="outlined"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="sk-xxx..."
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#555" },
                  "&:hover fieldset": { borderColor: "#888" },
                  "&.Mui-focused fieldset": { borderColor: "#aaa" },
                  "& .MuiOutlinedInput-input": {
                    color: "#fff",
                    fontFamily: '"Roboto Mono", monospace',
                  },
                },
                backgroundColor: "#333",
                mt: 1,
              }}
            />

            <Typography
              variant="body2"
              sx={{ color: "#aaa", mt: 2, fontSize: "0.85rem" }}
            >
              We don't send your key to any servers. Pinky promise. 🤞
            </Typography>
          </DialogContent>
          <DialogActions sx={{ justifyContent: "space-between", pt: 2 }}>
            <Button onClick={handleBack}>Back</Button>
            <Button
              variant="contained"
              onClick={handleFinish}
              disabled={!tempKey.trim()}
              sx={{
                backgroundColor: "var(--color-primary)",
                fontSize: "1rem",
                px: 4,
                py: 1.5,
                fontWeight: "bold",
                fontFamily: '"Ubuntu Mono", monospace',
                "&:hover": {
                  backgroundColor: "var(--color-hover)",
                },
              }}
            >
              Finish
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
