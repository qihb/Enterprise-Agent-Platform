import { readConfig } from "../db/config";
import { DocumentWorkspace } from "../views/documents/workspace";

export const dynamic = "force-dynamic";

export default function Home() {
  let initialUnavailable = false;
  try { readConfig(); } catch { initialUnavailable = true; }
  return <DocumentWorkspace initialUnavailable={initialUnavailable} />;
}
