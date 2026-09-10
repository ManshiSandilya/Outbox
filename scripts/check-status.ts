import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkEmails() {
  const emails = await prisma.email.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      recipient: true,
      subject: true,
      scheduledTime: true,
      sentTime: true,
      status: true,
      createdAt: true
    }
  });

  console.log("--- RECENT 20 EMAILS IN DB ---");
  console.table(emails);

  const counts = await prisma.email.groupBy({
    by: ['status'],
    _count: { id: true }
  });
  console.log("--- EMAIL STATUS SUMMARY ---");
  console.log(counts);
}

checkEmails()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
