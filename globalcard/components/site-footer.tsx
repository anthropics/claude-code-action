import Link from "next/link";

const footerLinks = {
  Product: [
    { href: "/pricing", label: "Pricing" },
    { href: "/blog", label: "Blog" },
    { href: "/reviews", label: "Reviews" },
  ],
  Company: [
    { href: "/about", label: "About" },
    { href: "/careers", label: "Careers" },
    { href: "/contact", label: "Contact" },
  ],
  Legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/cookies", label: "Cookie Policy" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="bg-foreground text-white/70">
      <div className="container mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <p className="text-xl font-black text-white tracking-tight mb-3">
              Global<span className="text-primary">Card</span>
            </p>
            <p className="text-sm leading-relaxed mb-4">
              Premium card issuing infrastructure for businesses in 25+
              countries.
            </p>
            <div className="text-xs space-y-1">
              <p className="text-white/50">NorwegianSpark SA</p>
              <p className="text-white/50">Org. 834 984 172</p>
              <p className="text-white/50">norwegianspark@gmail.com</p>
              <p className="text-white/50">+47 99 73 74 67</p>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3 className="text-sm font-bold text-white mb-4">{title}</h3>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 text-center text-xs text-white/40">
          &copy; {new Date().getFullYear()} NorwegianSpark SA. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
