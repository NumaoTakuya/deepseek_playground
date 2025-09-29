// src/components/layout/Sidebar.tsx
import { Box, Typography, TextField, Button, IconButton } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import Link from "next/link";
import SidebarTab from "./SidebarTab";
import { useThreads } from "../../hooks/useThreads";
import { useAuth } from "../../contexts/AuthContext";
import { doSignOut } from "../../services/firebase";
import { useRouter } from "next/router";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { useState, useEffect, useRef } from "react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [width, setWidth] = useState(240);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const MIN_WIDTH = 120;
  const MAX_WIDTH = 400;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = e.clientX;
      setWidth(Math.min(Math.max(newWidth, MIN_WIDTH), MAX_WIDTH));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
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
    <Box
      className="sidebar"
      height="100%"
      ref={sidebarRef}
      sx={{
        width: isOpen ? `${width}px` : "56px",
        transition: isDragging ? "none" : "width 0.3s ease",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Toggle Button */}
      <IconButton
        onClick={onToggle}
        sx={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 2,
          color: "var(--color-text)",
          "&:hover": {
            backgroundColor: "rgba(255, 255, 255, 0.1)",
          },
        }}
      >
        {isOpen ? <ChevronLeftIcon /> : <MenuIcon />}
      </IconButton>
      {isOpen && (
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "4px",
            cursor: "ew-resize",
            zIndex: 1,
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.1)",
            },
          }}
        />
      )}
      {/* Title with click handler */}
      <Box mb={2}>
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            cursor: "pointer",
            opacity: isOpen ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
          onClick={handleTitleClick}
        >
          Deepseek Playground
        </Typography>
      </Box>

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

      {isOpen && (
        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 1, color: "#fff", borderColor: "#fff" }}
          onClick={handleNewThread}
        >
          New Thread
        </Button>
      )}

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

      {/* Logout */}
      <Box mt={2}>
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
