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
                        return factory.createStringLiteral(odataString);
                    }
                }
            }

            return visitEachChild(node, visitor, context);
        };

        const transformedSourceFile = visitNode(sourceFile, visitor);
        return transformedSourceFile as SourceFile;
    };
}
