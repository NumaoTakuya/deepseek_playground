// src/components/layout/Layout.tsx
import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { Box, IconButton, useMediaQuery } from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import { useRouter } from "next/router";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const SIDEBAR_OPEN_KEY = "ui-left-sidebar-open";
  const isMobile = useMediaQuery("(max-width:900px)");
  const router = useRouter();
  const isThreadPage = router.pathname === "/chat/[threadId]";

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (stored !== null) {
      setIsSidebarOpen(stored === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_OPEN_KEY, String(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSidebarControl = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      const nextOpen = customEvent.detail?.open;
      if (typeof nextOpen === "boolean") {
        setIsSidebarOpen(nextOpen);
        return;
      }
      setIsSidebarOpen((prev) => !prev);
    };

    window.addEventListener(
      "app:left-sidebar",
      handleSidebarControl as EventListener
    );
    return () => {
      window.removeEventListener(
        "app:left-sidebar",
        handleSidebarControl as EventListener
      );
    };
  }, []);

  return (
    <Box
      display="flex"
      height="100dvh"
      minHeight="100dvh"
      overflow="hidden"
      position="relative"
    >
      {/* 左側サイドバー */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={toggleSidebar}
        isMobile={isMobile}
      />

      {isMobile && !isSidebarOpen && !isThreadPage && (
        <IconButton
          onClick={toggleSidebar}
          aria-label="Open navigation"
          sx={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 1300,
            color: "var(--color-text)",
            backgroundColor: "var(--color-panel)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 12px 28px rgba(0, 0, 0, 0.25)",
            "&:hover": {
              backgroundColor: "var(--color-sidebar)",
            },
          }}
        >
          <MenuIcon />
        </IconButton>
      )}

      {/* メイン領域 */}
      <Box flex="1" minWidth={0} overflow="auto">
        {children}
      </Box>
    </Box>
  );
}
