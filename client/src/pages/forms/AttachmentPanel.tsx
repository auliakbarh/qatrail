import { RightPanel } from "../../components/RightPanel";
import { TextAttachmentViewer } from "../../components/TextAttachmentViewer";
import { useNav, type PanelState } from "../../store/nav";

// Right panel showing a text-based attachment (markdown/json/csv/…) formatted.
export function AttachmentPanel({ panel }: { panel: PanelState }) {
  const { closePanel } = useNav();
  const a = panel.initial ?? {};
  return (
    <RightPanel title={a.label || a.kind || "Attachment"} onClose={closePanel}>
      <TextAttachmentViewer url={a.url} kind={a.kind} label={a.label} />
    </RightPanel>
  );
}
