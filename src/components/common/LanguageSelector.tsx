import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { languageOptions, type Language } from "../../i18n/translations";
import { useTranslation } from "../../contexts/LanguageContext";

interface LanguageSelectorProps {
  label?: string;
  size?: "small" | "medium";
  variant?: "outlined" | "standard"|
    "filled";
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
  disableLabel?: boolean;
}

export default function LanguageSelector({
  label,
  size = "small",
  variant = "outlined",
  fullWidth = false,
  sx,
  disableLabel = false,
}: LanguageSelectorProps) {
  const { t, language, setLanguage } = useTranslation();
  const resolvedLabel = label ?? t("common.language");

  const handleChange = (event: SelectChangeEvent<Language>) => {
    setLanguage(event.target.value as Language);
  };

  const baseStyles: SxProps<Theme> = {
    minWidth: fullWidth ? undefined : 140,
    "& .MuiOutlinedInput-root": {
      backgroundColor: "var(--color-panel)",
      "& fieldset": { borderColor: "var(--color-border)" },
      "&:hover fieldset": { borderColor: "var(--color-hover)" },
      "&.Mui-focused fieldset": { borderColor: "var(--color-hover)" },
      "& .MuiSelect-select": { color: "var(--color-text)" },
    },
    "& .MuiInputLabel-root": { color: "var(--color-subtext)" },
    "& .MuiInputLabel-root.Mui-focused": { color: "var(--color-text)" },
  };

  return (
    <FormControl
      size={size}
      variant={variant}
      fullWidth={fullWidth}
      sx={[baseStyles, sx]}
    >
      {!disableLabel && variant !== "standard" && (
        <InputLabel>{resolvedLabel}</InputLabel>
      )}
      <Select
        value={language}
        label={!disableLabel && variant !== "standard" ? resolvedLabel : undefined}
        onChange={handleChange}
        sx={{
          color: "var(--color-text)",
          "& .MuiSelect-icon": { color: "var(--color-text)" },
          backgroundColor: variant === "standard" ? "transparent" : undefined,
        }}
      >
        {languageOptions.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
