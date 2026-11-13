import { documentService } from "../../../db/client";
import { authorize, failure, json, uploadName } from "../../../modules/documents/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    authorize(request, false);
    return json({ documents: await (await documentService()).list() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    authorize(request, true);
    const name = uploadName(request);
    const service = await documentService();
    const result = await service.upload(name, request.body);
    return json(result, result.duplicate ? 200 : 201);
  } catch (error) {
    return failure(error);
  }
}
