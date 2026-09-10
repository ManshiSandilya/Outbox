const EMAILS_INDEX = 'emails';
const elasticsearchUrl = (process.env.ELASTICSEARCH_URL ?? 'http://127.0.0.1:9200').replace(/\/$/, '');

const emailsIndexMapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      recipient: { type: 'keyword', fields: { text: { type: 'text' } } },
      subject: { type: 'text' },
      status: { type: 'keyword' },
      scheduled_time: { type: 'date' },
      sent_time: { type: 'date' },
      sender: {
        properties: {
          id: { type: 'keyword' },
          email: { type: 'keyword' },
          display_name: { type: 'text' },
        },
      },
    },
  },
};

type EmailForIndex = {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  scheduledTime: Date;
  sentTime: Date | null;
  sender: {
    id: string;
    email: string;
    displayName: string | null;
  };
};

let indexInitialization: Promise<void> | undefined;

async function ensureEmailsIndex(): Promise<void> {
  const response = await fetch(`${elasticsearchUrl}/${EMAILS_INDEX}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(emailsIndexMapping),
  });

  if (response.ok) {
    return;
  }

  const responseText = await response.text();
  // A concurrent API/worker boot can create the same named index first.
  if (response.status === 400 && responseText.includes('resource_already_exists_exception')) {
    return;
  }

  throw new Error(`Elasticsearch index initialization failed: ${response.status} ${responseText}`);
}

function initializeEmailsIndex(): Promise<void> {
  indexInitialization ??= ensureEmailsIndex().catch((error: unknown) => {
    indexInitialization = undefined;
    throw error;
  });
  return indexInitialization;
}

/** Mirrors a committed Postgres email row; Postgres remains authoritative. */
export async function indexEmail(email: EmailForIndex): Promise<void> {
  try {
    await initializeEmailsIndex();

    const response = await fetch(
      `${elasticsearchUrl}/${EMAILS_INDEX}/_doc/${encodeURIComponent(email.id)}?refresh=wait_for`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipient: email.recipient,
          subject: email.subject,
          status: email.status,
          scheduled_time: email.scheduledTime.toISOString(),
          sent_time: email.sentTime?.toISOString() ?? null,
          sender: {
            id: email.sender.id,
            email: email.sender.email,
            display_name: email.sender.displayName,
          },
        }),
      },
    );

    if (!response.ok) {
      console.warn(`Elasticsearch email indexing warning: ${response.status}`);
    }
  } catch (error) {
    console.warn('Elasticsearch not available, skipping index:', error instanceof Error ? error.message : error);
  }
}

export async function syncAllEmailsToElasticsearch(): Promise<void> {
  try {
    const allEmails = await prisma.email.findMany({
      include: { sender: true },
    });
    await Promise.all(allEmails.map((email) => indexEmail(email)));
  } catch (error) {
    console.warn('Elasticsearch bulk sync skipped:', error);
  }
}

export async function searchEmails(query: string): Promise<unknown[]> {
  void syncAllEmailsToElasticsearch().catch(() => null);

  try {
    await initializeEmailsIndex();
    const response = await fetch(`${elasticsearchUrl}/${EMAILS_INDEX}/_search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        size: 50,
        query: {
          multi_match: {
            query,
            fields: ['subject^2', 'recipient.text', 'sender.email', 'sender.display_name'],
          },
        },
      }),
    });

    if (response.ok) {
      const result = (await response.json()) as { hits?: { hits?: Array<{ _id: string; _source: unknown }> } };
      const hits = (result.hits?.hits ?? []).map((hit) => ({ id: hit._id, ...asObject(hit._source) }));
      if (hits.length > 0) {
        return hits;
      }
    }
  } catch (error) {
    console.warn('Elasticsearch search fallback to DB:', error instanceof Error ? error.message : error);
  }


  // Database fallback for search
  const dbEmails = await prisma.email.findMany({
    where: {
      OR: [
        { subject: { contains: query, mode: 'insensitive' } },
        { body: { contains: query, mode: 'insensitive' } },
        { recipient: { contains: query, mode: 'insensitive' } },
      ],
    },
    include: { sender: true },
    take: 50,
  });

  return dbEmails.map((email) => ({
    id: email.id,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    status: email.status.toLowerCase(),
    scheduled_time: email.scheduledTime.toISOString(),
    sent_time: email.sentTime?.toISOString() ?? null,
  }));
}

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}
