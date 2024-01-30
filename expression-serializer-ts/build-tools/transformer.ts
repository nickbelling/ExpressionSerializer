import { dirname, normalize, resolve } from 'path';
import {
    ArrowFunction, CallExpression, Expression, factory, ImportDeclaration, isCallExpression, isIdentifier,
    isImportDeclaration, isNamedImports, isNamespaceImport, isPropertyAccessExpression, isStringLiteral, NamespaceImport, Node, Program, SourceFile, SyntaxKind,
    TemplateSpan, TransformerFactory, visitEachChild, visitNode, Visitor,
    VisitResult
} from 'typescript';

import { serializeExpression } from './../src/serialize';
import { convertExpressionToODataString } from './serializer';

const MODULE_NAME: string = 'expression-serializer-ts';
const METHOD_NAME: string = 'serializeExpression';

/**
 * A transformer which looks for calls to {@link serializeExpression} at TypeScript compile time, and transforms those
 * calls into OData $filter strings.
 * @param program The TypeScript program being transformed.
 * @returns A {@link TransformerFactory<SourceFile>} capable of intercepting calls to {@link serializeExpression} and
 * converting them to OData $filter strings at compile-time.
 */
export function serializeExpressionTransformer(program: Program): TransformerFactory<SourceFile> {
    const typeChecker = program.getTypeChecker();

    return context => sourceFile => {
        console.debug(`Inspecting file '${sourceFile.fileName}' for ${METHOD_NAME} transformers...`);

        let sourceFileModified = false;
        const modifiedDescriptions: [string, string][] = [];

        // The "serializeExpression" function might be imported as an alias. If so, store it here.
        let serializeImportedAs: string | null = null;

        // Function to visit nodes recursively
        const visitor: Visitor = (node: Node): VisitResult<Node> => {
            // Check import statements
            if (isImportDeclaration(node) && isSerializeExpressionFunctionImport(node, sourceFile, program)) {
                const importClause = node.importClause;
                if (importClause) {
                    //console.log(`Inspecting import clause: ${importClause.getText()}`);
                    
                    if (importClause.namedBindings && isNamespaceImport(importClause.namedBindings)) {
                        // Handle namespace imports (import * as Alias from '...')
                        const namespaceImport = importClause.namedBindings as NamespaceImport;
                        if (namespaceImport.name && isIdentifier(namespaceImport.name)) {
                            serializeImportedAs = namespaceImport.name.text;
                            //console.log(`Module imported as (namespace): ${serializeImportedAs}`);
                        } else {
                            //console.log(`Expected namespace import name not found.`);
                        }
                    } else {
                        //console.log(`Namespace import not matched. NamedBindings type: ${importClause.namedBindings?.kind}`);
                    }
                
                    if (importClause.namedBindings && isNamedImports(importClause.namedBindings)) {
                        // Handle direct imports (import { serializeExpression as Alias } from '...')
                        importClause.namedBindings.elements.forEach(element => {
                            if (element.propertyName?.text === METHOD_NAME || element.name.text === METHOD_NAME) {
                                serializeImportedAs = element.name.text;
                                //console.log(`serializeImportedAs set (named import): ${serializeImportedAs}`);
                            }
                        });
                    } else {
                        //console.log(`Named import not matched. NamedBindings: ${importClause.namedBindings?.getText()}`);
                    }
                }                
            }

            // Check for function calls
            if (isCallExpression(node)) {
                //console.log(`Checking call expression: ${node.getText()}`);
                const expression = node.expression;

                // Check if the function being called is 'serializeExpression'
                if (isSerializeExpressionCall(node, serializeImportedAs)) {
                    //console.log(`Found 'serializeExpression' call: ${node.getText()}`);

                    // Assuming the first argument is the lambda expression
                    const firstArgument: Expression = node.arguments[0];
                    if (firstArgument && firstArgument.kind == SyntaxKind.ArrowFunction) {
                        
                        const lambdaString: string = firstArgument.getText();
                        const odataString: string = 
                            convertExpressionToODataString(
                                firstArgument as ArrowFunction, typeChecker);
                        modifiedDescriptions.push([lambdaString, odataString]);

                        sourceFileModified = true;

                        const literal = createTemplateLiteral(odataString);
                        return literal;
                    } else {
                        throw new Error(`Called a serializeExpression function, but the first argument was not ` + 
                            `an ArrowFunction.`);
                    }
                } // else another function, we're not interested
            }

            return visitEachChild(node, visitor, context);
        };

        const transformedSourceFile = visitNode(sourceFile, visitor);

        if (sourceFileModified) {
            console.log(`Modified source file '${sourceFile.fileName}' with the following replacements:`);
            modifiedDescriptions.forEach(d => {
                console.log(`- "serializeExpression(${d[0]})" converted to OData string "${d[1]}"`);
            });
        }

        return transformedSourceFile as SourceFile;
    };
}

/**
 * Determines if the current import is an import for the {@link METHOD_NAME}, regardless whether or not it's relative,
 * module-based, etc.
 */
function isSerializeExpressionFunctionImport(
    importDeclaration: ImportDeclaration,
    sourceFile: SourceFile,
    program: Program
): boolean {
    const moduleSpecifier = importDeclaration.moduleSpecifier;

    if (isStringLiteral(moduleSpecifier)) {
        const importPath = getFullPath(moduleSpecifier.text, sourceFile.fileName, program);
        const includes = importPath.includes(MODULE_NAME);
        if (includes) {
            console.log('Found serializeExpression import path:', importPath, 'in source file:', sourceFile.fileName);
        }
        return includes;
    }
    
    return false;
}

function isSerializeExpressionCall(node: Node, serializeImportedAs: string | null): node is CallExpression {

    console.log(`isSerializeExpressionCall: Checking node ${node.getText()}, serializeImportedAs: ${serializeImportedAs}`);
    let result: boolean;

    if (!isCallExpression(node)) {
        result = false;
    } else {
        const expression = node.expression;
        if (isIdentifier(expression)) {
            // Check for direct call (function aliasing)
            result = expression.text === serializeImportedAs;
        } else if (isPropertyAccessExpression(expression) && isIdentifier(expression.name)) {
            // Check for module aliasing
            result = expression.name.text === METHOD_NAME && 
                isIdentifier(expression.expression) && 
                expression.expression.text === serializeImportedAs;
        } else {
            result = false;
        }
    }
    
    // Log the final decision of the function
    console.log(`isSerializeExpressionCall: Result for node ${node.getText()} is ${result}`);
    return result;
}

/**
 * Resolves the full path of an import.
 * Handles both relative and non-relative (e.g., node_modules) imports.
 */
function getFullPath(importPath: string, currentFile: string, program: Program): string {
    if (isRelativePath(importPath)) {
        // Resolve relative path
        return normalize(resolve(dirname(currentFile), importPath));
    } else {
        // For non-relative paths, we need to assume that the module name
        // (e.g., 'expression-serializer-ts') is unique enough to identify the package
        return importPath;
    }
}

/** 
 * Returns true if the given path is relative to the current file.
 */
function isRelativePath(path: string): boolean {
    return path.startsWith('./') || path.startsWith('../');
}

/**
 * Given a string with potential "${}" interpolation inside, returns a {@link Node} capable of being written to
 * JavaScript source that represents the string as part of the source tree.
 * @param str The string to convert to a template expression. May or may not contain internal "${}" syntax that links
 * to identifiers external to the string for interpolation at runtime.
 * @returns A TypeScript Node representing the string as it should appear in source, with interpolations linked to the
 * appropriate identifiers.
 */
function createTemplateLiteral(str: string): Node {
    // Check if the string contains interpolations
    if (!str.includes('${')) {
        // No interpolation, return as a no substitution template literal
        return factory.createNoSubstitutionTemplateLiteral(str, str);
    }

    const parts = str.split(/\$\{(.*?)\}/);
    let templateHead = parts.shift() ?? "";
    const spans: TemplateSpan[] = [];

    while (parts.length > 0) {
        const expressionText = parts.shift();
        const literalText = parts.shift() ?? "";

        const expression = expressionText ? factory.createIdentifier(expressionText) : factory.createIdentifier('');
        const templatePart = parts.length > 0 ? factory.createTemplateMiddle(literalText, literalText) : factory.createTemplateTail(literalText, literalText);

        spans.push(factory.createTemplateSpan(expression, templatePart));
    }

    return factory.createTemplateExpression(factory.createTemplateHead(templateHead, templateHead), spans);
}
