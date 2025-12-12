// pages/chat/index.tsx
import React, { useEffect, useState } from "react";
import {
  Box,
  TextField,
  IconButton,
  Alert,
  Typography,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  CircularProgress,
  Slider,
  Button,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useRouter } from "next/router";
import ApiKeyOnboardingDialog from "@/src/components/ApiKeyOnboardingDialog";
import { useAuth } from "../../contexts/AuthContext";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { createThread } from "../../services/thread";
import { callDeepseek } from "../../services/deepseek";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import Head from "next/head";
import { useTranslation } from "../../contexts/LanguageContext";

export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiKey, setApiKey } = useApiKey();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [hasDismissedThisSession, setHasDismissedThisSession] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedSkip = window.localStorage.getItem("skipApiKeyOnboarding") === "true";
    const storedKey = window.localStorage.getItem("deepseekApiKey");
    setSkipOnboarding(storedSkip);
    setDontShowAgain(storedSkip);
    if (storedKey) {
      setHasDismissedThisSession(true);
    }
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    if (apiKey) {
      setIsDialogOpen(false);
      setHasDismissedThisSession(false);
      return;
    }
    if (!skipOnboarding && !hasDismissedThisSession) {
      setIsDialogOpen(true);
    } else {
      setIsDialogOpen(false);
    }
  }, [apiKey, skipOnboarding, hasDismissedThisSession, preferencesLoaded]);

  const persistSkipPreference = (shouldSkip: boolean) => {
    if (typeof window === "undefined") return;
    if (shouldSkip) {
      window.localStorage.setItem("skipApiKeyOnboarding", "true");
    } else {
      window.localStorage.removeItem("skipApiKeyOnboarding");
    }
  };

  const handleDontShowAgainChange = (value: boolean) => {
    setDontShowAgain(value);
  };

  const handleOnboardingClose = (shouldSkip: boolean) => {
    setDontShowAgain(shouldSkip);
    persistSkipPreference(shouldSkip);
    if (shouldSkip) {
      setSkipOnboarding(true);
      setHasDismissedThisSession(false);
    } else {
      setSkipOnboarding(false);
      setHasDismissedThisSession(true);
    }
    setIsDialogOpen(false);
  };

  // ダイアログ内でキーが確定された
  const handleApiKeySave = (key: string, shouldSkip: boolean) => {
    setApiKey(key); // Contextなどで保存
    localStorage.setItem("apiKey", key);
    handleOnboardingClose(shouldSkip);
  };

  // system prompt
  const [systemInput, setSystemInput] = useState(
    "You are a helpful assistant."
  );
  const [showSystemBox, setShowSystemBox] = useState(false);
  const [showParametersBox, setShowParametersBox] = useState(false);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(1024);
  const { t } = useTranslation();
  const resetParameters = () => {
    setFrequencyPenalty(0);
    setPresencePenalty(0);
    setTemperature(1);
    setTopP(1);
    setMaxTokens(1024);
  };

  // user's first message
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Deepseekモデル選択
  const [model, setModel] = useState("deepseek-chat");

  if (!user) return null;

  const handleSend = async () => {
    setError("");
    if (!apiKey.trim()) {
      setError(
        `${t("chat.errors.apiKeyMissing")} ${t("chat.errors.apiKeyHint")} ${t("chat.errors.apiKeyLinkLabel")}`
      );
      return;
    }
    if (!userInput.trim()) return;

    const inputValue = userInput.trim();
    setUserInput("");
    setLoading(true);

    try {
      // 1) 新規スレッド作成（仮タイトル）
      const newThreadId = await createThread(user.uid, "New Chat");

      // 2) [threadId]で用いるためローカルストレージにユーザの入力内容を一時的に保存
      localStorage.setItem(`thread-${newThreadId}-model`, model);
      localStorage.setItem(`thread-${newThreadId}-systemInput`, systemInput);
      localStorage.setItem(`thread-${newThreadId}-inputValue`, inputValue);
      localStorage.setItem(
        `thread-${newThreadId}-frequencyPenalty`,
        String(frequencyPenalty)
      );
      localStorage.setItem(
        `thread-${newThreadId}-presencePenalty`,
        String(presencePenalty)
      );
      localStorage.setItem(
        `thread-${newThreadId}-temperature`,
        String(temperature)
      );
      localStorage.setItem(`thread-${newThreadId}-topP`, String(topP));
      localStorage.setItem(`thread-${newThreadId}-maxTokens`, String(maxTokens));

      // 3) 即座にチャット画面へ遷移
      router.push(`/chat/${newThreadId}`);

      // 4) バックグラウンドでタイトル生成
      const titlePrompt = `Create a short thread title (under 10 characters, no quotes) based on this message: "${inputValue}"`;
      callDeepseek(apiKey, [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: titlePrompt },
      ])
        .then(async (title) => {
          await updateDoc(doc(db, "threads", newThreadId), {
            title,
            model,
            frequencyPenalty,
            presencePenalty,
            temperature,
            topP,
            maxTokens,
          });
        })
        .catch(console.error);
    } catch (err) {
      console.error("Error in handleSend:", err);
      setError(t("chat.errors.threadCreation"));
    }
  };

  const handleKeyDownUser = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      console.log("Enter key pressed");
      handleSend();
    }
  };

  return (
    <>
      {/* Wizardダイアログ（もしlocalStrageにapi keyが存在しなかったら表示） */}
      <ApiKeyOnboardingDialog
        open={isDialogOpen}
        onClose={handleOnboardingClose}
        onApiKeySave={handleApiKeySave}
        dontShowAgain={dontShowAgain}
        onDontShowAgainChange={handleDontShowAgainChange}
      />
      <Head>
        <title>{t("chat.new.meta.title")}</title>
        <meta name="description" content={t("chat.new.meta.description")} />
        <meta property="og:title" content={t("chat.new.meta.title")} />
        <meta
          property="og:description"
          content={t("chat.new.meta.preview")}
        />
        <meta
          property="og:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
        <meta
          property="og:url"
          content="https://deepseek-playground.vercel.app/chat"
        />
        <meta property="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={t("chat.new.meta.title")} />
        <meta
          name="twitter:description"
          content={t("chat.new.meta.twitter")}
        />
        <meta
          name="twitter:image"
          content="https://deepseek-playground.vercel.app/images/screenshot-small.png"
        />
      </Head>

      {/* 全体ラッパ */}
      <Box
        display="flex"
        flexDirection="column"
        minHeight="100vh"
        justifyContent="center"
        alignItems="center"
        p={2}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={2}
          >
            <CircularProgress />
            <div>
              {t("chat.new.loading")}
            </div>
          </Box>
        ) : (
          <Box width="100%" maxWidth="600px">
            {/* モデル選択 */}
            <Box mb={2}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t("chat.new.chooseModel")}
              </Typography>
              <FormControl
                variant="outlined"
                size="small"
                sx={{
                  minWidth: 180,
                  backgroundColor: "transparent",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "var(--color-border)" },
                    "&:hover fieldset": { borderColor: "var(--color-hover)" },
                    "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
                    "& .MuiSelect-select": {
                      color: "var(--color-text)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  },
                  "& .MuiFormLabel-root": { color: "var(--color-subtext)" },
                  "& .MuiFormLabel-root.Mui-focused": {
                    color: "var(--color-text)",
                  },
                }}
              >
                <InputLabel shrink sx={{ color: "var(--color-subtext)" }}>
                  {t("common.model")}
                </InputLabel>
                <Select
                  label={t("common.model")}
                  value={model}
                  onChange={(e) => {
                    const selectedModel = e.target.value as string;
                    setModel(selectedModel);
                    // if (selectedModel === "deepseek-reasoner") {
                    //   setError(
                    //     "Currently, due to attacks on Deepseek servers, the deepseek-reasoner API might be unstable. If it doesn't work, please switch back to deepseek-chat."
                    //   );
                    // } else {
                    //   setError(""); // 他のモデル選択時はエラーをクリア
                    // }
                  }}
                >
                  <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                  <MenuItem value="deepseek-reasoner">
                    deepseek-reasoner
                  </MenuItem>
                </Select>
              </FormControl>
            </Box>

            {/* System Prompt */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "var(--color-panel)",
                color: "var(--color-text)",
                p: 1,
                mb: 2,
                borderRadius: 1,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {t("common.systemPrompt")}
              </Typography>
              <IconButton
                onClick={() => setShowSystemBox(!showSystemBox)}
                sx={{ color: "var(--color-text)", ml: "auto" }}
              >
                {showSystemBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            {showSystemBox && (
              <Box
                sx={{
                  backgroundColor: "var(--color-panel)",
                  p: 2,
                  borderRadius: 1,
                  mb: 3,
                }}
              >
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  value={systemInput}
                  onChange={(e) => setSystemInput(e.target.value)}
                  label={t("chat.new.editSystemPrompt")}
                  variant="outlined"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "var(--color-border)" },
                      "&:hover fieldset": { borderColor: "var(--color-hover)" },
                      "&.Mui-focused fieldset": {
                        borderColor: "var(--color-hover)",
                      },
                    },
                    "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                    "& .MuiOutlinedInput-input": { color: "var(--color-text)" },
                  }}
                />
              </Box>
            )}

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                backgroundColor: "var(--color-panel)",
                color: "var(--color-text)",
                p: 1,
                mb: 2,
                borderRadius: 1,
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {t("common.parameters")}
              </Typography>
              <IconButton
                onClick={() => setShowParametersBox(!showParametersBox)}
                sx={{ color: "var(--color-text)", ml: "auto" }}
              >
                {showParametersBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            {showParametersBox && (
              <Box
                sx={{
                  backgroundColor: "var(--color-panel)",
                  p: 2,
                  borderRadius: 1,
                  mb: 3,
                }}
              >
                <Box sx={{ mb: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)" }}
                    >
                      {t("common.frequencyPenalty")}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {frequencyPenalty.toFixed(1)}
                    </Typography>
                  </Box>
                  <Slider
                    value={frequencyPenalty}
                    onChange={(_, value) =>
                      setFrequencyPenalty(Array.isArray(value) ? value[0] : value)
                    }
                    min={-2}
                    max={2}
                    step={0.1}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="frequency penalty"
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)" }}
                  >
                    {t("common.frequencyPenaltyDescription")}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)" }}
                    >
                      {t("common.presencePenalty")}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {presencePenalty.toFixed(1)}
                    </Typography>
                  </Box>
                  <Slider
                    value={presencePenalty}
                    onChange={(_, value) =>
                      setPresencePenalty(Array.isArray(value) ? value[0] : value)
                    }
                    min={-2}
                    max={2}
                    step={0.1}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="presence penalty"
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)" }}
                  >
                    {t("common.presencePenaltyDescription")}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)" }}
                    >
                      {t("common.temperature")}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {temperature.toFixed(1)}
                    </Typography>
                  </Box>
                  <Slider
                    value={temperature}
                    onChange={(_, value) =>
                      setTemperature(Array.isArray(value) ? value[0] : value)
                    }
                    min={0}
                    max={2}
                    step={0.1}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="temperature"
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)" }}
                  >
                    {t("common.temperatureDescription")}
                  </Typography>
                </Box>

                <Box sx={{ mb: 3 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)" }}
                    >
                      {t("common.topP")}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {topP.toFixed(2)}
                    </Typography>
                  </Box>
                  <Slider
                    value={topP}
                    onChange={(_, value) =>
                      setTopP(Array.isArray(value) ? value[0] : value)
                    }
                    min={0}
                    max={1}
                    step={0.05}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="top p"
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)" }}
                  >
                    {t("common.topPDescription")}
                  </Typography>
                </Box>

                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)" }}
                    >
                      {t("common.maxTokens")}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "var(--color-subtext)" }}
                    >
                      {maxTokens}
                    </Typography>
                  </Box>
                  <Slider
                    value={maxTokens}
                    onChange={(_, value) =>
                      setMaxTokens(Array.isArray(value) ? value[0] : value)
                    }
                    min={1}
                    max={4096}
                    step={64}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="max tokens"
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--color-subtext)" }}
                  >
                    {t("common.maxTokensDescription")}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mt: 3,
                    gap: 2,
                  }}
                >
                  <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>
                    {t("common.toolsInfo")}
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={resetParameters}
                    sx={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}
                  >
                    {t("common.reset")}
                  </Button>
                </Box>
              </Box>
            )}

            {/* ユーザーの最初のメッセージ */}
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t("chat.labels.firstMessage")}
            </Typography>

            <Box display="flex" alignItems="center" gap={1}>
              <TextField
                multiline
                minRows={1}
                maxRows={6}
                fullWidth
                label={t("chat.placeholders.firstMessage")}
                variant="outlined"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDownUser}
                sx={{
                  backgroundColor: "var(--color-panel)",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "var(--color-border)" },
                    "&:hover fieldset": { borderColor: "var(--color-hover)" },
                    "&.Mui-focused fieldset": {
                      borderColor: "var(--color-hover)",
                    },
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "var(--color-text)",
                    fontSize: "0.9rem",
                    lineHeight: 1.4,
                  },
                  "& .MuiInputLabel-root": {
                    color: "var(--color-subtext)",
                  },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "var(--color-text)",
                  },
                }}
              />

              {/* 送信ボタン */}
              <IconButton
                onClick={handleSend}
                sx={{
                  borderRadius: "50%",
                  backgroundColor: "var(--color-primary)",
                  color: "#fff",
                  width: 48,
                  height: 48,
                  "&:hover": {
                    backgroundColor: "var(--color-hover)",
                  },
                  "&:focus": {
                    outline: "none",
                    boxShadow: "none",
                  },
                }}
              >
                <ArrowUpwardIcon />
              </IconButton>
            </Box>
          </Box>
        )}
      </Box>
    </>
  );
}
