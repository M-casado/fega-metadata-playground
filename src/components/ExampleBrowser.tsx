import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import type { Manifest, ManifestExample } from '../lib/types';

interface ExampleBrowserProps {
  manifest: Manifest;
  selectedId: string | null;
  onSelect: (example: ManifestExample) => void;
  entityFilter: string;
  setEntityFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function ExampleBrowser({
  manifest,
  selectedId,
  onSelect,
  entityFilter,
  setEntityFilter,
  categoryFilter,
  setCategoryFilter,
  query,
  setQuery,
  collapsed,
  onToggleCollapsed
}: ExampleBrowserProps) {
  const examples = manifest.examples.filter((example) => {
    const matchesEntity = entityFilter === 'all' || example.entity === entityFilter;
    const matchesCategory = categoryFilter === 'all' || example.category === categoryFilter;
    const haystack = `${example.entity} ${example.category} ${example.name} ${example.sourcePath}`.toLowerCase();
    return matchesEntity && matchesCategory && haystack.includes(query.toLowerCase());
  });

  const selected = manifest.examples.find((example) => example.id === selectedId) || null;

  if (collapsed) {
    return (
      <aside className="sidebar sidebarCollapsed" aria-label="Example browser collapsed">
        <button className="iconButton" type="button" title="Show examples" onClick={onToggleCollapsed}>
          <PanelLeftOpen size={17} aria-hidden="true" />
        </button>
        <div className="collapsedSummary">
          <span>{selected?.entity || 'Examples'}</span>
          <strong>{selected?.category || ''}</strong>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar" aria-label="Example browser">
      <div className="sidebarHeader">
        <h2>Examples</h2>
        <div className="sidebarHeaderActions">
          <span>{examples.length}</span>
          <button className="iconButton" type="button" title="Collapse examples" onClick={onToggleCollapsed}>
            <PanelLeftClose size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <label>
        Entity
        <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          <option value="all">All entities</option>
          {manifest.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">All categories</option>
          <option value="valid">Valid examples</option>
          <option value="invalid">Invalid examples</option>
        </select>
      </label>
      <label>
        Search
        <div className="searchBox">
          <Search size={16} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, path, entity" />
        </div>
      </label>
      <div className="exampleList">
        {examples.map((example) => (
          <button
            key={example.id}
            className={`exampleButton ${selectedId === example.id ? 'isSelected' : ''}`}
            type="button"
            onClick={() => onSelect(example)}
          >
            <span className="exampleName">{example.name}</span>
            <span className="exampleMeta">
              {example.entity} · {example.category}
              {example.warningCount > 0 ? ` · ${example.warningCount} warning(s)` : ''}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
