// src/components/chat/ChatWindow.tsx

import React, { useState, useEffect } from "react";
import { Box, Alert } from "@mui/material";
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
    systemPrompt,
    setSystemPrompt,
    showSystemBox,
    setShowSystemBox,
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
  }, [threadId, setInput, setModel, setSystemPrompt, isFirstTime]);

  // 初回自動送信
  useEffect(() => {
    if (isFirstTime && model && input && systemPrompt) {
      setIsFirstTime(false);
      handleSend();
      return;
    }
  }, [model, input, systemPrompt, isFirstTime, handleSend]);

  return (
    <Box display="flex" flexDirection="column" height="100%">
      {/* 警告メッセージ表示 */}
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <SystemPromptSection
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        showSystemBox={showSystemBox}
        setShowSystemBox={setShowSystemBox}
      />

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
        model={model}
        handleModelChange={handleModelChangeWrapper} // ラッパー関数を使用
        assistantThinking={assistantThinking}
      />
    </Box>
  );
}
