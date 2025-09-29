// src/components/layout/SidebarTab.tsx
import React from "react";
import { Box, Button } from "@mui/material";

interface Props {
  title: string;
}

export default function SidebarTab({ title }: Props) {
  return (
    <Button
      variant="text"
      fullWidth
      sx={{
        justifyContent: "flex-start",
        color: "var(--color-text)",
        textTransform: "none",
        minHeight: 40,
        paddingY: 0.5,
        paddingX: 1.5,
        overflow: "hidden",
        "& .MuiButton-startIcon": {
          marginRight: 1,
        },
        "& .MuiButton-endIcon": {
          marginLeft: 1,
        },
        "&:hover": {
          backgroundColor: "var(--color-accent-surface)",
          color: "var(--color-on-accent-surface)",
        },
      }}
    >
      <Box
        component="span"
        sx={{
          display: "block",
          flexGrow: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "left",
          fontSize: "0.95rem",
          color: "inherit",
        }}
      >
        {title}
      </Box>
    </Button>
  );
}
