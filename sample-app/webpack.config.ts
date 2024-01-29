import { Configuration } from 'webpack';
import { AngularWebpackPlugin } from '@ngtools/webpack';
import { BuilderProgram, CustomTransformers, Program, SourceFile, TransformerFactory } from 'typescript';
import { serializeTransformer } from 'expression-serializer-ts/build-tools/transformer';

function findAngularWebpackPlugin(webpackCfg: Configuration) {
    return webpackCfg?.plugins?.find((plugin) =>
        AngularWebpackPlugin ? plugin instanceof AngularWebpackPlugin : plugin?.constructor.name == 'AngularWebpackPlugin',
    );
}

function addTransformerToAngularWebpackPlugin(
    plugin: AngularWebpackPlugin,
    transformer: (program: Program) => TransformerFactory<SourceFile>): void {
    
    // Here, we patch the AngularWebpackPlugin to include our specific transform.
    console.debug('Patching the webpack plugin...');

    // Take a copy of the original "createFileEmitter" method, which is private.
    // This is the part of the Angular compiler that takes in a TypeScript file, runs all of Angular's transformers
    // on it, and then outputs the transformed JS file (similar to the "tsc" tool). We're going to add *our* transformer
    // in prior to any of Angular's ones, so that to Angular it looks like the transform has already occurred. 
    const originalFetchQuery = plugin['createFileEmitter'];
    
    // Update the "createFileEmitter" method to just intercept the function call so that it includes our transformer as
    // the first item in the list of provided transformers, and then call the original function (to retain maximum
    // compatibility).
    plugin['createFileEmitter'] = function (
        program: BuilderProgram,
        transformers: CustomTransformers,
        getExtraDependencies: (sourceFile: SourceFile) => Iterable<string>,
        onAfterEmit?: (sourceFile: SourceFile) => void) {
        
        if (!transformers) {
            transformers = {};
        }

        if (!transformers.before) {
            transformers.before = [];
        }

        if (transformers.before) {
            transformers.before = [transformer(program.getProgram()), ...transformers.before];
        }

        return originalFetchQuery.apply(plugin, [program, transformers, getExtraDependencies, onAfterEmit]);
    };
}

export default (
    config: Configuration
) => {
    // Find the AngularCompilerPlugin in the webpack configuration
    const angularWebpackPlugin = findAngularWebpackPlugin(config);

    if (!angularWebpackPlugin) {
        throw new Error('Could not inject the typescript transformer: Webpack AngularWebpackPlugin not found');
    }

    console.log('Adding serialize transformer...');
    addTransformerToAngularWebpackPlugin(angularWebpackPlugin as AngularWebpackPlugin, serializeTransformer);
    return config;
};
