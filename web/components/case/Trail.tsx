import { Countdown } from "@/components/ui/Countdown";
import type { TrailStep } from "@/lib/caseView";

const SR: Record<TrailStep["state"], string> = {
  done: "done",
  now: "in progress",
  todo: "not reached yet",
  stop: "stopped here",
  halt: "waiting for a person",
  back: "money returned",
};

export function Trail({ steps, note }: { steps: TrailStep[]; note?: string }) {
  return (
    <div className="card card-p flex flex-col gap-7">
      <div className="sec-head" style={{ margin: 0 }}>
        <h2 className="h2">What happened</h2>
        <span className="cap">Times in UTC.</span>
      </div>
      <ol className="trail">
        {steps.map((s) => (
          <li key={s.t} className={s.state}>
            <span className="node" aria-hidden />
            <div className="trail-t">
              {s.t}
              <span className="sr-only"> ({SR[s.state]})</span>
            </div>
            {s.m && <div className="trail-m">{s.m}</div>}
            {s.countdownTo !== undefined && (
              <div className="trail-m">
                Closes in <Countdown endsAtMs={s.countdownTo} endedText="closed" />
              </div>
            )}
            {s.link && (
              <div className="trail-l">
                <a className="rec" href={s.link.href} style={{ fontSize: 12.5 }}>
                  {s.link.label}
                </a>
              </div>
            )}
          </li>
        ))}
      </ol>
      {note && <p className="notice n-plain">{note}</p>}
    </div>
  );
}
