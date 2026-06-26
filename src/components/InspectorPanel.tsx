import type { GraphEdge, GraphNode, SimpleGraphEdge, SimpleGraphNode } from '../lib/types';

interface InspectorPanelProps {
  node: GraphNode | SimpleGraphNode | null;
  edge: GraphEdge | SimpleGraphEdge | null;
}

export function InspectorPanel({ node, edge }: InspectorPanelProps) {
  if (!node && !edge) {
    return (
      <aside className="inspector">
        <h3>Inspector</h3>
        <p className="muted">Select a node or edge in the graph.</p>
      </aside>
    );
  }

  if (edge) {
    return (
      <aside className="inspector">
        <h3>Predicate</h3>
        <dl>
          <dt>Compact</dt>
          <dd>{edge.compactPredicate}</dd>
          <dt>Expanded</dt>
          <dd>{edge.predicate}</dd>
          <dt>Source</dt>
          <dd>{edge.source}</dd>
          <dt>Target</dt>
          <dd>{edge.target}</dd>
          {'objectKind' in edge ? (
            <>
              <dt>Object kind</dt>
              <dd>{edge.objectKind}</dd>
            </>
          ) : null}
          {'sourcePath' in edge ? (
            <>
              <dt>Source path</dt>
              <dd>{edge.sourcePath}</dd>
            </>
          ) : null}
        </dl>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <h3>{node && 'kind' in node && node.kind === 'literal' ? 'Literal' : 'Entity'}</h3>
      <dl>
        <dt>Label</dt>
        <dd>{node?.label}</dd>
        {'kind' in (node || {}) ? (
          <>
            <dt>Kind</dt>
            <dd>{(node as GraphNode).kind}</dd>
          </>
        ) : null}
        <dt>Value</dt>
        <dd>{'value' in (node || {}) ? (node as GraphNode).value || node?.id : node?.id}</dd>
        {node && 'entityKind' in node ? (
          <>
            <dt>Entity kind</dt>
            <dd>{node.entityKind}</dd>
            <dt>Source path</dt>
            <dd>{node.sourcePath}</dd>
            <dt>Properties</dt>
            <dd>{node.propertyCount}</dd>
          </>
        ) : null}
        {node?.compactTypes?.length ? (
          <>
            <dt>Types</dt>
            <dd>{node.compactTypes.join(', ')}</dd>
          </>
        ) : null}
        {node && 'datatype' in node && node.datatype ? (
          <>
            <dt>Datatype</dt>
            <dd>{node.compactDatatype || node.datatype}</dd>
          </>
        ) : null}
        {node && 'language' in node && node.language ? (
          <>
            <dt>Language</dt>
            <dd>{node.language}</dd>
          </>
        ) : null}
        {node && 'sourcePreview' in node ? (
          <>
            <dt>Preview</dt>
            <dd>
              <pre className="miniPre">{JSON.stringify(node.sourcePreview, null, 2)}</pre>
            </dd>
          </>
        ) : null}
      </dl>
    </aside>
  );
}
