import { getSamplePage, SAMPLE_PAGES } from './samplePages.js';
import { rewriteHtmlAssets } from './proxy.js';
import { TextExtractionStrategy } from './strategies/TextExtractionStrategy.js';
import { LinkExtractionStrategy } from './strategies/LinkExtractionStrategy.js';
import { StructureExtractionStrategy } from './strategies/StructureExtractionStrategy.js';
import { MediaExtractionStrategy } from './strategies/MediaExtractionStrategy.js';
import { SpiderFleetCoordinator, SPIDER_FLEET_DEFINITIONS } from './SpiderFleetCoordinator.js';
import { WebSocketServerMessage } from '../../../shared/types.js';

async function runTests() {
  console.log('=== ARACHNOS CRAWLER TEST SUITE ===\n');

  // 1. Verify Preloaded Sample Pages
  console.log('1. Testing Preloaded Sample Pages:');
  const sampleKeys = Object.keys(SAMPLE_PAGES);
  console.log(`- Loaded ${sampleKeys.length} sample pages: ${sampleKeys.join(', ')}`);
  if (sampleKeys.length < 4) throw new Error('Expected at least 4 sample pages');

  const qPage = getSamplePage('quantum-computing');
  if (!qPage || !qPage.html.includes('Quantum Computing')) {
    throw new Error('Failed loading quantum-computing sample page');
  }
  console.log(`  ✓ Sample page "quantum-computing" verified (${qPage.html.length} chars)`);

  // 2. Testing Asset Rewriter & Coordinate Script Injection
  console.log('\n2. Testing Proxy Asset Rewriter & Script Injection:');
  const rewritten = rewriteHtmlAssets(qPage.html, qPage.url);
  if (!rewritten.includes('ARACHNOS CLIENT COORDINATE TRACKER')) {
    throw new Error('Missing injected coordinate tracker script');
  }
  if (!rewritten.includes('/api/proxy?url=')) {
    throw new Error('Hyperlinks were not rewritten to route through proxy');
  }
  console.log('  ✓ Coordinate injection and proxy URL rewrite verified');

  // 3. Testing 4 Specialized Extraction Strategies
  console.log('\n3. Testing 4 Specialized Extraction Strategies:');
  const textStrat = new TextExtractionStrategy();
  const linkStrat = new LinkExtractionStrategy();
  const structStrat = new StructureExtractionStrategy();
  const mediaStrat = new MediaExtractionStrategy();

  const textTargets = textStrat.extract(qPage.html, qPage.url);
  console.log(`  ✓ TextStrategy: extracted ${textTargets.length} targets (headings/paragraphs)`);
  if (textTargets.length === 0) throw new Error('TextStrategy yielded 0 targets');
  console.log(`    Sample text target: [${textTargets[0].tag}] ${textTargets[0].rawText.slice(0, 60)}...`);

  const linkTargets = linkStrat.extract(qPage.html, qPage.url);
  console.log(`  ✓ LinkStrategy: extracted ${linkTargets.length} targets`);
  if (linkTargets.length === 0) throw new Error('LinkStrategy yielded 0 targets');
  console.log(`    Sample link target: ${linkTargets[0].rawText} (type: ${linkTargets[0].metadata.linkType})`);

  const structTargets = structStrat.extract(qPage.html, qPage.url);
  console.log(`  ✓ StructureStrategy: extracted ${structTargets.length} targets (tables/lists/metadata)`);
  if (structTargets.length === 0) throw new Error('StructureStrategy yielded 0 targets');
  console.log(`    Sample structure target: [${structTargets[0].tag}] rowCount: ${structTargets[0].metadata.rowCount || structTargets[0].metadata.pairCount}`);

  const mediaTargets = mediaStrat.extract(qPage.html, qPage.url);
  console.log(`  ✓ MediaStrategy: extracted ${mediaTargets.length} targets`);
  if (mediaTargets.length === 0) throw new Error('MediaStrategy yielded 0 targets');
  console.log(`    Sample media target: [${mediaTargets[0].tag}] src: ${mediaTargets[0].metadata.src}`);

  // 4. Testing SpiderFleetCoordinator Execution
  console.log('\n4. Testing SpiderFleetCoordinator Simulation:');
  const coordinator = new SpiderFleetCoordinator();
  const spiders = coordinator.getSpiders();
  console.log(`  ✓ Coordinator initialized with ${spiders.length} spiders:`);
  spiders.forEach(s => console.log(`    - [${s.id}] ${s.name} (${s.specialization})`));
  if (spiders.length !== 4) throw new Error('Expected 4 spiders');

  const receivedEvents: string[] = [];
  let harvestCount = 0;

  coordinator.on('message', (event: WebSocketServerMessage) => {
    receivedEvents.push(event.type);
    if (event.type === 'harvest') {
      harvestCount++;
    }
  });

  // Run fast test simulation
  console.log('  -> Launching crawl on quantum-computing...');
  await coordinator.start('quantum-computing', {
    stepIntervalMs: 50,
    moveDurationMs: 40
  });

  // Wait for crawl steps to execute
  await new Promise(resolve => setTimeout(resolve, 800));

  coordinator.pause();
  console.log(`  ✓ Pause executed. Harvested so far: ${harvestCount}`);
  if (harvestCount === 0) throw new Error('Expected harvest events during active crawl');

  coordinator.resume();
  console.log('  ✓ Resume executed.');
  await new Promise(resolve => setTimeout(resolve, 600));

  coordinator.stop();
  console.log(`  ✓ Stopped coordinator. Total harvest events captured: ${harvestCount}`);
  console.log(`  ✓ Event types observed: ${Array.from(new Set(receivedEvents)).join(', ')}`);

  console.log('\n>>> ALL ARACHNOS CRAWLER TESTS PASSED SUCCESSFULLY! <<<\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
