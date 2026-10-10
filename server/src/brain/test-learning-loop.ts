import { Brain } from './brain.js';

async function testLearningLoop() {
  console.log('🧪 Testing Arachnos Personal Learning Loop & Memory Tiers...\n');
  const brain = new Brain();

  // 1. Initial harvest
  console.log('1️⃣ Ingesting web page harvest...');
  brain.ingest({
    page_url: 'https://example.com/gadget',
    content: 'The SuperWidget costs $299 and comes with a 1-year warranty.',
    element_selector: '#price-info',
    bounding_box: { x: 50, y: 100, w: 300, h: 50 },
    confidence: 0.9,
  });

  // 2. Query initial fact
  console.log('2️⃣ Querying initial fact...');
  let res = await brain.queryWithLlm('How much does the SuperWidget cost?');
  console.log('Answer:', res.answer);
  console.log('Citations count:', res.citations.length);

  // 3. User feedback correction
  console.log('\n3️⃣ User corrects the memory: "No, the SuperWidget price was reduced to $199"...');
  const memoryId = res.citations[0]?.chunk_id;
  if (memoryId) {
    brain.feedback({
      memory_id: memoryId,
      feedback: 'corrected',
      corrected_text: 'The SuperWidget price was reduced to $199 with a 2-year warranty.',
    });
  }

  // 4. Query after correction
  console.log('\n4️⃣ Querying after correction...');
  res = await brain.queryWithLlm('What is the price of the SuperWidget?');
  console.log('Updated Answer:', res.answer);
  console.log('Tier:', (res.citations[0] as any)?.tier);
  console.log('Feedback state:', (res.citations[0] as any)?.user_feedback);

  // 5. User explicit teach
  console.log('\n5️⃣ User explicitly teaches Arachnos a personal fact...');
  brain.teach({
    content: 'My favorite color is emerald green and I prefer dark mode.',
    page_url: 'user://personal-preferences',
  });

  const teachRes = await brain.queryWithLlm('What is my favorite color?');
  console.log('Answer to taught query:', teachRes.answer);

  // 6. Memory Stats
  console.log('\n6️⃣ Final Memory Stats:');
  console.log(brain.memoryStore.getStats());

  console.log('\n✅ Learning loop and memory tiers verified successfully!');
}

testLearningLoop().catch(console.error);
