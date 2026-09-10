import { EmailStatus, PrismaClient, RateLimitScope } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { name: 'Development Tenant' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Development Tenant',
    },
  });

  const sender = await prisma.sender.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: process.env.SEED_SENDER_EMAIL ?? 'sender@example.test',
      },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: process.env.SEED_SENDER_EMAIL ?? 'sender@example.test',
      displayName: 'Development Sender',
      smtpHost: process.env.SEED_SMTP_HOST ?? 'smtp.ethereal.email',
      smtpPort: Number(process.env.SEED_SMTP_PORT ?? 587),
      smtpUsername: process.env.SEED_SMTP_USERNAME ?? 'replace-me',
      // This must be encrypted by the application before a real SMTP password is stored.
      smtpPasswordEncrypted: process.env.SEED_SMTP_PASSWORD_ENCRYPTED ?? 'replace-me',
      smtpSecure: false,
    },
  });

  await prisma.rateLimitConfig.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: { maxPerHour: 100, minDelayMs: 1_000 },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      tenantId: tenant.id,
      scope: RateLimitScope.TENANT,
      maxPerHour: 100,
      minDelayMs: 1_000,
    },
  });

  await prisma.rateLimitConfig.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: { maxPerHour: 25, minDelayMs: 5_000 },
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      tenantId: tenant.id,
      senderId: sender.id,
      scope: RateLimitScope.SENDER,
      maxPerHour: 25,
      minDelayMs: 5_000,
    },
  });

  await prisma.email.upsert({
    where: { idempotencyKey: 'candidate@example.test:demo-campaign' },
    update: {},
    create: {
      recipient: 'candidate@example.test',
      subject: 'Development scheduled email',
      body: 'This is a seed record. It is not sent by this script.',
      scheduledTime: new Date('2030-01-01T09:00:00.000Z'),
      status: EmailStatus.SCHEDULED,
      senderId: sender.id,
      campaignId: 'demo-campaign',
      idempotencyKey: 'candidate@example.test:demo-campaign',
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
