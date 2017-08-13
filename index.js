const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');
const Handlebars = require('handlebars');
const glob = require('glob');
const n2a = require('native2ascii').native2ascii;

function buildPartials(source, fileName, options) {
    let dir = path.dirname(fileName),
        includes = source.match(/\{\{>(.*)\}\}/g);

    if (includes) {
        includes.forEach((item) => {
            let relativeFileName = item.replace(/\{|\}|>/g, ''),
                fullIncludeFileName,
                ext = path.extname(relativeFileName),
                isPathPrefixFound = false;

            if (ext !== '.html') {
                relativeFileName += '.hbs';
            }

            Object.keys(options.paths).forEach((pathId) => {
                if (relativeFileName.indexOf('@' + pathId) !== -1) {
                    fullIncludeFileName = path.resolve(options.paths[pathId], relativeFileName.replace('@' + pathId + '/', ''));
                    isPathPrefixFound = true;
                }
            });

            if (!isPathPrefixFound) {
                fullIncludeFileName = path.resolve(dir, relativeFileName);
            }

            if (!fs.existsSync(fullIncludeFileName)) {
                console.log('No such file or directory: ' + fullIncludeFileName + '\nin file ' + fileName);
            } else {
                source = source.replace(item, buildPartials(fs.readFileSync(fullIncludeFileName).toString(), fullIncludeFileName, options));
            }
        });
    }

    return source;
}

function processingFile(file, options) {
    return new Promise((resolve, reject) => {
        let filePath = path.resolve(options.cwd, file),
            moduleName = file.split('/')[0],
            relativeFileName = file.replace(moduleName + '/tmpl/', ''),
            dstPath = options.isNoPreparePath ? path.resolve(options.dst, file.replace(/(\.html)|(\.hbs)/, '.js')) : path.resolve(options.dst, moduleName, options.tmplDir || '', relativeFileName.replace(/(\.html)|(\.hbs)/, '.js')),
            tmplSource = fs.readFileSync(filePath).toString(),
            pathToApp = options.pathToApp || '/src/app',
            handleBarsJs,
            precompile;

        tmplSource = buildPartials(tmplSource, filePath, options);

        try {
            precompile = Handlebars.precompile(tmplSource);
        } catch (err) {
            console.log(err);
            console.log('Cannot compile ' + file);
        }

        if (options.isCommonJs) {
            handleBarsJs = ' ' +
                'Handlebars = require(process.cwd() + \'' + pathToApp + '\').Handlebars;' +
                'module.exports = Handlebars.template(' + precompile + ');';
        } else {
            handleBarsJs = ' ' +
                'define([' +
                '   \'handlebars\',' +
                '   \'' + options.helpersPath + '\'' +
                '], function (Handlebars, helpers) {' +
                '       helpers(Handlebars);' +
                '       return Handlebars.template(' + precompile + ');' +
                '});';
        }

        fs.mkdirpSync(path.dirname(dstPath));
        fs.writeFileSync(dstPath, n2a(handleBarsJs));
        console.log(`Compiled: ${dstPath}`);
        resolve();
    });
}

module.exports = function (options) {
    options = options || {};
    options = _.merge({
        cwd: process.cwd(),
        paths: []
    }, options);

    return new Promise((resolve, reject) => {
        glob(options.src, {
            cwd: options.cwd
        }, (err, files) => {
            if (err) {
                console.log(err);
            } else {
                Promise.all(files.map((file) => processingFile(file, options)))
                    .then(resolve)
                    .catch(reject);
            }
        });
    });
};