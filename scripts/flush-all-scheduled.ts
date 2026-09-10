import { EmailStatus, PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

async function flushAllScheduled() {
  const scheduled = await prisma.email.findMany({
    where: { status: EmailStatus.SCHEDULED },
    include: { sender: true },
  });

  console.log(`Processing remaining ${scheduled.length} scheduled emails...`);

  for (const email of scheduled) {
    try {
      const transporter = nodemailer.createTransport({
        host: email.sender.smtpHost,
        port: email.sender.smtpPort,
        secure: email.sender.smtpSecure,
        auth: {
          user: email.sender.smtpUsername,
          pass: email.sender.smtpPasswordEncrypted,
        },
      });

      await transporter.sendMail({
        from: email.sender.displayName ? `${email.sender.displayName} <${email.sender.email}>` : email.sender.email,
        to: email.recipient,
        subject: email.subject,
        text: email.body,
      });

      await prisma.email.update({
        where: { id: email.id },
        data: { status: EmailStatus.SENT, sentTime: new Date(), failureReason: null },
      });
      console.log(`Successfully sent & updated email ${email.id} (${email.recipient})`);
    } catch (err) {
      console.warn(`Failed sending email ${email.id}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('All remaining scheduled emails processed!');
}

flushAllScheduled()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
