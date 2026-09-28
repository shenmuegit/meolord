import BlurFade from "@/components/magicui/blur-fade";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DATA } from "@/data/resume";
import Markdown from "react-markdown";
import ContactSection from "@/components/section/contact-section";
import HackathonsSection from "@/components/section/hackathons-section";
import ProjectsSection from "@/components/section/projects-section";
import WolfchaSection from "@/components/section/wolfcha-section";
import Image from "next/image";

const BLUR_FADE_DELAY = 0.04;

export default function Page() {
  return (
    <main className="min-h-dvh flex flex-col gap-14 relative">
      <section id="hero">
        <div className="relative mx-auto w-full max-w-2xl">
          <div className="flex flex-col gap-6 md:block">
            <BlurFade delay={BLUR_FADE_DELAY} className="order-1 md:absolute md:right-0 md:top-0">
              <Avatar className="size-24 md:size-32 border rounded-full shadow-lg ring-4 ring-muted">
                <AvatarImage alt={DATA.name} src={DATA.avatarUrl} />
                <AvatarFallback>{DATA.initials}</AvatarFallback>
              </Avatar>
            </BlurFade>
            <BlurFade delay={BLUR_FADE_DELAY} className="order-2 md:pr-36">
              <h1 className="text-3xl font-semibold tracking-tighter sm:text-4xl lg:text-5xl">
                {DATA.name}
                <span className="ml-3 inline-block text-xl font-bold tracking-normal sm:text-2xl lg:text-3xl">
                  @shenmue
                </span>
              </h1>
            </BlurFade>
            <BlurFade delay={BLUR_FADE_DELAY * 2} className="order-3 md:mt-4">
              <div className="prose max-w-full text-pretty font-sans leading-relaxed text-muted-foreground dark:prose-invert md:[&>p:first-child]:pr-36">
                <Markdown>{DATA.summary}</Markdown>
              </div>
            </BlurFade>
          </div>
        </div>
      </section>
      <BlurFade delay={BLUR_FADE_DELAY * 3}>
        <WolfchaSection />
      </BlurFade>
      <section id="skills">
        <div className="flex min-h-0 flex-col gap-y-4">
          <BlurFade delay={BLUR_FADE_DELAY * 5}>
            <h2 className="text-xl font-bold">技能</h2>
          </BlurFade>
          <div className="flex flex-wrap gap-2">
            {DATA.skills.map((skill, id) => (
              <BlurFade key={skill.name} delay={BLUR_FADE_DELAY * 6 + id * 0.05}>
                <div className="border bg-background border-border ring-2 ring-border/20 rounded-xl h-8 w-fit px-4 flex items-center gap-2">
                  {skill.icon && (
                    <Image
                      src={skill.icon}
                      alt=""
                      width={16}
                      height={16}
                      unoptimized
                      className="size-4 rounded object-contain"
                    />
                  )}
                  <span className="text-foreground text-sm font-medium">{skill.name}</span>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>
      <section id="projects">
        <BlurFade delay={BLUR_FADE_DELAY * 7}>
          <ProjectsSection />
        </BlurFade>
      </section>
      <section id="hackathons">
        <BlurFade delay={BLUR_FADE_DELAY * 9}>
          <HackathonsSection />
        </BlurFade>
      </section>
      <section id="contact">
        <BlurFade delay={BLUR_FADE_DELAY * 12}>
          <ContactSection />
        </BlurFade>
      </section>
    </main>
  );
}
