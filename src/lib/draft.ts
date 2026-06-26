import type { BuilderDraft, BuilderEdge, BuilderNode, EntitySummary, SimpleGraphAsset, WrappedExample, WorkingDraft } from './types';

const RELATIONSHIP_TERMS = new Set(['hasPart', 'isPartOf', 'used', 'generated', 'wasGeneratedBy', 'wasDerivedFrom', 'hadMember', 'hadProtocolCollection', 'hadPlan', 'sameAs']);

export const WORKING_DRAFT_STORAGE_KEY = 'fega-playground.workingDraft';

export function emptyBuilderDraft(): BuilderDraft {
  return { nodes: [], edges: [] };
}

export function loadWorkingDraft(): WorkingDraft | null {
  try {
    const stored = localStorage.getItem(WORKING_DRAFT_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as WorkingDraft) : null;
  } catch {
    return null;
  }
}

export function saveWorkingDraft(draft: WorkingDraft | null) {
  try {
    if (!draft) {
      localStorage.removeItem(WORKING_DRAFT_STORAGE_KEY);
      return;
    }
    localStorage.setItem(WORKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Storage can fail in private browsing, quota limits, or restricted embeds.
  }
}

export function draftFromWrappedExample(source: WrappedExample, entities: EntitySummary[], sourceLabel = 'Imported example'): WorkingDraft {
  const builder = draftFromJsonLd(source.data, entities);
  return {
    id: `draft:${Date.now()}`,
    sourceLabel,
    schema: source.schema || {},
    data: cloneJson(source.data ?? {}),
    builder,
    updatedAt: new Date().toISOString()
  };
}

export function createBlankWorkingDraft(entity: EntitySummary): WorkingDraft {
  const node: BuilderNode = {
    id: `draft:${entity.id}:${Date.now()}`,
    entity: entity.id,
    egaType: entity.egaType,
    label: `${cleanEntityTitle(entity.title)} 1`,
    properties: {
      '@type': entity.egaType,
      label: `${cleanEntityTitle(entity.title)} 1`
    },
    sourcePath: []
  };
  return {
    id: `draft:${Date.now()}`,
    sourceLabel: 'New working draft',
    schema: { $ref: entity.schemaRef },
    data: { '@type': entity.egaType, label: node.label },
    builder: { nodes: [node], edges: [] },
    updatedAt: new Date().toISOString()
  };
}

export function withBuilderDraft(draft: WorkingDraft | null, builder: BuilderDraft, sourceLabel = draft?.sourceLabel || 'Working draft'): WorkingDraft {
  const { data, builder: syncedBuilder } = syncBuilderIntoData(draft?.data, builder, draft?.builder);
  return {
    id: draft?.id || `draft:${Date.now()}`,
    sourceLabel,
    schema: draft?.schema || {},
    data,
    builder: syncedBuilder,
    updatedAt: new Date().toISOString()
  };
}

export function updateDraftSchemaAndData(draft: WorkingDraft | null, schema: unknown, data: unknown, entities?: EntitySummary[]): WorkingDraft {
  return {
    id: draft?.id || `draft:${Date.now()}`,
    sourceLabel: draft?.sourceLabel || 'Edited validation draft',
    schema,
    data,
    builder: entities ? draftFromJsonLd(data, entities) : draft?.builder || emptyBuilderDraft(),
    updatedAt: new Date().toISOString()
  };
}

export function draftToValidationPayload(draft: WorkingDraft) {
  return {
    schema: draft.schema || {},
    data: draft.data ?? {}
  };
}

export function draftToJsonLd(builder: BuilderDraft) {
  const nodeMap = new Map<string, Record<string, unknown>>(
    builder.nodes.map((node) => [node.id, { '@id': node.id, '@type': node.egaType, ...node.properties }])
  );
  builder.edges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      return;
    }
    const current = source[edge.predicate];
    const ref = { '@id': target['@id'], '@type': target['@type'], label: target.label || target.title || target.name };
    source[edge.predicate] = Array.isArray(current) ? [...current, ref] : current ? [current, ref] : [ref];
  });
  const graph = [...nodeMap.values()];
  return graph.length === 1 ? graph[0] : { '@graph': graph };
}

export function simpleGraphFromWorkingDraft(draft: WorkingDraft): SimpleGraphAsset {
  const nodes = draft.builder.nodes.map((node) => {
    const searchParts: string[] = [];
    collectSearchable(node.properties, searchParts);
    searchParts.push(node.id, node.label, node.egaType, node.entity);
    return {
      id: node.id,
      label: node.label,
      sourcePath: pathLabel(node.sourcePath) || node.id,
      egaTypes: [node.egaType],
      compactTypes: [node.egaType],
      entityKind: node.egaType,
      searchableText: searchableText(searchParts),
      propertyCount: Object.keys(node.properties).filter((key) => !key.startsWith('@')).length,
      sourcePreview: previewObject(node.properties)
    };
  });
  const edges = draft.builder.edges.map((edge, index) => ({
    id: edge.id || `draft-edge:${index}`,
    source: edge.source,
    target: edge.target,
    predicate: edge.predicate,
    compactPredicate: edge.predicate,
    sourcePath: pathLabel(edge.relationshipPath || edge.sourcePath) || edge.id || `draft-edge:${index}`,
    searchableText: searchableText([edge.predicate, edge.source, edge.target])
  }));
  return { nodes, edges, warnings: [] };
}

export function draftFromJsonLd(data: unknown, entities: EntitySummary[]): BuilderDraft {
  const nodes: BuilderNode[] = [];
  const edges: BuilderEdge[] = [];
  const entityByType = new Map(entities.map((entity) => [entity.egaType, entity]));

  function visit(value: unknown, parentId = '', predicate = '', path: Array<string | number> = []) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, parentId, predicate, [...path, index]));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
    const egaType = types.find((type) => typeof type === 'string' && type.startsWith('ega:')) as string | undefined;
    let nodeId = parentId;
    if (egaType) {
      const entity = entityByType.get(egaType) || entities.find((item) => item.id === egaType.replace('ega:', ''));
      nodeId = String(record['@id'] || `draft:${entity?.id || 'entity'}:${nodes.length + 1}`);
      if (!nodes.some((node) => node.id === nodeId)) {
        nodes.push({
          id: nodeId,
          entity: entity?.id || egaType.replace('ega:', ''),
          egaType,
          label: String(record.label || record.title || record.name || record.fileName || nodeId),
          properties: { ...record },
          sourcePath: path
        });
      }
      if (parentId && predicate && RELATIONSHIP_TERMS.has(predicate)) {
        edges.push({ id: `edge:${edges.length + 1}`, source: parentId, target: nodeId, predicate, sourcePath: path, relationshipPath: path.slice(0, -1) });
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if (key !== '@context') {
        visit(child, nodeId, key, [...path, key]);
      }
    }
  }

  if (data && typeof data === 'object' && '@graph' in data && Array.isArray((data as Record<string, unknown>)['@graph'])) {
    ((data as Record<string, unknown>)['@graph'] as unknown[]).forEach((item, index) => visit(item, '', '', ['@graph', index]));
  } else {
    visit(data);
  }
  return { nodes, edges };
}

function syncBuilderIntoData(data: unknown, builder: BuilderDraft, previousBuilder: BuilderDraft = emptyBuilderDraft()): { data: unknown; builder: BuilderDraft } {
  const clonedData = data === undefined ? undefined : cloneJson(data);
  const nodeById = new Map(builder.nodes.map((node) => [node.id, node]));
  const previousNodeById = new Map(previousBuilder.nodes.map((node) => [node.id, node]));
  const edgesBySource = groupEdgesBySource(builder.edges);
  const previousEdgesBySource = groupEdgesBySource(previousBuilder.edges);
  const nextNodes = builder.nodes.map((node) => ({ ...node, properties: cloneJson(node.properties) }));
  const nextNodeById = new Map(nextNodes.map((node) => [node.id, node]));
  let nextData = clonedData ?? dataFromBuilderRoots({ nodes: nextNodes, edges: builder.edges });

  if (nextData === undefined || nextData === null) {
    nextData = dataFromBuilderRoots({ nodes: nextNodes, edges: builder.edges });
  }

  for (const node of nextNodes) {
    if (!node.sourcePath || !isRecordAtPath(nextData, node.sourcePath)) {
      continue;
    }
    const target = getAtPath(nextData, node.sourcePath);
    if (isRecord(target)) {
      syncNodeProperties(target, node);
    }
  }

  function materializeNode(nodeId: string, seen: Set<string>): Record<string, unknown> {
    const node = nextNodeById.get(nodeId) || nodeById.get(nodeId);
    if (!node) {
      return { '@id': nodeId };
    }
    if (seen.has(nodeId)) {
      return compactNodeReference(node);
    }
    const record = node.sourcePath && isRecordAtPath(nextData, node.sourcePath) ? cloneJson(getAtPath(nextData, node.sourcePath) as Record<string, unknown>) : {};
    syncNodeProperties(record, node);
    const outgoing = edgesBySource.get(nodeId) || [];
    const predicates = [...new Set(outgoing.map((edge) => edge.predicate))];
    for (const predicate of predicates) {
      const targetValues = outgoing.filter((edge) => edge.predicate === predicate).map((edge) => materializeNode(edge.target, new Set([...seen, nodeId])));
      record[predicate] = Array.isArray(record[predicate]) || targetValues.length > 1 ? targetValues : targetValues[0];
    }
    return record;
  }

  const managedSourceIds = new Set([...builder.edges.map((edge) => edge.source), ...previousBuilder.edges.map((edge) => edge.source)]);
  for (const sourceId of managedSourceIds) {
    const sourceNode = nextNodeById.get(sourceId) || previousNodeById.get(sourceId);
    if (!sourceNode?.sourcePath || !isRecordAtPath(nextData, sourceNode.sourcePath)) {
      continue;
    }
    const sourceRecord = getAtPath(nextData, sourceNode.sourcePath);
    if (!isRecord(sourceRecord)) {
      continue;
    }
    const outgoing = builder.edges.filter((edge) => edge.source === sourceId);
    const previousOutgoing = previousEdgesBySource.get(sourceId) || [];
    const managedPredicates = [...new Set([...outgoing.map((edge) => edge.predicate), ...previousOutgoing.map((edge) => edge.predicate)])];
    for (const predicate of managedPredicates) {
      const targets = outgoing.filter((edge) => edge.predicate === predicate).map((edge) => materializeNode(edge.target, new Set([sourceId])));
      if (targets.length === 0) {
        delete sourceRecord[predicate];
        continue;
      }
      sourceRecord[predicate] = Array.isArray(sourceRecord[predicate]) || targets.length > 1 ? targets : targets[0];
      assignPathsForRelationship(nextData, nextNodes, sourceRecord, sourceNode.sourcePath, predicate);
    }
  }

  for (const edge of builder.edges) {
    const sourceNode = nextNodeById.get(edge.source);
    const targetNode = nextNodeById.get(edge.target);
    if (!sourceNode || !targetNode || targetNode.sourcePath) {
      continue;
    }
    const relationPath = sourceNode.sourcePath ? [...sourceNode.sourcePath, edge.predicate] : undefined;
    if (!relationPath || !isValueAtPath(nextData, relationPath)) {
      continue;
    }
    const relationValue = getAtPath(nextData, relationPath);
    const matchedPath = findChildPathForNode(relationValue, relationPath, targetNode);
    if (matchedPath) {
      targetNode.sourcePath = matchedPath;
    }
  }

  return {
    data: nextData,
    builder: {
      nodes: nextNodes,
      edges: builder.edges.map((edge) => ({
        ...edge,
        relationshipPath: edge.relationshipPath || (nextNodeById.get(edge.source)?.sourcePath ? [...(nextNodeById.get(edge.source)?.sourcePath || []), edge.predicate] : undefined)
      }))
    }
  };
}

function dataFromBuilderRoots(builder: BuilderDraft): unknown {
  if (builder.nodes.length === 0) {
    return {};
  }
  const targetIds = new Set(builder.edges.map((edge) => edge.target));
  const root = builder.nodes.find((node) => !targetIds.has(node.id)) || builder.nodes[0];
  return cloneJson(root.properties);
}

function syncNodeProperties(target: Record<string, unknown>, node: BuilderNode) {
  for (const [key, value] of Object.entries(node.properties)) {
    if (RELATIONSHIP_TERMS.has(key)) {
      continue;
    }
    target[key] = cloneJson(value);
  }
  target['@type'] = node.egaType;
  if (node.properties['@id'] !== undefined) {
    target['@id'] = cloneJson(node.properties['@id']);
  }
}

function compactNodeReference(node: BuilderNode): Record<string, unknown> {
  const ref: Record<string, unknown> = { '@id': node.properties['@id'] || node.id, '@type': node.egaType };
  const label = node.properties.label || node.properties.title || node.properties.name || node.properties.fileName || node.label;
  if (label) {
    ref.label = label;
  }
  return ref;
}

function groupEdgesBySource(edges: BuilderEdge[]) {
  const grouped = new Map<string, BuilderEdge[]>();
  for (const edge of edges) {
    grouped.set(edge.source, [...(grouped.get(edge.source) || []), edge]);
  }
  return grouped;
}

function assignPathsForRelationship(data: unknown, nodes: BuilderNode[], sourceRecord: Record<string, unknown>, sourcePath: Array<string | number>, predicate: string) {
  const relationValue = sourceRecord[predicate];
  for (const node of nodes) {
    if (node.sourcePath) {
      continue;
    }
    const matchedPath = findChildPathForNode(relationValue, [...sourcePath, predicate], node);
    if (matchedPath && isValueAtPath(data, matchedPath)) {
      node.sourcePath = matchedPath;
    }
  }
}

function findChildPathForNode(value: unknown, basePath: Array<string | number>, node: BuilderNode): Array<string | number> | undefined {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const matched = findChildPathForNode(value[index], [...basePath, index], node);
      if (matched) {
        return matched;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const valueId = value['@id'];
  if ((valueId && valueId === node.properties['@id']) || valueId === node.id || value === node.properties) {
    return basePath;
  }
  const valueType = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  const nodeType = Array.isArray(node.properties['@type']) ? node.properties['@type'] : [node.properties['@type'] || node.egaType];
  const valueLabel = value.label || value.title || value.name || value.fileName;
  const nodeLabel = node.properties.label || node.properties.title || node.properties.name || node.properties.fileName || node.label;
  if (valueType.includes(node.egaType) && valueLabel === nodeLabel) {
    return basePath;
  }
  return undefined;
}

function isRecordAtPath(data: unknown, path: Array<string | number>) {
  return isRecord(getAtPath(data, path));
}

function isValueAtPath(data: unknown, path: Array<string | number>) {
  return getAtPath(data, path) !== undefined;
}

function getAtPath(data: unknown, path: Array<string | number>): unknown {
  let current = data;
  for (const segment of path) {
    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function pathLabel(path?: Array<string | number>) {
  return path?.length ? path.map((part) => String(part)).join('.') : '';
}

function cleanEntityTitle(title: string) {
  return title.replace(/^FEGA\s+/i, '').replace(/\s+metadata schema$/i, '');
}

function collectSearchable(value: unknown, output: string[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchable(item, output));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      output.push(key);
      collectSearchable(child, output);
    }
    return;
  }
  if (value !== null && value !== undefined) {
    output.push(String(value));
  }
}

function searchableText(parts: unknown[]) {
  return [...new Set(parts.filter(Boolean).map((part) => String(part).toLowerCase()))].join(' ');
}

function previewObject(value: Record<string, unknown>) {
  const preview: Record<string, unknown> = {};
  for (const key of ['@id', '@type', 'label', 'title', 'name', 'fileName', 'description']) {
    if (value[key] !== undefined) {
      preview[key] = value[key];
    }
  }
  return preview;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
