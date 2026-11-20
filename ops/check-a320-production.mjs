// Current curriculum production smoke; full flight cases are in check-levels.mjs.
process.argv[2] ||= 'https://renorzr.github.io/pilot-sim/';
process.argv[3] = 'smoke';
await import('./check-levels.mjs');
