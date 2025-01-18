// src/components/common/LoadingIndicator.tsx
import React from "react";
import { CircularProgress, Box } from "@mui/material";

export default function LoadingIndicator() {
  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      height="100%"
    >
      <CircularProgress />
    </Box>
  );
}
