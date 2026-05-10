import { LocalDocumentLoader } from './server/src/infrastructure/document/local-document-loader.js';
import path from 'node:path';

async function test() {
  const loader = new LocalDocumentLoader();
  try {
    const chunks = await loader.load('Teen_Mental_Health_Dataset.csv');
    console.log('Successfully loaded CSV. Chunks:', chunks.length);
    console.log('First chunk content preview:', chunks[0].content.slice(0, 200));
  } catch (error) {
    console.error('Failed to load CSV:', error);
  }
}

test();
