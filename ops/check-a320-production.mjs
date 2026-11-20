// Current curriculum production smoke; full flight cases are in check-levels.mjs.
process.argv[2] ||= 'https://flight.awsdev.renorzr.top/';
process.argv[3] = 'smoke';
await import('./check-levels.mjs');
