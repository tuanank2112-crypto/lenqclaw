// graph-shape.test.ts — SPEC-P03 §11 hang 9 (BB-16): tap node va tap canh [nguon, dich, dieu-kien] cua
// `getGraph()` hai do thi BANG DUNG PIPELINE_SHAPE / TURN_SHAPE (01-CONTRACTS §12.4 = so do da duyet).
// Khong DB, khong mang. Them/bot/doi ten node hay canh ⇒ test do.
import { END, START, StateGraph } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';
import { PIPELINE_SHAPE, TURN_SHAPE } from './shape.js';
import { pipelineGraph } from './pipeline.js';
import { turnGraph } from './turn.js';
import { TurnState } from './state.js';

interface DrawableLike {
  nodes: Record<string, unknown>;
  edges: Array<{ source: string; target: string; conditional?: boolean }>;
}

function describeGraph(g: DrawableLike): { nodes: string[]; edges: string[] } {
  return {
    nodes: Object.keys(g.nodes).filter((n) => n !== '__start__' && n !== '__end__').sort(),
    edges: g.edges.map((e) => `${e.source}>${e.target}>${e.conditional === true}`).sort(),
  };
}

function describeShape(s: { nodes: readonly string[]; edges: ReadonlyArray<readonly [string, string, boolean]> }) {
  return { nodes: [...s.nodes].sort(), edges: s.edges.map(([a, b, c]) => `${a}>${b}>${c}`).sort() };
}

describe('hinh do thi == hang SHAPE (so do da duyet)', () => {
  it('pipelineGraph: 9 node, 20 canh', () => {
    const want = describeShape(PIPELINE_SHAPE);
    expect(want.nodes).toHaveLength(9);
    expect(want.edges).toHaveLength(20);
    expect(describeGraph(pipelineGraph.getGraph() as unknown as DrawableLike)).toEqual(want);
  });

  it('turnGraph: 6 node, 10 canh', () => {
    const want = describeShape(TURN_SHAPE);
    expect(want.nodes).toHaveLength(6);
    expect(want.edges).toHaveLength(10);
    expect(describeGraph(turnGraph.getGraph() as unknown as DrawableLike)).toEqual(want);
  });

  it('drawMermaid() khong nem', () => {
    expect(pipelineGraph.getGraph().drawMermaid().length).toBeGreaterThan(50);
    expect(turnGraph.getGraph().drawMermaid().length).toBeGreaterThan(50);
  });

  it('bo so sanh BAT DUOC do thi lech: noi nudge → deliver thay nudge → agent thi khac SHAPE', () => {
    const noop = async () => ({});
    const bad = new StateGraph(TurnState)
      .addNode('prepare', noop)
      .addNode('agent', noop)
      .addNode('tools', noop)
      .addNode('nudge', noop)
      .addNode('deliver', noop)
      .addNode('trace', noop)
      .addEdge(START, 'prepare')
      .addConditionalEdges('prepare', () => 'agent' as const, ['agent', 'deliver'])
      .addConditionalEdges('agent', () => 'deliver' as const, ['tools', 'nudge', 'deliver'])
      .addEdge('tools', 'agent')
      .addEdge('nudge', 'deliver') // SAI: dung ra la nudge → agent
      .addEdge('deliver', 'trace')
      .addEdge('trace', END)
      .compile();
    const got = describeGraph(bad.getGraph() as unknown as DrawableLike);
    const want = describeShape(TURN_SHAPE);
    expect(got).not.toEqual(want);
    expect(got.edges).toContain('nudge>deliver>false');
    expect(want.edges).toContain('nudge>agent>false');
  });

  it('compile() khong gan bo luu trang thai hay store (BB-17)', () => {
    expect((pipelineGraph as unknown as { checkpointer?: unknown }).checkpointer ?? false).toBeFalsy();
    expect((turnGraph as unknown as { checkpointer?: unknown }).checkpointer ?? false).toBeFalsy();
  });
});
