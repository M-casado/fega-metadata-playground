import type { SimpleGraphNode } from './types';

export interface FegaVisualStyle {
  shape: string;
  fill: string;
  stroke: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed';
}

const DEFAULT_STYLE: FegaVisualStyle = {
  shape: 'ellipse',
  fill: '#f7f3ea',
  stroke: '#52636b',
  borderWidth: 1,
  borderStyle: 'solid'
};

export const FEGA_VISUAL_STYLES: Record<string, FegaVisualStyle> = {
  'ega:biomaterial': {
    shape: 'ellipse',
    fill: '#B3D9FF',
    stroke: '#4C8BF5',
    borderWidth: 4,
    borderStyle: 'solid'
  },
  'ega:process': {
    shape: 'rectangle',
    fill: '#FFE5CC',
    stroke: '#F5A45D',
    borderWidth: 2,
    borderStyle: 'solid'
  },
  'ega:protocol': {
    shape: 'rectangle',
    fill: '#FEEEDF',
    stroke: '#F5A45D',
    borderWidth: 2,
    borderStyle: 'dashed'
  },
  'ega:datafile': {
    shape: 'round-rectangle',
    fill: '#D5E8D4',
    stroke: '#6FB96C',
    borderWidth: 1,
    borderStyle: 'solid'
  },
  'ega:dataset': {
    shape: 'diamond',
    fill: '#FFD600',
    stroke: '#000000',
    borderWidth: 1,
    borderStyle: 'solid'
  },
  'ega:cohort': {
    shape: 'round-rectangle',
    fill: '#E1BEE7',
    stroke: '#000000',
    borderWidth: 1,
    borderStyle: 'solid'
  }
};

export function styleForEgaType(typeOrNode: string | SimpleGraphNode | undefined): FegaVisualStyle {
  const type =
    typeof typeOrNode === 'string'
      ? typeOrNode
      : typeOrNode?.compactTypes?.find((item) => item.startsWith('ega:')) || typeOrNode?.entityKind;
  return (type && FEGA_VISUAL_STYLES[type]) || DEFAULT_STYLE;
}

export function cytoscapeDataForEgaType(typeOrNode: string | SimpleGraphNode | undefined) {
  const style = styleForEgaType(typeOrNode);
  return {
    shape: style.shape,
    fill: style.fill,
    stroke: style.stroke,
    borderWidth: style.borderWidth,
    borderStyle: style.borderStyle
  };
}
