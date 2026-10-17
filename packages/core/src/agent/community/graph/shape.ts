// packages/core/src/agent/community/graph/shape.ts — hinh hai do thi (BB-16): hang
// = 01-CONTRACTS §12.4 = so do nguoi dung da duyet (00-ARCH §4). `graph-shape.test.ts`
// so `getGraph()` voi hai hang nay: them/bot/doi ten node hay canh => test do.
// Moi canh: [nguon, dich, co dieu kien]; `__start__`/`__end__` la ten LangGraph.

export const PIPELINE_SHAPE = {
  nodes: ['ingest', 'triage', 'moderate', 'gate', 'defer', 'group_event', 'system_event', 'dm_intake', 'turn'],
  edges: [
    ['__start__', 'ingest', true],
    ['__start__', 'group_event', true],
    ['__start__', 'system_event', true],
    ['__start__', 'dm_intake', true], // routeEvent
    ['ingest', 'triage', true],
    ['ingest', '__end__', true], // afterIngest
    ['dm_intake', 'triage', true],
    ['dm_intake', '__end__', true], // afterDmIntake
    ['triage', 'moderate', true],
    ['triage', 'turn', true], // afterTriage
    ['moderate', 'gate', true],
    ['moderate', '__end__', true], // afterModerate
    ['gate', 'turn', true],
    ['gate', 'defer', true],
    ['gate', '__end__', true], // afterGate
    ['system_event', 'turn', true],
    ['system_event', '__end__', true], // afterSystemEvent
    ['group_event', '__end__', false],
    ['defer', '__end__', false],
    ['turn', '__end__', false],
  ],
} as const;

export const TURN_SHAPE = {
  nodes: ['prepare', 'agent', 'tools', 'nudge', 'deliver', 'trace'],
  edges: [
    ['__start__', 'prepare', false],
    ['prepare', 'agent', true],
    ['prepare', 'deliver', true], // afterPrepare
    ['agent', 'tools', true],
    ['agent', 'nudge', true],
    ['agent', 'deliver', true], // afterAgent
    ['tools', 'agent', false],
    ['nudge', 'agent', false],
    ['deliver', 'trace', false],
    ['trace', '__end__', false],
  ],
} as const;
