#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import jsonld from 'jsonld';
import { Parser } from 'n3';

const DEFAULT_SCHEMA_REPO = 'https://github.com/M-casado/fega-metadata-schema.git';
const DEFAULT_SCHEMA_REF = 'main';
const RAW_PREFIX = 'https://raw.githubusercontent.com/M-casado/fega-metadata-schema/main/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const EGA_TYPE_PREFIX = 'ega:';
const RELATIONSHIP_TERMS = new Set([
  'hasPart',
  'isPartOf',
  'used',
  'generated',
  'wasGeneratedBy',
  'wasDerivedFrom',
  'hadMember',
  'hadProtocolCollection',
  'hadPlan',
  'sameAs'
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export function parseArgs(argv) {
  const args = {
    schemaRoot: process.env.FEGA_SCHEMA_ROOT || '',
    schemaRepo: process.env.FEGA_SCHEMA_REPO || DEFAULT_SCHEMA_REPO,
    schemaRef: process.env.FEGA_SCHEMA_REF || DEFAULT_SCHEMA_REF,
    outputDir: path.join(REPO_ROOT, 'public', 'generated'),
    noClone: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--schema-root' && next) {
      args.schemaRoot = next;
      index += 1;
    } else if (arg === '--schema-repo' && next) {
      args.schemaRepo = next;
      index += 1;
    } else if (arg === '--schema-ref' && next) {
      args.schemaRef = next;
      index += 1;
    } else if (arg === '--output-dir' && next) {
      args.outputDir = next;
      index += 1;
    } else if (arg === '--no-clone') {
      args.noClone = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (!args.schemaRoot) {
    args.schemaRoot = path.join(REPO_ROOT, '.cache', 'fega-metadata-schema');
  }
  return args;
}

export async function ensureSchemaRoot(args) {
  const schemaRoot = path.resolve(args.schemaRoot);
  const stat = await statSafe(schemaRoot);
  if (stat?.isDirectory()) {
    return schemaRoot;
  }
  if (args.noClone) {
    throw new Error(`Schema root does not exist: ${schemaRoot}`);
  }
  await fs.mkdir(path.dirname(schemaRoot), { recursive: true });
  execFileSync('git', ['clone', '--depth', '1', '--branch', args.schemaRef, args.schemaRepo, schemaRoot], {
    stdio: 'inherit'
  });
  return schemaRoot;
}

export async function generatePlaygroundAssets(options) {
  const schemaRoot = path.resolve(options.schemaRoot);
  const outputDir = path.resolve(options.outputDir);
  const entityRoot = path.join(schemaRoot, 'schemas', 'entities');
  const documentMap = await buildDocumentMap(schemaRoot);
  const compactor = await buildCompactor(schemaRoot);
  const documentLoader = makeLocalDocumentLoader(documentMap);
  const examples = await discoverExamples(entityRoot, schemaRoot);
  const entitySummaries = await buildEntitySummaries(entityRoot, schemaRoot);
  const manifestExamples = [];
  const buildWarnings = [];

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });

  for (const example of examples) {
    const warnings = [];
    const exampleDir = path.join(outputDir, 'examples', example.id);
    await fs.mkdir(exampleDir, { recursive: true });
    const source = await readJson(example.path);
    const data = isWrappedExample(source) ? source.data : source;
    const schemaRef = isWrappedExample(source) ? source.schema?.$ref : example.schemaRef;
    const framePath = path.join(example.entityDir, 'frame.jsonld');
    const frameExists = Boolean(await statSafe(framePath));
    const assets = {
      source: `generated/examples/${example.id}/source.json`
    };

    await writeJson(path.join(exampleDir, 'source.json'), source);

    const transformInput = cloneJson(data);
    let expanded = null;
    let flattened = null;
    let framed = null;
    let nquads = '';
    let rdfGraph = emptyGraph([`JSON-LD transforms did not run for ${example.id}.`]);
    const simpleGraph = simpleGraphFromSource(transformInput, compactor);

    try {
      expanded = await jsonld.expand(transformInput, { documentLoader });
      await writeJson(path.join(exampleDir, 'expanded.json'), expanded);
      assets.expanded = `generated/examples/${example.id}/expanded.json`;
    } catch (error) {
      warnings.push(warning(example, 'expanded', error));
    }

    try {
      flattened = await jsonld.flatten(transformInput, null, { documentLoader });
      await writeJson(path.join(exampleDir, 'flattened.json'), flattened);
      assets.flattened = `generated/examples/${example.id}/flattened.json`;
    } catch (error) {
      warnings.push(warning(example, 'flattened', error));
    }

    if (frameExists) {
      try {
        const frame = await readJson(framePath);
        framed = await jsonld.frame(transformInput, frame, { documentLoader });
        await writeJson(path.join(exampleDir, 'framed.json'), framed);
        assets.framed = `generated/examples/${example.id}/framed.json`;
      } catch (error) {
        warnings.push(warning(example, 'framed', error));
      }
    }

    try {
      nquads = await jsonld.toRDF(transformInput, { format: 'application/n-quads', documentLoader });
      await fs.writeFile(path.join(exampleDir, 'nquads.txt'), nquads, 'utf8');
      assets.nquads = `generated/examples/${example.id}/nquads.txt`;
      rdfGraph = graphFromNQuads(nquads, compactor);
    } catch (error) {
      warnings.push(warning(example, 'nquads', error));
      rdfGraph = emptyGraph([messageOf(error)]);
    }

    simpleGraph.warnings.push(...warnings.map((item) => `${item.stage}: ${item.message}`));
    rdfGraph.warnings.push(...warnings.map((item) => `${item.stage}: ${item.message}`));
    await writeJson(path.join(exampleDir, 'graph.json'), simpleGraph);
    await writeJson(path.join(exampleDir, 'rdf-graph.json'), rdfGraph);
    assets.graph = `generated/examples/${example.id}/graph.json`;
    assets.simpleGraph = `generated/examples/${example.id}/graph.json`;
    assets.rdfGraph = `generated/examples/${example.id}/rdf-graph.json`;

    if (warnings.length > 0) {
      buildWarnings.push(...warnings);
    }

    manifestExamples.push({
      id: example.id,
      entity: example.entity,
      category: example.category,
      name: example.name,
      sourcePath: example.sourcePath,
      schemaRef,
      assets,
      warningCount: warnings.length
    });
  }

  const entityMap = new Map();
  for (const example of manifestExamples) {
    if (!entityMap.has(example.entity)) {
      entityMap.set(example.entity, {
        id: example.entity,
        title: titleForEntity(example.entity),
        schemaPath: `schemas/entities/${example.entity}/schema.json`,
        schemaRef: example.schemaRef,
        exampleCount: 0
      });
    }
    entityMap.get(example.entity).exampleCount += 1;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    schemaSource: {
      root: schemaRoot,
      repository: options.schemaRepo || DEFAULT_SCHEMA_REPO,
      ref: options.schemaRef || DEFAULT_SCHEMA_REF
    },
    entities: [...entityMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    categories: ['valid', 'invalid'],
    examples: manifestExamples
  };

  await writeJson(path.join(outputDir, 'manifest.json'), manifest);
  await writeJson(path.join(outputDir, 'build-warnings.json'), buildWarnings);
  await writeJson(path.join(outputDir, 'entity-summaries.json'), entitySummaries);

  return { manifest, buildWarnings, entitySummaries };
}

export async function discoverExamples(entityRoot, schemaRoot) {
  const entities = await listDirs(entityRoot);
  const examples = [];

  for (const entityDir of entities) {
    const schemaPath = path.join(entityDir, 'schema.json');
    if (!(await statSafe(schemaPath))) {
      continue;
    }
    const schema = await readJson(schemaPath);
    const entity = path.basename(entityDir);
    const schemaRef = schema.$id || rawUrl(schemaRoot, schemaPath);

    for (const category of ['valid', 'invalid']) {
      const categoryDir = path.join(entityDir, 'examples', category);
      if (!(await statSafe(categoryDir))) {
        continue;
      }
      const files = (await fs.readdir(categoryDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(categoryDir, entry.name))
        .sort();
      for (const file of files) {
        const name = path.basename(file, '.json');
        examples.push({
          id: `${entity}-${category}-${slugify(name)}`,
          entity,
          category,
          name,
          path: file,
          entityDir,
          sourcePath: slash(path.relative(schemaRoot, file)),
          schemaRef
        });
      }
    }
  }
  return examples;
}

export async function buildDocumentMap(schemaRoot) {
  const files = await walkFiles(schemaRoot);
  const map = new Map();

  for (const file of files) {
    if (!/\.(json|jsonld)$/i.test(file)) {
      continue;
    }
    const url = rawUrl(schemaRoot, file);
    map.set(url, file);
    try {
      const doc = await readJson(file);
      if (doc && typeof doc === 'object' && typeof doc.$id === 'string') {
        map.set(doc.$id, file);
      }
    } catch {
      // Non-JSON or malformed files are irrelevant to JSON-LD context loading.
    }
  }

  return map;
}

export function makeLocalDocumentLoader(documentMap) {
  return async (url) => {
    const cleanUrl = stripHash(url);
    const file = documentMap.get(url) || documentMap.get(cleanUrl);
    if (!file) {
      throw new Error(`Cannot load JSON-LD document locally: ${url}`);
    }
    return {
      contextUrl: null,
      documentUrl: url,
      document: await readJson(file)
    };
  };
}

export async function buildCompactor(schemaRoot) {
  const files = await walkFiles(schemaRoot);
  const contextFiles = files.filter((file) => file.endsWith('context.jsonld'));
  const prefixes = new Map([
    ['rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'],
    ['rdfs', 'http://www.w3.org/2000/01/rdf-schema#'],
    ['xsd', 'http://www.w3.org/2001/XMLSchema#']
  ]);
  const terms = new Map();
  const rawContexts = [];

  for (const file of contextFiles) {
    try {
      const doc = await readJson(file);
      rawContexts.push(doc['@context']);
      collectPrefixes(doc['@context'], prefixes);
    } catch {
      // The transform path will surface malformed contexts where they matter.
    }
  }
  for (const context of rawContexts) {
    collectTerms(context, prefixes, terms);
  }

  return {
    compactIri(iri) {
      if (!iri || typeof iri !== 'string') {
        return iri;
      }
      if (terms.has(iri)) {
        return terms.get(iri);
      }
      let best = null;
      for (const [prefix, base] of prefixes) {
        if (iri.startsWith(base) && (!best || base.length > best.base.length)) {
          best = { prefix, base };
        }
      }
      return best ? `${best.prefix}:${iri.slice(best.base.length)}` : iri;
    }
  };
}

export async function buildEntitySummaries(entityRoot, schemaRoot) {
  const summaries = [];
  for (const entityDir of await listDirs(entityRoot)) {
    const schemaPath = path.join(entityDir, 'schema.json');
    if (!(await statSafe(schemaPath))) {
      continue;
    }
    const schema = await readJson(schemaPath);
    const entity = path.basename(entityDir);
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const properties = flattenTopLevelProperties(schema).map(([name, definition]) => ({
      name,
      title: typeof definition?.title === 'string' ? definition.title : titleForEntity(name),
      description: typeof definition?.description === 'string' ? definition.description : '',
      required: required.has(name),
      kind: propertyKind(definition),
      enum: Array.isArray(definition?.enum) ? definition.enum : undefined,
      relationship: RELATIONSHIP_TERMS.has(name)
    }));
    const relationshipFields = properties
      .filter((property) => property.relationship)
      .map((property) => ({ name: property.name, compactPredicate: property.name }));
    summaries.push({
      id: entity,
      title: schema.title || titleForEntity(entity),
      schemaPath: slash(path.relative(schemaRoot, schemaPath)),
      schemaRef: schema.$id || rawUrl(schemaRoot, schemaPath),
      egaType: `ega:${entity}`,
      required: [...required],
      properties,
      relationshipFields
    });
  }
  return summaries.sort((a, b) => a.id.localeCompare(b.id));
}

export function graphFromNQuads(nquads, compactor) {
  const parser = new Parser({ format: 'N-Quads' });
  const quads = parser.parse(nquads);
  const nodes = new Map();
  const edges = [];

  for (const quad of quads) {
    const subject = nodeFromTerm(quad.subject, compactor);
    nodes.set(subject.id, { ...nodes.get(subject.id), ...subject });

    const object = nodeFromTerm(quad.object, compactor, edges.length);
    nodes.set(object.id, { ...nodes.get(object.id), ...object });

    const predicate = quad.predicate.value;
    const edge = {
      id: `e${edges.length}`,
      source: subject.id,
      target: object.id,
      predicate,
      compactPredicate: compactor.compactIri(predicate),
      objectKind: object.kind
    };
    edges.push(edge);

    if (predicate === RDF_TYPE && object.kind !== 'literal') {
      const existing = nodes.get(subject.id);
      existing.types = [...new Set([...(existing.types || []), object.value])];
      existing.compactTypes = existing.types.map((type) => compactor.compactIri(type));
      nodes.set(subject.id, existing);
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
    warnings: []
  };
}

export function simpleGraphFromSource(data, compactor) {
  const nodes = new Map();
  const edges = [];
  const warnings = [];

  function visit(value, currentPath = '$', nearestEgaNodeId = null, incomingPredicate = '') {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${currentPath}[${index}]`, nearestEgaNodeId, incomingPredicate));
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }

    const isEga = hasEgaType(value);
    let activeEgaNodeId = nearestEgaNodeId;
    if (isEga) {
      const node = simpleNodeFromObject(value, currentPath, compactor);
      nodes.set(node.id, nodes.has(node.id) ? mergeSimpleNode(nodes.get(node.id), node) : node);
      if (nearestEgaNodeId && nearestEgaNodeId !== node.id && RELATIONSHIP_TERMS.has(incomingPredicate)) {
        edges.push({
          id: `se${edges.length}`,
          source: nearestEgaNodeId,
          target: node.id,
          predicate: incomingPredicate,
          compactPredicate: compactor.compactIri(incomingPredicate),
          sourcePath: currentPath,
          searchableText: searchableText([incomingPredicate, compactor.compactIri(incomingPredicate), nearestEgaNodeId, node.id])
        });
      }
      activeEgaNodeId = node.id;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === '@context') {
        continue;
      }
      visit(child, `${currentPath}/${key}`, activeEgaNodeId, key);
    }
  }

  visit(data);
  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges,
    warnings
  };
}

function simpleNodeFromObject(value, sourcePath, compactor) {
  const egaTypes = asArray(value['@type']).filter((type) => typeof type === 'string' && type.startsWith(EGA_TYPE_PREFIX));
  const id = typeof value['@id'] === 'string' && value['@id'] ? value['@id'] : `generated:${hash(sourcePath)}`;
  const compactId = compactor.compactIri(id);
  const label = firstString(value.label, value.title, value.name, value.fileName) || compactId || egaTypes[0] || id;
  const compactTypes = egaTypes.map((type) => compactor.compactIri(type));
  const searchParts = [];
  collectSearchable(value, searchParts);
  searchParts.push(id, compactId, label, sourcePath, ...egaTypes, ...compactTypes);
  return {
    id,
    label,
    sourcePath,
    egaTypes,
    compactTypes,
    entityKind: compactTypes[0] || egaTypes[0] || 'ega:entity',
    searchableText: searchableText(searchParts),
    propertyCount: Object.keys(value).filter((key) => !key.startsWith('@')).length,
    sourcePreview: previewObject(value)
  };
}

function mergeSimpleNode(existing, incoming) {
  return {
    ...existing,
    label: existing.label || incoming.label,
    sourcePath: existing.sourcePath || incoming.sourcePath,
    egaTypes: [...new Set([...(existing.egaTypes || []), ...(incoming.egaTypes || [])])],
    compactTypes: [...new Set([...(existing.compactTypes || []), ...(incoming.compactTypes || [])])],
    searchableText: searchableText([existing.searchableText, incoming.searchableText]),
    propertyCount: Math.max(existing.propertyCount || 0, incoming.propertyCount || 0),
    sourcePreview: { ...incoming.sourcePreview, ...existing.sourcePreview }
  };
}

function nodeFromTerm(term, compactor, salt = 0) {
  if (term.termType === 'Literal') {
    const datatype = term.datatype?.value || XSD_STRING;
    const language = term.language || '';
    const value = term.value;
    const id = `literal:${hash(`${value}|${datatype}|${language}|${salt}`)}`;
    return {
      id,
      kind: 'literal',
      label: truncate(value, 64),
      value,
      datatype,
      compactDatatype: compactor.compactIri(datatype),
      language,
      types: [],
      compactTypes: []
    };
  }

  const value = term.value;
  const kind = term.termType === 'BlankNode' ? 'blank' : 'iri';
  return {
    id: kind === 'blank' ? `_:${value}` : value,
    kind,
    label: kind === 'blank' ? `_:${value}` : compactor.compactIri(value),
    value,
    compactValue: kind === 'blank' ? `_:${value}` : compactor.compactIri(value),
    types: [],
    compactTypes: []
  };
}

function collectPrefixes(context, prefixes) {
  if (Array.isArray(context)) {
    context.forEach((item) => collectPrefixes(item, prefixes));
    return;
  }
  if (!context || typeof context !== 'object') {
    return;
  }
  for (const [key, definition] of Object.entries(context)) {
    if (key.startsWith('@')) {
      continue;
    }
    const iri = typeof definition === 'string' ? definition : definition?.['@id'];
    if (typeof iri === 'string' && /[#/:]$/.test(iri)) {
      prefixes.set(key, expandCurie(iri, prefixes));
    }
  }
}

function collectTerms(context, prefixes, terms) {
  if (Array.isArray(context)) {
    context.forEach((item) => collectTerms(item, prefixes, terms));
    return;
  }
  if (!context || typeof context !== 'object') {
    return;
  }
  for (const [term, definition] of Object.entries(context)) {
    if (term.startsWith('@')) {
      continue;
    }
    const iri = typeof definition === 'string' ? definition : definition?.['@id'];
    if (typeof iri === 'string' && !/[#/:]$/.test(iri)) {
      terms.set(expandCurie(iri, prefixes), term);
    }
  }
}

function flattenTopLevelProperties(schema) {
  const seen = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') {
      return;
    }
    if (value.properties && typeof value.properties === 'object') {
      for (const [name, definition] of Object.entries(value.properties)) {
        if (!seen.has(name) && !name.startsWith('@')) {
          seen.set(name, definition);
        }
      }
    }
    for (const key of ['allOf', 'anyOf', 'oneOf']) {
      if (Array.isArray(value[key])) {
        value[key].forEach(visit);
      }
    }
  }
  visit(schema);
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function propertyKind(definition) {
  if (!definition || typeof definition !== 'object') {
    return 'unknown';
  }
  if (definition.type === 'array' || definition.items) {
    return 'array';
  }
  if (definition.type === 'object' || definition.properties || definition.allOf || definition.anyOf || definition.oneOf) {
    return 'object';
  }
  if (definition.type === 'integer' || definition.type === 'number') {
    return 'number';
  }
  if (definition.type === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

function hasEgaType(value) {
  return asArray(value?.['@type']).some((type) => typeof type === 'string' && type.startsWith(EGA_TYPE_PREFIX));
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (Array.isArray(value)) {
      const match = value.find((item) => typeof item === 'string' && item.trim());
      if (match) {
        return match;
      }
    }
  }
  return '';
}

function collectSearchable(value, output) {
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

function searchableText(parts) {
  return [...new Set(parts.filter(Boolean).map((part) => String(part).toLowerCase()))].join(' ');
}

function previewObject(value) {
  const preview = {};
  for (const key of ['@id', '@type', 'label', 'title', 'name', 'fileName', 'description']) {
    if (value[key] !== undefined) {
      preview[key] = value[key];
    }
  }
  return preview;
}

function expandCurie(value, prefixes) {
  if (/^https?:\/\//.test(value)) {
    return value;
  }
  const [prefix, suffix] = value.split(':', 2);
  if (suffix !== undefined && prefixes.has(prefix)) {
    return `${prefixes.get(prefix)}${suffix}`;
  }
  return value;
}

async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        await visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  await visit(root);
  return files.sort();
}

async function listDirs(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name)).sort();
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function statSafe(file) {
  try {
    return await fs.stat(file);
  } catch {
    return null;
  }
}

function isWrappedExample(value) {
  return Boolean(value && typeof value === 'object' && value.schema && value.data);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawUrl(root, file) {
  return `${RAW_PREFIX}${slash(path.relative(root, file))}`;
}

function slash(value) {
  return value.split(path.sep).join('/');
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function hash(value) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
}

function stripHash(value) {
  return value.split('#')[0];
}

function truncate(value, length) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function titleForEntity(entity) {
  return entity.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`);
}

function warning(example, stage, error) {
  return {
    exampleId: example.id,
    entity: example.entity,
    category: example.category,
    sourcePath: example.sourcePath,
    stage,
    message: messageOf(error)
  };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function emptyGraph(warnings = []) {
  return { nodes: [], edges: [], warnings };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const schemaRoot = await ensureSchemaRoot(args);
    const { manifest, buildWarnings } = await generatePlaygroundAssets({ ...args, schemaRoot });
    console.log(`Generated ${manifest.examples.length} examples from ${schemaRoot}`);
    if (buildWarnings.length > 0) {
      console.warn(`Generated with ${buildWarnings.length} warning(s). See public/generated/build-warnings.json`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
