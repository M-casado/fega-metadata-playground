import { Parser } from 'n3';
import type { BuilderNode, GraphAsset, GraphEdge, GraphNode, WorkingDraft } from './types';

export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';

interface RdfFilterOptions {
  showLiterals: boolean;
  showBlankNodes: boolean;
  showTypeEdges: boolean;
  predicateFilter: string;
  searchText: string;
  typeFilter: string;
  selectedOnly: boolean;
  selectedNodeId?: string;
}

export function graphFromNQuads(nquads: string): GraphAsset {
  const parser = new Parser({ format: 'N-Quads' });
  const quads = parser.parse(nquads);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  for (const quad of quads) {
    const subject = nodeFromTerm(quad.subject);
    nodes.set(subject.id, { ...nodes.get(subject.id), ...subject });

    const object = nodeFromTerm(quad.object, edges.length);
    nodes.set(object.id, { ...nodes.get(object.id), ...object });

    const predicate = quad.predicate.value;
    edges.push({
      id: `e${edges.length}`,
      source: subject.id,
      target: object.id,
      predicate,
      compactPredicate: compactKnownIri(predicate),
      objectKind: object.kind
    });

    if (predicate === RDF_TYPE && object.kind !== 'literal') {
      const existing = nodes.get(subject.id);
      if (existing) {
        existing.types = [...new Set([...existing.types, object.value || object.id])];
        existing.compactTypes = existing.types.map(compactKnownIri);
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
    warnings: []
  };
}

export function augmentRdfGraphWithBuilder(graph: GraphAsset, draft: WorkingDraft): GraphAsset {
  const nodes = new Map(graph.nodes.map((node) => [node.id, cloneGraphNode(node)]));
  const edges = [...graph.edges];
  const builderNodeIds = new Map<string, string>();

  for (const builderNode of draft.builder.nodes) {
    const existingId = findRdfNodeIdForBuilderNode(builderNode, nodes);
    const nodeId = existingId || builderNode.id;
    builderNodeIds.set(builderNode.id, nodeId);

    if (!nodes.has(nodeId)) {
      nodes.set(nodeId, syntheticNodeFromBuilder(builderNode, nodeId));
      continue;
    }

    const existing = nodes.get(nodeId);
    if (existing && !existing.compactTypes.includes(builderNode.egaType)) {
      existing.types = [...new Set([...existing.types, builderNode.egaType])];
      existing.compactTypes = [...new Set([...existing.compactTypes, builderNode.egaType])];
    }
  }

  for (const builderEdge of draft.builder.edges) {
    const source = builderNodeIds.get(builderEdge.source);
    const target = builderNodeIds.get(builderEdge.target);
    if (!source || !target || !nodes.has(source) || !nodes.has(target)) {
      continue;
    }
    const hasEdge = edges.some((edge) => edge.source === source && edge.target === target && (edge.compactPredicate === builderEdge.predicate || edge.predicate === builderEdge.predicate));
    if (!hasEdge) {
      edges.push({
        id: `builder:${builderEdge.id}`,
        source,
        target,
        predicate: builderEdge.predicate,
        compactPredicate: builderEdge.predicate,
        objectKind: nodes.get(target)?.kind || 'iri'
      });
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
    warnings: graph.warnings
  };
}

export function filterRdfGraph(graph: GraphAsset, options: RdfFilterOptions): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const searchNeedle = options.searchText.trim().toLowerCase();
  const predicateNeedle = options.predicateFilter.trim().toLowerCase();
  const typeNeedle = options.typeFilter.trim().toLowerCase();
  let nodes = graph.nodes.filter((node) => {
    if (!options.showLiterals && node.kind === 'literal') {
      return false;
    }
    if (!options.showBlankNodes && node.kind === 'blank') {
      return false;
    }
    if (typeNeedle && ![...node.compactTypes, ...node.types].join(' ').toLowerCase().includes(typeNeedle)) {
      return false;
    }
    return true;
  });
  let nodeIds = new Set(nodes.map((node) => node.id));
  let edges = graph.edges.filter((edge) => {
    if (!options.showTypeEdges && edge.predicate === RDF_TYPE) {
      return false;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      return false;
    }
    const predicateHaystack = `${edge.compactPredicate} ${edge.predicate}`.toLowerCase();
    return !predicateNeedle || predicateHaystack.includes(predicateNeedle);
  });

  if (predicateNeedle) {
    nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
    nodes = nodes.filter((node) => nodeIds.has(node.id));
  }

  if (searchNeedle) {
    const matchingIds = new Set(
      nodes
        .filter((node) => [node.id, node.label, node.value, node.compactValue, ...node.compactTypes, ...node.types].join(' ').toLowerCase().includes(searchNeedle))
        .map((node) => node.id)
    );
    edges.forEach((edge) => {
      if (`${edge.compactPredicate} ${edge.predicate}`.toLowerCase().includes(searchNeedle)) {
        matchingIds.add(edge.source);
        matchingIds.add(edge.target);
      }
    });
    nodes = nodes.filter((node) => matchingIds.has(node.id));
    nodeIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  }

  if (options.selectedOnly && options.selectedNodeId) {
    const visibleIds = expandByRadius(new Set([options.selectedNodeId]), edges, 1);
    nodes = nodes.filter((node) => visibleIds.has(node.id));
    nodeIds = new Set(nodes.map((node) => node.id));
    edges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  }

  return { nodes, edges };
}

export function expandByRadius(seedIds: Set<string>, edges: Array<{ source: string; target: string }>, radius: number) {
  const visible = new Set(seedIds);
  let frontier = new Set(seedIds);
  for (let step = 0; step < radius; step += 1) {
    const next = new Set<string>();
    edges.forEach((edge) => {
      if (frontier.has(edge.source)) {
        next.add(edge.target);
      }
      if (frontier.has(edge.target)) {
        next.add(edge.source);
      }
    });
    next.forEach((id) => visible.add(id));
    frontier = next;
  }
  return visible;
}

function nodeFromTerm(term: { termType: string; value: string; datatype?: { value: string }; language?: string }, salt = 0): GraphNode {
  if (term.termType === 'Literal') {
    const datatype = term.datatype?.value || XSD_STRING;
    const language = term.language || '';
    const value = term.value;
    return {
      id: `literal:${hash(`${value}|${datatype}|${language}|${salt}`)}`,
      kind: 'literal',
      label: truncate(value, 64),
      value,
      datatype,
      compactDatatype: compactKnownIri(datatype),
      language,
      types: [],
      compactTypes: []
    };
  }

  const kind = term.termType === 'BlankNode' ? 'blank' : 'iri';
  return {
    id: kind === 'blank' ? `_:${term.value}` : term.value,
    kind,
    label: kind === 'blank' ? `_:${term.value}` : compactKnownIri(term.value),
    value: term.value,
    compactValue: kind === 'blank' ? `_:${term.value}` : compactKnownIri(term.value),
    types: [],
    compactTypes: []
  };
}

function findRdfNodeIdForBuilderNode(builderNode: BuilderNode, nodes: Map<string, GraphNode>) {
  const candidates = new Set([builderNode.id, stringValue(builderNode.properties['@id'])].filter(Boolean));
  for (const node of nodes.values()) {
    if (candidates.has(node.id) || candidates.has(node.value || '') || candidates.has(node.compactValue || '')) {
      return node.id;
    }
  }
  return '';
}

function syntheticNodeFromBuilder(builderNode: BuilderNode, nodeId: string): GraphNode {
  const value = stringValue(builderNode.properties['@id']) || builderNode.id;
  return {
    id: nodeId,
    kind: 'iri',
    label: builderNode.label,
    value,
    compactValue: value,
    types: [builderNode.egaType],
    compactTypes: [builderNode.egaType]
  };
}

function cloneGraphNode(node: GraphNode): GraphNode {
  return {
    ...node,
    types: [...node.types],
    compactTypes: [...node.compactTypes]
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : '';
}

function compactKnownIri(value: string) {
  return value
    .replace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf:')
    .replace('http://www.w3.org/2001/XMLSchema#', 'xsd:')
    .replace('https://w3id.org/ega/metadata/', 'ega:')
    .replace('https://schema.org/', 'schema:')
    .replace('http://schema.org/', 'schema:');
}

function hash(value: string) {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}
