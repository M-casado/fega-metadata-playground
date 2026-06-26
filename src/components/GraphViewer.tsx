import cytoscape, { Core, ElementDefinition } from 'cytoscape';
import { Focus, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { simpleGraphFromWorkingDraft } from '../lib/draft';
import { loadJsonAsset } from '../lib/examples';
import { cytoscapeDataForEgaType } from '../lib/fegaStyles';
import type { GraphAsset, GraphEdge, GraphNode, ManifestExample, SimpleGraphAsset, SimpleGraphEdge, SimpleGraphNode, WorkingDraft } from '../lib/types';
import { InspectorPanel } from './InspectorPanel';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
type GraphMode = 'ega' | 'rdf';

interface GraphViewerProps {
  example: ManifestExample;
  draft: WorkingDraft | null;
}

export function GraphViewer({ example, draft }: GraphViewerProps) {
  const [mode, setMode] = useState<GraphMode>('ega');
  const [simpleGraph, setSimpleGraph] = useState<SimpleGraphAsset | null>(null);
  const [rdfGraph, setRdfGraph] = useState<GraphAsset | null>(null);
  const [error, setError] = useState('');
  const [compactLabels, setCompactLabels] = useState(true);
  const [showLiterals, setShowLiterals] = useState(true);
  const [showBlankNodes, setShowBlankNodes] = useState(true);
  const [showTypeEdges, setShowTypeEdges] = useState(false);
  const [predicateFilter, setPredicateFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [typeRadius, setTypeRadius] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | SimpleGraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | SimpleGraphEdge | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSimpleGraph(draft ? simpleGraphFromWorkingDraft(draft) : null);
    setRdfGraph(null);
    setError('');
    setSelectedNode(null);
    setSelectedEdge(null);

    const simplePath = example.assets.simpleGraph || example.assets.graph;
    const rdfPath = example.assets.rdfGraph;
    Promise.all([
      simplePath ? loadJsonAsset<SimpleGraphAsset>(simplePath) : Promise.resolve(null),
      rdfPath ? loadJsonAsset<GraphAsset>(rdfPath) : Promise.resolve(null)
    ])
      .then(([simple, rdf]) => {
        if (!cancelled) {
          setSimpleGraph(simple);
          setRdfGraph(rdf);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft, example]);

  const filteredSimple = useMemo(() => {
    if (!simpleGraph) {
      return { nodes: [] as SimpleGraphNode[], edges: [] as SimpleGraphEdge[] };
    }
    const searchNeedle = searchText.trim().toLowerCase();
    const typeNeedle = typeFilter.trim().toLowerCase();
    let nodes = simpleGraph.nodes;
    let edges = simpleGraph.edges;

    if (searchNeedle) {
      const matchingNodeIds = new Set(
        nodes.filter((node) => node.searchableText.includes(searchNeedle) || node.label.toLowerCase().includes(searchNeedle)).map((node) => node.id)
      );
      const matchingEdges = edges.filter((edge) => edge.searchableText.includes(searchNeedle));
      matchingEdges.forEach((edge) => {
        matchingNodeIds.add(edge.source);
        matchingNodeIds.add(edge.target);
      });
      nodes = nodes.filter((node) => matchingNodeIds.has(node.id));
      edges = edges.filter((edge) => matchingNodeIds.has(edge.source) && matchingNodeIds.has(edge.target));
    }

    if (typeNeedle) {
      const seedIds = new Set(
        nodes
          .filter((node) => [...node.egaTypes, ...node.compactTypes, node.entityKind].join(' ').toLowerCase().includes(typeNeedle))
          .map((node) => node.id)
      );
      const visibleIds = expandByRadius(seedIds, edges, typeRadius);
      nodes = nodes.filter((node) => visibleIds.has(node.id));
      edges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    }

    if (selectedOnly && selectedNode) {
      const visibleIds = expandByRadius(new Set([selectedNode.id]), edges, 1);
      nodes = nodes.filter((node) => visibleIds.has(node.id));
      edges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    }

    return { nodes, edges };
  }, [searchText, selectedNode, selectedOnly, simpleGraph, typeFilter, typeRadius]);

  const filteredRdf = useMemo(() => {
    if (!rdfGraph) {
      return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    }
    const searchNeedle = searchText.trim().toLowerCase();
    const predicateNeedle = predicateFilter.trim().toLowerCase();
    const typeNeedle = typeFilter.trim().toLowerCase();
    let nodes = rdfGraph.nodes.filter((node) => {
      if (!showLiterals && node.kind === 'literal') {
        return false;
      }
      if (!showBlankNodes && node.kind === 'blank') {
        return false;
      }
      if (typeNeedle && ![...(node.compactTypes || []), ...(node.types || [])].join(' ').toLowerCase().includes(typeNeedle)) {
        return false;
      }
      return true;
    });
    let nodeIds = new Set(nodes.map((node) => node.id));
    let edges = rdfGraph.edges.filter((edge) => {
      if (!showTypeEdges && edge.predicate === RDF_TYPE) {
        return false;
      }
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        return false;
      }
      const predicateHaystack = `${edge.compactPredicate} ${edge.predicate}`.toLowerCase();
      return !predicateNeedle || predicateHaystack.includes(predicateNeedle);
    });

    if (searchNeedle) {
      const matchingIds = new Set(
        nodes
          .filter((node) =>
            [node.id, node.label, node.value, node.compactValue, ...(node.compactTypes || []), ...(node.types || [])].join(' ').toLowerCase().includes(searchNeedle)
          )
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

    if (selectedOnly && selectedNode) {
      const visibleIds = expandByRadius(new Set([selectedNode.id]), edges, 1);
      nodes = nodes.filter((node) => visibleIds.has(node.id));
      nodeIds = new Set(nodes.map((node) => node.id));
      edges = edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    }
    return { nodes, edges };
  }, [predicateFilter, rdfGraph, searchText, selectedNode, selectedOnly, showBlankNodes, showLiterals, showTypeEdges, typeFilter]);

  const activeGraph = mode === 'ega' ? simpleGraph : rdfGraph;
  const filtered = mode === 'ega' ? filteredSimple : filteredRdf;

  useEffect(() => {
    if (!containerRef.current || !activeGraph) {
      return undefined;
    }
    const elements: ElementDefinition[] = [
      ...filtered.nodes.map((node) => ({
        data: {
          id: node.id,
          label: labelForNode(node, compactLabels),
          kind: 'kind' in node ? node.kind : 'ega',
          ...('kind' in node ? fallbackVisualForRdfNode(node) : cytoscapeDataForEgaType(node))
        }
      })),
      ...filtered.edges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: compactLabels ? edge.compactPredicate : edge.predicate
        }
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
              width: '34px',
              height: '34px'
            }
          },
          {
            selector: 'edge',
            style: {
              width: '1.7px',
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
          { selector: ':selected', style: { 'border-width': '3px', 'border-color': '#111827', 'line-color': '#111827' } }
        ] as unknown as cytoscape.StylesheetCSS[]
      });
    cyRef.current = cy;
    cy.elements().remove();
    cy.add(elements);
    cy.layout({ name: mode === 'ega' ? 'breadthfirst' : 'cose', animate: false, idealEdgeLength: 125, nodeRepulsion: 6500, padding: 30 }).run();

    cy.removeAllListeners();
    cy.on('tap', 'node', (event) => {
      const node = filtered.nodes.find((item) => item.id === event.target.id()) || null;
      setSelectedNode(node);
      setSelectedEdge(null);
    });
    cy.on('tap', 'edge', (event) => {
      const edge = filtered.edges.find((item) => item.id === event.target.id()) || null;
      setSelectedEdge(edge);
      setSelectedNode(null);
    });
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    return () => undefined;
  }, [activeGraph, compactLabels, filtered, mode]);

  useEffect(
    () => () => {
      cyRef.current?.destroy();
      cyRef.current = null;
    },
    []
  );

  const predicates = useMemo(() => [...new Set(rdfGraph?.edges.map((edge) => edge.compactPredicate) || [])].sort(), [rdfGraph]);
  const simpleTypes = useMemo(() => [...new Set(simpleGraph?.nodes.flatMap((node) => node.compactTypes) || [])].sort(), [simpleGraph]);
  const rdfTypes = useMemo(() => [...new Set(rdfGraph?.nodes.flatMap((node) => node.compactTypes || []) || [])].sort(), [rdfGraph]);
  const typeOptions = mode === 'ega' ? simpleTypes : rdfTypes;
  const warnings = activeGraph?.warnings || [];

  return (
    <section className="graphPanel">
      <div className="graphToolbar">
        {draft ? <span className="draftChip">Editing working draft</span> : null}
        <div className="segmentedControl" role="tablist" aria-label="Graph detail">
          <button className={mode === 'ega' ? 'activeTab' : ''} type="button" onClick={() => setMode('ega')}>
            EGA graph
          </button>
          <button className={mode === 'rdf' ? 'activeTab' : ''} type="button" onClick={() => setMode('rdf')}>
            RDF detail
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={compactLabels} onChange={(event) => setCompactLabels(event.target.checked)} />
          Compact labels
        </label>
        <button className="iconButton" type="button" title="Fit graph" onClick={() => cyRef.current?.fit(undefined, 40)}>
          <Focus size={17} aria-hidden="true" />
        </button>
        <button
          className="iconButton"
          type="button"
          title="Re-run graph layout"
          onClick={() => cyRef.current?.layout({ name: mode === 'ega' ? 'breadthfirst' : 'cose', animate: true, animationDuration: 260 }).run()}
        >
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="filterRow">
        <label>
          Search graph
          <div className="searchBox">
            <Search size={16} aria-hidden="true" />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="IDs, text, properties, predicates" />
          </div>
        </label>
        <label>
          Entity type
          <input list="type-options" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} placeholder={mode === 'ega' ? 'ega:dataset' : 'Type'} />
        </label>
        <datalist id="type-options">
          {typeOptions.map((type) => (
            <option key={type} value={type} />
          ))}
        </datalist>
        {mode === 'ega' ? (
          <label>
            Type radius
            <select value={typeRadius} onChange={(event) => setTypeRadius(Number(event.target.value))}>
              <option value={0}>0 edges</option>
              <option value={1}>1 edge</option>
              <option value={2}>2 edges</option>
            </select>
          </label>
        ) : (
          <>
            <label>
              Predicate
              <input list="predicate-options" value={predicateFilter} onChange={(event) => setPredicateFilter(event.target.value)} placeholder="Filter predicate" />
            </label>
            <datalist id="predicate-options">
              {predicates.map((predicate) => (
                <option key={predicate} value={predicate} />
              ))}
            </datalist>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} disabled={!selectedNode} />
          Selected neighbourhood
        </label>
      </div>

      {mode === 'rdf' ? (
        <div className="graphToolbar compactToolbar">
          <label className="check">
            <input type="checkbox" checked={showLiterals} onChange={(event) => setShowLiterals(event.target.checked)} />
            Literals
          </label>
          <label className="check">
            <input type="checkbox" checked={showBlankNodes} onChange={(event) => setShowBlankNodes(event.target.checked)} />
            Blank nodes
          </label>
          <label className="check">
            <input type="checkbox" checked={showTypeEdges} onChange={(event) => setShowTypeEdges(event.target.checked)} />
            rdf:type
          </label>
        </div>
      ) : null}

      {error ? <div className="warningLine">{error}</div> : null}
      {warnings.length ? (
        <div className="warningStack">
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
      <div className="graphBody">
        <div className="graphCanvas" ref={containerRef}>
          {!activeGraph ? <span>Loading graph...</span> : null}
        </div>
        <InspectorPanel node={selectedNode} edge={selectedEdge} />
      </div>
    </section>
  );
}

function expandByRadius(seedIds: Set<string>, edges: Array<{ source: string; target: string }>, radius: number) {
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

function labelForNode(node: GraphNode | SimpleGraphNode, compactLabels: boolean) {
  if ('kind' in node) {
    return compactLabels ? node.label : node.value || node.id;
  }
  return compactLabels ? node.label : `${node.id}\n${node.compactTypes.join(', ')}`;
}

function fallbackVisualForRdfNode(node: GraphNode) {
  if (node.kind === 'literal') {
    return { shape: 'round-rectangle', fill: '#b85c38', stroke: '#7c3f27', borderWidth: 1, borderStyle: 'solid' };
  }
  if (node.kind === 'blank') {
    return { shape: 'diamond', fill: '#7b6688', stroke: '#4f4058', borderWidth: 1, borderStyle: 'solid' };
  }
  const egaType = node.compactTypes?.find((type) => type.startsWith('ega:'));
  return egaType ? cytoscapeDataForEgaType(egaType) : { shape: 'ellipse', fill: '#356f7c', stroke: '#244f58', borderWidth: 1, borderStyle: 'solid' };
}
