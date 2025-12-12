// src/components/layout/Sidebar.tsx
import {
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import SettingsIcon from "@mui/icons-material/Settings";
import Link from "next/link";
import SidebarTab from "./SidebarTab";
import { useThreads } from "../../hooks/useThreads";
import { useAuth } from "../../contexts/AuthContext";
import { doSignOut } from "../../services/firebase";
import { useRouter } from "next/router";
import { useApiKey } from "../../contexts/ApiKeyContext";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import LanguageSelector from "../common/LanguageSelector";
import { useTranslation } from "../../contexts/LanguageContext";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { darkMode, setTheme } = useTheme();
  const { t } = useTranslation();

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

  const handleToggleDarkMode = (_: React.ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setTheme(checked ? "dark" : "light");
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

  const handleCloseSettings = () => {
    setSettingsOpen(false);
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
        display: "flex",
        flexDirection: "column",
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
          {t("common.appName")}
        </Typography>
      </Box>

      {/* APIキー入力 (type=password) */}
      <TextField
        label={t("common.deepseekApiKey")}
        type="password"
        value={apiKey}
        onChange={handleApiKeyChange}
        size="small"
        fullWidth
        margin="dense"
        variant="outlined"
        autoComplete="off"
        sx={{
          display: isOpen ? "block" : "none",
          backgroundColor: "var(--color-panel)",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--color-border)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "var(--color-hover)",
          },
          "& .MuiOutlinedInput-input": {
            color: "var(--color-text)",
          },
          "& .MuiInputLabel-root": {
            color: "var(--color-subtext)",
          },
          "& .MuiInputLabel-root.Mui-focused": {
            color: "var(--color-text)",
          },
        }}
      />

      {isOpen && (
        <Button
          variant="outlined"
          fullWidth
          sx={{
            mt: 1,
            color: "var(--color-text)",
            borderColor: "var(--color-border)",
            "&:hover": {
              borderColor: "var(--color-accent-surface)",
              backgroundColor: "var(--color-accent-surface)",
              color: "var(--color-on-accent-surface)",
            },
          }}
          onClick={handleNewThread}
        >
          {t("common.newThread")}
        </Button>
      )}

      {/* スレッド一覧 (時系列) */}
      <Box
        flex="1"
        overflow="auto"
        mt={2}
        sx={{ display: isOpen ? "block" : "none" }}
      >
        {threads?.map((thread) => (
          <Box key={thread.id} mb={1}>
            <Link href={`/chat/${thread.id}`} passHref>
              <SidebarTab title={thread.title} />
            </Link>
          </Box>
        ))}
      </Box>

      {/* Settings */}
      <Box
        display="flex"
        justifyContent="center"
        sx={{ mt: "auto", pt: 2, pb: 1 }}
      >
        {isOpen ? (
          <Button
            variant="outlined"
            fullWidth
            onClick={handleOpenSettings}
            startIcon={<SettingsIcon />}
            aria-label={t("sidebar.openSettings")}
            sx={{
              color: "var(--color-text)",
              borderColor: "var(--color-border)",
              justifyContent: "center",
              "&:hover": {
                borderColor: "var(--color-accent-surface)",
                backgroundColor: "var(--color-accent-surface)",
                color: "var(--color-on-accent-surface)",
              },
            }}
          >
            Settings
          </Button>
        ) : (
          <IconButton
            onClick={handleOpenSettings}
            aria-label={t("sidebar.openSettings")}
            sx={{
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              width: 40,
              height: 40,
              "&:hover": {
                borderColor: "var(--color-accent-surface)",
                backgroundColor: "var(--color-accent-surface)",
                color: "var(--color-on-accent-surface)",
              },
            }}
          >
            <SettingsIcon />
          </IconButton>
        )}
      </Box>

      <Dialog
        open={settingsOpen}
        onClose={handleCloseSettings}
        PaperProps={{
          sx: {
            backgroundColor: "var(--color-panel)",
            color: "var(--color-text)",
            minWidth: { xs: "280px", sm: "360px" },
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 600, pb: 1 }}>
          {t("common.settings")}
        </DialogTitle>
        <DialogContent>
          <FormControlLabel
            control={
              <Switch
                checked={darkMode}
                onChange={handleToggleDarkMode}
                sx={{
                  "& .MuiSwitch-thumb": { backgroundColor: "var(--color-text)" },
                  "& .MuiSwitch-track": { backgroundColor: "var(--color-border)" },
                  "&.Mui-checked .MuiSwitch-track": {
                    backgroundColor: "var(--color-primary)",
                  },
                }}
              />
            }
            label={t("common.darkMode")}
            sx={{ color: "var(--color-text)" }}
          />
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ mb: 1, display: "block", color: "var(--color-subtext)" }}>
              {t("common.language")}
            </Typography>
            <LanguageSelector fullWidth />
          </Box>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button
            variant="outlined"
            color="error"
            onClick={handleLogout}
            sx={{
              borderColor: "var(--color-border)",
              color: "var(--color-text)",
              "&:hover": {
                borderColor: "var(--color-accent-surface)",
                backgroundColor: "var(--color-accent-surface)",
                color: "var(--color-on-accent-surface)",
              },
            }}
          >
            {t("common.logout")}
          </Button>
          <Button onClick={handleCloseSettings}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
