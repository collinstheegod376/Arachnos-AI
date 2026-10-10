import { SamplePageDefinition } from './types.js';

export const SAMPLE_PAGES: Record<string, SamplePageDefinition> = {
  'quantum-computing': {
    id: 'quantum-computing',
    title: 'Quantum Computing — Principles, Architecture & Hardware Implementations',
    category: 'Wikipedia / Science',
    description: 'Comprehensive encyclopedic breakdown of quantum superposition, entanglement, physical qubit architectures, and algorithmic supremacy.',
    url: 'https://en.wikipedia.org/wiki/Quantum_computing',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quantum Computing — Principles, Architecture & Hardware Implementations</title>
  <meta name="description" content="Detailed analysis of quantum information systems, qubit coherence times, and physical implementations.">
  <meta property="og:title" content="Quantum Computing Architecture">
  <meta property="og:type" content="article">
  <meta property="og:image" content="https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 1040px; margin: 0 auto; padding: 24px; background: #f8fafc; }
    header { border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 2.2rem; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 1.6rem; color: #1e293b; margin-top: 32px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; }
    h3 { font-size: 1.25rem; color: #334155; margin-top: 24px; }
    p { margin: 12px 0; font-size: 1.05rem; }
    blockquote { border-left: 4px solid #3b82f6; margin: 16px 0; padding: 8px 16px; background: #eff6ff; font-style: italic; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; border: 1px solid #e2e8f0; text-align: left; }
    th { background: #f1f5f9; font-weight: 600; color: #0f172a; }
    figure { margin: 24px 0; text-align: center; background: #ffffff; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
    figure img { max-width: 100%; height: auto; border-radius: 6px; }
    figcaption { margin-top: 8px; font-size: 0.9rem; color: #64748b; }
    .infobox { float: right; width: 320px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 0 0 24px 24px; font-size: 0.95rem; }
    .infobox h4 { margin-top: 0; color: #1e293b; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
    .infobox dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; row-gap: 8px; }
    .infobox dt { font-weight: 600; color: #475569; }
    .infobox dd { margin: 0; color: #0f172a; }
    ul, ol { padding-left: 24px; margin: 12px 0; }
    li { margin-bottom: 6px; }
    nav.toc { background: #f1f5f9; padding: 16px 24px; border-radius: 8px; margin-bottom: 24px; }
    nav.toc ul { list-style: none; padding-left: 0; }
    nav.toc li { margin: 4px 0; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
  </style>
</head>
<body>
  <header>
    <span class="badge">Reference Architecture</span>
    <h1 id="main-title">Quantum Computing: Principles, Architecture & Hardware</h1>
    <p class="subtitle">An overview of quantum algorithms, quantum error correction, and physical hardware realizations.</p>
  </header>

  <aside class="infobox" id="quantum-infobox">
    <h4>Quantum Computing Overview</h4>
    <dl>
      <dt>Computational Base</dt>
      <dd>Qubit (Superposition)</dd>
      <dt>Key State Space</dt>
      <dd>2^N Hilbert Dimensions</dd>
      <dt>Coherence Target</dt>
      <dd>&gt; 100 microseconds</dd>
      <dt>Gate Fidelity</dt>
      <dd>&gt; 99.9% Fault Tolerance</dd>
      <dt>Primary Domain</dt>
      <dd>Simulation, Cryptography, Optimization</dd>
    </dl>
  </aside>

  <nav class="toc" id="page-nav">
    <strong>Contents</strong>
    <ul>
      <li><a href="#fundamental-principles">1. Fundamental Principles</a></li>
      <li><a href="#qubit-technologies">2. Physical Qubit Technologies</a></li>
      <li><a href="#quantum-algorithms">3. Landmark Quantum Algorithms</a></li>
      <li><a href="#error-correction">4. Quantum Fault Tolerance & Error Correction</a></li>
      <li><a href="#key-research-labs">5. Research Institutions & Industry Consortia</a></li>
    </ul>
  </nav>

  <main>
    <section id="fundamental-principles">
      <h2>1. Fundamental Principles</h2>
      <p id="para-intro">
        Quantum computing is an emerging multidisciplinary branch of computer science and physics that harnesses the bizarre properties of quantum mechanics—notably <strong>superposition</strong>, <strong>entanglement</strong>, and <strong>quantum interference</strong>—to solve numerical equations that remain mathematically intractable for classical von Neumann architectures.
      </p>
      <p id="para-superposition">
        Whereas a classical computing bit must definitively inhabit state <code>0</code> or <code>1</code>, a quantum bit (qubit) exists as a linear combination of basis vectors: |ψ⟩ = α|0⟩ + β|1⟩, parameterized by probability amplitudes over the complex unit sphere known as the Bloch Sphere.
      </p>
      <blockquote id="quote-feynman">
        "Nature isn't classical, dammit, and if you want to make a simulation of nature, you'd better make it quantum mechanical, and by golly it's a wonderful problem!"
        <br>— <em>Richard Feynman, 1981 Simulating Physics with Computers</em>
      </blockquote>
    </section>

    <figure id="fig-cryostat">
      <img src="https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800" alt="Superconducting quantum dilution refrigerator cryostat chamber" width="800" height="450">
      <figcaption>Figure 1. Golden dilution refrigerator wiring stage, cooling superconducting transmon chips down to 15 millikelvin.</figcaption>
    </figure>

    <section id="qubit-technologies">
      <h2>2. Physical Qubit Technologies</h2>
      <p id="para-tech-comparison">
        Different physical approaches compete to achieve high gate fidelities while maintaining long quantum coherence times. The leading contemporary modalities are cataloged below:
      </p>

      <table id="table-qubit-modalities">
        <thead>
          <tr>
            <th>Technology Modality</th>
            <th>Operating Temperature</th>
            <th>Single-Qubit Fidelity</th>
            <th>Two-Qubit Fidelity</th>
            <th>Primary Advantages</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Superconducting Transmon</strong></td>
            <td>15 mK (Dilution Refrigerator)</td>
            <td>99.95%</td>
            <td>99.4%</td>
            <td>Rapid nanosecond gate speeds, lithographic manufacturing</td>
          </tr>
          <tr>
            <td><strong>Trapped Ion (Yb-171, Ba-133)</strong></td>
            <td>Room Temp / 4K Cryo</td>
            <td>99.99%</td>
            <td>99.7%</td>
            <td>Identical atomic qubits, long minute-scale coherence, all-to-all connectivity</td>
          </tr>
          <tr>
            <td><strong>Silicon Spin Qubits</strong></td>
            <td>1 Kelvin</td>
            <td>99.8%</td>
            <td>98.9%</td>
            <td>Compatibility with existing semiconductor CMOS fabrication foundries</td>
          </tr>
          <tr>
            <td><strong>Photonic Waveguides</strong></td>
            <td>Ambient Room Temp</td>
            <td>99.5%</td>
            <td>97.8%</td>
            <td>No bulk cryogenic requirements, optical networking interconnects</td>
          </tr>
          <tr>
            <td><strong>Neutral Atom Arrays (Rb-87)</strong></td>
            <td>Microkelvin Optical Tweezers</td>
            <td>99.9%</td>
            <td>99.5%</td>
            <td>Dynamic 3D geometric reconfiguration, thousands of physical sites</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="quantum-algorithms">
      <h2>3. Landmark Quantum Algorithms</h2>
      <p id="para-algo-desc">
        Quantum algorithms exploit phase cancellation and interference to amplify correct answers while suppressing incorrect computational branches:
      </p>
      <ul id="list-algorithms">
        <li><strong>Shor's Algorithm (1994):</strong> Solves integer factorization in polynomial time O((log N)³), rendering classical RSA encryption insecure.</li>
        <li><strong>Grover's Algorithm (1996):</strong> Provides quadratic speedup O(√N) for unstructured database search queries.</li>
        <li><strong>Variational Quantum Eigensolver (VQE):</strong> Hybrid classical-quantum heuristic for estimating ground state molecular energies in computational chemistry.</li>
        <li><strong>Quantum Approximate Optimization (QAOA):</strong> Combinatorial optimization algorithm suited for near-term NISQ processor execution.</li>
      </ul>
    </section>

    <section id="error-correction">
      <h2>4. Quantum Fault Tolerance & Error Correction</h2>
      <p id="para-qec">
        Due to environmental decoherence, noise, and cross-talk, physical qubits suffer error rates too high for deep quantum circuits. Fault-tolerant quantum computing relies on topological codes such as the <em>Surface Code</em>, where logical qubits are encoded across an array of entangled data and syndrome-measurement physical qubits.
      </p>
    </section>

    <section id="key-research-labs">
      <h2>5. Research Institutions & Industry Consortia</h2>
      <p id="para-links">
        Global quantum development is spearheaded by academic laboratories and commercial hardware vendors:
      </p>
      <ul id="list-links">
        <li><a href="https://research.ibm.com/quantum-computing" target="_blank">IBM Quantum Computing Research & Eagle/Condor Processors</a></li>
        <li><a href="https://quantumai.google/" target="_blank">Google Quantum AI & Sycamore Processor Architecture</a></li>
        <li><a href="https://ionq.com" target="_blank">IonQ Trapped Ion Quantum Hardware Platform</a></li>
        <li><a href="https://www.rigetti.com" target="_blank">Rigetti Computing Hybrid QPU Cloud Systems</a></li>
        <li><a href="https://www.nature.com/articles/s41586-019-1666-5" target="_blank">Nature: Quantum Supremacy Using a Programmable Superconducting Processor</a></li>
      </ul>
    </section>
  </main>

  <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 0.85rem;">
    <p>© 2026 Arachnos Knowledge Harvest Corpus. Indexed for automated DOM spidering and RAG ingestion.</p>
  </footer>
</body>
</html>`
  },

  'tech-article': {
    id: 'tech-article',
    title: 'The Architecture of Modern Neural Networks: Beyond Self-Attention',
    category: 'Technical Article',
    description: 'An architectural dive into state-space models (Mamba), mixture of experts (MoE), and linear attention alternatives.',
    url: 'https://arxiv.org/abs/2312.00752',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>The Architecture of Modern Neural Networks: Beyond Self-Attention</title>
  <meta name="description" content="Technical exploration into State Space Models, Selective State Spaces, and sparse Mixture-of-Experts.">
  <meta property="og:title" content="Neural Networks: Beyond Self-Attention">
  <meta property="og:type" content="article">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.65; color: #0f172a; max-width: 980px; margin: 0 auto; padding: 32px 20px; background: #ffffff; }
    h1 { font-size: 2.4rem; font-weight: 800; line-height: 1.2; color: #0f172a; }
    .author-meta { display: flex; align-items: center; gap: 12px; margin: 16px 0 32px 0; color: #64748b; font-size: 0.95rem; }
    .author-avatar { width: 44px; height: 44px; border-radius: 50%; background: #6366f1; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
    h2 { font-size: 1.7rem; color: #1e293b; margin-top: 40px; }
    p { margin: 16px 0; font-size: 1.1rem; }
    pre { background: #0f172a; color: #f8fafc; padding: 18px; border-radius: 8px; overflow-x: auto; font-family: 'Fira Code', monospace; }
    code { font-family: 'Fira Code', monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre code { background: transparent; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th, td { padding: 12px; border: 1px solid #e2e8f0; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 24px 0; }
    ul { padding-left: 24px; }
    li { margin-bottom: 8px; }
    a { color: #4f46e5; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <article>
    <header>
      <h1 id="article-headline">The Architecture of Modern Neural Networks: Beyond Self-Attention</h1>
      <div class="author-meta" id="author-byline">
        <div class="author-avatar">AI</div>
        <div>
          <div>By <strong>Dr. Elena Vance & Arachnos Systems Lab</strong></div>
          <time datetime="2026-04-14">Published April 14, 2026 · 14 min read · 8,420 words</time>
        </div>
      </div>
    </header>

    <div class="card" id="executive-summary">
      <strong>Core Abstract:</strong>
      <p>
        While standard Transformers with quadratic quadratic O(N²) attention scaled modern LLMs, context lengths beyond 128k tokens hit steep compute walls. We examine linear state-space models (Mamba, S4), hybrid architectures (Jamba), and fine-grained Mixture-of-Experts (MoE) routing mechanisms that deliver linear inference throughput O(1) state memory overhead.
      </p>
    </div>

    <section id="limits-of-transformers">
      <h2>1. The Quadratic Scaling Bottleneck</h2>
      <p id="p-scaling">
        The classical scaled dot-product attention computes Attention(Q, K, V) = softmax(QK^T / √d_k) V. The resulting pairwise interaction matrix requires storing an N × N attention map in high-bandwidth memory (HBM). When sequence length N exceeds 100,000 tokens, activation memory completely dominates training and inference hardware budgets.
      </p>
    </section>

    <section id="comparative-benchmarks">
      <h2>2. Architecture Complexity & Performance Matrix</h2>
      <p>Below is an empirical comparison across 1M token contexts:</p>
      <table id="table-arch-comparison">
        <thead>
          <tr>
            <th>Architecture Model</th>
            <th>Attention Complexity</th>
            <th>Inference State Memory</th>
            <th>Throughput (Tokens/s)</th>
            <th>Needle in a Haystack Accuracy</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Standard Dense Transformer</strong></td>
            <td>O(N²)</td>
            <td>O(N) KV Cache</td>
            <td>450</td>
            <td>99.8%</td>
          </tr>
          <tr>
            <td><strong>Mamba (Selective SSM)</strong></td>
            <td>O(N) Linear</td>
            <td>O(1) Fixed Hidden</td>
            <td>2,150</td>
            <td>96.4%</td>
          </tr>
          <tr>
            <td><strong>Mixtral 8x22B MoE</strong></td>
            <td>O(N²) Sparse</td>
            <td>O(N) KV Cache</td>
            <td>1,280</td>
            <td>99.2%</td>
          </tr>
          <tr>
            <td><strong>Hybrid SSM-Transformer (Jamba)</strong></td>
            <td>O(N) / Interleaved</td>
            <td>O(N/k) Reduced</td>
            <td>1,720</td>
            <td>98.7%</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="ssm-mechanics">
      <h2>3. State Space Discretization Code</h2>
      <p>Continuous state-space equations are discretized via the Zero-Order Hold (ZOH) rule:</p>
      <pre id="code-snippet"><code># Continuous to discrete SSM conversion
def discretize_ssm(delta, A, B):
    # delta: (B, L, D), A: (D, N), B: (B, L, N)
    dA = torch.exp(torch.einsum('bld,dn->bldn', delta, A))
    dB = torch.einsum('bld,bln->bldn', delta, B)
    return dA, dB</code></pre>
    </section>

    <section id="future-outlook">
      <h2>4. Key Takeaways for Model Builders</h2>
      <ul id="key-takeaways">
        <li><strong>Memory Efficiency:</strong> SSMs eliminate the expanding KV cache, enabling continuous streaming inference.</li>
        <li><strong>Hybrid Convergence:</strong> Interleaving one Transformer layer every 6-8 SSM layers yields optimal associative recall with linear cost.</li>
        <li><strong>MoE Routing:</strong> Expert parallelization decouples active compute FLOPs from total stored parameter weights.</li>
      </ul>
    </section>
  </article>
</body>
</html>`
  },

  'hacker-news': {
    id: 'hacker-news',
    title: 'Hacker News — Real-Time Developer Feed',
    category: 'Aggregator / Forum',
    description: 'Dynamic tech news list featuring top community submissions, vote tallies, authors, and active discussions.',
    url: 'https://news.ycombinator.com',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hacker News — Real-Time Developer Feed</title>
  <style>
    body { font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: #222222; background: #f6f6ef; margin: 0; padding: 8px; }
    header { background: #ff6600; padding: 4px 8px; display: flex; align-items: center; justify-content: space-between; font-weight: bold; }
    .hnname { color: #000000; font-size: 11pt; margin-right: 12px; }
    .nav-links a { color: #000000; margin: 0 4px; text-decoration: none; font-size: 9pt; }
    main { margin-top: 10px; }
    ol.news-list { padding-left: 28px; margin: 0; }
    li.story-item { margin-bottom: 12px; }
    .story-title { font-size: 10.5pt; font-weight: 500; }
    .story-title a { color: #000000; text-decoration: none; }
    .story-title a:visited { color: #828282; }
    .story-domain { color: #828282; font-size: 8.5pt; margin-left: 4px; }
    .subtext { font-size: 7.5pt; color: #828282; margin-top: 3px; }
    .subtext a { color: #828282; text-decoration: none; }
    .subtext a:hover { text-decoration: underline; }
    footer { margin-top: 24px; border-top: 2px solid #ff6600; padding-top: 10px; text-align: center; font-size: 8pt; color: #828282; }
  </style>
</head>
<body>
  <header id="hn-header">
    <div style="display: flex; align-items: center;">
      <span class="hnname">Y Hacker News</span>
      <span class="nav-links">
        <a href="#new">new</a> |
        <a href="#past">past</a> |
        <a href="#comments">comments</a> |
        <a href="#ask">ask</a> |
        <a href="#show">show</a> |
        <a href="#jobs">jobs</a> |
        <a href="#submit">submit</a>
      </span>
    </div>
    <div style="font-size: 9pt;"><a href="#login" style="color: #000; text-decoration: none;">login</a></div>
  </header>

  <main>
    <ol class="news-list" id="story-feed">
      <li class="story-item" id="story-1">
        <div class="story-title">
          <a href="https://github.com/arachnos/spiders">Arachnos: Autonomous Visual Crawler and DOM Reasoning Engine</a>
          <span class="story-domain">(github.com/arachnos)</span>
        </div>
        <div class="subtext">
          <span>642 points</span> by <a href="#user-satoshi">d_knuth</a> 3 hours ago |
          <a href="#discuss-1">189 comments</a> | <a href="#save">favorite</a>
        </div>
      </li>

      <li class="story-item" id="story-2">
        <div class="story-title">
          <a href="https://kernel.org/v6.12">Linux 6.12 Kernel Released With Real-Time PREEMPT_RT Support</a>
          <span class="story-domain">(kernel.org)</span>
        </div>
        <div class="subtext">
          <span>512 points</span> by <a href="#user-torvalds">torvalds_fan</a> 5 hours ago |
          <a href="#discuss-2">142 comments</a> | <a href="#save">favorite</a>
        </div>
      </li>

      <li class="story-item" id="story-3">
        <div class="story-title">
          <a href="https://w3c.github.io/webauthn/">Passkeys and WebAuthn Level 3 Reaches Proposed Recommendation</a>
          <span class="story-domain">(w3c.github.io)</span>
        </div>
        <div class="subtext">
          <span>389 points</span> by <a href="#user-sec">cryptonerd</a> 7 hours ago |
          <a href="#discuss-3">96 comments</a> | <a href="#save">favorite</a>
        </div>
      </li>

      <li class="story-item" id="story-4">
        <div class="story-title">
          <a href="https://sqlite.org/draft/wasm.html">SQLite Official WebAssembly build with OPFS Virtual File System</a>
          <span class="story-domain">(sqlite.org)</span>
        </div>
        <div class="subtext">
          <span>721 points</span> by <a href="#user-drh">drh_admirer</a> 8 hours ago |
          <a href="#discuss-4">215 comments</a> | <a href="#save">favorite</a>
        </div>
      </li>

      <li class="story-item" id="story-5">
        <div class="story-title">
          <a href="https://arxiv.org/abs/2603.1124">Why Vector Databases Need Graph Indexes for Multi-Hop Reasoning</a>
          <span class="story-domain">(arxiv.org)</span>
        </div>
        <div class="subtext">
          <span>298 points</span> by <a href="#user-graphguy">neo_matrix</a> 9 hours ago |
          <a href="#discuss-5">83 comments</a> | <a href="#save">favorite</a>
        </div>
      </li>
    </ol>
  </main>

  <footer>
    <p>Guidelines | FAQ | Lists | API | Security | Legal | Apply to YC | Contact</p>
  </footer>
</body>
</html>`
  },

  'documentation': {
    id: 'documentation',
    title: 'Arachnos Graph Engine — Developer Documentation',
    category: 'API Documentation',
    description: 'Technical quickstart, REST API parameters, and integration guides for the distributed Knowledge Graph.',
    url: 'https://docs.arachnos.ai/api',
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Arachnos Graph Engine — Developer Documentation</title>
  <meta name="description" content="Official documentation for Arachnos Knowledge Graph query endpoints and spider telemetry API.">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; color: #1e293b; background: #ffffff; display: flex; }
    aside.sidebar { width: 260px; height: 100vh; position: sticky; top: 0; background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 24px; box-sizing: border-box; }
    aside h3 { font-size: 1.1rem; color: #0f172a; margin-top: 0; }
    aside ul { list-style: none; padding: 0; margin: 0; }
    aside li { margin: 8px 0; }
    aside a { color: #475569; text-decoration: none; font-size: 0.95rem; }
    aside a.active, aside a:hover { color: #2563eb; font-weight: 600; }
    main.content { flex: 1; padding: 36px 48px; max-width: 900px; }
    h1 { font-size: 2.2rem; color: #0f172a; margin-top: 0; }
    h2 { font-size: 1.5rem; color: #1e293b; margin-top: 36px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    p { line-height: 1.6; font-size: 1.05rem; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 0.95rem; }
    th, td { padding: 10px 14px; border: 1px solid #cbd5e1; text-align: left; }
    th { background: #f1f5f9; }
    code { background: #f1f5f9; color: #0f172a; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace; }
    .badge-method { background: #10b981; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; }
  </style>
</head>
<body>
  <aside class="sidebar" id="doc-nav">
    <h3>Arachnos Docs</h3>
    <ul>
      <li><a href="#quickstart" class="active">Quickstart</a></li>
      <li><a href="#architecture">Architecture</a></li>
      <li><a href="#endpoints">API Endpoints</a></li>
      <li><a href="#websocket-spec">WebSocket Protocol</a></li>
      <li><a href="#error-codes">Status & Errors</a></li>
    </ul>
  </aside>

  <main class="content">
    <header>
      <h1 id="doc-title">Arachnos Knowledge Graph API Reference</h1>
      <p id="doc-subtitle">Streamline high-speed DOM harvesting, automated relation extraction, and vector-backed knowledge retrieval.</p>
    </header>

    <section id="quickstart">
      <h2>1. Quickstart</h2>
      <p>Initiate a new spider crawl session by sending a POST request to <code>/api/crawl</code>:</p>
      <pre id="quickstart-code"><code>curl -X POST http://localhost:3001/api/crawl \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://en.wikipedia.org/wiki/Quantum_computing", "spiders": 4}'</code></pre>
    </section>

    <section id="endpoints">
      <h2>2. Core API Endpoints</h2>
      <table id="table-endpoints">
        <thead>
          <tr>
            <th>Method & Path</th>
            <th>Description</th>
            <th>Response Type</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><span class="badge-method">POST</span> <code>/api/crawl</code></td>
            <td>Launches 4 specialized spiders onto target URL</td>
            <td><code>JSON { session_id, status }</code></td>
          </tr>
          <tr>
            <td><span class="badge-method">GET</span> <code>/api/proxy?url=...</code></td>
            <td>Sandboxed page proxy with coordinate hooks injected</td>
            <td><code>text/html</code></td>
          </tr>
          <tr>
            <td><span class="badge-method">POST</span> <code>/api/query</code></td>
            <td>RAG knowledge query with grounded citations</td>
            <td><code>JSON { answer, citations }</code></td>
          </tr>
          <tr>
            <td><span class="badge-method">GET</span> <code>/api/health</code></td>
            <td>Health telemetry for coordinator and brain stores</td>
            <td><code>JSON { status, spiders, brain }</code></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section id="query-parameters">
      <h2>3. Query Parameters Reference</h2>
      <table id="table-parameters">
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Type</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>url</code></td>
            <td>string</td>
            <td>required</td>
            <td>Valid HTTP/HTTPS or local sample page identifier</td>
          </tr>
          <tr>
            <td><code>focusMode</code></td>
            <td>string</td>
            <td>"all"</td>
            <td>Filter: "all", "text", "media", or "structure"</td>
          </tr>
          <tr>
            <td><code>spiderCount</code></td>
            <td>number</td>
            <td>4</td>
            <td>Fleet size between 1 and 4 active spiders</td>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`
  }
};

export function getSamplePage(urlOrId: string): SamplePageDefinition | undefined {
  const normalized = urlOrId.trim().toLowerCase();
  
  // Exact ID match
  if (SAMPLE_PAGES[normalized]) {
    return SAMPLE_PAGES[normalized];
  }

  // By URL or substring
  for (const [id, page] of Object.entries(SAMPLE_PAGES)) {
    if (page.url.toLowerCase() === normalized) return page;
    if (normalized.includes(id)) return page;
  }

  // Keyword match
  if (normalized.includes('quantum') || normalized.includes('wikipedia')) {
    return SAMPLE_PAGES['quantum-computing'];
  }
  if (normalized.includes('tech') || normalized.includes('neural') || normalized.includes('arxiv')) {
    return SAMPLE_PAGES['tech-article'];
  }
  if (normalized.includes('hacker') || normalized.includes('ycombinator') || normalized.includes('news')) {
    return SAMPLE_PAGES['hacker-news'];
  }
  if (normalized.includes('doc') || normalized.includes('api') || normalized.includes('guide')) {
    return SAMPLE_PAGES['documentation'];
  }

  return undefined;
}
