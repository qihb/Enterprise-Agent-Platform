import { documentService } from "../../../../../db/client";
import { authorize, failure } from "../../../../../modules/documents/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    authorize(request, false);
    const { id } = await context.params;
    const file = await (await documentService()).file(id);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "sandbox",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
