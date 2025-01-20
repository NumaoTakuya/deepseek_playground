// src/components/layout/Sidebar.tsx

import React, { useState } from "react";
import { Box, Typography, TextField, Button } from "@mui/material";
import Link from "next/link";
import SidebarTab from "./SidebarTab";
import { useThreads } from "../../hooks/useThreads";
import { useAuth } from "../../contexts/AuthContext";
import { doSignOut } from "../../services/firebase";
import { useRouter } from "next/router";
import { useApiKey } from "../../contexts/ApiKeyContext";

export default function Sidebar() {
  const router = useRouter();
  const { user } = useAuth();
  const { threads } = useThreads(user?.uid);
  const { apiKey, setApiKey } = useApiKey(); // Context から取得

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    localStorage.setItem("deepseekApiKey", e.target.value);
  };

  const handleLogout = async () => {
    try {
      await doSignOut();
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleNewThread = () => {
    router.push("/chat");
  };

  // 「Deepseek Playground」タイトルをクリックで "/" に遷移する
  const handleTitleClick = () => {
    router.push("/");
  };

  return (
    <Box className="sidebar" height="100%">
      {/* タイトルをボタン風に。cursor:pointerでルーティング */}
      <Typography
        variant="h6"
        sx={{ mb: 2, fontWeight: 600, cursor: "pointer" }}
        onClick={handleTitleClick}
      >
        Deepseek Playground
      </Typography>

      {/* APIキー入力 (type=password) */}
      <TextField
        label="Deepseek API Key"
        type="password"
        value={apiKey}
        onChange={handleApiKeyChange}
        size="small"
        fullWidth
        margin="dense"
        variant="outlined"
        autoComplete="off"
        sx={{
          backgroundColor: "var(--color-panel)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--color-border)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--color-hover)",
          },
          "& .MuiOutlinedInput-input": {
            color: "#fff",
          },
          "& .MuiInputLabel-root": {
            color: "var(--color-subtext)",
          },
          "& .MuiInputLabel-root.Mui-focused": {
            color: "#fff",
          },
        }}
      />

      {/* スレッド一覧 (時系列) */}
      <Box flex="1" overflow="auto" mt={2}>
        {threads?.map((thread) => (
          <Box key={thread.id} mb={1}>
            <Link href={`/chat/${thread.id}`} passHref>
              <SidebarTab title={thread.title} />
            </Link>
          </Box>
        ))}
      </Box>

      {/* New Thread & Logout */}
      <Box mt={2}>
        <Button
          variant="outlined"
          fullWidth
          sx={{ mb: 1, color: "#fff", borderColor: "#fff" }}
          onClick={handleNewThread}
        >
          New Thread
        </Button>

        <Button
          variant="outlined"
          color="error"
          fullWidth
          onClick={handleLogout}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );
}
