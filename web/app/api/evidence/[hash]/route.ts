import { getEvidence } from "@/lib/evidence";

export async function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    return Response.json({ error: "Hash must be 64 lowercase hex characters." }, { status: 400 });
  }
  const record = await getEvidence(hash);
  if (!record) return Response.json({ error: "No record stored under this hash." }, { status: 404 });
  return Response.json(record);
}
