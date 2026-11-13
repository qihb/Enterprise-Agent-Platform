import { documentService } from "../../../../db/client";
import { authorize, failure, json } from "../../../../modules/documents/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    authorize(request, true);
    const { id } = await context.params;
    return json(await (await documentService()).remove(id));
  } catch (error) {
    return failure(error);
  }
}
