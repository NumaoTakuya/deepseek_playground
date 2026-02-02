// src/components/layout/Layout.tsx
import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import { Box } from "@mui/material";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const SIDEBAR_OPEN_KEY = "ui-left-sidebar-open";

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

  return (
    <Box display="flex" height="100vh">
      {/* 左側サイドバー */}
      <Sidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />

      {/* メイン領域 */}
      <Box flex="1" overflow="auto">
        {children}
      </Box>
    </Box>
  );
}
