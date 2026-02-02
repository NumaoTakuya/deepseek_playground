// src/components/chat/ChatWindow.tsx

import React, { useState, useEffect } from "react";
import {
  Box,
  Alert,
  IconButton,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Button,
  TextField,
  Switch,
  Divider,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import CloseIcon from "@mui/icons-material/Close";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useChatWindow } from "../../hooks/useChatWindow";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { useAuth } from "../../contexts/AuthContext";
import { useRouter } from "next/router";
import SystemPromptSection from "./SystemPromptSection";
import MessageList from "./MessageList";
import InputSection from "./InputSection";
import { useTranslation } from "../../contexts/LanguageContext";

interface Props {
  threadId: string;
}

export default function ChatWindow({ threadId }: Props) {
  const router = useRouter();
  const { apiKey } = useApiKey();
  const { user } = useAuth();
  const { t } = useTranslation();
  const {
    messages,
    input,
    setInput,
    setModel,
    frequencyPenalty,
    setFrequencyPenalty,
    presencePenalty,
    setPresencePenalty,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens,
    toolsJson,
    setToolsJson,
    toolsStrict,
    setToolsStrict,
    toolsJsonError,
    setToolsJsonError,
    toolHandlersJson,
    setToolHandlersJson,
    toolHandlersJsonError,
    setToolHandlersJsonError,
    jsonOutput,
    setJsonOutput,
    systemPrompt,
    setSystemPrompt,
    model,
    handleModelChange,
    handleSend,
    waitingForFirstChunk,
    assistantThinking,
    assistantMsgId,
    assistantCoT,
    assistantDraft,
    assistantFinishReason,
    errorMessage,
    handleEditMessage,
    handleRegenerateMessage,
    handleBranchMessage,
  } = useChatWindow(threadId, apiKey, user?.uid);

  const handleBranchMessageAndNavigate = async (messageId: string) => {
    const newThreadId = await handleBranchMessage(messageId);
    if (newThreadId) {
      router.push(`/chat/${newThreadId}`);
    }
  };

  const [isFirstTime, setIsFirstTime] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showParametersBox, setShowParametersBox] = useState(false);
  const [showAdvancedBox, setShowAdvancedBox] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollToBottomRef = React.useRef<(smooth?: boolean) => void>(() => {});

  const sidebarWidth = isSidebarOpen ? 360 : 48;

  const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);

  const resetParameters = () => {
    setFrequencyPenalty(0);
    setPresencePenalty(0);
    setTemperature(1);
    setTopP(1);
    setMaxTokens(1024);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // モデル変更ハンドラのラッパー
  const handleModelChangeWrapper = (newModel: string) => {
    handleModelChange(newModel); // 常にモデルを更新
    // if (newModel === "deepseek-reasoner") {
    //   setError(
    //     "Currently, due to attacks on Deepseek servers, the deepseek-reasoner API might be unstable. If it doesn't work, please switch back to deepseek-chat."
    //   );
    // } else {
    //   setError(""); // 他のモデル選択時は警告をクリア
    // }
  };

  // ローカルストレージから初期値を読み込む
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = window.localStorage.getItem(
        "dec12UpdateDismissed"
      );
      setShowUpdateBanner(dismissed !== "true");
    }

    const storedModel = localStorage.getItem(`thread-${threadId}-model`);
    const storedInput = localStorage.getItem(`thread-${threadId}-inputValue`);
    const storedSystemInput = localStorage.getItem(
      `thread-${threadId}-systemInput`
    );
    const storedFrequencyPenalty = localStorage.getItem(
      `thread-${threadId}-frequencyPenalty`
    );
    const storedPresencePenalty = localStorage.getItem(
      `thread-${threadId}-presencePenalty`
    );
    const storedTemperature = localStorage.getItem(
      `thread-${threadId}-temperature`
    );
    const storedTopP = localStorage.getItem(`thread-${threadId}-topP`);
    const storedMaxTokens = localStorage.getItem(
      `thread-${threadId}-maxTokens`
    );
    const storedToolsJson = localStorage.getItem(
      `thread-${threadId}-toolsJson`
    );
    const storedToolsStrict = localStorage.getItem(
      `thread-${threadId}-toolsStrict`
    );
    const storedToolHandlersJson = localStorage.getItem(
      `thread-${threadId}-toolHandlersJson`
    );
    const storedJsonOutput = localStorage.getItem(
      `thread-${threadId}-jsonOutput`
    );

    if (storedModel && storedInput && storedSystemInput) {
      setModel(storedModel);
      setInput(storedInput);
      setSystemPrompt(storedSystemInput);
      localStorage.removeItem(`thread-${threadId}-model`);
      localStorage.removeItem(`thread-${threadId}-inputValue`);
      localStorage.removeItem(`thread-${threadId}-systemInput`);
    } else if (
      isFirstTime &&
      !storedModel &&
      !storedInput &&
      !storedSystemInput
    ) {
      setIsFirstTime(false);
    }

    if (storedFrequencyPenalty) {
      const parsed = Number.parseFloat(storedFrequencyPenalty);
      if (!Number.isNaN(parsed)) {
        setFrequencyPenalty(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-frequencyPenalty`);
    }
    if (storedPresencePenalty) {
      const parsed = Number.parseFloat(storedPresencePenalty);
      if (!Number.isNaN(parsed)) {
        setPresencePenalty(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-presencePenalty`);
    }
    if (storedTemperature) {
      const parsed = Number.parseFloat(storedTemperature);
      if (!Number.isNaN(parsed)) {
        setTemperature(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-temperature`);
    }
    if (storedTopP) {
      const parsed = Number.parseFloat(storedTopP);
      if (!Number.isNaN(parsed)) {
        setTopP(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-topP`);
    }
    if (storedMaxTokens) {
      const parsed = Number.parseInt(storedMaxTokens, 10);
      if (!Number.isNaN(parsed)) {
        setMaxTokens(parsed);
      }
      localStorage.removeItem(`thread-${threadId}-maxTokens`);
    }
    if (storedToolsJson) {
      setToolsJson(storedToolsJson);
      localStorage.removeItem(`thread-${threadId}-toolsJson`);
    }
    if (storedToolsStrict) {
      setToolsStrict(storedToolsStrict === "true");
      localStorage.removeItem(`thread-${threadId}-toolsStrict`);
    }
    if (storedToolHandlersJson) {
      setToolHandlersJson(storedToolHandlersJson);
      localStorage.removeItem(`thread-${threadId}-toolHandlersJson`);
    }
    if (storedJsonOutput) {
      setJsonOutput(storedJsonOutput === "true");
      localStorage.removeItem(`thread-${threadId}-jsonOutput`);
    }
  }, [
    threadId,
    setInput,
    setModel,
    setSystemPrompt,
    isFirstTime,
    setFrequencyPenalty,
    setPresencePenalty,
    setTemperature,
    setTopP,
    setMaxTokens,
    setToolsJson,
    setToolsStrict,
    setToolHandlersJson,
    setJsonOutput,
  ]);

  // 初回自動送信
  useEffect(() => {
    if (isFirstTime && model && input && systemPrompt) {
      setIsFirstTime(false);
      handleSend();
      return;
    }
  }, [model, input, systemPrompt, isFirstTime, handleSend]);

  const emailAddress = "numaothe@gmail.com";
  const githubUrl = "https://github.com/NumaoTakuya/deepseek_playground";
  const EMAIL_PLACEHOLDER = "__EMAIL_LINK__";
  const GITHUB_PLACEHOLDER = "__GITHUB_LINK__";
  const bannerText = t("chat.banner.update", {
    email: EMAIL_PLACEHOLDER,
    github: GITHUB_PLACEHOLDER,
  });
  const [bannerBeforeEmail, bannerAfterEmailRaw] = bannerText.split(EMAIL_PLACEHOLDER);
  const [bannerBetweenLinks, bannerAfterGithub = ""] = (bannerAfterEmailRaw || "").split(
    GITHUB_PLACEHOLDER
  );

  return (
    <Box display="flex" height="100%" position="relative">
      <Box flex="1" display="flex" flexDirection="column" minWidth={0}>
        {errorMessage && (
          <Alert severity="error" sx={{ mx: 2, my: 1 }}>
            {errorMessage}
          </Alert>
        )}

        <Box
          flex="1"
          minHeight={0}
          position="relative"
          display="flex"
          flexDirection="column"
        >
          <MessageList
            messages={messages}
            streamingAssistantId={assistantMsgId}
            assistantCoT={assistantCoT}
            assistantDraft={assistantDraft}
            assistantFinishReason={assistantFinishReason}
            waitingForFirstChunk={waitingForFirstChunk}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
            onBranchMessage={handleBranchMessageAndNavigate}
            onScrollStateChange={setIsAtBottom}
            onRegisterScrollToBottom={(fn) => {
              scrollToBottomRef.current = fn;
            }}
          />

          {!isAtBottom && (
            <Box
              sx={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 16,
                zIndex: 2,
              }}
            >
              <IconButton
                className="scroll-to-bottom-inline"
                color="inherit"
                aria-label={t("chat.scrollToBottom")}
                onClick={() => scrollToBottomRef.current(true)}
                sx={{
                  color: "var(--color-subtext)",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: "var(--color-panel)",
                  },
                }}
              >
                <ArrowDownwardIcon fontSize="inherit" sx={{ color: "inherit" }} />
              </IconButton>
            </Box>
          )}
        </Box>

        <InputSection
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          assistantThinking={assistantThinking}
        />

        {showUpdateBanner && (
          <Box
            sx={{
              borderTop: "1px solid var(--color-border)",
              backgroundColor: "var(--color-panel)",
              color: "var(--color-text)",
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <Typography variant="body2" sx={{ flex: 1 }}>
              {bannerBeforeEmail}
              <Box
                component="a"
                href={`mailto:${emailAddress}`}
                sx={{
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {emailAddress}
              </Box>
              {bannerBetweenLinks}
              <Box
                component="a"
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: "var(--color-primary)",
                  fontWeight: 600,
                  textDecoration: "underline",
                }}
              >
                {t("common.github")}
              </Box>
              {bannerAfterGithub}
            </Typography>
            <IconButton
              size="small"
              aria-label={t("chat.banner.dismiss")}
              onClick={() => {
                setShowUpdateBanner(false);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(
                    "dec12UpdateDismissed",
                    "true"
                  );
                }
              }}
              sx={{ color: "var(--color-text)" }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: sidebarWidth,
          transition: "width 0.2s ease",
          borderLeft: "1px solid var(--color-border)",
          backgroundColor: "var(--color-panel)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            p: 1,
            gap: 1,
          }}
        >
          <IconButton
            onClick={toggleSidebar}
            size="small"
            sx={{ color: "var(--color-text)" }}
            aria-label={isSidebarOpen ? t("chat.controls.collapse") : t("chat.controls.expand")}
          >
            {isSidebarOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
          {isSidebarOpen && (
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {t("chat.controls.chatSettings")}
            </Typography>
          )}
        </Box>
        {isSidebarOpen && (
          <Box sx={{ px: 2, pt: 1, pb: 2, overflowY: "auto" }}>
            <Box sx={{ mb: 2 }}>
              <FormControl
                fullWidth
                size="small"
                sx={{
                  backgroundColor: "transparent",
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "var(--color-border)" },
                    "&:hover fieldset": { borderColor: "var(--color-hover)" },
                    "&.Mui-focused fieldset": {
                      borderColor: "var(--color-hover)",
                    },
                    "& .MuiSelect-select": {
                      color: "var(--color-text)",
                    },
                  },
                  "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
                  "& .MuiInputLabel-root.Mui-focused": {
                    color: "var(--color-text)",
                  },
                }}
              >
                <InputLabel id="chat-settings-model-label">
                  {t("common.model")}
                </InputLabel>
                <Select
                  labelId="chat-settings-model-label"
                  label={t("common.model")}
                  value={model}
                  onChange={(e) =>
                    handleModelChangeWrapper(e.target.value as string)
                  }
                >
                  <MenuItem value="deepseek-chat">deepseek-chat</MenuItem>
                  <MenuItem value="deepseek-reasoner">deepseek-reasoner</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ mb: 2 }}>
              <SystemPromptSection
                systemPrompt={systemPrompt}
                setSystemPrompt={setSystemPrompt}
              />
            </Box>

            <Box
              sx={{
                border: "1px solid var(--color-border)",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--color-panel)",
                  color: "var(--color-text)",
                  p: 1,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t("common.parameters")}
                </Typography>
                <IconButton
                  onClick={() => setShowParametersBox((prev) => !prev)}
                  sx={{ color: "var(--color-text)", ml: "auto" }}
                >
                  {showParametersBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              {showParametersBox && (
                <Box sx={{ p: 2 }}>
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
                        setFrequencyPenalty(
                          Array.isArray(value) ? value[0] : value
                        )
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
                        setPresencePenalty(
                          Array.isArray(value) ? value[0] : value
                        )
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
                      <Typography
                        variant="caption"
                        sx={{ color: "var(--color-subtext)" }}
                      >
                        {t("common.toolsInfo")}
                      </Typography>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={resetParameters}
                        sx={{
                          color: "var(--color-text)",
                          borderColor: "var(--color-border)",
                          minWidth: "64px",
                        }}
                      >
                        {t("common.reset")}
                      </Button>
                    </Box>
                  </Box>
                )}
            </Box>

            <Box
              sx={{
                border: "1px solid var(--color-border)",
                mt: 2,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "var(--color-panel)",
                  color: "var(--color-text)",
                  p: 1,
                }}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {t("common.advancedSettings")}
                </Typography>
                <IconButton
                  onClick={() => setShowAdvancedBox((prev) => !prev)}
                  sx={{ color: "var(--color-text)", ml: "auto" }}
                >
                  {showAdvancedBox ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              {showAdvancedBox && (
                <Box sx={{ p: 2 }}>
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
                  <Typography
                    variant="subtitle2"
                    sx={{ color: "var(--color-text)", fontWeight: 600, mb: 1 }}
                  >
                    {t("common.tools")}
                  </Typography>
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
                      label={t("common.toolsJson")}
                      placeholder={t("common.toolsJsonPlaceholder")}
                      value={toolsJson}
                      onChange={(e) => {
                        setToolsJson(e.target.value);
                        if (toolsJsonError) {
                          setToolsJsonError(null);
                        }
                      }}
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
                      label={t("common.toolHandlersJson")}
                      placeholder={t("common.toolHandlersJsonPlaceholder")}
                      value={toolHandlersJson}
                      onChange={(e) => {
                        setToolHandlersJson(e.target.value);
                        if (toolHandlersJsonError) {
                          setToolHandlersJsonError(null);
                        }
                      }}
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
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
