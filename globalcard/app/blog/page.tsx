import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "GlobalCard blog. Insights on card issuing, fintech, tokenization, and building modern payment infrastructure.",
};

const posts = [
  {
    slug: "virtual-cards-2026",
    title: "The State of Virtual Cards in 2026",
    excerpt:
      "Virtual cards have evolved from a niche tool to a core component of modern business finance. Here's what's changed and what's next.",
    date: "March 12, 2026",
    readTime: "6 min read",
  },
  {
    slug: "tokenization-replacing-card-numbers",
    title: "How Tokenization Is Replacing Card Numbers",
    excerpt:
      "The era of sharing raw card numbers is ending. Tokenization is reshaping payment security from the ground up.",
    date: "February 28, 2026",
    readTime: "5 min read",
  },
  {
    slug: "launch-card-program-7-days",
    title: "How to Launch a Card Program in 7 Days",
    excerpt:
      "A practical guide to going from zero to live card issuance in under a week using modern infrastructure.",
    date: "February 15, 2026",
    readTime: "7 min read",
  },
];

export default function BlogPage() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-primary tracking-[0.18em] uppercase">
              Blog
            </span>
            <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mt-3 mb-4">
              Insights & Guides
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Expert perspectives on card issuing, fintech infrastructure, and
              modern payments.
            </p>
          </div>

          <div className="space-y-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                  <span>{post.date}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{post.readTime}</span>
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {post.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {post.excerpt}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
