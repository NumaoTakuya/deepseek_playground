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
import { useTranslation } from "../contexts/LanguageContext";

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
  const { t } = useTranslation();

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
          sx={{ color: "var(--color-text)", ml: 1 }}
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
            sx={{
              color: "var(--color-subtext)",
              "&.Mui-checked": { color: "var(--color-primary)" },
            }}
          />
        }
        label={t("onboarding.checkbox")}
        sx={{
          color: "var(--color-text)",
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
          backgroundColor: "var(--color-panel)",
          color: "var(--color-text)",
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
            {t("onboarding.step1.title")}
          </TitleWithClose>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>{t("onboarding.step1.body")}</Typography>
          </DialogContent>
          {renderFooter(
            <>
              <Button onClick={handleCancel} sx={{ mr: 1 }}>
                {t("onboarding.actions.cancel")}
              </Button>
              <Button variant="contained" onClick={handleNext}>
                {t("onboarding.actions.next")}
              </Button>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <TitleWithClose>
            {t("onboarding.step2.title")}
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

            <Typography sx={{ mb: 2 }}>{t("onboarding.step2.body")}</Typography>

            {/* "Go to Deepseek Page" button */}
            <Button
              variant="contained"
              onClick={() =>
                window.open("https://platform.deepseek.com/api_keys", "_blank")
              }
              endIcon={<OpenInNewIcon />}
              sx={{
                backgroundColor: "var(--color-primary)",
                color: "#fff",
                borderRadius: 2,
                fontWeight: "bold",
                mb: 2,
                "&:hover": {
                  backgroundColor: "var(--color-hover)",
                },
              }}
            >
              {t("onboarding.step2.button")}
            </Button>

            <Typography variant="body2" sx={{ color: "var(--color-subtext)" }}>
              {t("onboarding.step2.tip")}
            </Typography>
          </DialogContent>
          {renderFooter(
            <>
              <Button onClick={handleBack}>{t("onboarding.actions.back")}</Button>
              <Button variant="contained" onClick={handleNext}>
                {t("onboarding.actions.next")}
              </Button>
            </>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <TitleWithClose>
            {t("onboarding.step3.title")}
          </TitleWithClose>
          <DialogContent>
            <Typography sx={{ mb: 2 }}>{t("onboarding.step3.body")}</Typography>

            <TextField
              fullWidth
              variant="outlined"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="sk-xxx..."
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "var(--color-border)" },
                  "&:hover fieldset": { borderColor: "var(--color-hover)" },
                  "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
                  "& .MuiOutlinedInput-input": {
                    color: "var(--color-text)",
                    fontFamily: '"Roboto Mono", monospace',
                  },
                },
                backgroundColor: "var(--color-panel)",
                mt: 1,
              }}
            />

            <Typography
              variant="body2"
              sx={{
                color: "var(--color-subtext)",
                mt: 2,
                fontSize: "0.85rem",
              }}
            >
              {t("onboarding.step3.note")}
            </Typography>
          </DialogContent>
          {renderFooter(
            <>
              <Button onClick={handleBack}>{t("onboarding.actions.back")}</Button>
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
                {t("onboarding.actions.finish")}
              </Button>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}
