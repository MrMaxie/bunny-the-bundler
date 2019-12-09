<p align="center"><img src="./bunnyLogo.png" width="250px" alt="Bunny in the bundle ^^" /></p>

# Bunny the Bundler

Modular and deadly simple bundler for generating things... mostly static websites.

[//]: # (--docs--)

# Get started

At very beginning install this dependency using command:

```bash
npm install --save-dev bunny-the-bundler
# or
yarn --dev bunny-the-bundler
```

After that we need to set-up our scripts in `package.json`, add entries, for example:

```json
{
    "scripts": {
        "build": "bunny ./genDocs.html ./result.html"
    }
}
```

After that use your script like that:

```bash
npm run build
# or
yarn run build
```

So, like description said - it's simple. First of all create somewhere file with `.html` extension with single `<script>` block with attribute `role="main"`:

```html
<!-- ./genDocs.html -->
<script role="main">
    // context-based code here
</script>
```

Inside of that block you have access to "context" which will build your script. You can to use [few context available functions](#context) here, but before that set-up some data entry points.

```html
<!-- ./genDocs.html -->
<script role="main">
    //
</script>

<style id="my-style">
    .awesome {
        color: red;
    }
</style>

<template id="header">
    <div class="awesome">Test</div>
</template>

<script id="readme" src="./README.md"></script>
```

Now you know why `.html` is build file extension. Every entry need unique `id` attribute, and content or `src` attribute pointing to source file. We need to load them at very beginning:

```javascript
// ./genDocs.html:script[role="main"]
load(['my-style', 'header', 'readme'])
    .then(([myStyle, header, readme]) => {
        // Every above variable is string
    });
```

Now we have here content of every needed data entry. **This package doesn't contains any of parsers** but you can still install dependencies of your choice. In our example we will need markdown parser, for example [commonmark](https://www.npmjs.com/package/commonmark).

```javascript
// ./generateDocs.html:script[role="main"]
const { Parser, HtmlRenderer } = require('commonmark');

load(['my-style', 'header', 'readme'])
    .then(([myStyle, header, readme]) => {
        const reader = new Parser();
        const writer = new HtmlRenderer();
        const parsed = reader.parse(readme);
        const readmeHtml = writer.render(parsed);

        const html = [
            '<style>', myStyle, '</style>',
            header,
            readmeHtml,
        ].join('');

        save(html); // Save output file
    });
```

After that, our `html` variable contains our expected result. We need only to save it using `save()` or `saveFile()`. It's all. Your output file will contain your HTML.

# Context

Context is fully prepared by Bunny, so you can't use typical global variables.

## require(name)

- `name: string` - name of module, it's important that your builder will look for modules in directory of your project, so you can to include any needed module.
- `return: any` - anything that require can returns

## load(ids)

- `ids: string | string[]` - id or array of ids for data entries
- `return: Promise<string | string[]>` - promise with result data containing string (for string argument) and array of strings (for array of strings argument)

## save(content)

`save` will write into output file passed in CLI, also after being called run `done()`, so you don't need to call it manually

- `content: string` - data that should be written
- `return: Promise<void>` - promise of saving

## saveFile(filename, content)

`saveFile` will save into file of your choice

- `filename: string` - path to string, can be relative
- `content: string` - data that should be written
- `return: Promise<void>` - promise of saving

## done()

Tell for Bunny that you finished your building process

- `return: void`

## fail(reason)

Tell for Bunny that you finished your building process but with error

- `reason?: string` - reason of fail, can be omitted
- `return: void`

## console

```typescript
{
    log: (...args) => void;
    error: (...args) => void;
    warn: (...args) => void;
    info: (...args) => void;
}
```

All of them are just proxies for built-in `console`

# CLI

```
usage: bunny [...commands] <input> [output]

    commands:
       --watch      | -w
           -> turns on watchers for needed files and rebuild every
              time when any of those files will been edited

       --dev [8080] | -d [8080]
           -> runs dev server on selected port, also watchers will
              turn on

       --help       | -h
           -> shows this message :)
```

## Watch mode

Watch mode will observe all needed files. After every rebuild only list of used files will be observed, so you don't need to pass any kind of glob or list for observing.

## Dev server

Hosts your output file using HTTP server and WebSockets server for automatic reloading after every rebuild. For reloading also watch files, like in [watch mode](#watch-mode).

# License

This project is licensed under the Apache-2.0 License - see the [LICENSE.md](LICENSE.md) file for details
