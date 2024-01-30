import { Configuration, WebpackPluginInstance } from 'webpack';
import { BuilderProgram, CustomTransformers, Program, SourceFile, TransformerFactory } from 'typescript';
import { serializeExpressionTransformer } from './transformer';

/**
 * Given a Webpack configuration that contains an AngularWebpackPlugin, injects a {@link serializeExpressionTransformer}
 * into the Typescript transformer pipeline.
 * @param config The webpack config, as defined in the custom webpack extension file when using the 
 * `@angular-builders/custom-webpack` project.
 * @returns The modified configuration for passing to subsequent steps if necessary.
 */
export function addSerializeExpressionTransformerToAngularPipeline(config: Configuration): Configuration {
    // Find the AngularCompilerPlugin in the webpack configuration
    const angularWebpackPlugin = findAngularWebpackPlugin(config);

    if (!angularWebpackPlugin) {
        throw new Error('Could not inject the typescript transformer: Webpack AngularWebpackPlugin not found');
    }

    console.debug('Adding serializeExpressionTransformer...');
    addTransformerToAngularWebpackPlugin(angularWebpackPlugin, serializeExpressionTransformer);
    return config;
}

/**
 * Searches the given webpack config for the currently loaded AngularWebpackPlugin.
 * @param webpackCfg The webpack configuration being searched for an AngularWebpackPlugin.
 * @returns The AngularWebpackPlugin if found, otherwise undefined.
 */
function findAngularWebpackPlugin(webpackConfig: Configuration): WebpackPluginInstance | undefined {
    return webpackConfig?.plugins?.find((plugin) =>
        plugin?.constructor.name == 'AngularWebpackPlugin') as WebpackPluginInstance;
}

/**
 * Adds the given TypeScript transformer to the AngularWebpackPlugin. Inserts it as the first "before" transformer,
 * meaning it runs prior to any other TS transformer.
 * @param plugin The discovered AngularWebpackPlugin.
 * @param transformer The transformer to add to the Angular plugin's set of custom transformers.
 */
function addTransformerToAngularWebpackPlugin(
    plugin: WebpackPluginInstance,
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
