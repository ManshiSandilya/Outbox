import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { indexEmail } from './email-search';

export async function sendEmailById(emailId: string): Promise<{ sent: boolean; skipped: boolean; failureReason?: string }> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { sender: true },
  });

  if (!email || email.status === 'SENT') {
    return { sent: false, skipped: true };
  }

  try {
    let transporter: nodemailer.Transporter;

    // Use Ethereal test account if SMTP credentials are placeholder
    if (email.sender.smtpUsername === 'replace-me' || !email.sender.smtpHost) {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: email.sender.smtpHost,
        port: email.sender.smtpPort,
        secure: email.sender.smtpSecure,
        auth: {
          user: email.sender.smtpUsername,
          pass: email.sender.smtpPasswordEncrypted,
        },
      });
    }

    const info = await transporter.sendMail({
      from: email.sender.displayName
        ? `${email.sender.displayName} <${email.sender.email}>`
        : email.sender.email,
      to: email.recipient,
      subject: email.subject,
      text: email.body,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[EMAIL SENT TO ETHEREAL] Recipient: ${email.recipient} | Subject: "${email.subject}" | Preview URL: ${previewUrl}`);
    } else {
      console.log(`[EMAIL SENT] Recipient: ${email.recipient} | Subject: "${email.subject}"`);
    }

    const sentEmail = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'SENT', sentTime: new Date(), failureReason: null },
      include: { sender: true },
    });

    await indexEmail(sentEmail);

    return { sent: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    console.error(`[EMAIL SEND FAILED] ${email.recipient}: ${message}`);
    const failedEmail = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', failureReason: message, sentTime: null },
      include: { sender: true },
    });
    await indexEmail(failedEmail);
    return { sent: false, skipped: false, failureReason: message };
  }
}
