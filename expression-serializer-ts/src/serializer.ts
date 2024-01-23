import {
    Expression,
    SyntaxKind,
    PropertyAccessExpression,
    Identifier,
    StringLiteral,
    NumericLiteral,
    CallExpression,
    forEachChild,
    ArrowFunction,
    Node,
    createSourceFile,
    ScriptTarget,
    isArrowFunction,
    isFunctionExpression,
    createProgram,
    CompilerHost,
    TypeChecker
} from "typescript";

interface ParsedExpression {
    expression: ArrowFunction | null;
    typeChecker: TypeChecker
}

function parseFunctionToArrowFunctionExpression<T>(fn: (x: T) => boolean): ParsedExpression {
    const functionString = fn.toString();
    const sourceFile = createSourceFile(
        'tempFile.ts',
        functionString,
        ScriptTarget.Latest,
        true /* setParentNodes */
    );

    const host: CompilerHost = {
        getSourceFile: (fileName) => fileName === 'tempFile.ts' ? sourceFile : undefined,
        getDefaultLibFileName: () => 'lib.d.ts',
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getDirectories: () => [],
        getCanonicalFileName: fileName => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: fileName => fileName === 'tempFile.ts',
        readFile: () => '',
        directoryExists: () => true,
        getEnvironmentVariable: () => ''
    };

    const program = createProgram(
        ['tempFile.ts'],
        {
            noResolve: true,
            target: ScriptTarget.Latest
        }, host);
    const typeChecker = program.getTypeChecker();

    // Traverse the AST to find the ArrowFunction
    let arrowFunctionNode: ArrowFunction | null = null;
    function visit(node: Node) {
        if (isArrowFunction(node)) {
            arrowFunctionNode = node as ArrowFunction;
        } else {
            forEachChild(node, visit);
        }
    }
    forEachChild(sourceFile, visit);

    return {
        expression: arrowFunctionNode,
        typeChecker: typeChecker
    };
}

export function convertFuncToODataString<T>(func: (x: T) => boolean): string {
    const parsed: ParsedExpression = parseFunctionToArrowFunctionExpression(func);
    if (parsed.expression) {
        return convertExpressionToODataString(parsed.expression, parsed.typeChecker);
    } else {
        throw new Error(`Could not parse input "${func.toString()}" as an Expression.`);
    }
}

export function convertExpressionToODataString(
    expression: ArrowFunction,
    typeChecker: TypeChecker): string {

    let odataFilter: string = "";
    let lambdaParameter: string | null = null;

    if (expression.kind === SyntaxKind.ArrowFunction) {
        const arrowFunction = expression as ArrowFunction;    
        if (arrowFunction.parameters.length > 0) {
            lambdaParameter = arrowFunction.parameters[0].name.getText();
        }
    }

    const visitNode = (node: Node, parentNode?: Node): void => {
        //consoleLogNode(node);
        let processed = false;

        switch (node.kind) {
            case SyntaxKind.GreaterThanToken:
                odataFilter += " gt ";
                break;
            case SyntaxKind.GreaterThanEqualsToken:
                odataFilter += " ge ";
                break;
            case SyntaxKind.LessThanToken:
                odataFilter += " lt ";
                break;
            case SyntaxKind.LessThanEqualsToken:
                odataFilter += " le ";
                break;
            case SyntaxKind.EqualsEqualsToken:
            case SyntaxKind.EqualsEqualsEqualsToken:
                odataFilter += " eq ";
                break;
            case SyntaxKind.ExclamationEqualsToken:
            case SyntaxKind.ExclamationEqualsEqualsToken:
                odataFilter += " ne ";
                break;
            case SyntaxKind.AmpersandAmpersandToken:
                odataFilter += " and ";
                break;
            case SyntaxKind.BarBarToken:
                odataFilter += " or ";
                break;
            case SyntaxKind.OpenParenToken:
                odataFilter += "(";
                break;
            case SyntaxKind.CloseParenToken:
                odataFilter += ")";
                break;
            case SyntaxKind.PropertyAccessExpression:
                const propertyAccess = node as PropertyAccessExpression;
                const object = propertyAccess.expression;
                const property = propertyAccess.name;
    
                if (object.kind === SyntaxKind.Identifier && (object as Identifier).text === lambdaParameter) {
                    odataFilter += property.text;
                } else {
                    const objectText = object.kind === SyntaxKind.Identifier ? (object as Identifier).text : object.getText();
                    odataFilter += `${objectText}.${property.text}`;
                }
                break;
            case SyntaxKind.Identifier:
                const identifier = node as Identifier;
                if (identifier.text === "undefined") {
                    // Treat 'undefined' as 'null' in OData
                    odataFilter += "null";
                } else if (identifier.text !== lambdaParameter) {
                    if (!parentNode || parentNode.kind !== SyntaxKind.PropertyAccessExpression) {
                        const type = typeChecker.getTypeAtLocation(identifier);
                        const isStringType = typeChecker.typeToString(type) === 'string';

                        // Format the output based on type
                        odataFilter += isStringType ? `
                            "' + ${identifier.text} + '"` :
                            `" + ${identifier.text} + "`;
                    }
                }
                break;
            case SyntaxKind.StringLiteral:
                odataFilter += `'${(node as StringLiteral).text}'`;
                break;
            case SyntaxKind.NumericLiteral:
                odataFilter += (node as NumericLiteral).text;
                break;
            case SyntaxKind.NullKeyword:
            case SyntaxKind.UndefinedKeyword:
                odataFilter += "null";
                break;

            // Handle functions
            case SyntaxKind.CallExpression:
                const callExpression = node as CallExpression;
                const methodName = callExpression.expression.getLastToken()?.getText();
            
                if (callExpression.expression.kind === SyntaxKind.PropertyAccessExpression) {
                    const propertyAccess = callExpression.expression as PropertyAccessExpression;
                    const propertyName = getNestedPropertyName(propertyAccess.expression, lambdaParameter!);
                    const args = callExpression.arguments.map(arg => arg.getText()).join(', ');
            
                    switch (methodName) {
                        case 'startsWith':
                            odataFilter += `startswith(${propertyName}, ${args})`;
                            processed = true;
                            break;
                        case 'endsWith':
                            odataFilter += `endswith(${propertyName}, ${args})`;
                            processed = true;
                            break;
                        case 'includes':
                            odataFilter += `contains(${propertyName}, ${args})`;
                            processed = true;
                            break;
                        case 'indexOf':
                            odataFilter += `indexof(${propertyName}, ${args})`;
                            processed = true;
                            break;
                        case 'replace':
                            // Note: TypeScript's replace method might have different usage than OData's replace function.
                            odataFilter += `replace(${propertyName}, ${args})`;
                            processed = true;
                            break;
                        case 'toLowerCase':
                        case 'toLocaleLowerCase':
                            odataFilter += `tolower(${propertyName})`;
                            processed = true;
                            break;
                        case 'toUpperCase':
                        case 'toLocaleUpperCase':
                            odataFilter += `toupper(${propertyName})`;
                            processed = true;
                            break;
                        case 'trim':
                            odataFilter += `trim(${propertyName})`;
                            processed = true;
                            break;
                        // Handling length property
                        case 'length':
                            if (parentNode && parentNode.kind === SyntaxKind.PropertyAccessExpression) {
                                odataFilter += `length(${propertyName})`;
                                processed = true;
                            }
                            break;
                        // Add other cases here
                    }
                }
                break;

            // Handle arithmetic operators
            case SyntaxKind.PlusToken:
                odataFilter += " add ";
                break;
            case SyntaxKind.MinusToken:
                odataFilter += " sub ";
                break;
            case SyntaxKind.AsteriskToken:
                odataFilter += " mul ";
                break;
            case SyntaxKind.SlashToken:
                odataFilter += " div ";
                break;

            // Add more cases as needed
        }

        if (!processed) {
            forEachChild(node, (child) => visitNode(child, node));
        }
    };

    forEachChild(expression, visitNode);

    return odataFilter;
}

function getNestedPropertyName(node: Node, lambdaParameter: string): string {
    if (node.kind === SyntaxKind.PropertyAccessExpression) {
        const propertyAccess = node as PropertyAccessExpression;
        if (propertyAccess.expression.kind === SyntaxKind.Identifier && 
            (propertyAccess.expression as Identifier).text === lambdaParameter) {
            // Base case: Direct property access on lambda parameter
            return propertyAccess.name.text;
        } else {
            // Recursive case: Nested property access
            const parentName = getNestedPropertyName(propertyAccess.expression, lambdaParameter);
            return `${parentName}/${propertyAccess.name.text}`;
        }
    }
    return '';
}

function consoleLogNode(node: Node) {
    const nodeKind = SyntaxKind[node.kind];
    let nodeText: string;

    try {
        nodeText = node.getText();
    } catch (error) {
        nodeText = "Error getting text representation";
    }    

    console.log("Node Kind:", nodeKind, "Node Text:", nodeText);
}

