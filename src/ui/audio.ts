/** Procedural cab audio: engine hum, horn, reverse beeper, air brake hiss and collision thuds. */

export interface CabAudioFrame {
  readonly rpm: number;
  readonly throttle: number;
  readonly muted: boolean;
  readonly horn: boolean;
  readonly reversing: boolean;
  readonly impact: number;
  /** True on the frame the parking brake valve is pulled. */
  readonly parkingBrakePulled: boolean;
}

const BEEP_PERIOD = 0.9;
const BEEP_LENGTH = 0.22;
const IDLE_GAIN = 0.03;
const THROTTLE_GAIN = 0.1;

/** Keeps one noise buffer around instead of regenerating it per hit. */
function noiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

export class CabAudio {
  private context: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private hornGain: GainNode | null = null;
  private beeperGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private nextBeep = 0;

  /** The browser only lets audio start after a user gesture. */
  unlock(): void {
    if (this.context !== null) return;
    const context = new AudioContext();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = context.createGain();
    gain.gain.value = 0;
    const osc = context.createOscillator();
    osc.type = 'sawtooth';
    const sub = context.createOscillator();
    sub.type = 'square';
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(gain).connect(context.destination);
    osc.start();
    sub.start();

    const hornGain = context.createGain();
    hornGain.gain.value = 0;
    [311, 415].forEach((frequency) => {
      const horn = context.createOscillator();
      horn.type = 'triangle';
      horn.frequency.value = frequency;
      horn.connect(hornGain);
      horn.start();
    });
    hornGain.connect(context.destination);

    const beeperGain = context.createGain();
    beeperGain.gain.value = 0;
    const beeper = context.createOscillator();
    beeper.type = 'square';
    beeper.frequency.value = 950;
    beeper.connect(beeperGain).connect(context.destination);
    beeper.start();

    this.context = context;
    this.engineOsc = osc;
    this.engineSub = sub;
    this.engineGain = gain;
    this.engineFilter = filter;
    this.hornGain = hornGain;
    this.beeperGain = beeperGain;
    this.noise = noiseBuffer(context);
  }

  update(frame: CabAudioFrame): void {
    const context = this.context;
    if (context === null || this.engineOsc === null || this.engineGain === null || this.engineFilter === null) return;
    const now = context.currentTime;
    /** Six cylinders, four strokes: three fires per revolution. */
    const fires = (frame.rpm / 60) * 3;
    this.engineOsc.frequency.setTargetAtTime(Math.max(fires, 20), now, 0.05);
    this.engineSub?.frequency.setTargetAtTime(Math.max(fires / 2, 12), now, 0.05);
    const volume = frame.muted ? 0 : IDLE_GAIN + frame.throttle * THROTTLE_GAIN;
    this.engineGain.gain.setTargetAtTime(volume, now, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + frame.throttle * 900, now, 0.1);
    this.hornGain?.gain.setTargetAtTime(!frame.muted && frame.horn ? 0.14 : 0, now, 0.02);

    if (!frame.muted && frame.reversing) {
      if (this.nextBeep <= now) {
        this.beep(now, 1);
        this.nextBeep = now + BEEP_PERIOD;
      }
    } else {
      this.nextBeep = 0;
      this.beeperGain?.gain.setTargetAtTime(0, now, 0.01);
    }
    if (frame.impact > 0.3) this.thud(Math.min(frame.impact, 4));
    if (frame.parkingBrakePulled && !frame.muted) this.hiss(now);
  }

  private beep(at: number, volume: number): void {
    this.beeperGain?.gain.setValueAtTime(volume * 0.06, at);
    this.beeperGain?.gain.setValueAtTime(0, at + BEEP_LENGTH);
  }

  private thud(strength: number): void {
    const context = this.context;
    if (context === null || this.noise === null) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180 + strength * 60;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(Math.min(0.25, 0.08 * strength), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(now);
    source.stop(now + 0.3);
  }

  private hiss(at: number): void {
    const context = this.context;
    if (context === null || this.noise === null) return;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.12, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(at);
    source.stop(at + 0.55);
  }
}
