import { describe, expect, it, vi } from 'vitest';
import { createBlankWorkingDraft, draftFromWrappedExample, draftToValidationPayload, saveWorkingDraft, updateDraftSchemaAndData, withBuilderDraft, WORKING_DRAFT_STORAGE_KEY } from '../src/lib/draft';
import { cytoscapeDataForEgaType, styleForEgaType } from '../src/lib/fegaStyles';
import type { EntitySummary, WrappedExample } from '../src/lib/types';

const entities: EntitySummary[] = [
  {
    id: 'dataset',
    title: 'FEGA Dataset metadata schema',
    schemaPath: 'schemas/entities/dataset/schema.json',
    schemaRef: 'https://example.org/dataset/schema.json',
    egaType: 'ega:dataset',
    required: ['title'],
    properties: [],
    relationshipFields: [{ name: 'hasPart', compactPredicate: 'hasPart' }]
  },
  {
    id: 'datafile',
    title: 'FEGA Datafile metadata schema',
    schemaPath: 'schemas/entities/datafile/schema.json',
    schemaRef: 'https://example.org/datafile/schema.json',
    egaType: 'ega:datafile',
    required: [],
    properties: [],
    relationshipFields: []
  }
];

describe('FEGA visual styles', () => {
  it('returns technical-report styles for supported EGA types', () => {
    expect(styleForEgaType('ega:process')).toEqual(expect.objectContaining({ shape: 'rectangle', fill: '#FFE5CC', stroke: '#F5A45D' }));
    expect(styleForEgaType('ega:dataset')).toEqual(expect.objectContaining({ shape: 'diamond', fill: '#FFD600', stroke: '#000000' }));
    expect(cytoscapeDataForEgaType('ega:cohort')).toEqual(expect.objectContaining({ shape: 'round-rectangle', fill: '#E1BEE7' }));
  });
});

describe('working draft utilities', () => {
  it('imports wrapped examples into shared draft schema/data/nodes/edges', () => {
    const source: WrappedExample = {
      schema: { $ref: 'https://example.org/dataset/schema.json' },
      data: {
        '@id': 'ega:EGAD1',
        '@type': 'ega:dataset',
        title: 'Dataset',
        hasPart: [{ '@id': 'ega:EGAF1', '@type': 'ega:datafile', fileName: 'reads.bam' }]
      }
    };
    const draft = draftFromWrappedExample(source, entities, 'example');
    expect(draft.schema).toEqual(source.schema);
    expect(draft.data).toEqual(source.data);
    expect(draft.builder.nodes.map((node) => node.id)).toEqual(['ega:EGAD1', 'ega:EGAF1']);
    expect(draft.builder.nodes.map((node) => node.sourcePath)).toEqual([[], ['hasPart', 0]]);
    expect(draft.builder.edges).toEqual([expect.objectContaining({ source: 'ega:EGAD1', target: 'ega:EGAF1', predicate: 'hasPart' })]);
  });

  it('keeps imported framed data as the validation payload after builder edits', () => {
    const source: WrappedExample = {
      schema: { $ref: 'https://example.org/dataset/schema.json' },
      data: {
        '@id': 'ega:EGAD1',
        '@type': 'ega:dataset',
        title: 'Dataset',
        hasPart: [{ '@id': 'ega:EGAF1', '@type': 'ega:datafile', fileName: 'reads.bam' }]
      }
    };
    const draft = draftFromWrappedExample(source, entities, 'example');
    const edited = withBuilderDraft(draft, {
      ...draft.builder,
      nodes: draft.builder.nodes.map((node) =>
        node.id === 'ega:EGAF1' ? { ...node, label: 'reads.cram', properties: { ...node.properties, fileName: 'reads.cram' } } : node
      )
    });

    const payload = draftToValidationPayload(edited);
    expect(payload.data).not.toHaveProperty('@graph');
    expect(payload.data).toEqual({
      '@id': 'ega:EGAD1',
      '@type': 'ega:dataset',
      title: 'Dataset',
      hasPart: [{ '@id': 'ega:EGAF1', '@type': 'ega:datafile', fileName: 'reads.cram' }]
    });
  });

  it('keeps unconnected builder nodes out of validation data', () => {
    const draft = createBlankWorkingDraft(entities[0]);
    const looseNode = {
      id: 'draft:datafile:loose',
      entity: 'datafile',
      egaType: 'ega:datafile',
      label: 'Loose file',
      properties: { '@type': 'ega:datafile', fileName: 'loose.bam' }
    };
    const edited = withBuilderDraft(draft, { nodes: [...draft.builder.nodes, looseNode], edges: [] });

    expect(draftToValidationPayload(edited).data).toEqual({ '@type': 'ega:dataset', label: 'Dataset 1' });
    expect(edited.builder.nodes.find((node) => node.id === looseNode.id)?.sourcePath).toBeUndefined();
  });

  it('adds connected builder nodes inside the framed validation structure', () => {
    const draft = createBlankWorkingDraft(entities[0]);
    const fileNode = {
      id: 'draft:datafile:1',
      entity: 'datafile',
      egaType: 'ega:datafile',
      label: 'reads.bam',
      properties: { '@type': 'ega:datafile', fileName: 'reads.bam' }
    };
    const edited = withBuilderDraft(draft, {
      nodes: [...draft.builder.nodes, fileNode],
      edges: [{ id: 'edge:1', source: draft.builder.nodes[0].id, target: fileNode.id, predicate: 'hasPart' }]
    });

    expect(draftToValidationPayload(edited).data).toEqual({
      '@type': 'ega:dataset',
      label: 'Dataset 1',
      hasPart: { '@type': 'ega:datafile', fileName: 'reads.bam' }
    });
    expect(edited.builder.nodes.find((node) => node.id === fileNode.id)?.sourcePath).toEqual(['hasPart']);
  });

  it('removes deleted builder relationships from framed validation data', () => {
    const source: WrappedExample = {
      schema: { $ref: 'https://example.org/dataset/schema.json' },
      data: {
        '@id': 'ega:EGAD1',
        '@type': 'ega:dataset',
        title: 'Dataset',
        hasPart: [{ '@id': 'ega:EGAF1', '@type': 'ega:datafile', fileName: 'reads.bam' }]
      }
    };
    const draft = draftFromWrappedExample(source, entities, 'example');
    const edited = withBuilderDraft(draft, { nodes: draft.builder.nodes, edges: [] });

    expect(draftToValidationPayload(edited).data).toEqual({
      '@id': 'ega:EGAD1',
      '@type': 'ega:dataset',
      title: 'Dataset'
    });
  });

  it('builds validation payloads from edited schema and data', () => {
    const draft = updateDraftSchemaAndData(createBlankWorkingDraft(entities[0]), { $ref: 'schema.json' }, { '@type': 'ega:dataset', title: 'Edited' });
    expect(draftToValidationPayload(draft)).toEqual({ schema: { $ref: 'schema.json' }, data: { '@type': 'ega:dataset', title: 'Edited' } });
  });

  it('rebuilds the builder projection from manually edited validation data', () => {
    const draft = updateDraftSchemaAndData(
      createBlankWorkingDraft(entities[0]),
      { $ref: 'schema.json' },
      {
        '@id': 'ega:EGAD2',
        '@type': 'ega:dataset',
        title: 'Edited',
        hasPart: [{ '@id': 'ega:EGAF2', '@type': 'ega:datafile', fileName: 'edited.bam' }]
      },
      entities
    );

    expect(draft.builder.nodes.map((node) => node.id)).toEqual(['ega:EGAD2', 'ega:EGAF2']);
    expect(draft.builder.edges).toEqual([expect.objectContaining({ source: 'ega:EGAD2', target: 'ega:EGAF2', predicate: 'hasPart' })]);
  });

  it('clears persisted working draft state', () => {
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    saveWorkingDraft(null);
    expect(remove).toHaveBeenCalledWith(WORKING_DRAFT_STORAGE_KEY);
  });
});
