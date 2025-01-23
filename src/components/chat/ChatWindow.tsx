import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
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
  } = useChatWindow(threadId, apiKey);
  const [isFirstTime, setIsFirstTime] = useState(true);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // もしlocalStorageに内容が保存されていれば(=１回目のメッセージであれば)それを取得し、チャット開始(handleSend実行)。そしてlocalStorageを即座に削除
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
    }
  }, [threadId, setInput, setModel, setSystemPrompt]);

  useEffect(() => {
    if (isFirstTime && model && input && systemPrompt) {
      setIsFirstTime(false);
      handleSend();
      return;
    }
  }, [model, input, systemPrompt, handleSend, isFirstTime]);

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <SystemPromptSection
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        showSystemBox={showSystemBox}
        setShowSystemBox={setShowSystemBox}
      />

      <MessageList
        messages={messages}
        waitingForFirstChunk={waitingForFirstChunk}
      />

      <InputSection
        input={input}
        setInput={setInput}
        handleSend={handleSend}
        handleKeyDown={handleKeyDown}
        model={model}
        handleModelChange={handleModelChange}
      />
    </Box>
  );
}
