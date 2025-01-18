// src/components/layout/SidebarTab.tsx
import React from "react";
import { Button } from "@mui/material";

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
        color: "#fff",
        textTransform: "none",
        "&:hover": {
          backgroundColor: "var(--color-hover)",
        },
      }}
    >
      {title}
    </Button>
  );
}
