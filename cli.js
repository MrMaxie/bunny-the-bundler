#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));

const watchMode = argv.watch || argv.w;
const devMode = Boolean(argv.dev || argv.d);
const source = argv._[0];
const target = argv._[1] || false;
let devPort = parseInt(argv.dev || argv.d, 10);

if (isNaN(devPort) || devPort < 1024 || devPort > 65535) {
    devPort = 8080;
}

if (argv.help || argv.h) {
    console.log([
        'usage: bunny [...commands] <input> [output]',
        '',
        'commands:',
        '   --watch      | -w',
        '       -> turns on watchers for needed files and rebuild every time when any of those files will been edited',
        '',
        '   --dev [8080] | -d [8080]',
        '       -> runs dev server on selected port, also watchers will turn on',
        '',
        '   --help       | -h',
        '       -> shows this message :)',
    ].map(x => `    ${x}`).join('\r\n'));
    process.exit(0);
}

const Bunny = require('./src/Bunny.js');
const bunny = new Bunny(source, target);

if (devMode) {
    bunny.runServer(devPort);
} else if (watchMode) {
    bunny.watch();
} else {
    bunny.build();
}
