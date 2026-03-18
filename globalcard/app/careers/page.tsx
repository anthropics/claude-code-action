import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { MapPin, Briefcase } from "lucide-react";

export const metadata: Metadata = {
  title: "Careers",
  description:
    "Join the GlobalCard team. We're hiring engineers, designers, and sales talent to shape the future of card issuing.",
};

const roles = [
  {
    title: "Senior Backend Engineer (Fintech)",
    location: "Remote",
    type: "Full-time",
    description:
      "Build and scale our core card issuing APIs, payment processing pipelines, and ledger infrastructure. You'll work with TypeScript, PostgreSQL, and event-driven architectures to handle millions of transactions across 25+ countries.",
  },
  {
    title: "Product Designer",
    location: "Remote",
    type: "Full-time",
    description:
      "Design intuitive dashboards and workflows for card program managers. From card issuance flows to real-time analytics — you'll shape the experience for thousands of businesses managing their card programs through GlobalCard.",
  },
  {
    title: "Sales Development Representative",
    location: "Remote",
    type: "Full-time",
    description:
      "Drive growth by identifying and engaging potential customers in the fintech and enterprise space. You'll be the first point of contact for businesses looking to launch card programs, qualifying leads and booking demos with our team.",
  },
];

export default function CareersPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          {/* Intro */}
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
              Careers
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mt-3 mb-4">
              Join the team
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              We&apos;re a lean, remote-first team building the future of card
              issuing infrastructure. If you&apos;re passionate about fintech
              and want to make a global impact, we&apos;d love to hear from you.
            </p>
          </div>

          {/* Open roles */}
          <h2 className="text-2xl font-black text-foreground mb-6">
            Open Positions
          </h2>
          <div className="space-y-6 mb-16">
            {roles.map((role) => (
              <div
                key={role.title}
                className="bg-card border border-border rounded-2xl p-8"
              >
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {role.title}
                </h3>
                <div className="flex flex-wrap gap-4 mb-4">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" /> {role.location}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Briefcase className="w-3.5 h-3.5" /> {role.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {role.description}
                </p>
                <a
                  href={`mailto:norwegianspark@gmail.com?subject=${encodeURIComponent(`Application: ${role.title}`)}`}
                  className="inline-block text-sm font-bold text-primary hover:underline"
                >
                  Apply Now
                </a>
              </div>
            ))}
          </div>

          {/* How to apply */}
          <div className="bg-muted/50 border border-border rounded-2xl p-8 mb-16">
            <h2 className="text-xl font-bold text-foreground mb-3">
              How to Apply
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Send your CV and a brief note about why you&apos;re interested to{" "}
              <a
                href="mailto:norwegianspark@gmail.com"
                className="text-primary hover:underline"
              >
                norwegianspark@gmail.com
              </a>{" "}
              with the role title in the subject line. We review every
              application and respond within 5 business days.
            </p>
          </div>

          {/* Culture */}
          <h2 className="text-2xl font-black text-foreground mb-6">
            Our Culture
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                title: "Remote-First",
                description:
                  "Work from anywhere. We're distributed across Norway and Europe with async-first communication.",
              },
              {
                title: "Async by Default",
                description:
                  "Deep work matters. We minimize meetings and rely on clear written communication and documentation.",
              },
              {
                title: "Competitive Compensation",
                description:
                  "Market-rate salary, equity options, and comprehensive benefits regardless of location.",
              },
              {
                title: "Growth & Learning",
                description:
                  "Annual learning budget, conference attendance, and time allocated for professional development.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-card border border-border rounded-2xl p-6"
              >
                <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
