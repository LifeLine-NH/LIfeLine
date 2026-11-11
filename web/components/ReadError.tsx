export function ReadError({ what, message }: { what: string; message: string }) {
  return (
    <p role="alert" className="self-start rounded border border-stamp/40 bg-stamp/10 px-3 py-2 text-sm">
      Couldn&apos;t read {what} from the relief contract. <span className="text-muted">{message}</span>
    </p>
  );
}
