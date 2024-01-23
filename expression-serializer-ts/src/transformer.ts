import {
    resolve,
    dirname,
    extname,
    normalize
} from 'path';
import { 
    ArrowFunction,
    Expression,
    ImportDeclaration,
    Node,
    Program,
    SourceFile,
    SyntaxKind,
    TemplateSpan,
    TransformationContext,
    TransformerFactory,
    VisitResult,
    Visitor,
    factory,
    isCallExpression,
    isIdentifier,
    isImportDeclaration,
    isNamedImports,
    isStringLiteral,
    visitEachChild,
    visitNode
} from 'typescript';
import { convertExpressionToODataString } from './serializer';
import * as ts from 'typescript';

// Function to check if the import is from 'serialize.ts'
function isSerializeImport(importDeclaration: ImportDeclaration, sourceFile: SourceFile): boolean {
    const moduleSpecifier = importDeclaration.moduleSpecifier;
    if (isStringLiteral(moduleSpecifier)) {
        // Resolve the import path and compare it to 'serialize.ts'
        const importPath = normalize(resolve(dirname(sourceFile.fileName), moduleSpecifier.text));
        const serializePath = normalize(resolve(dirname(sourceFile.fileName), 'serialize.ts'));
        return !extname(importPath) ? 
            `${importPath}.ts` === serializePath : 
            importPath === serializePath;
    }
    return false;
}

export function serializeTransformer(program: Program): TransformerFactory<SourceFile> {
    const typeChecker = program.getTypeChecker();

    return context => sourceFile => {
        let serializeImportedAs: string | null = null;

        // Function to visit nodes recursively
        const visitor: Visitor = (node: Node): VisitResult<Node> => {
            // Check import statements
            if (isImportDeclaration(node) && isSerializeImport(node, sourceFile)) {
                // Find 'serialize' in the import clause
                const importClause = node.importClause;
                if (importClause && importClause.namedBindings && isNamedImports(importClause.namedBindings)) {
                    importClause.namedBindings.elements.forEach(element => {
                        if (element.name.text === 'serialize') {
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

                // Check if the function being called is 'serialize'
                if (isIdentifier(expression) && expression.text === serializeImportedAs) {
                    // Assuming the first argument is the lambda expression
                    const firstArgument: Expression = node.arguments[0];
                    if (firstArgument && firstArgument.kind == SyntaxKind.ArrowFunction) {
                        const odataString: string = 
                            convertExpressionToODataString(
                                firstArgument as ArrowFunction, typeChecker);
                        return createTemplateLiteral(odataString, context);
                    }
                }
            }

            return visitEachChild(node, visitor, context);
        };

        const transformedSourceFile = visitNode(sourceFile, visitor);
        return transformedSourceFile as SourceFile;
    };
}


function createTemplateLiteral(str: string, context: ts.TransformationContext): ts.Node {
    // Check if the string contains interpolations
    if (!str.includes('${')) {
        // No interpolation, return as a no substitution template literal
        return factory.createNoSubstitutionTemplateLiteral(str, str);
    }

    const parts = str.split(/\$\{(.*?)\}/);
    let templateHead = parts.shift() ?? "";
    const spans: ts.TemplateSpan[] = [];

    while (parts.length > 0) {
        const expressionText = parts.shift();
        const literalText = parts.shift() ?? "";

        const expression = expressionText ? factory.createIdentifier(expressionText) : factory.createIdentifier('');
        const templatePart = parts.length > 0 ? factory.createTemplateMiddle(literalText, literalText) : factory.createTemplateTail(literalText, literalText);

        spans.push(factory.createTemplateSpan(expression, templatePart));
    }

    return factory.createTemplateExpression(factory.createTemplateHead(templateHead, templateHead), spans);
}
