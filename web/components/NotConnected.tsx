export function NotConnected({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-review/40 bg-review/10 px-3 py-2 text-sm text-ink" role="note">
      {children}
    </p>
  );
}
