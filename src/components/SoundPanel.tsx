import { useEffect, useRef } from 'react';
import { useStore } from '../lib/createStore';
import {
  EQ_BANDS,
  EQ_PRESETS,
  EQ_RANGE,
  MAX_CROSSFADE,
  ensureGraph,
  fx,
  readSpectrum,
  setBandGain,
  setCrossfade,
  setGapless,
  setPreset,
} from '../store/fx';
import { player } from '../store/player';

const bandLabel = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : String(hz));

/** Frequency bars, drawn only while the panel is open and music is playing. */
function Visualizer() {
  const ref = useRef<HTMLCanvasElement>(null);
  const playing = useStore(player, (s) => s.playing);
  const graph = useStore(fx, (s) => s.graph);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    let raf = 0;
    let frame = 0;
    let color = '#6cb4ff';
    const BARS = 40;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      if (frame++ % 30 === 0) color = getComputedStyle(canvas).color;
      g.clearRect(0, 0, w, h);
      const bins = playing ? readSpectrum() : null;
      const gap = 3 * dpr;
      const bw = (w - gap * (BARS - 1)) / BARS;
      g.fillStyle = color;
      for (let i = 0; i < BARS; i++) {
        let level = 0;
        if (bins) {
          // Spread the bars over the lower ~60% of the spectrum, where music has its energy.
          const from = Math.floor(Math.pow(i / BARS, 1.6) * bins.length * 0.6);
          const to = Math.max(from + 1, Math.floor(Math.pow((i + 1) / BARS, 1.6) * bins.length * 0.6));
          let sum = 0;
          for (let k = from; k < to; k++) sum += bins[k];
          level = sum / (to - from) / 255;
        }
        const bh = Math.max(2 * dpr, level * h);
        g.globalAlpha = bins ? 0.35 + level * 0.65 : 0.25;
        g.fillRect(i * (bw + gap), h - bh, bw, bh);
      }
      g.globalAlpha = 1;
      if (playing) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [playing, graph]);

  return <canvas ref={ref} className="visualizer" aria-label="Audio visualizer" role="img" />;
}

export function SoundView() {
  const preset = useStore(fx, (s) => s.preset);
  const gains = useStore(fx, (s) => s.gains);
  const crossfade = useStore(fx, (s) => s.crossfade);
  const gapless = useStore(fx, (s) => s.gapless);
  const graph = useStore(fx, (s) => s.graph);

  // Opening this panel is a user action, so it is a good moment to start the audio graph.
  useEffect(() => {
    void ensureGraph();
  }, []);

  return (
    <div className="sound">
      <section>
        <h3 className="panel-label">Visualizer</h3>
        <Visualizer />
        {graph === 'unavailable' && (
          <p className="panel-note">The equalizer and visualizer aren’t supported by this browser. Playback is unaffected.</p>
        )}
      </section>

      <section>
        <div className="panel-label-row">
          <h3 className="panel-label">Equalizer</h3>
          <button type="button" className="link-btn" onClick={() => setPreset('normal')} disabled={preset === 'normal'}>
            Reset
          </button>
        </div>
        <div className="chips" role="radiogroup" aria-label="Equalizer preset">
          {EQ_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={preset === p.id}
              className={`chip${preset === p.id ? ' on' : ''}`}
              onClick={() => setPreset(p.id)}
              disabled={graph === 'unavailable'}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <span className="chip on" role="radio" aria-checked="true">
              Custom
            </span>
          )}
        </div>
        <div className="eq-bands">
          {EQ_BANDS.map((hz, i) => (
            <label key={hz} className="eq-band">
              <span className="eq-db">{gains[i] > 0 ? `+${gains[i]}` : gains[i]}</span>
              <input
                type="range"
                className="eq-slider"
                min={-EQ_RANGE}
                max={EQ_RANGE}
                step={0.5}
                value={gains[i]}
                disabled={graph === 'unavailable'}
                aria-label={`${bandLabel(hz)} hertz`}
                aria-valuetext={`${gains[i]} decibels`}
                onChange={(e) => setBandGain(i, Number(e.target.value))}
              />
              <span className="eq-hz">{bandLabel(hz)}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <h3 className="panel-label">Transitions</h3>
        <div className="setting-row">
          <div>
            <div className="setting-name">Crossfade</div>
            <div className="setting-help">Overlap the end of one song with the start of the next.</div>
          </div>
          <span className="crossfade-value">{crossfade === 0 ? 'Off' : `${crossfade}s`}</span>
        </div>
        <input
          type="range"
          className="range"
          min={0}
          max={MAX_CROSSFADE}
          step={1}
          value={crossfade}
          aria-label="Crossfade seconds"
          aria-valuetext={crossfade === 0 ? 'Off' : `${crossfade} seconds`}
          onChange={(e) => setCrossfade(Number(e.target.value))}
        />
        <div className="setting-row">
          <div>
            <div className="setting-name">Gapless playback</div>
            <div className="setting-help">Start the next song the moment this one ends. Used when crossfade is off.</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={gapless}
            aria-label="Gapless playback"
            className={`switch${gapless ? ' on' : ''}`}
            onClick={() => setGapless(!gapless)}
          >
            <span />
          </button>
        </div>
      </section>
    </div>
  );
}
