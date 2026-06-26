import { describe, expect, it } from 'vitest';
import { augmentRdfGraphWithBuilder, filterRdfGraph, graphFromNQuads, RDF_TYPE } from '../src/lib/rdfGraph';
import type { GraphAsset, WorkingDraft } from '../src/lib/types';

describe('RDF graph helpers', () => {
  it('includes rdf:type edges by default when filtering RDF graphs', () => {
    const graph = graphFromNQuads('<https://example.org/s> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/Thing> .');

    const filtered = filterRdfGraph(graph, defaultFilter());

    expect(filtered.edges).toEqual([expect.objectContaining({ predicate: RDF_TYPE, compactPredicate: 'rdf:type' })]);
  });

  it('keeps isolated builder-only nodes when no predicate filter is active', () => {
    const draft = draftWithLooseNode();
    const graph = augmentRdfGraphWithBuilder(emptyGraph(), draft);

    const filtered = filterRdfGraph(graph, defaultFilter());

    expect(filtered.nodes.map((node) => node.id)).toContain('draft:datafile:loose');
    expect(filtered.nodes.find((node) => node.id === 'draft:datafile:loose')).toEqual(
      expect.objectContaining({ label: 'Loose file', compactTypes: ['ega:datafile'] })
    );
  });

  it('removes unrelated nodes when a predicate filter is active', () => {
    const draft = draftWithLooseNode();
    const graph = augmentRdfGraphWithBuilder(emptyGraph(), {
      ...draft,
      builder: {
        ...draft.builder,
        edges: [{ id: 'edge:1', source: 'draft:dataset:1', target: 'draft:datafile:connected', predicate: 'hasPart' }]
      }
    });

    const filtered = filterRdfGraph(graph, { ...defaultFilter(), predicateFilter: 'hasPart' });

    expect(filtered.nodes.map((node) => node.id).sort()).toEqual(['draft:datafile:connected', 'draft:dataset:1']);
    expect(filtered.edges).toEqual([expect.objectContaining({ compactPredicate: 'hasPart' })]);
  });
});

function defaultFilter() {
  return {
    showLiterals: true,
    showBlankNodes: true,
    showTypeEdges: true,
    predicateFilter: '',
    searchText: '',
    typeFilter: '',
    selectedOnly: false
  };
}

function emptyGraph(): GraphAsset {
  return { nodes: [], edges: [], warnings: [] };
}

function draftWithLooseNode(): WorkingDraft {
  return {
    id: 'draft:1',
    sourceLabel: 'Test draft',
    schema: {},
    data: {},
    updatedAt: '2026-06-26T00:00:00.000Z',
    builder: {
      nodes: [
        {
          id: 'draft:dataset:1',
          entity: 'dataset',
          egaType: 'ega:dataset',
          label: 'Dataset',
          properties: { '@type': 'ega:dataset', label: 'Dataset' },
          sourcePath: []
        },
        {
          id: 'draft:datafile:connected',
          entity: 'datafile',
          egaType: 'ega:datafile',
          label: 'Connected file',
          properties: { '@type': 'ega:datafile', fileName: 'connected.bam' }
        },
        {
          id: 'draft:datafile:loose',
          entity: 'datafile',
          egaType: 'ega:datafile',
          label: 'Loose file',
          properties: { '@type': 'ega:datafile', fileName: 'loose.bam' }
        }
      ],
      edges: []
    }
  };
}
