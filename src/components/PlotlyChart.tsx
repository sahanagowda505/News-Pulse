import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

interface PlotlyChartProps {
  data: Record<string, unknown>[];
  layout?: Record<string, unknown>;
  height?: number;
  ariaLabel: string;
  onPointClick?: (pointIndex: number, label: string) => void;
}

export function PlotlyChart({
  data,
  layout = {},
  height = 340,
  ariaLabel,
  onPointClick,
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current as (HTMLDivElement & {
      on?: (event: string, cb: (ev: { points?: Array<{ pointIndex?: number; x?: string }> }) => void) => void;
      removeAllListeners?: (event: string) => void;
    }) | null;
    if (!el) return;

    const mergedLayout: Record<string, unknown> = {
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(7, 11, 20, 0.35)',
      font: {
        family: 'DM Sans, system-ui, sans-serif',
        color: '#CBD5E1',
        size: 12,
      },
      hoverlabel: {
        bgcolor: '#0F172A',
        bordercolor: '#334155',
        font: { family: 'DM Sans, system-ui, sans-serif', color: '#F8FAFC', size: 12 },
      },
      xaxis: {
        gridcolor: 'rgba(30, 41, 59, 0.75)',
        zerolinecolor: '#1E293B',
        tickfont: { color: '#94A3B8', size: 11 },
      },
      yaxis: {
        gridcolor: 'rgba(30, 41, 59, 0.75)',
        zerolinecolor: '#1E293B',
        tickfont: { color: '#94A3B8', size: 11 },
      },
      margin: { l: 48, r: 20, t: 24, b: 44 },
      height,
      ...layout,
    };

    Plotly.react(el, data, mergedLayout, {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    });

    if (onPointClick && el.on) {
      el.removeAllListeners?.('plotly_click');
      el.on('plotly_click', (ev) => {
        const pt = ev?.points?.[0];
        if (pt && typeof pt.pointIndex === 'number') {
          onPointClick(pt.pointIndex, String(pt.x ?? ''));
        }
      });
    }

    const observer = new ResizeObserver(() => {
      if (el) {
        Plotly.Plots.resize(el);
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [data, layout, height, onPointClick]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      style={{ minHeight: `${height}px` }}
    />
  );
}
