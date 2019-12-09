const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const ora = require('ora');
const chalk = require('chalk');
const cheerio = require('cheerio');
const vm = require('vm');
const requireAt = require("require-at");
const q = require('q');
const chokidar = require('chokidar');
const socket = require('socket.io');
const http = require('http');
const { execSync } = require('child_process');

module.exports = class Bunny extends EventEmitter {
    /**
     * @param {string} source
     */
    constructor(source, target) {
        super();

        this.files = [];
        this.cmd = ora({
            text: 'Preparing Bunny',
            spinner: {
                interval: 80,
                frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
            },
        }).start();
        this.source = path.resolve(process.cwd(), source);
        this.target = path.resolve(process.cwd(), target);

        if (!fs.existsSync(this.source)) {
            this.emit('fail', `Unable to read input file ${chalk.cyan(this.source)}`);
            return;
        }

        this.cmd.rerun = (mode, text) => {
            const oldText = this.cmd.text;
            this.cmd[mode](text);
            this.cmd.start(oldText);
        };

        this.cmd.stop();

        this.consoleLogs = {
            log: this._bindLog('log', 'gray'),
            error: this._bindLog('error', 'red'),
            warn: this._bindLog('warn', 'yellow'),
            info: this._bindLog('info', 'blue'),
        };
    }

    _genLoad(dir, $) {
        const load = ids => {
            if (Array.isArray(ids)) {
                return Promise.all(ids.map(load));
            }

            const def = q.defer();

            const elements = $(`#${ids.replace(/[^\-a-z0-9_]/ig, '')}`);

            if (elements.length === 0) {
                this.cmd.rerun('fail', `Could not find element with id: ${chalk.cyan(ids)}`);
                return def.reject();
            }

            const el = elements.first();
            const src = el.attr('src');

            if (!src) {
                def.resolve(el.html());
            } else {
                const file = path.resolve(dir, src);

                this.files.push(file);
                this._read(file)
                    .then(text => {
                        def.resolve(text);
                    })
                    .catch(err => {
                        this.consoleLogs.error(`Could not read file: ${chalk.cyan(file)}`);
                        def.reject(err);
                    });
            }

            return def.promise;
        };

        return load;
    }

    _genSaveFile(dir) {
        return (filename, data) => {
            const def = q.defer();

            filename = path.resolve(dir, filename);

            fs.writeFile(filename, data, {
                encoding: 'utf8',
            }, err => {
                if (err) {
                    this.consoleLogs.error(`Could not write file: ${chalk.cyan(filename)}`);
                    def.reject(err);
                } else {
                    def.resolve();
                }
            });

            return def.promise;
        };
    }

    _genSave(dir) {
        if (!this.target) {
            this.cmd.rerun('fail', `Target file isn't set, you can pass it as second non-flag argument`);
            return Promise.reject(new Error(`Target file isn't set, you can pass it as second non-flag argument`));
        }

        return data => {
            this._genSaveFile(dir)(this.target, data);
            this._genDone()();
        };
    }

    _read(file) {
        return new Promise((res, rej) => {
            fs.readFile(file, 'utf8', (err, data) => {
                return err ? rej(err) : res(data);
            });
        });
    }

    _bindLog(name, color) {
        const log = console[name];
        const prefix = chalk[color]('[context]');

        return (...args) => {
            this.cmd.stop();
            log(prefix, ...args);
            this.cmd.start();
        };
    }

    _genDone() {
        return () => {
            this.emit('done', this.files);
            this.files = [];
        };
    }

    _genFail() {
        return (message) => {
            this.emit('fail', message || '');
            this.files = [];
        };
    }

    _getContext($) {
        const dirname = path.dirname(this.source);

        const sandbox = {
            require: requireAt(dirname),
            load: this._genLoad(dirname, $),
            save: this._genSave(dirname),
            saveFile: this._genSaveFile(dirname),
            done: this._genDone(),
            fail: this._genFail(),
            console: Object.assign({}, this.consoleLogs),
        };

        vm.createContext(sandbox);

        return sandbox;
    }

    _runContext(data) {
        const mainSelector = 'script[role="main"]';

        try {
            const $ = cheerio.load(data);

            const main = $(mainSelector);

            if (main.length === 0) {
                this.cmd.fail(`Could not find main script in input file with given selector: ${chalk.cyan(mainSelector)}`);
                return;
            }

            const context = this._getContext($);
            const script = [
                'try {',
                main.first().html(),
                '} catch (e) { fail(e.message ? e.message : e); }',
            ].join('\r\n');

            vm.runInContext(script, context);
        } catch(e) {
            this.cmd.fail('Error inside of context:');
            console.error(e);
        }
    }

    _build() {
        this.emit('building');
        this.files = [];
        this._read(this.source)
            .then(data => {
                this._runContext(data);
            })
            .catch(() => {
                this.cmd.fail(`Unable to read input file ${chalk.cyan(this.source)}`);
            });
    }

    _printTimeRes(hr) {
        const s = hr[0];
        const ms = Math.floor(hr[1] / 1000000);
        return [
            s ? `${s}s` : '',
            ms ? `${ms}ms` : ''
        ].filter(x => x.length > 0).join(' ');
    }

    build() {
        const hrstart = process.hrtime();

        this.on('building', () => {
            this.cmd.start('Building');
        });

        this.on('done', () => {
            const hrend = process.hrtime(hrstart);
            this.cmd.succeed(`Builded in ${this._printTimeRes(hrend)}`);
        });

        this.on('fail', reason => {
            const hrend = process.hrtime(hrstart);
            this.cmd.fail(`Failed in ${this._printTimeRes(hrend)}\r\nReason: ${reason}\r\n---`);
        });

        this._build();
    }

    _watch() {
        let building = false;
        let loop = false;

        this.on('rewatch', files => {
            if (building) {
                return;
            }

            const w = chokidar.watch(files, {
                persistent: false,
                disableGlobbing: true,
            });

            w.on('ready', () => {
                w.on('all', () => {
                    w.close();
                    this.emit('rebuild');
                });
            });
        });

        this.on('done', files => {
            building = false;

            if (!loop) {
                this.emit('rewatch', [this.source].concat(files));
            }
        });

        this.on('fail', () => {
            building = false;

            if (!loop) {
                this.emit('rewatch', [this.source]);
            }
        });

        this.on('rebuild', () => {
            if (loop) {
                clearTimeout(loop);
                loop = false;
            }

            if (building === false) {
                building = true;
                setTimeout(() => {
                    this._build();
                }, 300);
                return;
            }

            loop = setTimeout(() => {
                this.emit('rebuild');
            }, 300);
        });

        this.emit('rebuild');
    }

    watch() {
        let hrstart = process.hrtime();

        this.on('rewatch', files => {
            this.cmd.stop();
            console.log(`Watched files:\r\n${files.map(x => `- ${chalk.cyan(x)}`).join('\r\n')}`);
            this.cmd.start('Watching');
        });

        this.on('building', () => {
            hrstart = process.hrtime();
            this.cmd.start('Building');
        });

        this.on('done', () => {
            const hrend = process.hrtime(hrstart);
            this.cmd.succeed(`Builded in ${this._printTimeRes(hrend)}\r\n---`);
        });

        this.on('fail', reason => {
            const hrend = process.hrtime(hrstart);
            this.cmd.fail(`Failed in ${this._printTimeRes(hrend)}\r\nReason: ${reason}\r\n---`);
        });

        this._watch();
    }

    runServer(port) {
        if (!port || port < 1024 || port > 65535) {
            this.cmd.fail('Wrong port, port should be number between 1024 and 65535');
            process.exit(1);
        }

        if (!this.target) {
            this.cmd.fail('Target file should be set. You can do it by passing second non-flag argument');
            process.exit(1);
        }

        const inject = html => [
            html,
            `<script src="/socket.io/socket.io.js"></script>`,
            `<script>
                const s = io('http://localhost:${port}'); s.on('reload', () => { location.reload(); });
            </script>`
        ].join('');

        const server = http.createServer((req, res) => {
            this._read(this.target)
                .then(data => {
                    res.end(inject(data));
                })
                .catch(err => {
                    res.end(inject(err.message));
                });
        });

        server.listen(port, err => {
            if (err) {
                this.cmd.fail('Cannot run dev server, reason:');
                console.error(err.message);
                process.exit(1);
                return;
            }

            this.cmd.succeed(`Dev server is listening on ${port}`);
        });

        const io = socket(server);

        this.once('done', () => {
            execSync(`start http://localhost:${port}`);
            this.on('done', () => {
                io.emit('reload');
            });
        });

        this.watch();
    }
}
