import type { EntityCategory, EntityNode, EntityRelation, SubgraphResult } from './types.js';

export interface GraphNodeMetadata {
  inDegree: number;
  outDegree: number;
  degree: number;
  aliases: Set<string>;
}

export class KnowledgeGraph {
  // Nodes indexed by normalized ID: entity:lowercase_name
  private readonly nodes = new Map<string, EntityNode>();
  private readonly nodeMeta = new Map<string, GraphNodeMetadata>();

  // Relations indexed by unique key: sourceId::relation::targetId
  private readonly relations = new Map<string, EntityRelation>();

  // Adjacency maps (entityId -> relationIds)
  private readonly outgoing = new Map<string, Set<string>>();
  private readonly incoming = new Map<string, Set<string>>();

  /**
   * Generates a stable deterministic ID for an entity
   */
  public getEntityId(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * Generates a unique relation ID
   */
  public getRelationId(source: string, relation: string, target: string): string {
    const s = this.getEntityId(source);
    const r = relation.trim().toLowerCase().replace(/\s+/g, '_');
    const t = this.getEntityId(target);
    return `${s}__${r}__${t}`;
  }

  /**
   * Upserts an EntityNode into the graph
   */
  public upsertEntity(name: string, type: EntityCategory, chunkId: string): EntityNode {
    const id = this.getEntityId(name);
    let node = this.nodes.get(id);

    if (!node) {
      node = {
        id,
        name: name.trim(),
        type,
        frequency: 1,
        sourceChunks: [chunkId],
      };
      this.nodes.set(id, node);
      this.nodeMeta.set(id, {
        inDegree: 0,
        outDegree: 0,
        degree: 0,
        aliases: new Set([name.trim()]),
      });
      this.outgoing.set(id, new Set());
      this.incoming.set(id, new Set());
    } else {
      node.frequency += 1;
      if (!node.sourceChunks.includes(chunkId)) {
        node.sourceChunks.push(chunkId);
      }
      // Preserve the better casing if newly supplied has better capitalization
      if (name.trim() !== node.name && /[A-Z]/.test(name)) {
        node.name = name.trim();
      }
      this.nodeMeta.get(id)?.aliases.add(name.trim());
    }

    return node;
  }

  /**
   * Upserts an EntityRelation between two entities
   */
  public upsertRelation(
    sourceName: string,
    targetName: string,
    relation: string,
    weight: number,
    _chunkId?: string
  ): EntityRelation {
    const sId = this.getEntityId(sourceName);
    const tId = this.getEntityId(targetName);
    const rId = this.getRelationId(sourceName, relation, targetName);

    let rel = this.relations.get(rId);

    if (!rel) {
      rel = {
        id: rId,
        source: sourceName.trim(),
        target: targetName.trim(),
        relation: relation.trim(),
        weight: Math.min(1.0, Math.max(0.1, weight)),
      };
      this.relations.set(rId, rel);

      // Register adjacency
      if (!this.outgoing.has(sId)) this.outgoing.set(sId, new Set());
      this.outgoing.get(sId)!.add(rId);

      if (!this.incoming.has(tId)) this.incoming.set(tId, new Set());
      this.incoming.get(tId)!.add(rId);

      // Update degrees
      const sMeta = this.nodeMeta.get(sId);
      if (sMeta) {
        sMeta.outDegree += 1;
        sMeta.degree = sMeta.inDegree + sMeta.outDegree;
      }
      const tMeta = this.nodeMeta.get(tId);
      if (tMeta) {
        tMeta.inDegree += 1;
        tMeta.degree = tMeta.inDegree + tMeta.outDegree;
      }
    } else {
      // Reinforce weight asymptotically
      rel.weight = Math.min(1.0, rel.weight + (1 - rel.weight) * 0.15);
    }

    return rel;
  }

  /**
   * Retrieves an entity by name or ID
   */
  public getEntity(nameOrId: string): EntityNode | undefined {
    const id = this.getEntityId(nameOrId);
    return this.nodes.get(id);
  }

  /**
   * Retrieves adjacent nodes and relations (1-hop)
   */
  public getNeighbors(nameOrId: string): { nodes: EntityNode[]; relations: EntityRelation[] } {
    const id = this.getEntityId(nameOrId);
    const resultNodes = new Map<string, EntityNode>();
    const resultRelations = new Map<string, EntityRelation>();

    const outRelIds = this.outgoing.get(id) || new Set();
    const inRelIds = this.incoming.get(id) || new Set();

    const centerNode = this.nodes.get(id);
    if (centerNode) {
      resultNodes.set(id, centerNode);
    }

    for (const rId of [...outRelIds, ...inRelIds]) {
      const rel = this.relations.get(rId);
      if (!rel) continue;
      resultRelations.set(rel.id, rel);

      const srcId = this.getEntityId(rel.source);
      const tgtId = this.getEntityId(rel.target);

      const srcNode = this.nodes.get(srcId);
      if (srcNode) resultNodes.set(srcId, srcNode);

      const tgtNode = this.nodes.get(tgtId);
      if (tgtNode) resultNodes.set(tgtId, tgtNode);
    }

    return {
      nodes: Array.from(resultNodes.values()),
      relations: Array.from(resultRelations.values()),
    };
  }

  /**
   * Retrieves an expanded subgraph around a set of seed entities (multi-hop)
   */
  public getSubgraph(seedNamesOrIds: string[], maxHops = 2, maxNodes = 40): SubgraphResult {
    const collectedNodes = new Map<string, EntityNode>();
    const collectedRelations = new Map<string, EntityRelation>();
    const rootEntityIds: string[] = [];

    const queue: Array<{ id: string; hop: number }> = [];

    for (const seed of seedNamesOrIds) {
      const id = this.getEntityId(seed);
      const node = this.nodes.get(id);
      if (node) {
        collectedNodes.set(id, node);
        rootEntityIds.push(id);
        queue.push({ id, hop: 0 });
      }
    }

    while (queue.length > 0 && collectedNodes.size < maxNodes) {
      const { id, hop } = queue.shift()!;
      if (hop >= maxHops) continue;

      const outRelIds = this.outgoing.get(id) || new Set();
      const inRelIds = this.incoming.get(id) || new Set();

      for (const rId of [...outRelIds, ...inRelIds]) {
        const rel = this.relations.get(rId);
        if (!rel) continue;
        collectedRelations.set(rel.id, rel);

        const otherId = this.getEntityId(rel.source) === id ? this.getEntityId(rel.target) : this.getEntityId(rel.source);
        if (!collectedNodes.has(otherId)) {
          const otherNode = this.nodes.get(otherId);
          if (otherNode) {
            collectedNodes.set(otherId, otherNode);
            if (collectedNodes.size < maxNodes) {
              queue.push({ id: otherId, hop: hop + 1 });
            }
          }
        }
      }
    }

    return {
      nodes: Array.from(collectedNodes.values()),
      relations: Array.from(collectedRelations.values()),
      rootEntityIds,
    };
  }

  /**
   * Search entities by query substring or token matching
   */
  public searchEntities(query: string, limit = 10): EntityNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const matches: Array<{ node: EntityNode; score: number }> = [];

    for (const node of this.nodes.values()) {
      const nameLower = node.name.toLowerCase();
      let score = 0;

      if (nameLower === q) {
        score = 100;
      } else if (nameLower.startsWith(q)) {
        score = 80;
      } else if (nameLower.includes(q)) {
        score = 50;
      } else {
        const queryWords = q.split(' ');
        let wordHits = 0;
        for (const w of queryWords) {
          if (w.length > 2 && nameLower.includes(w)) {
            wordHits++;
          }
        }
        if (wordHits > 0) {
          score = 20 * wordHits;
        }
      }

      if (score > 0) {
        // Boost by degree and frequency
        const meta = this.nodeMeta.get(node.id);
        const deg = meta ? meta.degree : 0;
        score += Math.log1p(node.frequency) * 5 + deg * 2;
        matches.push({ node, score });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit).map((m) => m.node);
  }

  /**
   * Get top entities ranked by degree centrality and frequency
   */
  public getTopEntities(limit = 25): EntityNode[] {
    const ranked = Array.from(this.nodes.values()).map((node) => {
      const meta = this.nodeMeta.get(node.id);
      const deg = meta ? meta.degree : 0;
      const rankScore = deg * 3 + node.frequency;
      return { node, rankScore };
    });

    ranked.sort((a, b) => b.rankScore - a.rankScore);
    return ranked.slice(0, limit).map((r) => r.node);
  }

  /**
   * Returns all nodes and relations formatted for shared API or visual graph
   */
  public getAllData(): { nodes: EntityNode[]; entities: EntityNode[]; relations: EntityRelation[] } {
    const nodes = Array.from(this.nodes.values());
    const relations = Array.from(this.relations.values());
    return {
      nodes,
      entities: nodes,
      relations,
    };
  }

  public getNodeCount(): number {
    return this.nodes.size;
  }

  public getRelationCount(): number {
    return this.relations.size;
  }

  public clear(): void {
    this.nodes.clear();
    this.nodeMeta.clear();
    this.relations.clear();
    this.outgoing.clear();
    this.incoming.clear();
  }
}
