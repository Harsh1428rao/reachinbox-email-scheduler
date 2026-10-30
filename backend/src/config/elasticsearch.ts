import { Client } from '@elastic/elasticsearch';

export const esClient = new Client({
  node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200'
});

export const initElasticsearch = async () => {
  try {
    const indexExists = await esClient.indices.exists({ index: 'emails' });
    if (!indexExists) {
      await esClient.indices.create({
        index: 'emails',
        body: {
          mappings: {
            properties: {
              id: { type: 'keyword' },
              userId: { type: 'keyword' },
              senderEmail: { type: 'keyword' },
              recipientEmail: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              subject: { type: 'text' },
              bodyText: { type: 'text' },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' }
            }
          }
        }
      });
      console.log('Elasticsearch index `emails` configured');
    }
  } catch (error) {
    console.error('Elasticsearch initialization failed:', error);
  }
};
