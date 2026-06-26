import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import jsonld from 'jsonld';
import {
  buildDocumentMap,
  buildEntitySummaries,
  discoverExamples,
  generatePlaygroundAssets,
  graphFromNQuads,
  makeLocalDocumentLoader,
  simpleGraphFromSource
} from '../scripts/build-playground-assets.mjs';

describe('playground asset generator', () => {
  it('discovers wrapped examples and isolates JSON-LD transform warnings', async () => {
    const root = await makeFixtureRepo();
    const outputDir = path.join(root, 'out');

    const { manifest, buildWarnings } = await generatePlaygroundAssets({
      schemaRoot: root,
      outputDir,
      schemaRepo: 'fixture',
      schemaRef: 'test'
    });

    expect(manifest.examples).toHaveLength(2);
    expect(manifest.entities).toEqual([
      expect.objectContaining({ id: 'thing', exampleCount: 2, schemaRef: expect.stringContaining('/schemas/entities/thing/schema.json') })
    ]);
    expect(buildWarnings.length).toBeGreaterThan(0);
    expect(buildWarnings.every((item) => item.exampleId.includes('broken'))).toBe(true);

    const good = manifest.examples.find((example) => example.name === 'thing-valid-minimal');
    expect(good.assets.source).toBe('generated/examples/thing-valid-thing-valid-minimal/source.json');
    expect(good.assets.expanded).toBeDefined();
    expect(good.assets.graph).toBeDefined();
    expect(good.assets.simpleGraph).toBe(good.assets.graph);
    expect(good.assets.rdfGraph).toBeDefined();

    const graph = JSON.parse(await fs.readFile(path.join(outputDir, 'examples', good.id, 'graph.json'), 'utf8'));
    expect(graph.nodes.map((node) => node.id)).toEqual(['entity:item1', 'entity:item2']);
    expect(graph.edges).toEqual([
      expect.objectContaining({ source: 'entity:item1', target: 'entity:item2', compactPredicate: 'hasPart' })
    ]);
    expect(graph.nodes.find((node) => node.id === 'entity:item1').searchableText).toContain('free form note');

    const rdfGraph = JSON.parse(await fs.readFile(path.join(outputDir, 'examples', good.id, 'rdf-graph.json'), 'utf8'));
    expect(rdfGraph.nodes.some((node) => node.kind === 'literal')).toBe(true);

    const summaries = JSON.parse(await fs.readFile(path.join(outputDir, 'entity-summaries.json'), 'utf8'));
    expect(summaries[0]).toEqual(expect.objectContaining({ id: 'thing', egaType: 'ega:thing' }));
    expect(summaries[0].properties.map((property) => property.name)).toContain('label');
  });

  it('uses a local JSON-LD document loader instead of remote context fetching', async () => {
    const root = await makeFixtureRepo();
    const documentMap = await buildDocumentMap(root);
    const loader = makeLocalDocumentLoader(documentMap);
    const schemaUrl = 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json';

    const remoteContext = await loader(schemaUrl);
    expect(remoteContext.document['@context']).toBe('./context.jsonld');

    const expanded = await jsonld.expand(
      {
        '@context': schemaUrl,
        '@id': 'entity:item1',
        '@type': 'entity:Thing',
        label: 'Alpha'
      },
      { documentLoader: loader }
    );
    expect(expanded[0]['http://schema.org/name'][0]['@value']).toBe('Alpha');
  });

  it('converts N-Quads into graph nodes and predicate edges', () => {
    const graph = graphFromNQuads(
      [
        '<https://example.org/s> <http://schema.org/name> "Alpha" .',
        '<https://example.org/s> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://example.org/Thing> .'
      ].join('\n'),
      { compactIri: (iri) => iri.replace('http://schema.org/', 'schema:') }
    );

    expect(graph.nodes.some((node) => node.kind === 'literal' && node.value === 'Alpha')).toBe(true);
    expect(graph.edges.map((edge) => edge.compactPredicate)).toContain('schema:name');
    expect(graph.nodes.find((node) => node.id === 'https://example.org/s').types).toContain('https://example.org/Thing');
  });

  it('extracts simplified EGA entity graphs from source JSON only', () => {
    const graph = simpleGraphFromSource(
      {
        '@id': 'ega:EGAD1',
        '@type': ['ega:dataset', 'dcat:Dataset'],
        title: 'Dataset title',
        measurementTechnique: { id: 'EFO:1', label: 'Sequencing' },
        hasPart: [
          {
            '@id': 'ega:EGAF1',
            '@type': 'ega:datafile',
            fileName: 'reads.bam'
          }
        ],
        dcat: {
          '@id': 'https://example.org/distribution',
          '@type': 'dcat:Distribution',
          label: 'Non EGA node'
        }
      },
      { compactIri: (iri) => iri }
    );

    expect(graph.nodes.map((node) => node.id)).toEqual(['ega:EGAD1', 'ega:EGAF1']);
    expect(graph.edges).toEqual([expect.objectContaining({ source: 'ega:EGAD1', target: 'ega:EGAF1', predicate: 'hasPart' })]);
    expect(graph.nodes.find((node) => node.id === 'ega:EGAD1').searchableText).toContain('measurementtechnique');
    expect(graph.nodes.find((node) => node.id === 'ega:EGAD1').searchableText).toContain('dataset title');
  });

  it('writes entity summaries from schemas', async () => {
    const root = await makeFixtureRepo();
    const summaries = await buildEntitySummaries(path.join(root, 'schemas', 'entities'), root);
    expect(summaries[0].properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'label', kind: 'string', required: true }),
        expect.objectContaining({ name: 'hasPart', kind: 'array', relationship: true })
      ])
    );
  });

  it('discovers examples from entity/category directories', async () => {
    const root = await makeFixtureRepo();
    const examples = await discoverExamples(path.join(root, 'schemas', 'entities'), root);
    expect(examples.map((example) => example.sourcePath)).toEqual([
      'schemas/entities/thing/examples/valid/thing-valid-minimal.json',
      'schemas/entities/thing/examples/invalid/thing-invalid-broken.json'
    ]);
  });
});

async function makeFixtureRepo() {
  const root = await fs.mkdtemp('/tmp/fega-playground-');
  await writeJson(path.join(root, 'schemas', 'common', 'context.jsonld'), {
    '@context': {
      schema: 'http://schema.org/',
      entity: 'https://example.org/entity/',
      ega: 'https://example.org/ega/',
      label: 'schema:name'
    }
  });
  await writeJson(path.join(root, 'schemas', 'entities', 'thing', 'schema.json'), {
    $id: 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json',
    '@context': './context.jsonld',
    type: 'object',
    required: ['label'],
    properties: {
      label: { type: 'string', title: 'Label' },
      description: { type: 'string' },
      hasPart: { type: 'array', items: { type: 'object' } }
    }
  });
  await writeJson(path.join(root, 'schemas', 'entities', 'thing', 'context.jsonld'), {
    '@context': ['../../common/context.jsonld', { entityDoc: 'entity:thing/schema.json#', thingType: 'entityDoc:thingType' }]
  });
  await writeJson(path.join(root, 'schemas', 'entities', 'thing', 'frame.jsonld'), {
    '@context': 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json',
    '@type': 'ega:thing'
  });
  await writeJson(path.join(root, 'schemas', 'entities', 'thing', 'examples', 'valid', 'thing-valid-minimal.json'), {
    schema: {
      $ref: 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json'
    },
    data: {
      '@context': 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json',
      '@id': 'entity:item1',
        '@type': 'ega:thing',
      label: 'Alpha',
      description: 'Free form note',
      thingType: 'Sample',
      hasPart: [
        {
          '@id': 'entity:item2',
          '@type': 'ega:thing',
          label: 'Child'
        }
      ],
      ontologyTerm: {
        id: 'EFO:0001',
        label: 'Not an EGA node'
      }
    }
  });
  await writeJson(path.join(root, 'schemas', 'entities', 'thing', 'examples', 'invalid', 'thing-invalid-broken.json'), {
    schema: {
      $ref: 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/schemas/entities/thing/schema.json'
    },
    data: {
      '@context': 'https://unknown.example/context.jsonld',
      '@id': 'entity:item2',
      label: 'Broken'
    }
  });
  return root;
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
