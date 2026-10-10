import { Brain } from './index.js';
import type { HarvestEvent } from './types.js';

async function runBrainTests() {
  console.log('🧪 Starting Arachnos Brain Core Test Suite...\n');

  const brain = new Brain({ telemetryDebounceMs: 50 });

  let processedCount = 0;
  brain.on('brain_processed', (event) => {
    processedCount++;
    console.log(`[EVENT brain_processed] chunk=${event.chunk_id} entities=${event.entities.length} relations=${event.relationships.length}`);
  });

  let knowledgeReadyReceived = false;
  brain.on('knowledge_ready', (event) => {
    knowledgeReadyReceived = true;
    console.log(`[EVENT knowledge_ready] chunks=${event.stats.totalChunks} entities=${event.stats.totalEntities} relations=${event.stats.totalRelations} size=${event.stats.indexSizeKb}KB`);
  });

  // Sample realistic harvest events from multiple spiders
  const sampleEvents: HarvestEvent[] = [
    {
      type: 'harvest',
      spider_id: 'spider-text-01',
      timestamp: new Date().toISOString(),
      page_url: 'https://example.com/quantum',
      element_selector: '#hero-heading',
      bounding_box: { x: 120, y: 80, w: 800, h: 60 },
      content_type: 'heading',
      raw_text: 'Quantum Supremacy Demonstrated by Google Sycamore',
      extracted_facts: [
        'Organization: Google',
        'Technology: Sycamore',
        'Key Concept: Quantum Supremacy',
      ],
      confidence: 0.98,
    },
    {
      type: 'harvest',
      spider_id: 'spider-text-01',
      timestamp: new Date().toISOString(),
      page_url: 'https://example.com/quantum',
      element_selector: '#overview-p1',
      bounding_box: { x: 120, y: 160, w: 800, h: 120 },
      content_type: 'paragraph',
      raw_text: 'Google achieved quantum supremacy using their 53-qubit Sycamore processor in Santa Barbara, California. The experiment was led by John Martinis and benchmarked against world-class classical supercomputers.',
      extracted_facts: [
        'Key Metric: 53 qubits',
        'Lead Author: John Martinis',
        'Location: California',
      ],
      confidence: 0.96,
    },
    {
      type: 'harvest',
      spider_id: 'spider-struct-03',
      timestamp: new Date().toISOString(),
      page_url: 'https://example.com/quantum',
      element_selector: '#benchmark-table',
      bounding_box: { x: 120, y: 300, w: 750, h: 200 },
      content_type: 'table',
      raw_text: 'The Sycamore processor sampled a quantum random circuit in 200 seconds, which would take classical supercomputers an estimated 10,000 years. This demonstrated a 100x speedup in quantum state sampling.',
      extracted_facts: [
        'Metric: 200 seconds',
        'Metric: 10,000 years',
        'Metric: 100x speedup',
      ],
      confidence: 0.95,
    },
    {
      type: 'harvest',
      spider_id: 'spider-link-02',
      timestamp: new Date().toISOString(),
      page_url: 'https://example.com/quantum',
      element_selector: '#nature-paper-link',
      bounding_box: { x: 140, y: 520, w: 400, h: 30 },
      content_type: 'link',
      raw_text: 'Read the Nature Publication on Quantum Advantage',
      extracted_facts: ['Resource: https://www.nature.com/articles/s41586-019-1666-5'],
      metadata: {
        href: 'https://www.nature.com/articles/s41586-019-1666-5',
        tag: 'a',
      },
      confidence: 0.99,
    },
    {
      type: 'harvest',
      spider_id: 'spider-media-04',
      timestamp: new Date().toISOString(),
      page_url: 'https://example.com/quantum',
      element_selector: '#sycamore-chip-img',
      bounding_box: { x: 140, y: 580, w: 600, h: 400 },
      content_type: 'image',
      raw_text: 'Micrograph of the 54-qubit Sycamore QPU showing superconducting transmon qubits and tunable couplers.',
      extracted_facts: ['Technology: QPU', 'Technology: transmon qubits'],
      metadata: {
        src: 'https://example.com/images/sycamore-qpu.jpg',
        alt: 'Google Sycamore QPU Architecture',
        tag: 'img',
      },
      confidence: 0.94,
    },
  ];

  console.log('1️⃣ Ingesting streaming harvest events...');
  for (const event of sampleEvents) {
    const res = brain.ingest(event);
    console.log(`   Ingested chunk: ${res.chunk_id} | Entities: ${res.entities.map((e) => `${e.name} (${e.type})`).join(', ')}`);
  }

  // Allow debounce timer to fire
  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log('\n2️⃣ Verifying Knowledge Graph State:');
  const graphData = brain.getKnowledgeGraphData();
  console.log(`   Total Nodes: ${graphData.nodes.length}`);
  console.log(`   Total Relations: ${graphData.relations.length}`);
  console.log('   Top Entities:');
  for (const ent of brain.getTopEntities(7)) {
    console.log(`     - [${ent.type}] ${ent.name} (freq=${ent.frequency})`);
  }
  console.log('   Discovered Relations:');
  for (const rel of graphData.relations.slice(0, 7)) {
    console.log(`     - ${rel.source} --[${rel.relation}]--> ${rel.target} (w=${rel.weight})`);
  }

  console.log('\n3️⃣ Testing Vector Index & Semantic Search:');
  const queryTokens = ['sycamore', 'qubits', 'speed'];
  const searchHits = brain.vectorIndex.search('sycamore qubits benchmark speed', queryTokens, 3);
  console.log(`   Found ${searchHits.length} vector hits:`);
  for (const hit of searchHits) {
    console.log(`     - [Score: ${hit.score.toFixed(3)}] ${hit.chunk.id} (${hit.chunk.content_type}): "${hit.chunk.normalized_text.slice(0, 60)}..."`);
  }

  console.log('\n4️⃣ Testing Citation-Grounded RAG Engine:');

  const testQueries = [
    'What did Google achieve with Sycamore?',
    'What are the key metrics and performance numbers?',
    'What links or publications are available on the page?',
    'Summarize the key facts about this page',
  ];

  for (const q of testQueries) {
    console.log(`\n❓ Query: "${q}"`);
    const resp = brain.query(q);
    console.log(`💡 Latency: ${resp.latencyMs}ms | Confidence: ${resp.confidence}`);
    console.log(`📖 Answer:\n${resp.answer}`);
    console.log(`📌 Citations (${resp.citations.length}):`);
    for (const c of resp.citations) {
      console.log(`     * [${c.spider_id}] ${c.element_selector} (${c.content_type}) bbox=[${c.bounding_box.x},${c.bounding_box.y},${c.bounding_box.w},${c.bounding_box.h}]`);
      console.log(`       "${c.snippet}"`);
    }
    console.log(`🔗 Related Entities: ${resp.related_entities.join(', ')}`);
  }

  console.log('\n5️⃣ Verifying Telemetry and Stats:');
  const stats = brain.getStats();
  console.log('   Brain Stats:', stats);

  console.log('\n✅ All Arachnos Brain Core tests executed successfully!');
  brain.destroy();
}

runBrainTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
