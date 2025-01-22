// src/components/layout/Layout.tsx
import React, { useState } from "react";
import Sidebar from "./Sidebar";
import { Box } from "@mui/material";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

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
