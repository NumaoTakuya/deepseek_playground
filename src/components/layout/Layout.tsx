// src/components/layout/Layout.tsx
import React from "react";
import Sidebar from "./Sidebar";
import { Box } from "@mui/material";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <Box display="flex" height="100vh">
      {/* 左側サイドバー */}
      <Box width="240px">
        <Sidebar />
      </Box>

      {/* メイン領域 */}
      <Box flex="1" overflow="auto">
        {children}
      </Box>
    </Box>
  );
}
