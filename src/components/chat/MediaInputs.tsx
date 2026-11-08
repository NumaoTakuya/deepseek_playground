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
  return <Stack spacing={2} sx={mediaControlsSx}>
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Files</Typography>
      <Tooltip title="Refresh files"><span><IconButton size="small" aria-label="Refresh files" disabled={locked || !apiKey.trim()} onClick={() => void action("list")}><Refresh fontSize="small" /></IconButton></span></Tooltip>
    </Box>
    {error && <Alert severity="error">{error}</Alert>}
    {notice && <Alert severity="success">{safe(notice)}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 1.5, alignItems: "start", "@container (min-width: 480px)": { gridTemplateColumns: "minmax(0, 1fr) 180px auto" } }}>
      <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={locked}
        sx={{ height: 40, minWidth: 0, justifyContent: "flex-start" }}>
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{upload ? safe(upload.name) : "Choose image"}</Box>
        <input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { setUpload(e.target.files?.[0]); e.target.value = ""; }} />
      </Button>
      <TextField label="Expiry (seconds)" size="small" type="number" disabled={locked} value={expiry}
        onChange={e => setExpiry(e.target.value)} helperText="3600-2592000; blank = permanent"
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 3600, max: 2592000 } }} />
      <Button variant="contained" startIcon={<UploadFile />} disabled={locked || !upload || !apiKey.trim()} onClick={() => void action("upload")} sx={{ height: 40 }}>Upload</Button>
    </Box>
    <Typography variant="caption" sx={{ color: "var(--color-subtext)" }}>Images up to 64 MiB. Hosted by DeepSeek until expiry or deletion.</Typography>
    {!files.length && <Typography variant="body2" sx={{ color: "var(--color-subtext)", py: 1 }}>{page ? "No files returned." : "Files not loaded."}</Typography>}
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

  return <Stack spacing={2.5} sx={{ ...mediaControlsSx, pt: 1.5 }}>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 2, "@container (min-width: 360px)": { gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" } }}>
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
      <Button component="label" variant="outlined" startIcon={<UploadFile />} disabled={locked || (mode === "upload" && !apiKey.trim())} sx={{ height: 40, alignSelf: "flex-start" }}>
        {busy ? "Uploading..." : "Choose image"}
        <input hidden type="file" accept={IMAGE_ACCEPT} onChange={e => { void local(e.target.files?.[0]); e.target.value = ""; }} />
      </Button>
    ) : (
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 40px", gap: 1, alignItems: "center" }}>
        <TextField fullWidth size="small" label={mode === "file" ? "File ID" : "Image URL"} disabled={locked} value={value} onChange={e => setValue(e.target.value)} />
        <Tooltip title="Attach image"><span><IconButton aria-label="Attach image" disabled={locked || !value.trim()} onClick={attachReference}
          sx={{ width: 40, height: 40, border: "1px solid var(--color-border)", borderRadius: 1 }}><Add /></IconButton></span></Tooltip>
      </Box>
    )}
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
    {showFiles && <Box sx={{ borderTop: "1px solid var(--color-border)", pt: 2 }}>
      <FilesManager apiKey={apiKey} disabled={locked}
        onSelect={file => { try { attach({ id: file.id, kind: "file", value: file.id, name: file.filename }); } catch (e) { setError(e instanceof Error ? e.message : "Invalid file."); } }}
        onDeleted={id => onChange(latest.current.attachments.filter(a => a.kind !== "file" || a.value !== id))}
      />
    </Box>}
  </Stack>;
}

function AttachmentPreview({ value }: { value: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [value]);
  try { attachmentBlocks([{ id: "preview", kind: "url", value, name: "preview" }]); } catch { return null; }
  return failed ? <Box sx={{ width: 72, height: 56, display: "grid", placeItems: "center", backgroundColor: "var(--color-sidebar)", borderRadius: 1 }}><InsertDriveFile sx={{ color: "var(--color-subtext)" }} /></Box> : <Box component="img" src={value} alt="Selected image preview" referrerPolicy="no-referrer" onError={() => setFailed(true)} sx={{ width: 72, height: 56, objectFit: "contain", borderRadius: 1, backgroundColor: "var(--color-sidebar)" }} />;
}

export default MediaInputs;
