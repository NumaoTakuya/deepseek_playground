import React from "react";
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
    assistantThinking,
    systemPrompt,
    setSystemPrompt,
    showSystemBox,
    setShowSystemBox,
    model,
    handleModelChange,
    handleSend,
  } = useChatWindow(threadId, apiKey);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <SystemPromptSection
        systemPrompt={systemPrompt}
        setSystemPrompt={setSystemPrompt}
        showSystemBox={showSystemBox}
        setShowSystemBox={setShowSystemBox}
      />

      <MessageList messages={messages} assistantThinking={assistantThinking} />

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
