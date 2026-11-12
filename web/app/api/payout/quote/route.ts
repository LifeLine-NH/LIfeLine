import { config } from "@/lib/config";
import { checkRecipient, DESTINATIONS, QuoteInputError, requestDryQuote, toUsdcUnits } from "@/lib/intents/quote";

// Dry quotes only: no deposit address is created, so nothing here can move funds.
// refundTo has to be a valid mainnet NEAR account but is never used by a dry quote.
const REFUND_TO = process.env.ONECLICK_REFUND_TO || "intents.near";

// One shared answer per input for 20 seconds, so many viewers don't each hit 1Click.
const cache = new Map<string, { at: number; body: unknown }>();
const TTL_MS = 20_000;

export async function POST(req: Request) {
  let input: { amount?: unknown; destination?: unknown; recipient?: unknown };
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "Send JSON with amount, destination and recipient." }, { status: 400 });
  }

  try {
    const dest = DESTINATIONS.find((d) => d.key === input.destination);
    if (!dest) throw new QuoteInputError("Pick one of the listed destinations.");
    const recipient = checkRecipient(dest, String(input.recipient ?? ""));
    const amountUsdc = toUsdcUnits(String(input.amount ?? ""), config.tokenDecimals);

    const key = `${dest.key}|${recipient}|${amountUsdc}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return Response.json(hit.body);

    const quote = await requestDryQuote({ amountUsdc, destination: dest, recipient, refundTo: REFUND_TO }, { apiKey: process.env.ONECLICK_API_KEY || undefined });
    const body = { quote };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return Response.json(body);
  } catch (err) {
    if (err instanceof QuoteInputError) return Response.json({ error: err.message }, { status: 400 });
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Couldn't get a quote from NEAR Intents. ${message}` }, { status: 502 });
  }
}

export function GET() {
  return Response.json({ destinations: DESTINATIONS.map(({ key, label, chain, addressKind }) => ({ key, label, chain, addressKind })) });
}
