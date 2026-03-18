import { readFileSync } from "fs";
import { join } from "path";

interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  variables: Record<string, string>;
}

function loadTemplate(name: string, variables: Record<string, string>): string {
  const templatePath = join(process.cwd(), "emails", `${name}.html`);
  let html = readFileSync(templatePath, "utf-8");
  for (const [key, value] of Object.entries(variables)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}

export async function sendEmail({
  to,
  subject,
  template,
  variables,
}: SendEmailOptions): Promise<void> {
  const html = loadTemplate(template, variables);

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "PagePulse <noreply@pagepulse.app>",
    to,
    subject,
    html,
  });
}
