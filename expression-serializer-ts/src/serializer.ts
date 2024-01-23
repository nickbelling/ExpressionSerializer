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
    createProgram,
    CompilerHost,
    TypeChecker,
    isFunctionExpression,
    PrefixUnaryExpression,
    ParenthesizedExpression
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

    const visitNode = (
        node: Node,
        parentNode?: Node,
        includeIdentifier: boolean = false): void => {

        let processed = false;

        switch (node.kind) {
            // Binary comparison
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
            case SyntaxKind.ExclamationToken:
                odataFilter += " not ";
                break;

            // Arithmetic operators
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
            case SyntaxKind.PercentToken:
                odataFilter += " mod ";
                break;

            // Literals
            case SyntaxKind.StringLiteral:
                odataFilter += `'${(node as StringLiteral).text}'`;
                break;
            case SyntaxKind.NumericLiteral:
                odataFilter += (node as NumericLiteral).text;
                break;
            case SyntaxKind.TrueKeyword:
                odataFilter += "true";
                break;
            case SyntaxKind.FalseKeyword:
                odataFilter += "false";
                break;
            case SyntaxKind.NullKeyword:
            case SyntaxKind.UndefinedKeyword:
                odataFilter += "null";
                break;

            // "not"
            case SyntaxKind.PrefixUnaryExpression:
                const prefixUnaryExpression = node as PrefixUnaryExpression;
                if (prefixUnaryExpression.operator === SyntaxKind.ExclamationToken) {
                    // Save the current state of odataFilter
                    const saveOdataFilter = odataFilter; 
                    odataFilter = '';

                    // Process the operand of the unary expression
                    visitNode(prefixUnaryExpression.operand, node, includeIdentifier);

                    const operandFilter = odataFilter;
                    odataFilter = `not ${operandFilter}`;

                    // Restore the original state
                    odataFilter = saveOdataFilter + odataFilter;
                    processed = true;
                }
                break;

            // Grouped with parentheses
            case SyntaxKind.ParenthesizedExpression:
                const parenthesizedExpression = node as ParenthesizedExpression;
                odataFilter += "(";
            
                // Process the expression inside the parentheses
                visitNode(parenthesizedExpression.expression, node, includeIdentifier);
            
                odataFilter += ")";
                processed = true;
                break;

            // Property access
            case SyntaxKind.PropertyAccessExpression:
                const propertyAccess = node as PropertyAccessExpression;
                const object = propertyAccess.expression;
                const property = propertyAccess.name;
            
                if (property.text === 'length') {
                    // Special handling for 'length' property
                    const objectText = getNestedPropertyName(object, lambdaParameter, includeIdentifier);
                    odataFilter += `length(${objectText})`;
                } else {
                    // Handling for other property access expressions
                    if (object.kind === SyntaxKind.Identifier && (object as Identifier).text === lambdaParameter) {
                        if (includeIdentifier) {
                            odataFilter += `${lambdaParameter}/${property.text}`;
                        } else {
                            odataFilter += property.text;
                        }
                    } else {
                        // Use getNestedPropertyName for nested properties to format correctly
                        const fullPropertyName = getNestedPropertyName(propertyAccess, lambdaParameter, includeIdentifier);
                        odataFilter += fullPropertyName;
                    }
                }

                processed = true;
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
                        if (isStringType) {
                            odataFilter += `'$\{${identifier.text}\}'`;
                        } else {
                            odataFilter += `$\{${identifier.text}\}`;
                        }
                    }
                }
                break;
            // Handle functions
            case SyntaxKind.CallExpression:
                const callExpression = node as CallExpression;
                const methodName = callExpression.expression.getLastToken()?.getText();
                const args = callExpression.arguments.map(arg => arg.getText()).join(', '); // Get the arguments

                if (isCollectionFunction(methodName)) {
                    const propertyAccess = callExpression.expression as PropertyAccessExpression;
                    const collectionName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);
                    const lambdaExpression = callExpression.arguments[0];
        
                    // Assuming the lambda expression is an arrow function
                    if (isArrowFunction(lambdaExpression) || isFunctionExpression(lambdaExpression)) {
                        // Capture the current lambda parameter and set it to the new one
                        const originalLambdaParameter = lambdaParameter;
                        lambdaParameter = lambdaExpression.parameters[0].name.getText();

                        // Save the current state of odataFilter and reset it for building the lambda body
                        const saveOdataFilter = odataFilter; 
                        odataFilter = '';

                        // Process the lambda body
                        forEachChild(lambdaExpression.body, node => visitNode(node, undefined, true));

                        // Build the OData filter string for the 'any' expression
                        const lambdaBody = odataFilter;
                        odataFilter = `${collectionName}/${convertCollectionFunction(methodName)}(${lambdaParameter}: ${lambdaBody})`;

                        // Restore the original state
                        odataFilter = saveOdataFilter + odataFilter;
                        lambdaParameter = originalLambdaParameter;

                        processed = true;
                    }
                } else if (callExpression.expression.kind == SyntaxKind.PropertyAccessExpression) {
                    const propertyAccess = callExpression.expression as PropertyAccessExpression;
                    const propertyName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);

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
                        case 'substring':
                            odataFilter += `substring(${propertyName}, ${args})`;
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
                } else {
                    // Direct function call
                    const expression = callExpression.expression.getText();
                    odataFilter += `\${${expression}(${args})}`;
                    processed = true; // Set the flag to true to avoid further processing
                }
                break;

            // Add more cases as needed
        }

        if (!processed) {
            forEachChild(node, (child) => visitNode(child, node, includeIdentifier));
        }
    };

    forEachChild(expression, visitNode);

    return odataFilter;
}

function getNestedPropertyName(
    node: Node,
    lambdaParameter: string | null,
    includeIdentifier: boolean): string {
    if (node.kind === SyntaxKind.PropertyAccessExpression) {
        const propertyAccess = node as PropertyAccessExpression;
        const parentName = getNestedPropertyName(propertyAccess.expression, lambdaParameter, includeIdentifier);
        return parentName ? `${parentName}/${propertyAccess.name.text}` : propertyAccess.name.text;
    } else if (node.kind === SyntaxKind.Identifier) {
        // Check if the identifier is the lambda parameter
        const identifier = node as Identifier;
        return includeIdentifier ? identifier.text : '';
    }
    return '';
}

function isCollectionFunction(functionName?: string): boolean {
    return functionName === 'some' ||
        functionName === 'every';
}

function convertCollectionFunction(functionName?: string): string {
    switch (functionName) {
        case 'some':
            return 'any';
        case 'every':
            return 'all';
        default:
            throw new Error('Unknown collection function name.');
    }
}
