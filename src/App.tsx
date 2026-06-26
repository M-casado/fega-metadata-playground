import { AlertTriangle, GitBranch, Network, PenLine, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ExampleBrowser } from './components/ExampleBrowser';
import { GraphViewer } from './components/GraphViewer';
import { JsonLdViews } from './components/JsonLdViews';
import { SubmissionBuilder } from './components/SubmissionBuilder';
import { ValidationPlayground } from './components/ValidationPlayground';
import { loadWorkingDraft, saveWorkingDraft } from './lib/draft';
import { loadBuildWarnings, loadEntitySummaries, loadManifest } from './lib/examples';
import type { EntitySummary, Manifest, ManifestExample, WorkingDraft } from './lib/types';

type Mode = 'graph' | 'jsonld' | 'validate' | 'builder';

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [warnings, setWarnings] = useState<unknown[]>([]);
  const [entitySummaries, setEntitySummaries] = useState<EntitySummary[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('graph');
  const [entityFilter, setEntityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft | null>(() => loadWorkingDraft());

  useEffect(() => {
    saveWorkingDraft(workingDraft);
  }, [workingDraft]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadManifest(), loadBuildWarnings().catch(() => []), loadEntitySummaries().catch(() => [])])
      .then(([loadedManifest, loadedWarnings, loadedEntitySummaries]) => {
        if (cancelled) {
          return;
        }
        setManifest(loadedManifest);
        setWarnings(loadedWarnings);
        setEntitySummaries(loadedEntitySummaries);
        setSelectedId(loadedManifest.examples[0]?.id || null);
      })
      .catch((reason) => {
        if (!cancelled) {
          setLoadError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedExample = useMemo<ManifestExample | null>(
    () => manifest?.examples.find((example) => example.id === selectedId) || null,
    [manifest, selectedId]
  );

  if (loadError) {
    return (
      <main className="appShell">
        <div className="emptyState">
          <h1>FEGA Metadata Playground</h1>
          <p>{loadError}</p>
          <p>Run `npm run generate -- --schema-root /path/to/fega-metadata-schema` before starting the app.</p>
        </div>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="appShell">
        <div className="emptyState">Loading generated playground assets…</div>
      </main>
    );
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <div>
          <h1>FEGA Metadata Playground</h1>
          <p>
            {manifest.examples.length} examples from {manifest.entities.length} entities · generated{' '}
            {new Date(manifest.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="sourceBadge">
          <GitBranch size={16} aria-hidden="true" />
          {manifest.schemaSource.ref}
        </div>
      </header>

      {warnings.length > 0 ? (
        <div className="warningBanner">
          <AlertTriangle size={18} aria-hidden="true" />
          {warnings.length} JSON-LD transform warning(s) were recorded during asset generation. Affected examples still load where possible.
        </div>
      ) : null}

      <div className={`workspace ${sidebarCollapsed ? 'workspaceCollapsed' : ''}`}>
        <ExampleBrowser
          manifest={manifest}
          selectedId={selectedId}
          onSelect={(example) => setSelectedId(example.id)}
          entityFilter={entityFilter}
          setEntityFilter={setEntityFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          query={query}
          setQuery={setQuery}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        />

        <section className="content">
          {selectedExample ? (
            <>
              <div className={`draftBanner ${workingDraft ? 'isDraft' : ''}`}>
                <strong>{workingDraft ? 'Editing working draft' : 'Viewing repository example'}</strong>
                <span>{workingDraft ? workingDraft.sourceLabel : selectedExample.name}</span>
                <button className="secondaryButton" type="button" onClick={() => setWorkingDraft(null)} disabled={!workingDraft}>
                  Clear draft
                </button>
              </div>
              <div className="contentHeader">
                <div>
                  <h2>{selectedExample.name}</h2>
                  <p>
                    {selectedExample.entity} · {selectedExample.category} · {selectedExample.sourcePath}
                  </p>
                </div>
                <div className="modeTabs" role="tablist" aria-label="Playground mode">
                  <button className={mode === 'graph' ? 'activeTab' : ''} type="button" onClick={() => setMode('graph')}>
                    <Network size={16} aria-hidden="true" />
                    Graph
                  </button>
                  <button className={mode === 'jsonld' ? 'activeTab' : ''} type="button" onClick={() => setMode('jsonld')}>
                    JSON-LD
                  </button>
                  <button className={mode === 'validate' ? 'activeTab' : ''} type="button" onClick={() => setMode('validate')}>
                    <ShieldCheck size={16} aria-hidden="true" />
                    Validate
                  </button>
                  <button className={mode === 'builder' ? 'activeTab' : ''} type="button" onClick={() => setMode('builder')}>
                    <PenLine size={16} aria-hidden="true" />
                    Builder
                  </button>
                </div>
              </div>

              {mode === 'graph' ? <GraphViewer example={selectedExample} draft={workingDraft} /> : null}
              {mode === 'jsonld' ? <JsonLdViews example={selectedExample} draft={workingDraft} /> : null}
              {mode === 'validate' ? <ValidationPlayground example={selectedExample} entities={entitySummaries} draft={workingDraft} onDraftChange={setWorkingDraft} /> : null}
              {mode === 'builder' ? <SubmissionBuilder entities={entitySummaries} selectedExample={selectedExample} draft={workingDraft} onDraftChange={setWorkingDraft} /> : null}
            </>
          ) : (
            <div className="emptyState">No example selected.</div>
          )}
        </section>
      </div>
    </main>
  );
}
