// src/components/ApiKeyOnboardingDialog.tsx

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  TextField,
  Checkbox,
  FormControlLabel,
  IconButton,
} from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";

interface Props {
  open: boolean; // Whether the dialog is open
  onClose: (dontShowAgain: boolean) => void; // Callback to close the dialog
  onApiKeySave: (key: string, dontShowAgain: boolean) => void; // Called when user finishes entering their key
  dontShowAgain: boolean; // Whether the user opted out of seeing the walkthrough again
  onDontShowAgainChange: (value: boolean) => void; // Update parent when checkbox toggled
}

export default function ApiKeyOnboardingDialog({
  open,
  onClose,
  onApiKeySave,
  dontShowAgain,
  onDontShowAgainChange,
}: Props) {
  const [step, setStep] = useState(1);
  const [tempKey, setTempKey] = useState("");

  const handleNext = () => setStep((prev) => prev + 1);
  const handleBack = () => setStep((prev) => prev - 1);

  // Finish wizard: Save key & close
  const handleFinish = () => {
    onApiKeySave(tempKey.trim(), dontShowAgain);
  };

  const handleCancel = () => {
    setStep(1);
    setTempKey("");
    onClose(dontShowAgain);
  };

  const TitleWithClose = ({ children }: { children: React.ReactNode }) => (
    <DialogTitle sx={{ fontWeight: "bold", fontSize: "1.4rem", pb: 1 }}>
      <Box display="flex" alignItems="center">
        <Box flexGrow={1}>{children}</Box>
        <IconButton
          onClick={handleCancel}
          size="small"
          sx={{ color: "#fff", ml: 1 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </DialogTitle>
  );

  useEffect(() => {
    if (open) {
      setStep(1);
      setTempKey("");
    }
  }, [open]);

  const renderFooter = (children: React.ReactNode) => (
    <DialogActions sx={{ justifyContent: "space-between", pt: 2 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={dontShowAgain}
            onChange={(event) => onDontShowAgainChange(event.target.checked)}
            sx={{ color: "#fff", "&.Mui-checked": { color: "#fff" } }}
          />
        }
        label="Do not show this again"
        sx={{
          color: "#fff",
          ml: 0,
          "& .MuiTypography-root": { fontSize: "0.9rem" },
        }}
      />
      <Box display="flex" gap={1}>
        {children}
      </Box>
    </DialogActions>
  );

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
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
          <TitleWithClose>
            1. Hello &amp; Welcome to Deepseek Playground! 🎉
          </TitleWithClose>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              We&apos;re thrilled to have you here! To start crafting AI
              responses, you&apos;ll need a Deepseek API key. Don&apos;t
              worry&mdash;your key is <strong>only stored locally</strong> in
              your browser. We never send it anywhere else.
            </Typography>
          </DialogContent>
          {renderFooter(
            <>
              <Button onClick={handleCancel} sx={{ mr: 1 }}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <TitleWithClose>
            2. Generate Your Deepseek API Key 🔑
          </TitleWithClose>
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
              Head over to Deepseek&apos;s console, then click{" "}
              <strong>&quot;Create new API key&quot;</strong> to get your shiny
              new key. Once you&apos;ve copied it, pop back here!
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
          {renderFooter(
            <>
              <Button onClick={handleBack}>Back</Button>
              <Button variant="contained" onClick={handleNext}>
                Next
              </Button>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <TitleWithClose>
            3. Paste Your Brand-New Key! 🚀
          </TitleWithClose>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>
              Almost there! Just drop your freshly-generated Deepseek key below.
              We&apos;ll keep it <strong>safely stored</strong> in your browser
              so you can focus on building awesome stuff.
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
              We don&apos;t send your key to any servers. Pinky promise. 🤞
            </Typography>
          </DialogContent>
          {renderFooter(
            <>
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
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
