import { useState } from "react";
import { extractPermit, type PermitText } from "../services/pdf";
import { proposeBookings } from "../domain/permit";
export function PermitUpload({
  onProposed,
  onSource,
}: {
  onProposed: (text: string) => void;
  onSource: (source: PermitText) => void;
}) {
  const [source, setSource] = useState<PermitText | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="permit-upload">
      <label>
        Read a permit PDF locally
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const source = await extractPermit(file),
                result = proposeBookings(source.text);
              setSource(source);
              onSource(source);
              if (result.proposals.length)
                onProposed(result.proposals.join("\n"));
              setMessage(
                `${result.proposals.length} unambiguous booking rows proposed; ${result.unresolved.length} date rows need manual transcription. Review every row against the PDF. ${result.permit ? "Detected permit " + result.permit : ""}`,
              );
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p role="status">{busy ? "Reading PDF…" : message}</p>
      {source && (
        <details>
          <summary>Extracted text and file provenance</summary>
          <p>
            {source.filename} · {source.pages} pages
          </p>
          <p className="hash">SHA-256: {source.sha256}</p>
          <pre>{source.text}</pre>
        </details>
      )}
    </div>
  );
}
