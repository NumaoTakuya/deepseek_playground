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
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { useChatWindow } from "../../hooks/useChatWindow";
import { useApiKey } from "../../contexts/ApiKeyContext";
import SystemPromptSection from "./SystemPromptSection";
import MessageList from "./MessageList";
import InputSection from "./InputSection";

interface Props {
  threadId: string;
}

export default function ChatWindow({ threadId }: Props) {
  const { apiKey } = useApiKey();
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
  } = useChatWindow(threadId, apiKey);

  const [isFirstTime, setIsFirstTime] = useState(true);
  const [error] = useState(""); // 警告メッセージ用の状態
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showParametersBox, setShowParametersBox] = useState(false);

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
  ]);

  // 初回自動送信
  useEffect(() => {
    if (isFirstTime && model && input && systemPrompt) {
      setIsFirstTime(false);
      handleSend();
      return;
    }
  }, [model, input, systemPrompt, isFirstTime, handleSend]);

  return (
    <Box display="flex" height="100%" position="relative">
      <Box flex="1" display="flex" flexDirection="column" minWidth={0}>
        {error && (
          <Alert severity="warning" sx={{ mx: 2, my: 1 }}>
            {error}
          </Alert>
        )}

        <MessageList
          messages={messages}
          streamingAssistantId={assistantMsgId}
          assistantCoT={assistantCoT}
          assistantDraft={assistantDraft}
          waitingForFirstChunk={waitingForFirstChunk}
        />

        <InputSection
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          assistantThinking={assistantThinking}
        />
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
            aria-label={isSidebarOpen ? "Collapse controls" : "Expand controls"}
          >
            {isSidebarOpen ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
          {isSidebarOpen && (
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Chat Settings
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
                <InputLabel id="chat-settings-model-label">Model</InputLabel>
                <Select
                  labelId="chat-settings-model-label"
                  label="Model"
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
                borderRadius: 1,
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
                  Parameters
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
                        Frequency Penalty
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
                      Number between -2.0 and 2.0. Positive values penalize new
                      tokens based on their existing frequency in the text so
                      far, decreasing repeated lines.
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
                        Presence Penalty
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
                      Number between -2.0 and 2.0. Positive values encourage
                      new topics by penalizing tokens that appeared earlier in
                      the conversation.
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
                        Temperature
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
                      Choose a sampling temperature between 0 and 2. Higher
                      values increase randomness; lower values make results more
                      deterministic.
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
                        Top P
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
                      Nucleus sampling keeps tokens within the top cumulative
                      probability mass. For example, 0.1 means only tokens in
                      the top 10% mass are considered.
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
                        Max Tokens
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
                      Limits the number of tokens that can be generated. Refer
                      to the model documentation for recommended defaults and
                      maximum values.
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
                      Tools and other elements will be implemented in future
                      updates.
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
                      Reset
                    </Button>
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
