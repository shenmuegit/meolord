import Link from "next/link";
import { DATA } from "@/data/resume";
import { Timeline, TimelineItem, TimelineConnectItem } from "@/components/timeline";

export default function HackathonsSection() {
  return (
    <section id="hackathons" className="overflow-hidden">
      <div className="flex min-h-0 flex-col gap-y-8 w-full">
        <div className="flex flex-col gap-y-4 items-center justify-center">
          <div className="flex items-center w-full">
            <div className="flex-1 h-px bg-linear-to-r from-transparent from-5% via-border via-95% to-transparent" />
            <div className="border bg-primary z-10 rounded-xl px-4 py-1">
              <span className="text-background text-sm font-medium">building things</span>
            </div>
            <div className="flex-1 h-px bg-linear-to-l from-transparent from-5% via-border via-95% to-transparent" />
          </div>
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">在实践中探索</h2>
        </div>
        <Timeline>
          {DATA.hackathons.map((project) => (
            <TimelineItem key={project.title} className="w-full flex items-start justify-between gap-10">
              <TimelineConnectItem className="flex items-start justify-center">
                <div className="size-10 bg-card z-10 shrink-0 border rounded-full shadow ring-2 ring-border flex items-center justify-center" aria-hidden>
                  {project.icon}
                </div>
              </TimelineConnectItem>
              <div className="flex flex-1 flex-col justify-start gap-2 min-w-0">
                <time className="text-xs text-muted-foreground">{project.dates}</time>
                <h3 className="font-semibold leading-none">
                  <Link href={project.href} target="_blank" rel="noopener noreferrer" className="hover:underline underline-offset-4">
                    {project.title}
                  </Link>
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed wrap-break-word">
                  {project.description}
                </p>
              </div>
            </TimelineItem>
          ))}
        </Timeline>
      </div>
    </section>
  );
}
