"use client";

import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Mail, Phone, Clock, Building } from "lucide-react";
import { useState } from "react";

const plans = [
  "Starter (Free)",
  "Growth ($49/mo)",
  "Business ($149/mo)",
  "Scale ($349/mo)",
  "Pro ($599/mo)",
  "Premium ($999/mo)",
  "Ultra ($1,499/mo)",
  "Enterprise ($2,499/mo)",
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    plan: "",
    message: "",
  });

  const mailtoHref = `mailto:norwegianspark@gmail.com?subject=${encodeURIComponent(
    `GlobalCard Inquiry${form.plan ? ` — ${form.plan}` : ""}${form.company ? ` — ${form.company}` : ""}`,
  )}&body=${encodeURIComponent(
    `Name: ${form.name}\nEmail: ${form.email}\nCompany: ${form.company}\nPlan Interest: ${form.plan}\n\n${form.message}`,
  )}`;

  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
              Contact Us
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mt-3 mb-4">
              Let&apos;s talk
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Have questions about GlobalCard? Want to discuss an enterprise
              plan? We&apos;re here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
            {/* Form */}
            <div className="lg:col-span-3">
              <div className="bg-card border border-border rounded-2xl p-8">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Name
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                        className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Company
                    </label>
                    <input
                      type="text"
                      value={form.company}
                      onChange={(e) =>
                        setForm({ ...form, company: e.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Your company"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Plan Interest
                    </label>
                    <select
                      value={form.plan}
                      onChange={(e) =>
                        setForm({ ...form, plan: e.target.value })
                      }
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Select a plan...</option>
                      {plans.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">
                      Message
                    </label>
                    <textarea
                      value={form.message}
                      onChange={(e) =>
                        setForm({ ...form, message: e.target.value })
                      }
                      rows={5}
                      className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      placeholder="Tell us about your card program needs..."
                    />
                  </div>
                  <a
                    href={mailtoHref}
                    className="inline-block w-full text-center bg-primary text-primary-foreground font-bold rounded-full px-8 py-3.5 hover:opacity-90 transition-opacity"
                  >
                    Send Message
                  </a>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="lg:col-span-2 space-y-8">
              <div className="flex gap-4">
                <Mail className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1">Email</h3>
                  <a
                    href="mailto:norwegianspark@gmail.com"
                    className="text-sm text-primary hover:underline"
                  >
                    norwegianspark@gmail.com
                  </a>
                </div>
              </div>
              <div className="flex gap-4">
                <Phone className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1">Phone</h3>
                  <p className="text-sm text-muted-foreground">
                    +47 99 73 74 67
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Clock className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1">
                    Response Time
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    We respond within 1 business day
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Building className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-foreground mb-1">Office</h3>
                  <p className="text-sm text-muted-foreground">Norway</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    NorwegianSpark SA | Org. 834 984 172
                  </p>
                </div>
              </div>

              <div className="bg-muted/50 border border-border rounded-2xl p-6 mt-6">
                <h3 className="font-bold text-foreground mb-2">
                  Enterprise Inquiries
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Need a custom card program with dedicated infrastructure,
                  white-label solutions, or volume pricing? Our enterprise team
                  is ready to design a solution tailored to your business needs.
                </p>
                <a
                  href="mailto:norwegianspark@gmail.com?subject=Enterprise%20Inquiry"
                  className="inline-block mt-4 text-sm font-bold text-primary hover:underline"
                >
                  Contact Enterprise Sales
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
