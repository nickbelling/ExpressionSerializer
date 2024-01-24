import { dirname, extname, normalize, resolve } from 'path';
import {
    ArrowFunction, Expression, factory, ImportDeclaration, isCallExpression, isIdentifier,
    isImportDeclaration, isNamedImports, isStringLiteral, Node, Program, resolveModuleName, SourceFile, SyntaxKind,
    TemplateSpan, TransformerFactory, visitEachChild, visitNode, Visitor,
    VisitResult
} from 'typescript';

import { serializeExpression } from './serialize';
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
export function serializeTransformer(program: Program): TransformerFactory<SourceFile> {
    const typeChecker = program.getTypeChecker();

    return context => sourceFile => {
        let serializeImportedAs: string | null = null;

        // Function to visit nodes recursively
        const visitor: Visitor = (node: Node): VisitResult<Node> => {
            // Check import statements
            if (isImportDeclaration(node) && isSerializeExpressionFunctionImport(node, sourceFile, program)) {
                // Find 'serialize' in the import clause
                const importClause = node.importClause;
                if (importClause && importClause.namedBindings && isNamedImports(importClause.namedBindings)) {
                    importClause.namedBindings.elements.forEach(element => {
                        if (element.name.text === METHOD_NAME) {
                            serializeImportedAs = element.name.text;
                            if (element.propertyName) {
                                serializeImportedAs = element.propertyName.text;
                            }
                        }
                    });
                }
            }

            // Check for function calls
            if (isCallExpression(node)) {
                const expression = node.expression;

                // Check if the function being called is 'serializeExpression'
                if (isIdentifier(expression) && expression.text === serializeImportedAs) {
                    // Assuming the first argument is the lambda expression
                    const firstArgument: Expression = node.arguments[0];
                    if (firstArgument && firstArgument.kind == SyntaxKind.ArrowFunction) {
                        const odataString: string = 
                            convertExpressionToODataString(
                                firstArgument as ArrowFunction, typeChecker);
                        return createTemplateLiteral(odataString);
                    }
                }
            }

            return visitEachChild(node, visitor, context);
        };

        const transformedSourceFile = visitNode(sourceFile, visitor);
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
        return importPath.includes(MODULE_NAME);
    }
    
    return false;
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
