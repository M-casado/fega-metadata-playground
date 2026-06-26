import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Copy, Download, LayoutDashboard, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createBlankWorkingDraft, draftFromWrappedExample, draftToJsonLd, emptyBuilderDraft, withBuilderDraft } from '../lib/draft';
import { formatJson, loadJsonAsset } from '../lib/examples';
import { cytoscapeDataForEgaType } from '../lib/fegaStyles';
import type { BuilderDraft, BuilderEdge, BuilderNode, EntityPropertySummary, EntitySummary, ManifestExample, WorkingDraft, WrappedExample } from '../lib/types';

interface SubmissionBuilderProps {
  entities: EntitySummary[];
  selectedExample: ManifestExample | null;
  draft: WorkingDraft | null;
  onDraftChange: (draft: WorkingDraft | null) => void;
}

export function SubmissionBuilder({ entities, selectedExample, draft, onDraftChange }: SubmissionBuilderProps) {
  const builder = draft?.builder || emptyBuilderDraft();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(builder.nodes[0]?.id || null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [newEntity, setNewEntity] = useState(entities[0]?.id || '');
  const [edgeSource, setEdgeSource] = useState('');
  const [edgeTarget, setEdgeTarget] = useState('');
  const [edgePredicate, setEdgePredicate] = useState('hasPart');
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!newEntity && entities[0]) {
      setNewEntity(entities[0].id);
    }
  }, [entities, newEntity]);

  useEffect(() => {
    if (selectedNodeId && !builder.nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(builder.nodes[0]?.id || null);
    }
    if (selectedEdgeId && !builder.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [builder, selectedEdgeId, selectedNodeId]);

  const selectedNode = builder.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = builder.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedEntity = selectedNode ? entities.find((entity) => entity.id === selectedNode.entity) || null : null;
  const relationshipPredicates = useMemo(
    () => [...new Set(entities.flatMap((entity) => entity.relationshipFields.map((field) => field.name)).concat(['hasPart', 'isPartOf', 'used', 'generated', 'wasGeneratedBy', 'hadMember']))].sort(),
    [entities]
  );
  const validationPreview = useMemo(() => formatJson(draft?.data ?? {}), [draft?.data]);
  const graphPreview = useMemo(() => formatJson(draftToJsonLd(builder)), [builder]);
  const unrepresentedNodes = useMemo(() => builder.nodes.filter((node) => !node.sourcePath).length, [builder.nodes]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }
    const elements: ElementDefinition[] = [
      ...builder.nodes.map((node) => ({
        data: {
          id: node.id,
          label: `${node.label}\n${node.egaType}`,
          kind: node.entity,
          ...cytoscapeDataForEgaType(node.egaType)
        }
      })),
      ...builder.edges.map((edge) => ({
        data: { id: edge.id, source: edge.source, target: edge.target, label: edge.predicate }
      }))
    ];
    const cy =
      cyRef.current ||
      cytoscape({
        container: containerRef.current,
        minZoom: 0.2,
        maxZoom: 3,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(label)',
              shape: 'data(shape)',
              'background-color': 'data(fill)',
              'border-color': 'data(stroke)',
              'border-width': 'data(borderWidth)',
              'border-style': 'data(borderStyle)',
              color: '#172026',
              'font-size': '10px',
              'text-wrap': 'wrap',
              'text-max-width': '130px',
              'text-valign': 'bottom',
              'text-margin-y': 8,
              width: '42px',
              height: '42px'
            }
          },
          {
            selector: 'edge',
            style: {
              width: '1.8px',
              'curve-style': 'bezier',
              'target-arrow-shape': 'triangle',
              'line-color': '#8b9ba3',
              'target-arrow-color': '#8b9ba3',
              label: 'data(label)',
              'font-size': '9px',
              color: '#34434a',
              'text-background-color': '#f7f3ea',
              'text-background-opacity': 0.9,
              'text-background-padding': '2px'
            }
          },
          { selector: ':selected', style: { 'border-width': '4px', 'border-color': '#111827', 'line-color': '#111827' } }
        ] as unknown as cytoscape.StylesheetCSS[]
      });
    cyRef.current = cy;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: 'breadthfirst', animate: false, padding: 30 }).run();
    cy.removeAllListeners();
    cy.on('tap', 'node', (event) => {
      setSelectedNodeId(event.target.id());
      setSelectedEdgeId(null);
    });
    cy.on('tap', 'edge', (event) => {
      setSelectedEdgeId(event.target.id());
      setSelectedNodeId(null);
    });
    return () => undefined;
  }, [builder]);

  useEffect(
    () => () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    },
    []
  );

  function commitBuilder(nextBuilder: BuilderDraft) {
    try {
      onDraftChange(withBuilderDraft(draft, nextBuilder));
    } catch (reason) {
      setImportError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function ensureDraftWithEntity(entity: EntitySummary): WorkingDraft {
    return draft || createBlankWorkingDraft(entity);
  }

  function addNode() {
    const entity = entities.find((item) => item.id === newEntity) || entities[0];
    if (!entity) {
      return;
    }
    if (!draft) {
      const newDraft = createBlankWorkingDraft(entity);
      onDraftChange(newDraft);
      setSelectedNodeId(newDraft.builder.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      return;
    }
    const baseDraft = ensureDraftWithEntity(entity);
    const baseBuilder = baseDraft.builder;
    const count = baseBuilder.nodes.filter((node) => node.entity === entity.id).length + 1;
    const node: BuilderNode = {
      id: `draft:${entity.id}:${Date.now()}`,
      entity: entity.id,
      egaType: entity.egaType,
      label: `${cleanEntityTitle(entity.title)} ${count}`,
      properties: {
        '@type': entity.egaType,
        label: `${cleanEntityTitle(entity.title)} ${count}`
      }
    };
    onDraftChange(withBuilderDraft(baseDraft, { ...baseBuilder, nodes: [...baseBuilder.nodes, node] }, baseDraft.sourceLabel));
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function duplicateNode() {
    if (!selectedNode) {
      return;
    }
    const copy = {
      ...selectedNode,
      id: `draft:${selectedNode.entity}:${Date.now()}`,
      label: `${selectedNode.label} copy`,
      properties: { ...selectedNode.properties }
    };
    commitBuilder({ ...builder, nodes: [...builder.nodes, copy] });
    setSelectedNodeId(copy.id);
  }

  function deleteSelection() {
    if (selectedEdgeId) {
      commitBuilder({ ...builder, edges: builder.edges.filter((edge) => edge.id !== selectedEdgeId) });
      setSelectedEdgeId(null);
      return;
    }
    if (selectedNodeId) {
      commitBuilder({
        nodes: builder.nodes.filter((node) => node.id !== selectedNodeId),
        edges: builder.edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId)
      });
      setSelectedNodeId(null);
    }
  }

  function addEdge() {
    if (!edgeSource || !edgeTarget || edgeSource === edgeTarget) {
      return;
    }
    commitBuilder({
      ...builder,
      edges: [...builder.edges, { id: `edge:${Date.now()}`, source: edgeSource, target: edgeTarget, predicate: edgePredicate }]
    });
  }

  function updateNodeProperty(property: EntityPropertySummary, rawValue: string) {
    if (!selectedNode) {
      return;
    }
    const value = parsePropertyValue(property, rawValue);
    const nodes = builder.nodes.map((node) =>
      node.id === selectedNode.id
        ? {
            ...node,
            label: property.name === 'label' || property.name === 'title' || property.name === 'name' ? String(value || node.label) : node.label,
            properties: { ...node.properties, [property.name]: value }
          }
        : node
    );
    commitBuilder({ ...builder, nodes });
  }

  function updateEdge(field: keyof BuilderEdge, value: string) {
    if (!selectedEdge) {
      return;
    }
    commitBuilder({
      ...builder,
      edges: builder.edges.map((edge) => (edge.id === selectedEdge.id ? { ...edge, [field]: value } : edge))
    });
  }

  async function importExample() {
    if (!selectedExample) {
      return;
    }
    setImportError('');
    setImportMessage('');
    try {
      const source = await loadJsonAsset<WrappedExample>(selectedExample.assets.source);
      const imported = draftFromWrappedExample(source, entities, selectedExample.name);
      onDraftChange(imported);
      setSelectedNodeId(imported.builder.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      setImportMessage(`Imported ${imported.builder.nodes.length} node(s) from ${selectedExample.name}.`);
    } catch (reason) {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setImportError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  return (
    <section className="builderLayout">
      <div className="builderMain">
        <div className="draftStateBar">
          <strong>{draft ? 'Editing working draft' : 'Viewing repository example'}</strong>
          <span>{draft?.sourceLabel || selectedExample?.name || 'No example selected'}</span>
          <button className="secondaryButton" type="button" onClick={() => onDraftChange(null)} disabled={!draft}>
            Clear draft
          </button>
        </div>
        <div className="graphToolbar">
          <label>
            Add entity
            <select value={newEntity} onChange={(event) => setNewEntity(event.target.value)}>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.title}
                </option>
              ))}
            </select>
          </label>
          <button className="primaryButton" type="button" onClick={addNode}>
            <Plus size={16} aria-hidden="true" />
            Add node
          </button>
          <button className="secondaryButton" type="button" onClick={duplicateNode} disabled={!selectedNode}>
            <Copy size={16} aria-hidden="true" />
            Duplicate
          </button>
          <button className="secondaryButton" type="button" onClick={deleteSelection} disabled={!selectedNode && !selectedEdge}>
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </button>
          <button className="iconButton" type="button" title="Auto layout" onClick={() => cyRef.current?.layout({ name: 'breadthfirst', animate: true }).run()}>
            <LayoutDashboard size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="fieldRow">
          <label>
            Source
            <select value={edgeSource} onChange={(event) => setEdgeSource(event.target.value)}>
              <option value="">Choose source</option>
              {builder.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Predicate
            <select value={edgePredicate} onChange={(event) => setEdgePredicate(event.target.value)}>
              {relationshipPredicates.map((predicate) => (
                <option key={predicate} value={predicate}>
                  {predicate}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target
            <select value={edgeTarget} onChange={(event) => setEdgeTarget(event.target.value)}>
              <option value="">Choose target</option>
              {builder.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
            </select>
          </label>
          <button className="secondaryButton" type="button" onClick={addEdge}>
            Connect
          </button>
          <button className="secondaryButton" type="button" onClick={importExample} disabled={!selectedExample}>
            <Download size={16} aria-hidden="true" />
            Import example to draft
          </button>
        </div>
        {importMessage ? <p className="muted">{importMessage}</p> : null}
        {importError ? <div className="warningLine">Import error: {importError}</div> : null}
        {unrepresentedNodes > 0 ? (
          <div className="warningLine">
            {unrepresentedNodes} unconnected draft node(s) are visual only until connected to the validation JSON structure.
          </div>
        ) : null}
        <div className="graphCanvas builderCanvas" ref={containerRef}>
          {builder.nodes.length === 0 ? <span>Add an entity node or import an example to start a working draft.</span> : null}
        </div>
      </div>
      <aside className="builderInspector">
        {selectedNode && selectedEntity ? (
          <>
            <h3>{selectedNode.label}</h3>
            <p className="muted">{selectedEntity.egaType}</p>
            <div className="propertyEditor">
              {selectedEntity.properties
                .filter((property) => !property.relationship)
                .slice(0, 24)
                .map((property) => (
                  <label key={property.name}>
                    {property.title}
                    {property.required ? <span className="requiredMark">required</span> : null}
                    {renderPropertyInput(property, selectedNode.properties[property.name], (value) => updateNodeProperty(property, value))}
                  </label>
                ))}
            </div>
          </>
        ) : null}
        {selectedEdge ? (
          <>
            <h3>Relationship</h3>
            <label>
              Predicate
              <select value={selectedEdge.predicate} onChange={(event) => updateEdge('predicate', event.target.value)}>
                {relationshipPredicates.map((predicate) => (
                  <option key={predicate} value={predicate}>
                    {predicate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Source
              <select value={selectedEdge.source} onChange={(event) => updateEdge('source', event.target.value)}>
                {builder.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target
              <select value={selectedEdge.target} onChange={(event) => updateEdge('target', event.target.value)}>
                {builder.nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {!selectedNode && !selectedEdge ? <p className="muted">Select a draft node or edge to edit it.</p> : null}
        <details className="curlBox" open>
          <summary>Validation JSON preview</summary>
          <pre className="codeBlock small">{validationPreview}</pre>
        </details>
        <details className="curlBox">
          <summary>Graph-style JSON-LD preview</summary>
          <pre className="codeBlock small">{graphPreview}</pre>
        </details>
      </aside>
    </section>
  );
}

function renderPropertyInput(property: EntityPropertySummary, value: unknown, onChange: (value: string) => void) {
  if (property.enum?.length) {
    return (
      <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
        <option value="">Unset</option>
        {property.enum.map((item) => (
          <option key={String(item)} value={String(item)}>
            {String(item)}
          </option>
        ))}
      </select>
    );
  }
  if (property.kind === 'boolean') {
    return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(String(event.target.checked))} />;
  }
  if (property.kind === 'number') {
    return <input type="number" value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
  }
  if (property.kind === 'object' || property.kind === 'array') {
    return <textarea value={typeof value === 'string' ? value : JSON.stringify(value ?? (property.kind === 'array' ? [] : {}), null, 2)} onChange={(event) => onChange(event.target.value)} />;
  }
  return <input value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />;
}

function parsePropertyValue(property: EntityPropertySummary, rawValue: string) {
  if (property.kind === 'boolean') {
    return rawValue === 'true';
  }
  if (property.kind === 'number') {
    return rawValue === '' ? '' : Number(rawValue);
  }
  if (property.kind === 'object' || property.kind === 'array') {
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

function cleanEntityTitle(title: string) {
  return title.replace(/^FEGA\s+/i, '').replace(/\s+metadata schema$/i, '');
}
