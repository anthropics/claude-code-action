import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteNav />
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-8xl font-black text-primary mb-6">404</p>
          <h1 className="text-3xl font-black text-foreground mb-4">
            Page not found
          </h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or has been
            moved.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-white font-bold rounded-full px-8 py-3.5 hover:opacity-90 transition-opacity"
          >
            &larr; Back to GlobalCard
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
