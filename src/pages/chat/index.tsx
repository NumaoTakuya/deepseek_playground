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
  Switch,
  Divider,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import MediaInputs, { mediaDialogPaperSx } from "../../components/chat/MediaInputs";
import ApiSettingsFields from "../../components/chat/ApiSettingsFields";
import BuiltinTools from "../../components/chat/BuiltinTools";
import type { Attachment } from "../../services/deepseekAttachments";
import { parseDeepseekOptions } from "../../services/deepseekRequest";
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
import { CURRENT_MODELS, DEFAULT_MODEL, getModelLimits, isCurrentModel } from "../../services/deepseekModels";

export default function ChatHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { apiKey, setApiKey } = useApiKey();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [skipOnboarding, setSkipOnboarding] = useState(false);
  const [hasDismissedThisSession, setHasDismissedThisSession] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const DRAFT_TOOLS_JSON_KEY = "chat-index-draft-toolsJson";
  const DRAFT_TOOL_HANDLERS_KEY = "chat-index-draft-toolHandlersJson";
  const DRAFT_INPUT_KEY = "chat-index-draft-input";
  const DRAFT_FIM_PREFIX_KEY = "chat-index-draft-fimPrefix";
  const DRAFT_FIM_SUFFIX_KEY = "chat-index-draft-fimSuffix";
  const DRAFT_FIM_MAX_TOKENS_KEY = "chat-index-draft-fimMaxTokens";
  const UI_SYSTEM_OPEN_KEY = "chat-index-ui-system-open";
  const UI_PARAMS_OPEN_KEY = "chat-index-ui-parameters-open";
  const UI_ADVANCED_OPEN_KEY = "chat-index-ui-advanced-open";
  const UI_TOOLS_OPEN_KEY = "chat-index-ui-tools-open";
  const UI_FIM_OPEN_KEY = "chat-index-ui-fim-open";

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
    if (typeof window === "undefined") return;
    const draftToolsJson = window.localStorage.getItem(DRAFT_TOOLS_JSON_KEY);
    const draftToolHandlers = window.localStorage.getItem(DRAFT_TOOL_HANDLERS_KEY);
    const draftInput = window.localStorage.getItem(DRAFT_INPUT_KEY);
    const draftFimPrefix = window.localStorage.getItem(DRAFT_FIM_PREFIX_KEY);
    const draftFimSuffix = window.localStorage.getItem(DRAFT_FIM_SUFFIX_KEY);
    const draftFimMaxTokens = window.localStorage.getItem(DRAFT_FIM_MAX_TOKENS_KEY);
    if (draftToolsJson !== null) {
      setToolsJson(draftToolsJson);
    }
    if (draftToolHandlers !== null) {
      setToolHandlersJson(draftToolHandlers);
    }
    if (draftInput !== null) {
      setUserInput(draftInput);
    }
    if (draftFimPrefix !== null) {
      setFimPrefix(draftFimPrefix);
    }
    if (draftFimSuffix !== null) {
      setFimSuffix(draftFimSuffix);
    }
    if (draftFimMaxTokens !== null) {
      const parsed = Number.parseInt(draftFimMaxTokens, 10);
      if (!Number.isNaN(parsed)) {
        setFimMaxTokens(parsed);
      }
    }
  }, [
    DRAFT_INPUT_KEY,
    DRAFT_TOOL_HANDLERS_KEY,
    DRAFT_TOOLS_JSON_KEY,
    DRAFT_FIM_PREFIX_KEY,
    DRAFT_FIM_SUFFIX_KEY,
    DRAFT_FIM_MAX_TOKENS_KEY,
  ]);

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

  // Deepseekモデル選択
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [apiFormat, setApiFormat] = useState<"chat" | "responses" | "messages">("chat");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [requestOptionsJson, setRequestOptionsJson] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState<"low" | "high" | "max">("high");

  // system prompt
  const [systemInput, setSystemInput] = useState(
    "You are a helpful assistant."
  );
  const [showSystemBox, setShowSystemBox] = useState(false);
  const [showParametersBox, setShowParametersBox] = useState(false);
  const [showAdvancedBox, setShowAdvancedBox] = useState(false);
  const [showApiBox, setShowApiBox] = useState(false);
  const toggleSection = (section: "system" | "parameters" | "features" | "api") => {
    setShowSystemBox(section === "system" ? !showSystemBox : false);
    setShowParametersBox(section === "parameters" ? !showParametersBox : false);
    setShowAdvancedBox(section === "features" ? !showAdvancedBox : false);
    setShowApiBox(section === "api" ? !showApiBox : false);
  };
  const [frequencyPenalty, setFrequencyPenalty] = useState(0);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [temperature, setTemperature] = useState(1);
  const [topP, setTopP] = useState(1);
  const [maxTokens, setMaxTokens] = useState(getModelLimits(DEFAULT_MODEL).defaultMaxTokens);
  const [toolsJson, setToolsJson] = useState("");
  const [toolsStrict, setToolsStrict] = useState(false);
  const [toolsJsonError, setToolsJsonError] = useState<string | null>(null);
  const [toolHandlersJson, setToolHandlersJson] = useState("");
  const [toolHandlersJsonError, setToolHandlersJsonError] = useState<
    string | null
  >(null);
  const [jsonOutput, setJsonOutput] = useState(false);
  const [showToolsBox, setShowToolsBox] = useState(false);
  const [showFimBox, setShowFimBox] = useState(false);
  const [fimPrefix, setFimPrefix] = useState("");
  const [fimSuffix, setFimSuffix] = useState("");
  const [fimMaxTokens, setFimMaxTokens] = useState(128);
  const { t } = useTranslation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const systemOpen = window.localStorage.getItem(UI_SYSTEM_OPEN_KEY);
    const paramsOpen = window.localStorage.getItem(UI_PARAMS_OPEN_KEY);
    const advancedOpen = window.localStorage.getItem(UI_ADVANCED_OPEN_KEY);
    const toolsOpen = window.localStorage.getItem(UI_TOOLS_OPEN_KEY);
    const fimOpen = window.localStorage.getItem(UI_FIM_OPEN_KEY);
    setShowSystemBox(systemOpen === "true");
    setShowParametersBox(systemOpen !== "true" && paramsOpen === "true");
    setShowAdvancedBox(systemOpen !== "true" && paramsOpen !== "true" && advancedOpen === "true");
    if (toolsOpen !== null) {
      setShowToolsBox(toolsOpen === "true");
    }
    if (fimOpen !== null) {
      setShowFimBox(fimOpen === "true");
    }
  }, [
    UI_ADVANCED_OPEN_KEY,
    UI_PARAMS_OPEN_KEY,
    UI_SYSTEM_OPEN_KEY,
    UI_TOOLS_OPEN_KEY,
    UI_FIM_OPEN_KEY,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_SYSTEM_OPEN_KEY, String(showSystemBox));
  }, [showSystemBox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_PARAMS_OPEN_KEY, String(showParametersBox));
  }, [showParametersBox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_ADVANCED_OPEN_KEY, String(showAdvancedBox));
  }, [showAdvancedBox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_TOOLS_OPEN_KEY, String(showToolsBox));
  }, [showToolsBox]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(UI_FIM_OPEN_KEY, String(showFimBox));
  }, [showFimBox]);
  const getMaxTokensDefaults = getModelLimits;

  const { defaultMaxTokens, maxTokensLimit } = getMaxTokensDefaults(model);

  const resetParameters = () => {
    setFrequencyPenalty(0);
    setPresencePenalty(0);
    setTemperature(1);
    setTopP(1);
    setMaxTokens(defaultMaxTokens);
  };

  const previousDefaultMaxTokensRef = React.useRef(defaultMaxTokens);

  useEffect(() => {
    const previousDefault = previousDefaultMaxTokensRef.current;
    const shouldReplaceDefault = maxTokens === previousDefault;
    const shouldClamp = maxTokens > maxTokensLimit;
    if (shouldReplaceDefault || shouldClamp) {
      setMaxTokens(Math.min(maxTokensLimit, defaultMaxTokens));
    }
    previousDefaultMaxTokensRef.current = defaultMaxTokens;
  }, [defaultMaxTokens, maxTokens, maxTokensLimit]);

  const parseToolsJson = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { tools: undefined };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { error: t("common.toolsJsonInvalid") };
      }
      return { tools: parsed };
    } catch (error) {
      return { error: t("common.toolsJsonInvalid") };
    }
  };

  const parseToolHandlersJson = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { handlers: undefined };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: t("common.toolHandlersJsonInvalid") };
      }
      return { handlers: parsed as Record<string, unknown> };
    } catch (error) {
      return { error: t("common.toolHandlersJsonInvalid") };
    }
  };

  // user's first message
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const handleSend = async () => {
    setError("");
    if (!apiKey.trim()) {
      setError(
        `${t("chat.errors.apiKeyMissing")} ${t("chat.errors.apiKeyHint")} ${t("chat.errors.apiKeyLinkLabel")}`
      );
      return;
    }
    if (!userInput.trim() && !attachments.length) return;
    try {
      parseDeepseekOptions(requestOptionsJson);
      if (apiFormat !== "chat" && (fimPrefix.trim() || fimSuffix.trim())) throw new Error("FIM requires Chat Completions.");
      if (attachments.length && model !== "deepseek-flash") throw new Error("Image inputs require deepseek-flash.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid request options.");
      return;
    }

    const toolsParsed = parseToolsJson(toolsJson);
    if (toolsParsed.error) {
      setToolsJsonError(toolsParsed.error);
      setError(toolsParsed.error);
      return;
    }
    setToolsJsonError(null);

    const handlersParsed = parseToolHandlersJson(toolHandlersJson);
    if (handlersParsed.error) {
      setToolHandlersJsonError(handlersParsed.error);
      setError(handlersParsed.error);
      return;
    }
    setToolHandlersJsonError(null);

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
      localStorage.setItem(`thread-${newThreadId}-draft-attachments`, JSON.stringify(attachments));
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
      localStorage.setItem(`thread-${newThreadId}-toolsJson`, toolsJson);
      localStorage.setItem(
        `thread-${newThreadId}-toolsStrict`,
        String(toolsStrict)
      );
      localStorage.setItem(
        `thread-${newThreadId}-toolHandlersJson`,
        toolHandlersJson
      );
      localStorage.setItem(
        `thread-${newThreadId}-jsonOutput`,
        String(jsonOutput)
      );
      localStorage.setItem(`thread-${newThreadId}-fimPrefix`, fimPrefix);
      localStorage.setItem(`thread-${newThreadId}-fimSuffix`, fimSuffix);
      localStorage.setItem(
        `thread-${newThreadId}-fimMaxTokens`,
        String(fimMaxTokens)
      );
      localStorage.removeItem(DRAFT_TOOLS_JSON_KEY);
      localStorage.removeItem(DRAFT_TOOL_HANDLERS_KEY);
      localStorage.removeItem(DRAFT_INPUT_KEY);
      localStorage.removeItem(DRAFT_FIM_PREFIX_KEY);
      localStorage.removeItem(DRAFT_FIM_SUFFIX_KEY);
      localStorage.removeItem(DRAFT_FIM_MAX_TOKENS_KEY);

      await updateDoc(doc(db, "threads", newThreadId), {
        model, apiFormat, streamEnabled, searchEnabled, requestOptionsJson, thinkingEnabled, reasoningEffort, frequencyPenalty, presencePenalty,
        temperature, topP, maxTokens, toolsJson, toolsStrict, toolHandlersJson,
        jsonOutput, fimPrefix, fimSuffix, fimMaxTokens,
      });
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
        minHeight="100dvh"
        justifyContent={{ xs: "flex-start", md: "center" }}
        alignItems="center"
        p={{ xs: 1.5, sm: 2 }}
        pt={{ xs: 9, md: 4 }}
        pb={{ xs: 2, md: 4 }}
        sx={{ "& .MuiInputBase-root, & .MuiInputLabel-root, & .MuiFormLabel-root": { color: "var(--color-text)" }, "& .MuiSelect-icon": { color: "var(--color-text)" }, "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-border)" } }}
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
          <Box width="100%" maxWidth="680px">
            <Box sx={{ mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>{t("chat.new.chooseModel")}</Typography>
              <Box sx={{ width: { xs: "100%", sm: 260 } }}>
                <FormControl fullWidth size="small">
                  <InputLabel id="new-model-label">{t("common.model")}</InputLabel>
                  <Select labelId="new-model-label" label={t("common.model")} value={model} onChange={(event) => setModel(event.target.value)}>
                    {CURRENT_MODELS.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
                    <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                    <MenuItem value="deepseek-reasoner">deepseek-reasoner</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" }, gap: 1, mb: 2 }}>
              {([
                { key: "system", label: t("common.systemPrompt"), open: showSystemBox },
                { key: "parameters", label: t("common.parameters"), open: showParametersBox },
                { key: "features", label: t("common.advancedSettings"), open: showAdvancedBox },
                { key: "api", label: "API Settings", open: showApiBox },
              ] as const).map(({ key, label, open }) => (
                <Button key={key} variant="outlined" onClick={() => toggleSection(key)}
                  aria-expanded={open} aria-controls={`new-${key}-panel`}
                  endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ minWidth: 0, minHeight: 42, px: 1.25, justifyContent: "space-between", textTransform: "none", fontSize: 13, lineHeight: 1.3, color: "var(--color-text)", borderColor: open ? "var(--color-primary)" : "var(--color-border)", backgroundColor: open ? "var(--color-panel)" : "transparent", "& .MuiButton-endIcon": { ml: 0.5, flexShrink: 0 } }}>
                  {label}
                </Button>
              ))}
            </Box>
            <Collapse id="new-api-panel" in={showApiBox} timeout={200} unmountOnExit>
              <Box sx={{ backgroundColor: "var(--color-panel)", p: 2, borderRadius: 1, mb: 3 }}>
                <ApiSettingsFields
                  apiFormat={apiFormat} onApiFormatChange={setApiFormat}
                  streamEnabled={streamEnabled} onStreamChange={setStreamEnabled}
                  thinkingEnabled={thinkingEnabled} onThinkingChange={setThinkingEnabled}
                  reasoningEffort={reasoningEffort} onReasoningEffortChange={setReasoningEffort}
                  requestOptionsJson={requestOptionsJson} onRequestOptionsChange={setRequestOptionsJson}
                  showThinking={isCurrentModel(model)}
                />
              </Box>
            </Collapse>


            <Collapse id="new-system-panel" in={showSystemBox} timeout={200} unmountOnExit>
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
            </Collapse>


            <Collapse id="new-parameters-panel" in={showParametersBox} timeout={200} unmountOnExit>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
                  columnGap: 3,
                  "& > .MuiBox-root:last-child": { gridColumn: "1 / -1" },
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
                    disabled={model === "deepseek-reasoner" || (isCurrentModel(model) && thinkingEnabled)}
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
                    disabled={model === "deepseek-reasoner" || (isCurrentModel(model) && thinkingEnabled)}
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
                    disabled={model === "deepseek-reasoner" || (isCurrentModel(model) && thinkingEnabled)}
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
                      {(model === "deepseek-flash" && thinkingEnabled ? Math.max(0.95, topP) : topP).toFixed(2)}
                    </Typography>
                  </Box>
                  <Slider
                    value={model === "deepseek-flash" && thinkingEnabled ? Math.max(0.95, topP) : topP}
                    onChange={(_, value) =>
                      setTopP(Array.isArray(value) ? value[0] : value)
                    }
                    min={model === "deepseek-flash" && thinkingEnabled ? 0.95 : 0.01}
                    max={1}
                    step={0.01}
                    sx={{ color: "var(--color-primary)" }}
                    aria-label="top p"
                    disabled={model === "deepseek-reasoner" || (model === "deepseek-flash" && !thinkingEnabled) || (model === "deepseek-v4-pro" && thinkingEnabled)}
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
                    max={maxTokensLimit}
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
            </Collapse>


            <Collapse id="new-features-panel" in={showAdvancedBox} timeout={200} unmountOnExit>
              <Box
                sx={{
                  backgroundColor: "var(--color-panel)",
                  p: 2,
                  borderRadius: 1,
                  mb: 3,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ color: "var(--color-text)", fontWeight: 600 }}
                  >
                    {t("common.jsonOutput")}
                  </Typography>
                  <Switch
                    checked={jsonOutput}
                    onChange={(e) => setJsonOutput(e.target.checked)}
                    color="primary"
                  />
                </Box>
                <Typography
                  variant="caption"
                  sx={{ color: "var(--color-subtext)", display: "block", mb: 2 }}
                >
                  {t("common.jsonOutputDescription")}
                </Typography>
                <Divider sx={{ my: 2, borderColor: "var(--color-border)" }} />
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    color: "var(--color-text)",
                    mb: 1,
                  }}
                >
                  <Typography
                    variant="subtitle2"
                    sx={{ color: "var(--color-text)", fontWeight: 600 }}
                  >
                    {t("common.tools")}
                  </Typography>
                  <IconButton
                    onClick={() => setShowToolsBox((prev) => !prev)}
                    size="small"
                    sx={{ color: "var(--color-text)", ml: "auto" }}
                    aria-label={
                      showToolsBox
                        ? t("chat.controls.collapse")
                        : t("chat.controls.expand")
                    }
                  >
                    {showToolsBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </Box>
                <Collapse in={showToolsBox} timeout={200} unmountOnExit>
                  <BuiltinTools searchEnabled={searchEnabled} onSearchChange={setSearchEnabled} disabled={loading || Boolean(fimPrefix.trim() || fimSuffix.trim())} />
                  <Box
                    sx={{
                      pl: 2,
                      borderLeft: "1px solid var(--color-border)",
                    }}
                  >
                    <TextField
                      fullWidth
                      multiline
                      minRows={5}
                      value={toolsJson}
                  onChange={(e) => {
                    setToolsJson(e.target.value);
                    localStorage.setItem(DRAFT_TOOLS_JSON_KEY, e.target.value);
                    if (toolsJsonError) {
                      setToolsJsonError(null);
                      setError("");
                    }
                  }}
                      label={t("common.toolsJson")}
                      placeholder={t("common.toolsJsonPlaceholder")}
                      error={Boolean(toolsJsonError)}
                      helperText={
                        toolsJsonError ?? t("common.toolsJsonDescription")
                      }
                      variant="outlined"
                      sx={{
                        mb: 2,
                        "& .MuiOutlinedInput-root": {
                          "& fieldset": { borderColor: "var(--color-border)" },
                          "&:hover fieldset": { borderColor: "var(--color-hover)" },
                          "&.Mui-focused fieldset": {
                            borderColor: "var(--color-hover)",
                          },
                        },
                        "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                        "& .MuiOutlinedInput-input": {
                          color: "var(--color-text)",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                        },
                        "& .MuiFormHelperText-root": {
                          color: "var(--color-subtext)",
                        },
                      }}
                    />
                    <TextField
                      fullWidth
                      multiline
                      minRows={4}
                      value={toolHandlersJson}
                  onChange={(e) => {
                    setToolHandlersJson(e.target.value);
                    localStorage.setItem(DRAFT_TOOL_HANDLERS_KEY, e.target.value);
                    if (toolHandlersJsonError) {
                      setToolHandlersJsonError(null);
                      setError("");
                    }
                  }}
                      label={t("common.toolHandlersJson")}
                      placeholder={t("common.toolHandlersJsonPlaceholder")}
                      error={Boolean(toolHandlersJsonError)}
                      helperText={
                        toolHandlersJsonError ??
                        t("common.toolHandlersJsonDescription")
                      }
                      variant="outlined"
                      sx={{
                        mb: 2,
                        "& .MuiOutlinedInput-root": {
                          "& fieldset": { borderColor: "var(--color-border)" },
                          "&:hover fieldset": { borderColor: "var(--color-hover)" },
                          "&.Mui-focused fieldset": {
                            borderColor: "var(--color-hover)",
                          },
                        },
                        "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                        "& .MuiOutlinedInput-input": {
                          color: "var(--color-text)",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                        },
                        "& .MuiFormHelperText-root": {
                          color: "var(--color-subtext)",
                        },
                      }}
                    />
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: 1,
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        sx={{ color: "var(--color-text)", fontWeight: 600 }}
                      >
                        {t("common.strictMode")}
                      </Typography>
                      <Switch
                        checked={toolsStrict}
                        onChange={(e) => setToolsStrict(e.target.checked)}
                        color="primary"
                      />
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: "var(--color-subtext)", display: "block" }}
                    >
                      {t("common.strictModeDescription")}
                    </Typography>
                  </Box>
                </Collapse>

                <Box sx={{ mt: 2, pt: 2, borderTop: "1px solid var(--color-border)" }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      color: "var(--color-text)",
                      mb: 1,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{ color: "var(--color-text)", fontWeight: 600 }}
                    >
                      {t("common.fimCompletionTitle")}
                    </Typography>
                    <IconButton
                      onClick={() => setShowFimBox((prev) => !prev)}
                      size="small"
                      sx={{ color: "var(--color-text)", ml: "auto" }}
                      aria-label={
                        showFimBox
                          ? t("chat.controls.collapse")
                          : t("chat.controls.expand")
                      }
                    >
                      {showFimBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  <Collapse in={showFimBox} timeout={200} unmountOnExit>
                    <Box sx={{ pl: 2, borderLeft: "1px solid var(--color-border)" }}>
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        label={t("common.fimPrefixLabel")}
                        placeholder={t("common.fimPrefixPlaceholder")}
                        value={fimPrefix}
                        onChange={(e) => {
                          setFimPrefix(e.target.value);
                          localStorage.setItem(DRAFT_FIM_PREFIX_KEY, e.target.value);
                        }}
                        variant="outlined"
                        sx={{
                          mb: 2,
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "var(--color-border)" },
                            "&:hover fieldset": { borderColor: "var(--color-hover)" },
                            "&.Mui-focused fieldset": {
                              borderColor: "var(--color-hover)",
                            },
                          },
                          "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                          "& .MuiOutlinedInput-input": {
                            color: "var(--color-text)",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                          },
                        }}
                      />
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        label={t("common.fimSuffixLabel")}
                        placeholder={t("common.fimSuffixPlaceholder")}
                        value={fimSuffix}
                        onChange={(e) => {
                          setFimSuffix(e.target.value);
                          localStorage.setItem(DRAFT_FIM_SUFFIX_KEY, e.target.value);
                        }}
                        variant="outlined"
                        sx={{
                          mb: 2,
                          "& .MuiOutlinedInput-root": {
                            "& fieldset": { borderColor: "var(--color-border)" },
                            "&:hover fieldset": { borderColor: "var(--color-hover)" },
                            "&.Mui-focused fieldset": {
                              borderColor: "var(--color-hover)",
                            },
                          },
                          "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                          "& .MuiOutlinedInput-input": {
                            color: "var(--color-text)",
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
                          },
                        }}
                      />
                      <Box sx={{ mb: 1 }}>
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
                            {t("common.fimMaxTokensLabel")}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ color: "var(--color-subtext)" }}
                          >
                            {fimMaxTokens}
                          </Typography>
                        </Box>
                        <Slider
                          value={fimMaxTokens}
                          onChange={(_, value) => {
                            const nextValue = Array.isArray(value) ? value[0] : value;
                            setFimMaxTokens(nextValue);
                            localStorage.setItem(
                              DRAFT_FIM_MAX_TOKENS_KEY,
                              String(nextValue)
                            );
                          }}
                          min={1}
                          max={4096}
                          step={64}
                          sx={{ color: "var(--color-primary)" }}
                          aria-label="fim max tokens"
                        />
                      </Box>
                    </Box>
                  </Collapse>
                </Box>
              </Box>
            </Collapse>

            {/* ユーザーの最初のメッセージ */}
            <Typography variant="h6" sx={{ mb: 1 }}>
              {t("chat.labels.firstMessage")}
            </Typography>

            <Box display="flex" alignItems="flex-end" gap={1}>
              <IconButton aria-label="Images and Files" disabled={loading} onClick={() => setMediaOpen(true)} sx={{ color: "var(--color-text)" }}><AttachFileIcon /></IconButton>
              <TextField
                multiline
                minRows={1}
                maxRows={6}
                fullWidth
                label={t("chat.placeholders.firstMessage")}
                variant="outlined"
                value={userInput}
                onChange={(e) => {
                  setUserInput(e.target.value);
                  localStorage.setItem(DRAFT_INPUT_KEY, e.target.value);
                }}
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
                  width: { xs: 44, sm: 48 },
                  height: { xs: 44, sm: 48 },
                  flexShrink: 0,
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
            {attachments.map((attachment) => <Button key={attachment.id} onClick={() => setMediaOpen(true)} size="small" sx={{ overflowWrap: "anywhere", maxWidth: "100%" }}>{attachment.name}</Button>)}
          </Box>
        )}
      </Box>
      <Dialog open={mediaOpen} onClose={() => setMediaOpen(false)} fullWidth maxWidth="md" PaperProps={{ sx: mediaDialogPaperSx }}><DialogTitle>Images and Files</DialogTitle><DialogContent><MediaInputs apiKey={apiKey} attachments={attachments} onChange={setAttachments} disabled={loading} /></DialogContent><DialogActions><Button onClick={() => setMediaOpen(false)}>{t("common.close")}</Button></DialogActions></Dialog>
    </>
  );
}
