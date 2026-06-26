export type ExampleCategory = 'valid' | 'invalid';

export interface ManifestAssetMap {
  source: string;
  expanded?: string;
  flattened?: string;
  framed?: string;
  nquads?: string;
  graph?: string;
  simpleGraph?: string;
  rdfGraph?: string;
}

export interface ManifestExample {
  id: string;
  entity: string;
  category: ExampleCategory;
  name: string;
  sourcePath: string;
  schemaRef: string;
  assets: ManifestAssetMap;
  warningCount: number;
}

export interface ManifestEntity {
  id: string;
  title: string;
  schemaPath: string;
  schemaRef: string;
  exampleCount: number;
}

export interface Manifest {
  generatedAt: string;
  schemaSource: {
    root: string;
    repository: string;
    ref: string;
  };
  entities: ManifestEntity[];
  categories: ExampleCategory[];
  examples: ManifestExample[];
}

export interface GraphNode {
  id: string;
  kind: 'iri' | 'blank' | 'literal';
  label: string;
  value?: string;
  compactValue?: string;
  datatype?: string;
  compactDatatype?: string;
  language?: string;
  types: string[];
  compactTypes: string[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  compactPredicate: string;
  objectKind: GraphNode['kind'];
}

export interface GraphAsset {
  nodes: GraphNode[];
  edges: GraphEdge[];
  warnings: string[];
}

export interface SimpleGraphNode {
  id: string;
  label: string;
  sourcePath: string;
  egaTypes: string[];
  compactTypes: string[];
  entityKind: string;
  searchableText: string;
  propertyCount: number;
  sourcePreview: Record<string, unknown>;
}

export interface SimpleGraphEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  compactPredicate: string;
  sourcePath: string;
  searchableText: string;
}

export interface SimpleGraphAsset {
  nodes: SimpleGraphNode[];
  edges: SimpleGraphEdge[];
  warnings: string[];
}

export interface EntityPropertySummary {
  name: string;
  title: string;
  description: string;
  required: boolean;
  kind: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'unknown';
  enum?: unknown[];
  relationship: boolean;
}

export interface EntitySummary {
  id: string;
  title: string;
  schemaPath: string;
  schemaRef: string;
  egaType: string;
  required: string[];
  properties: EntityPropertySummary[];
  relationshipFields: Array<{ name: string; compactPredicate: string }>;
}

export interface BuilderNode {
  id: string;
  entity: string;
  egaType: string;
  label: string;
  properties: Record<string, unknown>;
  sourcePath?: Array<string | number>;
}

export interface BuilderEdge {
  id: string;
  source: string;
  target: string;
  predicate: string;
  sourcePath?: Array<string | number>;
  relationshipPath?: Array<string | number>;
}

export interface BuilderDraft {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
}

export interface WorkingDraft {
  id: string;
  sourceLabel: string;
  schema: unknown;
  data: unknown;
  builder: BuilderDraft;
  updatedAt: string;
}

export interface WrappedExample {
  schema?: {
    $ref?: string;
    [key: string]: unknown;
  };
  data?: unknown;
  [key: string]: unknown;
}
