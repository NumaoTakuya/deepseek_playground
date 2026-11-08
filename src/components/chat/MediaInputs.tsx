import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import UploadFile from "@mui/icons-material/UploadFile";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Refresh from "@mui/icons-material/Refresh";
import Add from "@mui/icons-material/Add";
import InsertDriveFile from "@mui/icons-material/InsertDriveFile";
import { IMAGE_ACCEPT, inlineImage, labFiles, redactLab } from "../../services/deepseekLab";
import type { FileList, LabFile } from "../../services/deepseekLab";
import { attachmentBlocks, validateAttachmentImage } from "../../services/deepseekAttachments";
import type { Attachment, AttachmentDetail } from "../../services/deepseekAttachments";

export interface MediaInputsProps { apiKey: string; attachments: Attachment[]; onChange: (attachments: Attachment[]) => void; disabled?: boolean; allowInline?: boolean; showFiles?: boolean }

export const mediaDialogPaperSx = { backgroundColor: "var(--color-panel)", color: "var(--color-text)", border: "1px solid var(--color-border)" };
const mediaMenuProps = { PaperProps: { sx: {
  ...mediaDialogPaperSx,
  "& .MuiMenuItem-root.Mui-selected, & .MuiMenuItem-root:hover": { backgroundColor: "var(--color-sidebar)" },
} } };
const mediaControlsSx = {
  minWidth: 0, containerType: "inline-size", color: "var(--color-text)",
  "& .MuiInputBase-root, & .MuiSelect-icon, & .MuiIconButton-root:not(.Mui-disabled)": { color: "var(--color-text)" },
  "& .MuiInputLabel-root, & .MuiFormHelperText-root": { color: "var(--color-subtext)" },
  "& .MuiOutlinedInput-notchedOutline": { borderColor: "var(--color-border)" },
  "& .MuiButton-root": { textTransform: "none" },
  "& .MuiButton-outlined": { color: "var(--color-text)", borderColor: "var(--color-border)" },
  "& .MuiButton-contained": { backgroundColor: "var(--color-primary)", color: "#fff" },
  "& .Mui-disabled": { color: "var(--color-subtext)", opacity: 0.5 },
  "& .MuiButton-root.Mui-disabled": { color: "var(--color-subtext)", backgroundColor: "var(--color-sidebar)", borderColor: "var(--color-border)", opacity: 0.65 },
};
const controlRowSx = {
  display: "grid", gridTemplateColumns: "minmax(0, 1fr) 112px",
  gap: 1, alignItems: "center", width: "100%", maxWidth: 420,
};

export function FilesManager({ apiKey, disabled = false, onSelect, onDeleted, defaultExpiry = "" }: { apiKey: string; disabled?: boolean; onSelect: (file: LabFile) => void; onDeleted?: (id: string) => void; defaultExpiry?: string }) {
  const [files, setFiles] = useState<LabFile[]>([]);
  const [page, setPage] = useState<FileList>();
  const [raw, setRaw] = useState<unknown>();
  const [upload, setUpload] = useState<File>();
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [pending, setPending] = useState<LabFile>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    epoch.current++; controller.current?.abort(); setFiles([]); setPage(undefined); setRaw(undefined); setPending(undefined); setUpload(undefined); setError(""); setNotice(""); setBusy(false);
    return () => { epoch.current++; controller.current?.abort(); };
  }, [apiKey]);
  const locked = disabled || busy;
  const safe = (value: string) => redactLab(value, apiKey);
  async function action(operation: "list" | "upload" | "delete", more = false) {
    if (locked) return;
    const token = ++epoch.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice("");
    try {
      if (operation === "upload" && upload) await validateAttachmentImage(upload);
      if (token !== epoch.current) return;
      const result = await labFiles(apiKey, operation, { file: upload, id: pending?.id, after: more ? page?.last_id : undefined, expires: expiry === "" ? undefined : Number(expiry), signal: abort.signal });
      if (token !== epoch.current) return;
      setRaw(result);
      if (operation === "list") {
        const next = result as FileList;
        setFiles(previous => more ? [...previous, ...next.data.filter(file => !previous.some(old => old.id === file.id))] : next.data); setPage(next);
      } else if (operation === "upload") {
        const file = result as LabFile;
        attachmentBlocks([{ id: file.id, kind: "file", value: file.id, name: file.filename }]);
        setFiles(previous => [file, ...previous.filter(old => old.id !== file.id)]); setUpload(undefined); setNotice(`Uploaded ${file.filename}: ${file.id}`);
      } else {
        if (!(result as { deleted?: boolean }).deleted) throw new Error("Server did not confirm deletion.");
        const id = pending!.id;
        setFiles(previous => previous.filter(file => file.id !== id)); setPending(undefined); onDeleted?.(id); setNotice("File deleted.");
      }
    } catch (e) { if (token === epoch.current) setError(safe(e instanceof Error ? e.message : "File operation failed.")); }
    finally { if (token === epoch.current) setBusy(false); }
  }
  return <Stack spacing={1.5} sx={mediaControlsSx}>
    <Box sx={{ display: "flex", height: 32, alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Files</Typography>
      <Tooltip title="Refresh files"><span><IconButton size="small" aria-label="Refresh files" disabled={locked || !apiKey.trim()} onClick={() => void action("list")}><Refresh fontSize="small" /></IconButton></span></Tooltip>
    </Box>
    <Box sx={controlRowSx}>
      <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={locked}
        sx={{ height: 40, minWidth: 0, justifyContent: "flex-start" }}>
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{upload ? safe(upload.name) : "Choose image"}</Box>
        <input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { setUpload(e.target.files?.[0]); e.target.value = ""; }} />
      </Button>
      <TextField label="Expiry (sec)" size="small" type="number" disabled={locked} value={expiry}
        onChange={e => setExpiry(e.target.value)}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 3600, max: 2592000, "aria-label": "Expiry (seconds)", title: "3600-2592000; blank = permanent" } }} />
    </Box>
    <Box sx={{ ...controlRowSx, minHeight: 40 }}>
      <Tooltip title="Images up to 64 MiB. Hosted by DeepSeek until expiry or deletion.">
        <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>64 MiB max</Typography>
      </Tooltip>
      <Button variant="contained" startIcon={<UploadFile />} disabled={locked || !upload || !apiKey.trim()} onClick={() => void action("upload")} sx={{ height: 40 }}>Upload</Button>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{safe(notice)}</Alert>}
    {!files.length && <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>{page ? "No files returned." : "Files not loaded."}</Typography>}
    {!!files.length && <Box>
      {files.map(file => <Box key={file.id} sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 36px 36px", alignItems: "center", gap: 0.5, borderBottom: "1px solid var(--color-border)", py: 1 }}>
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere", pr: 1 }}>
          <Typography variant="body2">{safe(file.filename)}</Typography>
          <Typography variant="caption" sx={{ display: "block", color: "var(--color-subtext)" }}>{safe(file.id)} / {file.bytes.toLocaleString()} bytes{file.expires_at ? ` / expires ${new Date(file.expires_at * 1000).toLocaleString()}` : " / permanent"}</Typography>
        </Box>
        <Tooltip title="Attach file"><span><IconButton size="small" aria-label={`Attach ${file.filename}`} disabled={locked} onClick={() => onSelect(file)}><Add fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Delete file"><span><IconButton size="small" aria-label={`Delete ${file.filename}`} disabled={locked || !apiKey.trim()} onClick={() => setPending(file)}><DeleteOutline fontSize="small" /></IconButton></span></Tooltip>
      </Box>)}
    </Box>}
    {page?.has_more && <Button disabled={locked || !page.last_id} onClick={() => void action("list", true)}>Load More</Button>}
    {raw !== undefined && <Box component="details" sx={{ fontSize: 12, color: "var(--color-subtext)" }}>
      <Box component="summary" sx={{ cursor: "pointer" }}>Files response JSON</Box>
      <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 300, overflow: "auto" }}>{safe(JSON.stringify(raw, null, 2))}</Box>
    </Box>}
    <Dialog open={!!pending} PaperProps={{ sx: mediaDialogPaperSx }} onClose={() => { if (!locked) setPending(undefined); }}>
      <DialogTitle>Delete Image?</DialogTitle>
      <DialogContent sx={{ overflowWrap: "anywhere" }}>{safe(pending?.filename || "")} will be permanently deleted from your DeepSeek account. Existing references will stop working.</DialogContent>
      <DialogActions><Button disabled={locked} onClick={() => setPending(undefined)} sx={{ color: "var(--color-text)" }}>Cancel</Button><Button color="error" startIcon={<DeleteOutline />} disabled={locked} onClick={() => void action("delete")}>Delete</Button></DialogActions>
    </Dialog>
  </Stack>;
}

export function MediaInputs({ apiKey, attachments, onChange, disabled = false, allowInline = false, showFiles = true }: MediaInputsProps) {
  const [mode, setMode] = useState("url");
  const [value, setValue] = useState("");
  const [detail, setDetail] = useState<AttachmentDetail>("auto");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const latest = useRef({ attachments, onChange }); latest.current = { attachments, onChange };
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { generation.current++; abort.current?.abort(); setBusy(false); setError(""); return () => { generation.current++; abort.current?.abort(); }; }, [apiKey]);
  const locked = disabled || busy;
  function attach(attachment: Attachment) {
    const next = [...latest.current.attachments, attachment]; attachmentBlocks(next); latest.current.onChange(next);
  }
  async function local(file?: File) {
    if (!file || locked) return;
    const token = ++generation.current; const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError("");
    try {
      const inline = mode === "inline" && allowInline;
      await validateAttachmentImage(file, !inline, latest.current.attachments.length + 1);
      if (token !== generation.current) return;
      if (inline) {
        const data = await inlineImage(file);
        if (token === generation.current) attach({ id: crypto.randomUUID(), kind: "url", value: data, name: file.name, detail });
      } else {
        const uploaded = await labFiles(apiKey, "upload", { file, signal: controller.signal }) as LabFile;
        if (token === generation.current) attach({ id: uploaded.id, kind: "file", value: uploaded.id, name: uploaded.filename });
      }
    } catch (e) { if (token === generation.current) setError(redactLab(e instanceof Error ? e.message : "Image upload failed.", apiKey)); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function attachReference() {
    try {
      if (mode === "url" && value.trim().startsWith("data:")) throw new Error("Use a public HTTP(S) image URL. Local images must be uploaded.");
      attach({ id: crypto.randomUUID(), kind: mode === "file" ? "file" : "url", value: value.trim(), name: value.trim(), detail });
      setValue(""); setError("");
    } catch (e) {
      setError(redactLab(e instanceof Error ? e.message : "Invalid image.", apiKey));
    }
  }

  return <Box sx={mediaControlsSx}>
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 3,
      "@container (min-width: 720px)": { gridTemplateColumns: showFiles ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" } }}>
      <Stack component="section" aria-label="Images" spacing={1.5} sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", height: 32 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Images</Typography>
        </Box>
        <Box sx={controlRowSx}>
          <TextField select fullWidth size="small" label="Image source" value={mode} disabled={locked}
            slotProps={{ select: { MenuProps: mediaMenuProps } }}
            onChange={e => { setMode(e.target.value); setValue(""); }}>
            <MenuItem value="url">Public URL</MenuItem>
            <MenuItem value="file">Uploaded file ID</MenuItem>
            <MenuItem value="upload">Local upload</MenuItem>
            {allowInline && <MenuItem value="inline">Local inline image</MenuItem>}
          </TextField>
          <TextField select fullWidth size="small" label="Detail" value={detail}
            slotProps={{ select: { MenuProps: mediaMenuProps } }}
            disabled={locked || mode === "file" || mode === "upload"}
            onChange={e => setDetail(e.target.value as AttachmentDetail)}>
            {["auto", "low", "high", "original"].map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
        </Box>
        {mode === "upload" || mode === "inline" ? (
          <Box sx={{ height: 40 }}>
            <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={locked || (mode === "upload" && !apiKey.trim())} sx={{ height: 40 }}>
              {busy ? "Uploading..." : "Choose image"}
              <input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { void local(e.target.files?.[0]); e.target.value = ""; }} />
            </Button>
          </Box>
        ) : (
          <Box sx={{ ...controlRowSx, gridTemplateColumns: "minmax(0, 1fr) 40px" }}>
            <TextField fullWidth size="small" label={mode === "file" ? "File ID" : "Image URL"} disabled={locked} value={value} onChange={e => setValue(e.target.value)} />
            <Tooltip title="Attach image"><span><IconButton aria-label="Attach image" disabled={locked || !value.trim()} onClick={attachReference}
              sx={{ width: 40, height: 40, border: "1px solid var(--color-border)", borderRadius: 1 }}><Add /></IconButton></span></Tooltip>
          </Box>
        )}
        {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    {!!attachments.length && <Box>
      {attachments.map((attachment, index) => <Box key={`${attachment.id}-${index}`} sx={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) 32px", alignItems: "center", gap: 1.5, py: 1, borderBottom: "1px solid var(--color-border)" }}>
        {attachment.kind === "url" ? <AttachmentPreview value={attachment.value} /> : <Box sx={{ width: 72, height: 56, display: "grid", placeItems: "center", backgroundColor: "var(--color-sidebar)", borderRadius: 1 }}><InsertDriveFile sx={{ color: "var(--color-subtext)" }} /></Box>}
        <Box sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
          <Typography variant="body2">{redactLab(attachment.name, apiKey)}</Typography>
          {attachment.kind === "file" && <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>{attachment.value}</Typography>}
        </Box>
        <Tooltip title="Remove attachment"><span><IconButton size="small" aria-label={`Remove ${attachment.name}`} disabled={locked} onClick={() => onChange(attachments.filter((_, i) => i !== index))}><DeleteOutline fontSize="small" /></IconButton></span></Tooltip>
      </Box>)}
    </Box>}

      </Stack>
      {showFiles && <Box component="section" aria-label="Files" sx={{ position: "relative", minWidth: 0, borderTop: "1px solid var(--color-border)", pt: 2,
        "@container (min-width: 720px)": {
          borderTop: 0, pt: 0,
          "&::before": { content: '\"\"', position: "absolute", left: -12, top: 0, bottom: 0, width: "1px", backgroundColor: "var(--color-border)" },
        } }}>
        <FilesManager apiKey={apiKey} disabled={locked}
          onSelect={file => { try { attach({ id: file.id, kind: "file", value: file.id, name: file.filename }); } catch (e) { setError(e instanceof Error ? e.message : "Invalid file."); } }}
          onDeleted={id => onChange(latest.current.attachments.filter(a => a.kind !== "file" || a.value !== id))}
        />
      </Box>}
    </Box>
  </Box>;
}

function AttachmentPreview({ value }: { value: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [value]);
  try { attachmentBlocks([{ id: "preview", kind: "url", value, name: "preview" }]); } catch { return null; }
  return failed ? <Box sx={{ width: 72, height: 56, display: "grid", placeItems: "center", backgroundColor: "var(--color-sidebar)", borderRadius: 1 }}><InsertDriveFile sx={{ color: "var(--color-subtext)" }} /></Box> : <Box component="img" src={value} alt="Selected image preview" referrerPolicy="no-referrer" onError={() => setFailed(true)} sx={{ width: 72, height: 56, objectFit: "contain", borderRadius: 1, backgroundColor: "var(--color-sidebar)" }} />;
}

export default MediaInputs;
