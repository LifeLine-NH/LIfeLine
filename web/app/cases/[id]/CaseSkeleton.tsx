import { Skel } from "@/components/ui/tags";

export function CaseSkeleton() {
  return (
    <div aria-busy="true" aria-label="Reading the case from the relief contract">
      <section style={{ borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <div className="wrap flex flex-wrap items-center justify-between gap-12" style={{ paddingTop: 28, paddingBottom: 40 }}>
          <div className="flex min-w-0 flex-col gap-4" style={{ flex: "1 1 520px" }}>
            <Skel w={180} h={14} />
            <Skel w={220} h={32} r={999} />
            <Skel w="70%" h={52} />
            <Skel w="90%" h={36} />
          </div>
          <Skel w={260} h={260} r="50%" className="mx-auto" />
        </div>
      </section>
      <section className="wrap section grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(500px, 100%), 1fr))" }}>
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="card card-p flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Skel w={40} h={40} r={12} />
              <Skel w="40%" h={18} />
            </div>
            <Skel h={6} />
            <Skel w="95%" />
            <Skel w="70%" />
          </div>
        ))}
      </section>
    </div>
  );
}
